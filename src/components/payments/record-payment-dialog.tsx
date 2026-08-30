"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { DollarSign } from "@/lib/lucide";
import { toast } from "sonner";
import { toastInvoiceEmail } from "@/lib/invoice-email-toast";

interface Props {
  studentId?: string;
  studentName?: string;
  onRecorded?: () => void;
  variant?: "default" | "outline";
  size?: "default" | "sm";
  trigger?: React.ReactNode;
}

export function RecordPaymentDialog({ studentId: preselectedId, studentName, onRecorded, variant = "default", size = "default", trigger }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<{ id: string; fullName: string; monthlyFee: number; advanceBalance: number }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; pricePerSession: number | null; priceType: string; students: { id: string; fullName: string }[] }[]>([]);
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState(preselectedId || "");
  const [discount, setDiscount] = useState("0");
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const month = paymentDate.slice(0, 7);

  useEffect(() => {
    if (open) {
      fetch("/api/groups")
        .then((r) => r.json())
        .then((data) => {
          const list = (Array.isArray(data) ? data : []).map((g: any) => ({
            ...g,
            students: g.students || [],
          }));
          setGroups(list);
        })
        .catch(() => {});
      setStudents([]);
      requestAnimationFrame(() => {
        if (!preselectedId) {
          setGroupId("");
          setStudentId("");
        } else {
          setStudentId(preselectedId);
        }
        setDiscount("0");
        setAmount("");
      });
    }
  }, [open, preselectedId]);

  useEffect(() => {
    if (!open || !groupId) return;
    fetch(`/api/groups?id=${encodeURIComponent(groupId)}&withStudents=true`)
      .then((r) => r.json())
      .then((data) => {
        const g = Array.isArray(data) ? data[0] : null;
        if (!g) return;
        setGroups((prev) =>
          prev.map((x) => (x.id === groupId ? { ...x, students: g.students || [], pricePerSession: g.pricePerSession ?? x.pricePerSession, priceType: g.priceType ?? x.priceType } : x))
        );
        const price = Number(g.pricePerSession);
        if (Number.isFinite(price) && price > 0) setAmount((prev) => prev || String(price));
      })
      .catch(() => {});
  }, [open, groupId]);

  useEffect(() => {
    if (!open || !studentId) return;
    fetch(`/api/students?id=${encodeURIComponent(studentId)}&limit=1&page=1&view=lite`)
      .then((r) => r.json())
      .then((json) => {
        const list = Array.isArray(json) ? json : json.data || [];
        const hit = list.find((s: any) => s.id === studentId);
        if (hit) {
          setStudents((prev) => {
            const others = prev.filter((s) => s.id !== studentId);
            return [...others, hit];
          });
        }
      })
      .catch(() => {});
  }, [open, studentId]);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const displayGroups = groups;
  const availableStudents = selectedGroup?.students || [];
  const selectedStudentData = students.find((s) => s.id === studentId);
  const groupPrice = Number(selectedGroup?.pricePerSession);
  const basePrice = Number.isFinite(groupPrice) && groupPrice > 0 ? groupPrice : 0;
  const discountPct = Math.min(100, Math.max(0, Number(discount) || 0));
  const amountDue = basePrice > 0 ? Math.round(basePrice * (1 - discountPct / 100)) : 0;
  const advanceBalance = selectedStudentData?.advanceBalance ?? 0;
  const maxAllowed = amountDue > 0 ? amountDue : Infinity;

  function applyDiscount(pctStr: string, gid = groupId, sid = studentId) {
    setDiscount(pctStr);
    const pct = Math.min(100, Math.max(0, Number(pctStr) || 0));
    const g = groups.find((x) => x.id === gid);
    const price = Number(g?.pricePerSession);
    if (Number.isFinite(price) && price > 0) {
      setAmount(String(Math.round(price * (1 - pct / 100))));
    }
    void sid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!studentId || !groupId || !month || !amt || amt <= 0) return;
    if (amt > maxAllowed) {
      toast.error(t("payments.amount_exceeds"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, groupId, month, amount: amt, paymentDate, discountPercent: discountPct }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t("payments.paymentRecorded"));
        toastInvoiceEmail(t, data.invoiceEmail);
        setOpen(false);
        if (onRecorded) onRecorded();
        if (typeof window !== "undefined") window.location.reload();
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  const displayName = studentName || students.find((s) => s.id === studentId)?.fullName || "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={variant} size={size}>
            <DollarSign className="size-4" /> {t("payments.newPayment")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName ? `${t("payments.newPayment")} — ${displayName}` : t("payments.newPayment")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group">{t("payments.group")}</Label>
            <select
              id="group"
              value={groupId}
              onChange={(e) => {
                const gid = e.target.value;
                setGroupId(gid);
                if (!preselectedId) setStudentId("");
                applyDiscount(discount, gid);
              }}
              required
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t("common.select")}</option>
              {displayGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {Number(g.pricePerSession) > 0 ? ` — ${formatCurrency(Number(g.pricePerSession))}` : ""}
                </option>
              ))}
            </select>
          </div>
          {!preselectedId && (
            <div className="space-y-2">
              <Label htmlFor="student">{t("payments.student")}</Label>
              <select
                id="student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{t("common.select")}</option>
                {availableStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="paymentDate">{t("payments.payment_date")}</Label>
            <div className="flex gap-2">
              <Input id="paymentDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="flex-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  setPaymentDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                }}
              >
                {t("common.today")}
              </Button>
            </div>
          </div>

          {groupId && studentId && basePrice > 0 && (
            <div className="space-y-2">
              <Label htmlFor="discount">{t("payments.discount_label")}</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="1"
                value={discount}
                onChange={(e) => applyDiscount(e.target.value)}
              />
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("payments.base_price")}</span>
                  <span>{formatCurrency(basePrice)}</span>
                </div>
                {discountPct > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t("payments.discount_value", { pct: discountPct })}</span>
                    <span>−{formatCurrency(basePrice - amountDue)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1.5">
                  <span>{t("payments.due_after_discount")}</span>
                  <span>{formatCurrency(amountDue)}</span>
                </div>
              </div>
            </div>
          )}

          {groupId && studentId && (amountDue > 0 || advanceBalance > 0) && advanceBalance > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.advance")}</span>
                <span className="font-semibold text-blue-600">{formatCurrency(advanceBalance)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">{t("payments.amount_paid")}</Label>
            <Input id="amount" type="number" min="0" step="100" max={Number.isFinite(maxAllowed) ? maxAllowed : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t("payments.amount_paid")} />
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving || !amount || Number(amount) <= 0 || (Number.isFinite(maxAllowed) && Number(amount) > maxAllowed)}>
              {saving ? t("payments.recording") : t("payments.record")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

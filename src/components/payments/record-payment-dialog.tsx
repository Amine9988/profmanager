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
import { DollarSign } from "lucide-react";
import { toast } from "sonner";

interface Props {
  studentId?: string;
  studentName?: string;
  onRecorded?: () => void;
  variant?: "default" | "outline";
  size?: "default" | "sm";
}

export function RecordPaymentDialog({ studentId: preselectedId, studentName, onRecorded, variant = "default", size = "default" }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<{ id: string; fullName: string; monthlyFee: number; advanceBalance: number }[]>([]);
  const [studentId, setStudentId] = useState(preselectedId || "");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingPayment, setExistingPayment] = useState<{ amountDue: number; amountPaid: number } | null>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/students?status=active")
        .then((r) => r.json())
        .then(setStudents)
        .catch(() => {});
      requestAnimationFrame(() => {
        if (!preselectedId) setStudentId("");
        setAmount("");
        setNote("");
        setExistingPayment(null);
      });
    }
  }, [open, preselectedId]);

  useEffect(() => {
    if (!studentId || !month) return;
    fetch(`/api/payments?studentId=${studentId}&year=${month.split("-")[0]}&month=${month.split("-")[1]}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.length > 0) {
          setExistingPayment({ amountDue: data[0].amountDue, amountPaid: data[0].amountPaid });
        } else {
          setExistingPayment(null);
        }
      })
      .catch(() => setExistingPayment(null));
  }, [studentId, month]);

  const selectedStudentData = students.find((s) => s.id === studentId);
  const amountDue = existingPayment?.amountDue ?? selectedStudentData?.monthlyFee ?? 0;
  const alreadyPaid = existingPayment?.amountPaid ?? 0;
  const remaining = Math.max(amountDue - alreadyPaid, 0);
  const advanceBalance = selectedStudentData?.advanceBalance ?? 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!studentId || !month || !amt || amt <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, month, amount: amt, note: note || undefined }),
      });
      if (res.ok) {
        toast.success(t("payments.paymentRecorded"));
        setOpen(false);
        if (onRecorded) onRecorded();
        if (typeof window !== "undefined") window.location.reload();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
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
        <Button variant={variant} size={size}>
          <DollarSign className="size-4" /> {t("payments.newPayment")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{displayName ? `${t("payments.newPayment")} — ${displayName}` : t("payments.newPayment")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="month">{t("payments.month")}</Label>
            <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
          </div>

          {studentId && month && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.amount_due")}</span>
                <span className="font-semibold">{formatCurrency(amountDue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.amount_paid")}</span>
                <span className="font-semibold text-green-600">{formatCurrency(alreadyPaid)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-muted-foreground">{t("payments.remaining")}</span>
                <span className={`font-semibold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(remaining)}
                </span>
              </div>
              {advanceBalance > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("payments.advance")}</span>
                  <span className="font-semibold text-blue-600">{formatCurrency(advanceBalance)}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">{t("payments.amount_paid")}</Label>
            <Input id="amount" type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t("payments.amount_paid")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">{t("payments.notes_label")}</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("payments.notes_placeholder")} />
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving || !amount || Number(amount) <= 0}>
              {saving ? t("payments.recording") : t("payments.record")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

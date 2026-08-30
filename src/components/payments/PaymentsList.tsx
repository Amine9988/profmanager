"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useT, useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";
import { jsPDF } from "jspdf";
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
import { Plus, RefreshCw, Trash2, FileText, AlertTriangle, ChevronLeft, ChevronRight, Lock, Eye, EyeOff, Search } from "@/lib/lucide";
import html2canvas from "html2canvas-pro";
import { toast } from "sonner";
import { toastInvoiceEmail } from "@/lib/invoice-email-toast";
import Link from "next/link";

function EditPaymentModal({
  payment,
  onClose,
  onSaved,
  t,
}: {
  payment: Payment;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [amountPaid, setAmountPaid] = useState(payment.amountPaid);
  const [note, setNote] = useState(payment.note ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (amountPaid < 0 || amountPaid > payment.amountDue) {
      toast.error(t("payments.invalid_amount"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPaid,
          note: note || null,
          paidAt: amountPaid > 0 ? new Date().toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t("payments.paymentRecorded"));
        toastInvoiceEmail(t, data.invoiceEmail);
        onSaved();
        onClose();
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  const remaining = Math.max(payment.amountDue - amountPaid, 0);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("payments.edit_payment")} â€” {payment.student?.fullName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("payments.amount_due")}</span>
              <span className="font-semibold">{formatCurrency(payment.amountDue)}</span>
            </div>
            <div className="space-y-2">
              <Label>{t("payments.amount_paid")}</Label>
              <Input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
                min={0}
                max={payment.amountDue}
              />
            </div>
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-muted-foreground">{t("payments.remaining")}</span>
              <span className={`font-semibold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("payments.notes_label")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("payments.notes_placeholder")} />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("payments.recording") : t("payments.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface Payment {
  id: string | null;
  isVirtual?: boolean;
  studentId: string;
  month: string;
  amountDue: number;
  amountPaid: number;
  discountPercent?: number | null;
  status: string;
  paidAt: string | null;
  note: string | null;
  receiptNumber: string | null;
  receiptSequence: number | null;
  groupId: string | null;
  groupName?: string | null;
  student: {
    id: string;
    fullName: string;
    monthlyFee: number;
    groupStudents?: Array<{
      id: string;
      studentId: string;
      groupId: string;
      status: string;
      groups?: { id: string; name: string } | null;
      group?: { id: string; name: string } | null;
    }>;
  };
}

interface PaymentSummary {
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
  paidCount: number;
  overdueCount: number;
  pendingCount: number;
  partialCount: number;
}

interface PaymentsListProps {
  year: number;
  month: number;
  onRefresh?: () => void;
}

function PaymentRecordDialog({ onRecorded, defaultMonth }: { onRecorded: (month?: string) => void; defaultMonth?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<{ id: string; fullName: string; monthlyFee: number }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; pricePerSession: number | null; priceType: string; students: { id: string; fullName: string }[] }[]>([]);
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [month, setMonth] = useState(defaultMonth || new Date().toISOString().slice(0, 7));
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [discount, setDiscount] = useState("0");

  useEffect(() => {
    if (open) {
      fetch("/api/groups")
        .then((r) => r.json())
        .then((data) =>
          setGroups((Array.isArray(data) ? data : []).map((g: any) => ({ ...g, students: g.students || [] })))
        )
        .catch(() => {});
      setStudents([]);
      requestAnimationFrame(() => {
        setGroupId("");
        setStudentId("");
        setAmount("");
        setDiscount("0");
        setMonth(defaultMonth || new Date().toISOString().slice(0, 7));
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !groupId) return;
    fetch(`/api/groups?id=${encodeURIComponent(groupId)}&withStudents=true`)
      .then((r) => r.json())
      .then((data) => {
        const g = Array.isArray(data) ? data[0] : null;
        if (!g) return;
        setGroups((prev) =>
          prev.map((x) =>
            x.id === groupId
              ? { ...x, students: g.students || [], pricePerSession: g.pricePerSession ?? x.pricePerSession, priceType: g.priceType ?? x.priceType }
              : x
          )
        );
      })
      .catch(() => {});
  }, [open, groupId]);

  useEffect(() => {
    if (!open || !studentId) return;
    const fromGroup = groups.flatMap((g) => g.students || []).find((s) => s.id === studentId);
    if (fromGroup) {
      setStudents((prev) => {
        if (prev.some((s) => s.id === studentId)) return prev;
        return [...prev, { id: fromGroup.id, fullName: fromGroup.fullName, monthlyFee: 0 }];
      });
    }
  }, [open, studentId, groups]);

  const selectedGroup = groups.find((g) => g.id === groupId);
  const availableStudents = selectedGroup?.students || [];
  const selectedStudent = students.find((s) => s.id === studentId);
  const studentName = selectedStudent?.fullName || "";
  const discountPct = Math.min(100, Math.max(0, Number(discount) || 0));
  const groupPrice = Number(selectedGroup?.pricePerSession);
  const basePrice = Number.isFinite(groupPrice) && groupPrice > 0 ? groupPrice : 0;
  const typedPaid = Number(amount) || 0;
  const amountDue = basePrice > 0 ? Math.round(basePrice * (1 - discountPct / 100)) : typedPaid;
  const remaining = Math.max(amountDue - typedPaid, 0);

  function applyDiscountAndFill(pctStr: string, gid = groupId) {
    setDiscount(pctStr);
    const pct = Math.min(100, Math.max(0, Number(pctStr) || 0));
    const g = groups.find((x) => x.id === gid);
    const price = Number(g?.pricePerSession);
    if (Number.isFinite(price) && price > 0) setAmount(String(Math.round(price * (1 - pct / 100))));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!studentId || !groupId || !month || !amt || amt <= 0) return;
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
        onRecorded(month);
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {t("payments.newPayment")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{studentName ? `${t("payments.newPayment")} â€” ${studentName}` : t("payments.newPayment")}</DialogTitle>
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
                setStudentId("");
                const g = groups.find((x) => x.id === gid);
                const price = Number(g?.pricePerSession);
                if (Number.isFinite(price) && price > 0) setAmount(String(Math.round(price * (1 - discountPct / 100))));
                else setAmount("");
              }}
              required
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">{t("common.select")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {Number(g.pricePerSession) > 0 ? ` — ${formatCurrency(Number(g.pricePerSession))}` : ""}
                </option>
              ))}
            </select>
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="month">{t("payments.month")}</Label>
            <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
          </div>
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
              <Label htmlFor="pdiscount">{t("payments.discount_label")}</Label>
              <Input
                id="pdiscount"
                type="number"
                min="0"
                max="100"
                step="1"
                value={discount}
                onChange={(e) => applyDiscountAndFill(e.target.value)}
              />
            </div>
          )}

          {groupId && studentId && month && (basePrice > 0 || typedPaid > 0) && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              {basePrice > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("payments.base_price")}</span>
                  <span>{formatCurrency(basePrice)}</span>
                </div>
              )}
              {discountPct > 0 && basePrice > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>{t("payments.discount_value", { pct: discountPct })}</span>
                  <span>−{formatCurrency(basePrice - amountDue)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-muted-foreground">{t("payments.due_after_discount")}</span>
                <span className="font-semibold">{formatCurrency(amountDue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payments.amount_paid")}</span>
                <span className="font-semibold text-green-600">{formatCurrency(typedPaid)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-muted-foreground">{t("payments.remaining")}</span>
                <span className={`font-semibold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">{t("payments.amount_paid")}</Label>
            <Input id="amount" type="number" min="0" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t("payments.amount_paid")} />
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

export default function PaymentsList({ year, month }: PaymentsListProps) {
  const t = useT();
  const { direction } = useI18n();
  const align = direction === "rtl" ? "right" : "left";
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({
    totalDue: 0, totalPaid: 0, totalRemaining: 0,
    paidCount: 0, overdueCount: 0, pendingCount: 0, partialCount: 0,
  });
  const [viewMonth, setViewMonth] = useState<string>(() => {
    const d = new Date(year, month - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [allTime, setAllTime] = useState(false);

  function changeMonth(delta: number) {
    setViewMonth((prev) => {
      const [y, m] = prev.split("-").map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetError, setResetError] = useState(false);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  const handleReveal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pinValue }),
      });
      if (res.ok) {
        setRevealed(true);
        setPinValue("");
        setPinError(false);
        setShowPinDialog(false);
      } else {
        setPinError(true);
      }
    } catch {
      setPinError(true);
    }
  };

  const filteredPayments = useMemo(() => {
    const base = statusFilter === "all" ? payments : payments.filter((p) => p.status === statusFilter);
    return base.filter((p) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const groups = p.groupName || "";
      const month = new Date(p.month).toLocaleDateString(undefined, { year: "numeric", month: "long" });
      return [p.student?.fullName, groups, month, p.receiptNumber]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [payments, statusFilter, search]);

  useEffect(() => { setPage(1); }, [search, statusFilter, viewMonth, allTime]);
  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const paginatedPayments = useMemo(() => filteredPayments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredPayments, page]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  const monthOverdue = payments.filter((p) => p.status === "overdue" || p.status === "partial");
  const monthOverdueTotal = monthOverdue.reduce((acc, p) => acc + Math.max(p.amountDue - p.amountPaid, 0), 0);
  const monthOverdueStudents = new Set(monthOverdue.map((p) => p.studentId)).size;

  function calcSummary(data: Payment[]): PaymentSummary {
    const s: PaymentSummary = {
      totalDue: 0, totalPaid: 0, totalRemaining: 0,
      paidCount: 0, overdueCount: 0, pendingCount: 0, partialCount: 0,
    };
    const overdueIds = new Set<string>();
    const pendingIds = new Set<string>();
    const paidIds = new Set<string>();
    for (const p of data) {
      s.totalDue += p.amountDue;
      s.totalPaid += p.amountPaid;
      s.totalRemaining += Math.max(p.amountDue - p.amountPaid, 0);
      if (p.status === "overdue" || p.status === "partial") overdueIds.add(p.studentId);
      else if (p.status === "pending") pendingIds.add(p.studentId);
      else if (p.status === "paid") paidIds.add(p.studentId);
    }
    s.overdueCount = overdueIds.size;
    s.pendingCount = [...pendingIds].filter((id) => !overdueIds.has(id)).length;
    s.paidCount = [...paidIds].filter((id) => !overdueIds.has(id) && !pendingIds.has(id)).length;
    return s;
  }

  const fetchPayments = useCallback(async () => {
    const y = Number(viewMonth.slice(0, 4));
    const m = Number(viewMonth.slice(5, 7));
    const url = allTime ? "/api/payments?all=1" : `/api/payments?year=${y}&month=${m}`;
    const res = await fetch(url);
    if (res.ok) {
      const data: Payment[] = (await res.json()).map((p: Payment) =>
        p.status === "partial" ? { ...p, status: "overdue" } : p
      );
      setPayments(data);
      setSummary(calcSummary(data));
    }
  }, [viewMonth, allTime]);

  const handleRecorded = useCallback(
    (recordedMonth?: string) => {
      if (allTime) {
        fetchPayments();
        return;
      }
      if (recordedMonth && recordedMonth !== viewMonth) {
        setViewMonth(recordedMonth);
      } else {
        fetchPayments();
      }
    },
    [fetchPayments, viewMonth, allTime]
  );

  useEffect(() => {
    setLoading(true);
    fetchPayments().finally(() => setLoading(false));
  }, [fetchPayments]);

  const statusColors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
    partial: "bg-blue-100 text-blue-800",
  };

  const statusLabels: Record<string, string> = {
    paid: t("payments.paid"),
    overdue: t("payments.overdue"),
    pending: t("payments.pending"),
    partial: t("payments.partial"),
  };

  const [generating, setGenerating] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);
  const [bulkDeletingPayment, setBulkDeletingPayment] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const pdfViewerUrlRef = useRef<string | null>(null);

  function buildInvoiceHtml(p: Payment, i: number): string {
    const statusLabel = p.status === "paid" ? "مدفوع" : p.status === "partial" ? "جزئي" : p.status === "overdue" ? "متأخر" : "معلق";
    const monthLabel = new Date(p.month).toLocaleDateString("ar-DZ", { year: "numeric", month: "long" });
    const d = p.paidAt ? new Date(p.paidAt) : null;
    const isMidnight = d ? d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 : true;
    const dateObj = d && !isMidnight ? d : new Date();
    const dateLabel = dateObj.toLocaleString("ar-DZ", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const pct = Number(p.discountPercent) || 0;
    const baseDue = pct > 0 ? Math.round(p.amountDue / (1 - pct / 100)) : p.amountDue;
    const discountAmount = baseDue - p.amountDue;
    const remaining = Math.max(p.amountDue - p.amountPaid, 0);
    const groupLabel = p.groupName || "—";
    return `
      <div id="inv-${i}" dir="rtl" style="width:350px;margin:0 auto 20px;padding:24px;font-family:'Segoe UI',Arial,sans-serif;background:#fff;direction:rtl;text-align:right;border:1px solid #e2e8f0;border-radius:8px;">
        <h2 style="text-align:center;font-size:18px;font-weight:700;margin:0 0 8px;color:#1e293b;">فاتورة الدفع</h2>
        <hr style="border:none;border-top:1px solid #cbd5e1;margin:0 0 16px;" />
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:3px 0;color:#475569;">الطالب:</td><td style="padding:3px 0;font-weight:600;text-align:left;">${p.student?.fullName || "—"}</td></tr>
          <tr><td style="padding:3px 0;color:#475569;">المجموعة:</td><td style="padding:3px 0;font-weight:600;text-align:left;">${groupLabel}</td></tr>
          <tr><td style="padding:3px 0;color:#475569;">الشهر:</td><td style="padding:3px 0;font-weight:600;text-align:left;">${monthLabel}</td></tr>
          <tr><td style="padding:3px 0;color:#475569;">التاريخ:</td><td style="padding:3px 0;font-weight:600;text-align:left;">${dateLabel}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #cbd5e1;margin:12px 0;" />
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead><tr style="background:#f1f5f9;"><th style="padding:6px 8px;text-align:right;">البيان</th><th style="padding:6px 8px;text-align:left;">المبلغ</th></tr></thead>
          <tbody>
            ${pct > 0 ? `<tr><td style="padding:5px 8px;">السعر الأساسي</td><td style="padding:5px 8px;text-align:left;">${formatCurrency(baseDue)}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:5px 8px;color:#16a34a;">التخفيض (${pct}%)</td><td style="padding:5px 8px;text-align:left;color:#16a34a;">−${formatCurrency(discountAmount)}</td></tr>
            <tr><td style="padding:5px 8px;font-weight:600;">المستحق بعد التخفيض</td><td style="padding:5px 8px;text-align:left;font-weight:600;">${formatCurrency(p.amountDue)}</td></tr>` : `<tr><td style="padding:5px 8px;">المبلغ المستحق</td><td style="padding:5px 8px;text-align:left;">${formatCurrency(p.amountDue)}</td></tr>`}
            <tr style="background:#f8fafc;"><td style="padding:5px 8px;">المبلغ المدفوع</td><td style="padding:5px 8px;text-align:left;">${formatCurrency(p.amountPaid)}</td></tr>
            <tr><td style="padding:5px 8px;font-weight:600;">المبلغ المتبقي</td><td style="padding:5px 8px;text-align:left;font-weight:600;">${formatCurrency(remaining)}</td></tr>
          </tbody>
        </table>
        <hr style="border:none;border-top:1px solid #cbd5e1;margin:12px 0;" />
        <p style="font-size:14px;font-weight:700;margin:0;">الحالة: ${statusLabel}</p>
        <hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0 8px;" />
        <p style="text-align:center;font-size:11px;color:#64748b;margin:0;">شكراً لكم</p>
      </div>
    `;
  }

  async function handlePrintInvoice(p: Payment) {
    setPrinting(true);
    let container: HTMLDivElement | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      // Render HTML to a hidden container
      container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;";
      container.innerHTML = buildInvoiceHtml(p, 0);
      document.body.appendChild(container);
      fallbackTimer = setTimeout(() => container?.remove(), 5000);
      await new Promise((r) => setTimeout(r, 300));
      const el = document.getElementById("inv-0");
      if (!el) { toast.error("خطأ في إنشاء الفاتورة"); return; }
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const imgData = canvas.toDataURL("image/png");
      const ratio = pdf.internal.pageSize.getWidth() / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdf.internal.pageSize.getWidth(), canvas.height * ratio);
      if (pdfViewerUrlRef.current) URL.revokeObjectURL(pdfViewerUrlRef.current);
      const url = URL.createObjectURL(pdf.output("blob"));
      pdfViewerUrlRef.current = url;
      setPdfViewerUrl(url);
    } catch (e) {
      console.error("Invoice PDF error:", e);
      toast.error("فشل إنشاء الفاتورة");
    } finally {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (container && container.parentElement) container.remove();
      else {
        const c = document.getElementById("inv-0")?.parentElement;
        c?.remove();
      }
      setPrinting(false);
    }
  }

  function getPaymentKey(p: Payment): string {
    return p.id ?? `${p.studentId}-${p.month}`;
  }

  async function handlePrintSelectedInvoices() {
    const selected = filteredPayments.filter((p) => selectedIds.has(getPaymentKey(p)));
    if (selected.length === 0) return;
    setPrinting(true);
    let container: HTMLDivElement | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      container = document.createElement("div");
      container.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;";
      container.innerHTML = selected.map((p, i) => buildInvoiceHtml(p, i)).join("");
      document.body.appendChild(container);
      fallbackTimer = setTimeout(() => container?.remove(), 8000);
      await new Promise((r) => setTimeout(r, 400));
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      for (let i = 0; i < selected.length; i++) {
        if (i > 0) pdf.addPage();
        const el = document.getElementById("inv-" + i);
        if (!el) continue;
        const canvas = await html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const imgData = canvas.toDataURL("image/png");
        const ratio = pdf.internal.pageSize.getWidth() / canvas.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdf.internal.pageSize.getWidth(), canvas.height * ratio);
      }
      if (pdfViewerUrlRef.current) URL.revokeObjectURL(pdfViewerUrlRef.current);
      const url = URL.createObjectURL(pdf.output("blob"));
      pdfViewerUrlRef.current = url;
      setPdfViewerUrl(url);
      toast.success(`تم إنشاء ${selected.length} فاتورة`);
    } catch (e) {
      console.error("Bulk invoice PDF error:", e);
      toast.error("فشل إنشاء الفواتير");
    } finally {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (container && container.parentElement) container.remove();
      else document.getElementById("inv-0")?.parentElement?.remove();
      setPrinting(false);
    }
  }

  async function generateInvoices() {
    setGenerating(true);
    try {
      const res = await fetch("/api/payments/generate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const msg = data.created > 0
          ? t("dashboard.generate_invoices") + ` â€” ${data.created} ${t("payments.title").toLowerCase()}`
          : t("common.noData");
        toast.success(msg);
        fetchPayments();
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleMarkAsPaid(payment: Payment) {
    setRecordingId(payment.id);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaid: payment.amountDue }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t("payments.paymentRecorded"));
        toastInvoiceEmail(t, data.invoiceEmail);
        fetchPayments();
      } else {
        toast.error(data.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setRecordingId(null);
    }
  }

  async function handleMarkAsUnpaid(payment: Payment) {
    const confirmed = window.confirm(t("payments.confirm_revert"));
    if (!confirmed) return;
    setRecordingId(payment.id);
    try {
      const res = await fetch(`/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaid: 0, paidAt: null }),
      });
      if (res.ok) {
        toast.success(t("payments.reverted"));
        fetchPayments();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setRecordingId(null);
    }
  }

  async function handleDeletePayment() {
    if (!deletingPayment) return;
    setRecordingId(deletingPayment.id);
    try {
      const res = await fetch(`/api/payments/${deletingPayment.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("payments.payment_deleted"));
        setDeletingPayment(null);
        fetchPayments();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setRecordingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredPayments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPayments.map((p) => getPaymentKey(p))));
    }
  }

  async function handleBulkDelete() {
    const selected = filteredPayments.filter((p) => selectedIds.has(getPaymentKey(p)));
    const ids = selected.filter((p) => p.id).map((p) => p.id as string);
    if (ids.length === 0) {
      toast.error(t("payments.no_payments"));
      return;
    }
    setBulkDeletingPayment(true);
    try {
      const res = await fetch("/api/payments/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        toast.success(t("payments.payment_deleted"));
        setBulkDeletingPayment(false);
        setSelectedIds(new Set());
        fetchPayments();
      } else {
        const err = await res.json();
        toast.error(err.error || t("common.error"));
      }
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBulkDeletingPayment(false);
    }
  }

  if (loading) return <div className="p-4 text-center text-gray-500">{t("common.loading")}</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} title={t("payments.prev_month")} disabled={allTime}>
            {direction === "rtl" ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
          <Input type="month" value={viewMonth} onChange={(e) => e.target.value && setViewMonth(e.target.value)} className="w-44" aria-label={t("payments.month")} disabled={allTime} />
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)} title={t("payments.next_month")} disabled={allTime}>
            {direction === "rtl" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={allTime}
            onChange={(e) => setAllTime(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t("payments.all_time")}
        </label>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.total_due")}</p>
            <p className="text-xl font-bold">{revealed ? formatCurrency(summary.totalDue) : "••••••"}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.total_paid")}</p>
            <p className="text-xl font-bold text-green-600">{revealed ? formatCurrency(summary.totalPaid) : "••••••"}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.total_remaining")}</p>
            <p className="text-xl font-bold text-red-600">{revealed ? formatCurrency(summary.totalRemaining) : "••••••"}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.status")}</p>
            <p className="text-lg font-semibold">
              {summary.paidCount} {t("payments.paid")} {summary.overdueCount} {t("payments.overdue")}
            </p>
          </div>
        </div>
        <div className="ml-4 shrink-0 flex flex-col items-stretch gap-2">
          {!revealed ? (
            <Button variant="outline" size="sm" onClick={() => setShowPinDialog(true)}>
              <Lock className="size-4 mr-1" /> {t("caisse.reveal")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setRevealed(false)}>
              <EyeOff className="size-4 mr-1" /> {t("caisse.hide")}
            </Button>
          )}
          <PaymentRecordDialog onRecorded={handleRecorded} defaultMonth={viewMonth} />
        </div>
      </div>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("caisse.pin_required")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReveal} className="space-y-4">
            <Input
              type="password"
              value={pinValue}
              onChange={(e) => { setPinValue(e.target.value); setPinError(false); }}
              autoFocus
              autoComplete="off"
            />
            {pinError && <p className="text-sm text-destructive">{t("caisse.wrong_password")}</p>}
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => { setResetInput(""); setResetError(false); setShowResetDialog(true); }}
            >
              {t("settings.password_forgot")}
            </button>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowPinDialog(false); setPinValue(""); setPinError(false); }}>
                {t("common.cancel")}
              </Button>
              <Button type="submit"><Eye className="size-4 mr-1" /> {t("caisse.reveal")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("settings.password_forgot") || "إعادة كلمة المرور"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("settings.password_enter_default") || "أدخل كلمة المرور الافتراضية profmanager1234 للتأكيد:"}</p>
            <Input type="password" value={resetInput} onChange={(e) => { setResetInput(e.target.value); setResetError(false); }} placeholder="profmanager1234" autoFocus />
            {resetError && <p className="text-sm text-destructive">{t("caisse.wrong_password") || "كلمة المرور غير صحيحة"}</p>}
          </div>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => { setShowResetDialog(false); setResetInput(""); setResetError(false); }}>{t("common.cancel")}</Button>
            <Button type="button" variant="destructive" onClick={async () => {
              if (resetInput !== "profmanager1234") { setResetError(true); toast.error(t("caisse.wrong_password") || "كلمة المرور غير صحيحة"); return; }
              if (!confirm(t("settings.password_reset_confirm") || "هل أنت متأكد من إعادة كلمة المرور إلى الافتراضية profmanager1234؟")) return;
              const r = await fetch("/api/auth/reset-password", { method: "POST" });
              if (r.ok) { toast.success(t("settings.password_reset_success") || "تمت إعادة كلمة المرور إلى profmanager1234"); setShowResetDialog(false); setResetInput(""); setPinValue(""); setPinError(false); } else toast.error(t("common.error"));
            }}>{t("common.confirm") || "تأكيد"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {monthOverdue.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between gap-2">
          <p className="text-sm text-red-800">
            <AlertTriangle className="size-4 inline mr-1 -mt-0.5" />
            {t("payments.overdue_aggregate", {
              count: monthOverdueStudents,
              amount: formatCurrency(monthOverdueTotal),
            })}
          </p>
          <Link href="/overdue" className="text-sm font-medium text-red-700 underline hover:text-red-900 whitespace-nowrap">
            {t("dashboard.overdue_title")}
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-56 ps-8"
          />
        </div>
        {["all", "paid", "overdue"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
            }`}
          >
            {s === "all" ? t("common.all") : statusLabels[s] || t(`payments.${s}`)}
          </button>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-red-800">
            {t("payments.selected_count", { count: selectedIds.size })}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeletingPayment(true)}
            disabled={bulkDeletingPayment || allTime}
            title={allTime ? t("payments.bulk_delete_disabled_hint") : undefined}
          >
            <Trash2 className="size-4 mr-1" /> {t("payments.bulk_delete")}
          </Button>
          <Button variant="default" size="sm" onClick={handlePrintSelectedInvoices} disabled={printing}>
            <FileText className="size-4 mr-1" /> {t("payments.print_selected")}
          </Button>
        </div>
      )}

      {filteredPayments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {t("payments.no_payments")}
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: "1100px" }}>
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "auto" }} />
            </colgroup>
            <thead>
              <tr className="bg-muted/50 border-b">
                <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>
                  <input
                    type="checkbox"
                    checked={filteredPayments.length > 0 && selectedIds.size === filteredPayments.length}
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("students.form.fullName")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("common.group")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("payments.month")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("payments.amount_due")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("payments.amount_paid")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("payments.remaining")}</th>
                <th style={{ textAlign: align, padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("payments.status")}</th>
                <th style={{ textAlign: "center", padding: "12px", fontWeight: 600, fontSize: "13px", color: "hsl(var(--foreground))" }}>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPayments.map((p, i) => {
                const remaining = Math.max(p.amountDue - p.amountPaid, 0);
                return (
                    <tr key={getPaymentKey(p)} className={`border-b ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(getPaymentKey(p))}
                        onChange={() => toggleSelect(getPaymentKey(p))}
                        className="size-4 rounded border-gray-300 cursor-pointer"
                      />
                    </td>
                    <td style={{ padding: "12px", textAlign: align, fontWeight: 600, fontSize: "14px", color: "hsl(var(--foreground))" }}>{p.student?.fullName}</td>
                    <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                      {p.groupName || "—"}
                    </td>
                    <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>
                      {new Date(p.month).toLocaleDateString(undefined, { year: "numeric", month: "long" })}
                    </td>
                    <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>{formatCurrency(p.amountDue)}</td>
                    <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>{formatCurrency(p.amountPaid)}</td>
                    <td style={{ padding: "12px", textAlign: align, fontSize: "14px", color: "hsl(var(--foreground))" }}>{formatCurrency(remaining)}</td>
                    <td style={{ padding: "12px", textAlign: align }}>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || ""}`}>
                        {statusLabels[p.status] || t(`payments.${p.status}`)}
                      </span>
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handlePrintInvoice(p)}
                          disabled={printing}
                          className="px-2.5 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          title="ÙØ§ØªÙˆØ±Ø©"
                        >
                          <FileText className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingPayment(p)}
                          className="px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                        >
                          {t("common.edit")}
                        </button>
                        {p.status !== "paid" ? (
                          <button
                            onClick={() => handleMarkAsPaid(p)}
                            disabled={recordingId === p.id}
                            className="px-2.5 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {recordingId === p.id ? "..." : t("payments.paid")}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMarkAsUnpaid(p)}
                            disabled={recordingId === p.id}
                            className="px-2.5 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {recordingId === p.id ? "..." : t("payments.revert_status")}
                          </button>
                        )}
                        <button
                          onClick={() => setDeletingPayment(p)}
                          className="px-2.5 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                        >
                          <Trash2 className="size-3.5 inline" /> {t("payments.delete_payment")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredPayments.length > PAGE_SIZE && (
        <div className="flex items-center justify-between py-3 text-sm">
          <span className="text-muted-foreground">{page} / {totalPages} — {filteredPayments.length} {t("common.total")}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>{t("common.previous")}</Button>
            <span className="px-2 text-xs flex items-center">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t("common.next")}</Button>
          </div>
        </div>
      )}

      {editingPayment && (
        <EditPaymentModal
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={fetchPayments}
          t={t}
        />
      )}

      <Dialog open={!!deletingPayment} onOpenChange={() => setDeletingPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payments.delete_payment")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("payments.delete_confirm")}</p>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setDeletingPayment(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeletePayment}
              disabled={recordingId === deletingPayment?.id}
            >
              {recordingId === deletingPayment?.id ? "..." : t("payments.delete_confirm_yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeletingPayment} onOpenChange={() => setBulkDeletingPayment(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payments.bulk_delete")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("payments.bulk_delete_confirm", { count: selectedIds.size })}
          </p>
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setBulkDeletingPayment(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleBulkDelete}
            >
              {t("payments.delete_confirm_yes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pdfViewerUrl} onOpenChange={(o) => { if (!o) { setPdfViewerUrl(null); if (pdfViewerUrlRef.current) { URL.revokeObjectURL(pdfViewerUrlRef.current); pdfViewerUrlRef.current = null; } } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("payments.title")}</DialogTitle>
          </DialogHeader>
          {pdfViewerUrl && (
            <iframe src={pdfViewerUrl} className="w-full flex-1 min-h-0 border-0 rounded" style={{ height: "calc(90vh - 120px)" }} />
          )}
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => { const a = document.createElement("a"); a.href = pdfViewerUrl!; a.download = "ÙÙˆØ§ØªÙŠØ±-" + new Date().toISOString().slice(0, 10) + ".pdf"; a.click(); }}>
              <FileText className="size-4 ml-1" /> {t("payments.download_pdf")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


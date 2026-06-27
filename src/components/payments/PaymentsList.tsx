"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
      if (res.ok) {
        toast.success(t("payments.paymentRecorded"));
        onSaved();
        onClose();
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

  const remaining = payment.amountDue - amountPaid;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("payments.edit_payment")} — {payment.student?.fullName}
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
  id: string;
  studentId: string;
  month: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  paidAt: string | null;
  note: string | null;
  receiptNumber: string | null;
  receiptSequence: number | null;
  student: {
    id: string;
    fullName: string;
    monthlyFee: number;
    groupStudents?: Array<{
      id: string;
      studentId: string;
      groupId: string;
      status: string;
      group: { id: string; name: string };
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

function PaymentRecordDialog({ onRecorded }: { onRecorded: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<{ id: string; fullName: string; monthlyFee: number }[]>([]);
  const [studentId, setStudentId] = useState("");
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
        setStudentId("");
        setAmount("");
        setNote("");
        setExistingPayment(null);
      });
    }
  }, [open]);

  useEffect(() => {
    if (!studentId || !month) {
      setExistingPayment(null);
      return;
    }
    fetch(`/api/payments?studentId=${studentId}&year=${month.split("-")[0]}&month=${month.split("-")[1]}`)
      .then((r) => r.json())
      .then((data) => {
        setExistingPayment(data.length > 0 ? { amountDue: data[0].amountDue, amountPaid: data[0].amountPaid } : null);
      })
      .catch(() => setExistingPayment(null));
  }, [studentId, month]);

  const selectedStudent = students.find((s) => s.id === studentId);
  const studentName = selectedStudent?.fullName || "";
  const amountDue = existingPayment?.amountDue ?? selectedStudent?.monthlyFee ?? 0;
  const alreadyPaid = existingPayment?.amountPaid ?? 0;
  const remaining = Math.max(amountDue - alreadyPaid, 0);

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
        onRecorded();
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> {t("payments.newPayment")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{studentName ? `${t("payments.newPayment")} — ${studentName}` : t("payments.newPayment")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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

export default function PaymentsList({ year, month }: PaymentsListProps) {
  const t = useT();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({
    totalDue: 0, totalPaid: 0, totalRemaining: 0,
    paidCount: 0, overdueCount: 0, pendingCount: 0, partialCount: 0,
  });
  const [loading, setLoading] = useState(true);

  function calcSummary(data: Payment[]): PaymentSummary {
    const s: PaymentSummary = {
      totalDue: 0, totalPaid: 0, totalRemaining: 0,
      paidCount: 0, overdueCount: 0, pendingCount: 0, partialCount: 0,
    };
    for (const p of data) {
      s.totalDue += p.amountDue;
      s.totalPaid += p.amountPaid;
      s.totalRemaining += p.amountDue - p.amountPaid;
      if (p.status === "paid") s.paidCount++;
      else if (p.status === "overdue") s.overdueCount++;
      else if (p.status === "partial") s.partialCount++;
      else s.pendingCount++;
    }
    return s;
  }

  const fetchPayments = useCallback(async () => {
    const res = await fetch(`/api/payments?year=${year}&month=${month}`);
    if (res.ok) {
      const data: Payment[] = await res.json();
      setPayments(data);
      setSummary(calcSummary(data));
    }
  }, [year, month]);

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

  async function generateInvoices() {
    setGenerating(true);
    try {
      const res = await fetch("/api/payments/generate", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        const msg = data.created > 0
          ? t("dashboard.generate_invoices") + ` — ${data.created} ${t("payments.title").toLowerCase()}`
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
      if (res.ok) {
        toast.success(t("payments.paymentRecorded"));
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
    if (selectedIds.size === payments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(payments.map((p) => p.id)));
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
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
      <div className="flex items-center justify-between mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.total_due")}</p>
            <p className="text-xl font-bold">{formatCurrency(summary.totalDue)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.total_paid")}</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(summary.totalPaid)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.total_remaining")}</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(summary.totalRemaining)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">{t("payments.status")}</p>
            <p className="text-lg font-semibold">
              {summary.paidCount} {t("payments.paid")} {summary.overdueCount} {t("payments.overdue")}
            </p>
          </div>
        </div>
        <div className="ml-4 shrink-0 flex gap-2">
          <Button variant="outline" size="sm" onClick={generateInvoices} disabled={generating}>
            <RefreshCw className={`size-4${generating ? " animate-spin" : ""}`} /> {t("dashboard.generate_invoices")}
          </Button>
          <PaymentRecordDialog onRecorded={fetchPayments} />
        </div>
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
            disabled={bulkDeletingPayment}
          >
            <Trash2 className="size-4 mr-1" /> {t("payments.bulk_delete")}
          </Button>
        </div>
      )}

      {payments.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {t("payments.no_payments")}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                  <input
                    type="checkbox"
                    checked={payments.length > 0 && selectedIds.size === payments.length}
                    onChange={toggleSelectAll}
                    className="size-4 rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("students.form.fullName")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.group")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("payments.month")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.receipt")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("payments.amount_due")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("payments.amount_paid")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("payments.remaining")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("payments.status")}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payments.map((p) => {
                const remaining = p.amountDue - p.amountPaid;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="size-4 rounded border-gray-300 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">{p.student?.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {p.student?.groupStudents?.map((gs) => gs.group?.name ?? "?").join(", ") || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(p.month).toLocaleDateString(undefined, { year: "numeric", month: "long" })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                      {p.receiptNumber || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{formatCurrency(p.amountDue)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{formatCurrency(p.amountPaid)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{formatCurrency(remaining)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || ""}`}>
                        {statusLabels[p.status] || t(`payments.${p.status}`)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-1.5">
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
    </div>
  );
}

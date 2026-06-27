"use server";

import { getTenantContext } from "@/lib/auth";
import { isPaymentOverdue } from "@/lib/payments/overdue";

export async function getDailySummary() {
  const { tenantId, supabase } = await getTenantContext();

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  const startOfDay = new Date(y, now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: todaySessionIds } = await supabase
    .from("sessions")
    .select("id")
    .eq("tenantId", tenantId)
    .eq("sessionDate", todayStr);
  const todaySessionIdList = (todaySessionIds || []).map(s => s.id);

  const [
    { count: todayAbsences },
    { data: todayPayments },
    { count: pendingPayments },
    { data: overduePaymentRows },
  ] = await Promise.all([
    todaySessionIdList.length > 0
      ? supabase
          .from("attendances")
          .select("*", { count: "exact", head: true })
          .eq("tenantId", tenantId)
          .eq("status", "absent")
          .in("sessionId", todaySessionIdList)
      : { count: 0 },
    supabase
      .from("payments")
      .select("id, studentId, amountPaid, students(fullName)")
      .eq("tenantId", tenantId)
      .not("paidAt", "is", null)
      .gte("paidAt", startOfDay.toISOString())
      .lte("paidAt", endOfDay.toISOString()),
    supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("tenantId", tenantId)
      .eq("status", "pending"),
    supabase
      .from("payments")
      .select("amountDue, amountPaid, month")
      .eq("tenantId", tenantId)
      .lte("month", `${y}-${m}-01`),
  ]);

  const overduePayments = (overduePaymentRows || []).filter((p) => isPaymentOverdue(Number(p.amountDue), Number(p.amountPaid), p.month)).length;

  return {
    overdueSubs: overduePayments ?? 0,
    expiringSubs: 0,
    todayAbsences: todayAbsences ?? 0,
    todayPaymentsTotal: (todayPayments || []).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0),
    todayPaymentsCount: todayPayments?.length ?? 0,
    todayPayments: (todayPayments || []).map((p: any) => ({
      id: p.id,
      studentId: p.studentId,
      amountPaid: Number(p.amountPaid),
      student: { fullName: (p.students as any).fullName },
    })),
    expectedPaymentsCount: (pendingPayments ?? 0) + (overduePayments ?? 0),
  };
}

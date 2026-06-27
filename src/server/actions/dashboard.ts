"use server";

import { getTenantContext } from "@/lib/auth";
import { getSchoolYearSettings } from "./sessions";
import { checkAbsenceAlerts } from "./notifications";
import { isPaymentOverdue } from "@/lib/payments/overdue";

const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, "0");
const d = String(now.getDate()).padStart(2, "0");
const todayStr = `${y}-${m}-${d}`;
const firstOfCurrentMonth = `${y}-${m}-01`;
const startOfDay = new Date(y, now.getMonth(), now.getDate());
const endOfDay = new Date(startOfDay);
endOfDay.setHours(23, 59, 59, 999);

export async function getSessionStatsDashboard() {
  const { tenantId, supabase } = await getTenantContext();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const schoolYear = await getSchoolYearSettings();
  const yearEnd = schoolYear?.schoolYearEnd;
  const [{ count: total }, { count: completed }, { count: cancelled }, { count: extra }, { count: makeup }, { count: remaining }] = await Promise.all([
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("status", "completed"),
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("status", "cancelled"),
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("type", "extra"),
    supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("type", "makeup"),
    yearEnd ? supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("status", "scheduled").gte("sessionDate", todayStr).lte("sessionDate", yearEnd) : { count: null },
  ]);
  return { total: total ?? 0, completed: completed ?? 0, cancelled: cancelled ?? 0, extra: extra ?? 0, makeup: makeup ?? 0, remaining: remaining ?? 0 };
}

export async function getDashboardKPIs() {
  const { tenantId, supabase } = await getTenantContext();

  const [
    { count: activeStudents },
    { count: activeGroups },
    { data: todaySessions },
    { data: currentMonthPayments },
    { data: totalPayments },
    { data: recentSessionIds },
    { data: todayPayments },
    { data: groupCounts },
    { count: teacherCount },
    { count: subjectCount },
    { data: cashMovements },
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("status", "active"),
    supabase.from("groups").select("*", { count: "exact", head: true }).eq("tenantId", tenantId).eq("status", "active"),
    supabase.from("sessions").select("id, sessionDate, startTime, endTime, status, groups(id, name)").eq("tenantId", tenantId).gte("sessionDate", todayStr).lte("sessionDate", todayStr).order("startTime", { ascending: true }),
    supabase.from("payments").select("amountPaid, amountDue, status").eq("tenantId", tenantId).eq("month", firstOfCurrentMonth),
    supabase.from("payments").select("amountPaid, amountDue").eq("tenantId", tenantId),
    supabase.from("sessions").select("id").eq("tenantId", tenantId).lte("sessionDate", todayStr).order("sessionDate", { ascending: false }).limit(20),
    supabase.from("payments").select("id, studentId, amountPaid, status, students(fullName)").eq("tenantId", tenantId).eq("month", firstOfCurrentMonth).not("paidAt", "is", null).gte("paidAt", startOfDay.toISOString()).lte("paidAt", endOfDay.toISOString()),
    supabase.from("groups").select("id, name, group_students(count)").eq("tenantId", tenantId).eq("status", "active"),
    supabase.from("teachers").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("subjects").select("*", { count: "exact", head: true }).eq("tenantId", tenantId),
    supabase.from("cash_movements").select("type, amount").eq("tenantId", tenantId),
  ]);

  const pastSessionIdList = (recentSessionIds || []).map((s: any) => s.id);
  const { data: recentAttendanceData } = pastSessionIdList.length > 0
    ? await supabase.from("attendances").select("status").eq("tenantId", tenantId).in("sessionId", pastSessionIdList)
    : { data: [] };

  const attData = recentAttendanceData || [];
  const presentCount = attData.filter((a: any) => a.status === "present" || a.status === "late").length;
  const attendanceRate = attData.length > 0 ? Math.round((presentCount / attData.length) * 100) : 0;
  const absenceRate = attData.length > 0
    ? Math.round((attData.filter((a: any) => a.status === "absent").length / attData.length) * 100)
    : 0;

  const revenueThisMonth = (currentMonthPayments || []).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0);
  const totalDue = (totalPayments || []).reduce((sum: number, p: any) => sum + Number(p.amountDue), 0);
  const totalPaid = (totalPayments || []).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0);
  const overdueSubs = (currentMonthPayments || []).filter((p: any) => isPaymentOverdue(Number(p.amountDue), Number(p.amountPaid), p.month)).length;
  const upToDateSubs = (currentMonthPayments || []).filter((p: any) => Number(p.amountPaid) >= Number(p.amountDue)).length;

  void checkAbsenceAlerts();

  const recoveryRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;

  const caisseIncome = (cashMovements || []).filter((m: any) => m.type === "income").reduce((s: number, m: any) => s + Number(m.amount), 0);
  const caisseExpense = (cashMovements || []).filter((m: any) => m.type === "expense").reduce((s: number, m: any) => s + Number(m.amount), 0);

  return {
    activeStudents: activeStudents ?? 0,
    activeGroups: activeGroups ?? 0,
      todaySessions: (todaySessions || []).map((s: any) => ({ ...s, group: s.groups || null })),
    revenueThisMonth,
    attendanceRate,
    absenceRate,
    outstandingBalance: Math.max(totalDue - totalPaid, 0),
    recoveryRate,
    todayPresent: 0,
    todayAbsent: 0,
    todayPaymentsTotal: (todayPayments || []).reduce((sum: number, p: any) => sum + Number(p.amountPaid), 0),
    todayPaymentsCount: todayPayments?.length ?? 0,
    activeGroupsList: (groupCounts || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      activeStudents: g.group_students?.[0]?.count ?? 0,
    })).sort((a: any, b: any) => b.activeStudents - a.activeStudents).slice(0, 5),
    overdueSubs,
    upToDateSubs,
    expiringSubs: 0,
    totalDebt: (currentMonthPayments || []).filter((p: any) => isPaymentOverdue(Number(p.amountDue), Number(p.amountPaid), p.month)).reduce((sum: number, p: any) => sum + (Number(p.amountDue) - Number(p.amountPaid)), 0),
    caisseBalance: caisseIncome - caisseExpense,
    teacherCount: teacherCount ?? 0,
    subjectCount: subjectCount ?? 0,
  };
}

export async function getOverdueStudents() {
  const { tenantId, supabase } = await getTenantContext();

  const now = new Date();
  const firstOfCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: allPayments } = await supabase
    .from("payments")
    .select("studentId, amountDue, amountPaid, month, students(fullName, phone)")
    .eq("tenantId", tenantId)
    .lte("month", firstOfCurrentMonth);

  const byStudent = new Map<string, { studentId: string; fullName: string; phone: string | null; balance: number }>();

  for (const p of allPayments || []) {
    const amountDue = Number(p.amountDue);
    const amountPaid = Number(p.amountPaid);
    if (!isPaymentOverdue(amountDue, amountPaid, p.month)) continue;

    const existing = byStudent.get(p.studentId);
    const balance = amountDue - amountPaid;
    if (existing) {
      existing.balance += balance;
    } else {
      byStudent.set(p.studentId, {
        studentId: p.studentId,
        fullName: (p.students as any).fullName,
        phone: (p.students as any).phone,
        balance,
      });
    }
  }

  return Array.from(byStudent.values()).filter((s) => s.balance > 0).sort((a, b) => b.balance - a.balance);
}

export async function getRevenueByMonth(monthsBack = 6) {
  const { tenantId, supabase } = await getTenantContext();

  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  since.setDate(1);

  const { data: payments } = await supabase
    .from("payments")
    .select("amountPaid, month")
    .eq("tenantId", tenantId)
    .gte("month", `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`);

  const byMonth = new Map<string, number>();
  for (const p of payments || []) {
    const d = new Date(p.month);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.amountPaid));
  }

  return Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }));
}

export async function getStudentGrowth(monthsBack = 6) {
  const { tenantId, supabase } = await getTenantContext();

  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const { data: students } = await supabase
    .from("students")
    .select("enrolledAt")
    .eq("tenantId", tenantId)
    .gte("enrolledAt", since.toISOString());

  const byMonth = new Map<string, number>();
  for (const s of students || []) {
    const d = new Date(s.enrolledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  return Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}

export async function getRecentPayments(limit = 5) {
  const { tenantId, supabase } = await getTenantContext();
  const { data } = await supabase
    .from("payments")
    .select("id, amountPaid, paidAt, status, students(fullName)")
    .eq("tenantId", tenantId)
    .not("paidAt", "is", null)
    .order("paidAt", { ascending: false })
    .limit(limit);
  return (data || []).map((p: any) => ({
    id: p.id,
    studentName: p.students?.fullName || "",
    amount: Number(p.amountPaid),
    date: p.paidAt,
    status: p.status,
  }));
}

export async function getRecentOverduePayments(limit = 5) {
  const { tenantId, supabase } = await getTenantContext();
  const now = new Date();
  const firstOfCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data } = await supabase
    .from("payments")
    .select("id, amountDue, amountPaid, month, students(fullName)")
    .eq("tenantId", tenantId)
    .lte("month", firstOfCurrentMonth)
    .order("month", { ascending: false })
    .limit(limit);
  return (data || []).filter((p: any) => isPaymentOverdue(Number(p.amountDue), Number(p.amountPaid), p.month)).map((p: any) => ({
    id: p.id,
    studentName: p.students?.fullName || "",
    remaining: Number(p.amountDue) - Number(p.amountPaid),
  }));
}

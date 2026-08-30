import { getTenantContext } from "@/lib/auth";

export function isPaymentOverdue(amountDue: number, amountPaid: number, month: string | Date): boolean {
  if (amountPaid >= amountDue) return false;
  if (amountPaid > 0) return true;
  const monthDate = new Date(month);
  const now = new Date();
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  if (now > monthEnd) return true;
  const dayOfMonth = now.getDate();
  if (dayOfMonth > 10) return true;
  return false;
}

export interface OverdueSubscription {
  id: string;
  studentId: string;
  studentName: string;
  phone: string | null;
  monthlyAmount: number;
  amountPaid: number;
  remainingBalance: number;
  daysOverdue: number;
  groups: string[];
  endDate: Date;
  month: string;
}

export async function getOverdueSubscriptionsData(): Promise<OverdueSubscription[]> {
  const { tenantId, supabase } = await getTenantContext();

  const now = new Date();
  const firstOfCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: allPayments } = await supabase
    .from("payments")
    .select("id, studentId, groupId, amountDue, amountPaid, month, students(fullName, phone)")
    .eq("tenantId", tenantId)
    .eq("month", firstOfCurrentMonth)
    .limit(5000);

  const byStudent = new Map<string, OverdueSubscription>();
  const overdueGroupIdsByStudent = new Map<string, Set<string>>();

  for (const p of allPayments || []) {
    const amountDue = Number(p.amountDue);
    const amountPaid = Number(p.amountPaid);
    if (!isPaymentOverdue(amountDue, amountPaid, p.month)) continue;

    const existing = byStudent.get(p.studentId);
    const monthDate = new Date(p.month);
    const daysOverdue = Math.ceil((now.getTime() - monthDate.getTime()) / (1000 * 60 * 60 * 24));

    if (p.groupId) {
      const set = overdueGroupIdsByStudent.get(p.studentId) || new Set<string>();
      set.add(p.groupId);
      overdueGroupIdsByStudent.set(p.studentId, set);
    }

    if (existing) {
      existing.monthlyAmount += amountDue;
      existing.amountPaid += amountPaid;
      existing.remainingBalance += amountDue - amountPaid;
    } else {
      byStudent.set(p.studentId, {
        id: p.studentId,
        studentId: p.studentId,
        studentName: (p.students as any)?.fullName,
        phone: (p.students as any)?.phone,
        monthlyAmount: amountDue,
        amountPaid,
        remainingBalance: amountDue - amountPaid,
        daysOverdue,
        groups: [],
        endDate: monthDate,
        month: p.month,
      });
    }
  }

  const overdueGroupIds = [...new Set([...overdueGroupIdsByStudent.values()].flatMap((s) => [...s]))];
  if (overdueGroupIds.length > 0) {
    const { data: groupRows } = await supabase
      .from("groups")
      .select("id, name")
      .in("id", overdueGroupIds);
    const nameById = new Map((groupRows || []).map((g: any) => [g.id, g.name]));
    for (const [sid, sub] of byStudent) {
      const ids = overdueGroupIdsByStudent.get(sid);
      sub.groups = ids
        ? [...ids].map((id) => nameById.get(id)).filter((n): n is string => Boolean(n))
        : [];
    }
  }

  return Array.from(byStudent.values()).sort((a, b) => b.daysOverdue - a.daysOverdue);
}

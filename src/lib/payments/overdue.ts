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
    .select("*, students(fullName, phone)")
    .eq("tenantId", tenantId)
    .eq("month", firstOfCurrentMonth);

  const byStudent = new Map<string, OverdueSubscription>();

  for (const p of allPayments || []) {
    const amountDue = Number(p.amountDue);
    const amountPaid = Number(p.amountPaid);
    if (!isPaymentOverdue(amountDue, amountPaid, p.month)) continue;

    const existing = byStudent.get(p.studentId);
    const monthDate = new Date(p.month);
    const daysOverdue = Math.ceil((now.getTime() - monthDate.getTime()) / (1000 * 60 * 60 * 24));

    if (existing) {
      existing.monthlyAmount += amountDue;
      existing.amountPaid += amountPaid;
      existing.remainingBalance += (amountDue - amountPaid);
    } else {
      const { data: gs } = await supabase
        .from("group_students")
        .select("groups(name)")
        .eq("studentId", p.studentId)
        .eq("status", "active");

      byStudent.set(p.studentId, {
        id: p.studentId,
        studentId: p.studentId,
        studentName: (p.students as any)?.fullName,
        phone: (p.students as any)?.phone,
        monthlyAmount: amountDue,
        amountPaid,
        remainingBalance: amountDue - amountPaid,
        daysOverdue,
        groups: (gs || []).map((g: any) => g.groups?.name ?? "?"),
        endDate: monthDate,
        month: p.month,
      });
    }
  }

  return Array.from(byStudent.values()).sort((a, b) => b.daysOverdue - a.daysOverdue);
}

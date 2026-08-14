export function normalizePayment(p: Record<string, unknown>) {
  if (!p) return p;
  const rawStudent = (p.students || p.student) as Record<string, unknown> | undefined;
  if (!rawStudent) return { ...p, student: undefined, students: undefined };
  const rawGS = (rawStudent.group_students || rawStudent.groupStudents || []) as Record<string, unknown>[];
  return {
    ...p,
    student: {
      ...rawStudent,
      groupStudents: rawGS.map((gs: Record<string, unknown>) => ({
        ...gs,
        group: gs.groups || gs.group,
        groups: undefined,
      })),
      group_students: undefined,
    },
    students: undefined,
  };
}

export function generateReceiptNumberFromPayments(payments: Record<string, unknown>[]): string {
  const year = new Date().getFullYear().toString();
  const maxSeq = Math.max(0, ...payments.map((p: any) => p.receiptSequence || 0));
  const nextSeq = maxSeq + 1;
  return generateReceiptString(year, nextSeq);
}

export function generateReceiptString(year: string, seq: number): string {
  return `REC-${year}-${String(seq).padStart(6, "0")}`;
}

export function calculateStatus(amountDue: number, amountPaid: number, month: Date): string {
  if (amountPaid >= amountDue) return "paid";
  if (amountPaid > 0) return "overdue";
  const now = new Date();
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  if (now > monthEnd) return "overdue";
  const dayOfMonth = now.getDate();
  if (dayOfMonth > 10) return "overdue";
  return "pending";
}

/**
 * Add (or remove) session credits for a student in a group. Every recorded
 * payment grants the group's `sessionsIncluded` credits on top of the current
 * balance; deleting a payment removes that same amount again. The balance is
 * clamped at zero — credits never go negative.
 */
export async function adjustSessionCredits(params: {
  supabase: any;
  tenantId: string;
  studentId: string;
  groupId: string | null;
  sessionsIncluded: number;
  delta: number; // +1 per new paid payment, -1 per deleted paid payment
}) {
  const { supabase, tenantId, studentId, groupId, sessionsIncluded, delta } = params;
  if (!groupId || sessionsIncluded <= 0) return;

  const { data: rows } = await supabase
    .from("group_students")
    .select("id, remainingSessions")
    .eq("tenantId", tenantId)
    .eq("studentId", studentId)
    .eq("groupId", groupId)
    .eq("status", "active");

  for (const gs of (rows || []) as any[]) {
    const current = Number(gs.remainingSessions ?? 0);
    const next = Math.max(current + delta * sessionsIncluded, 0);
    await supabase
      .from("group_students")
      .update({ remainingSessions: next })
      .eq("id", gs.id);
  }
}

/**
 * After a payment is deleted, remove that payment's session credits from the
 * student's balance (the payment no longer covers sessions).
 */
export async function resetSessionCreditsOnPaymentDelete(params: {
  supabase: any;
  tenantId: string;
  studentId: string;
  groupId: string | null;
}) {
  const { supabase, tenantId, studentId, groupId } = params;
  if (!groupId) return;
  const { data: group } = await supabase
    .from("groups")
    .select("sessionsIncluded")
    .eq("id", groupId)
    .eq("tenantId", tenantId)
    .single();

  const sessionsIncluded = Number((group as any)?.sessionsIncluded ?? 0);
  await adjustSessionCredits({
    supabase,
    tenantId,
    studentId,
    groupId,
    sessionsIncluded,
    delta: -1,
  });
}

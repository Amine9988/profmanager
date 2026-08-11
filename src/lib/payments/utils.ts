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

export function isPaymentOverdue(amountDue: number, amountPaid: number, month: string | Date): boolean {
  if (amountPaid >= amountDue) return false;
  const monthDate = new Date(month);
  const now = new Date();
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  if (now > monthEnd) return true;
  const dayOfMonth = now.getDate();
  if (dayOfMonth > 10) return true;
  return false;
}

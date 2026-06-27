export type PaymentStatus = "pending" | "paid" | "partial" | "overdue";

export interface Payment {
  id: string;
  tenantId: string;
  studentId: string;
  month: Date;
  amountDue: number;
  amountPaid: number;
  status: PaymentStatus;
  paidAt: Date | null;
  note: string | null;
  receiptNumber: string | null;
  receiptSequence: number | null;
  createdAt: Date;
  updatedAt: Date;
  student?: { id: string; fullName: string; monthlyFee: number };
}

export interface PaymentSummary {
  totalDue: number;
  totalPaid: number;
  totalRemaining: number;
  paidCount: number;
  overdueCount: number;
  pendingCount: number;
  partialCount: number;
}

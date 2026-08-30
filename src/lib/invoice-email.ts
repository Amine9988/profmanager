import { formatCurrency } from "@/lib/utils";
import { sendSchoolMail, type SchoolMailResult, type TenantMail } from "@/lib/school-mail";

export type InvoiceEmailResult = SchoolMailResult;

type InvoicePayload = {
  studentName: string;
  groupName: string;
  month: string;
  paidAt?: string | null;
  amountDue: number;
  amountPaid: number;
  discountPercent?: number | null;
  schoolName?: string | null;
};

function statusLabel(amountDue: number, amountPaid: number) {
  if (amountPaid >= amountDue && amountDue > 0) return "مدفوع";
  if (amountPaid > 0) return "جزئي";
  return "معلق";
}

export function buildInvoiceEmailHtml(p: InvoicePayload) {
  const pct = Number(p.discountPercent) || 0;
  const baseDue = pct > 0 ? Math.round(p.amountDue / (1 - pct / 100)) : p.amountDue;
  const discountAmount = baseDue - p.amountDue;
  const remaining = Math.max(p.amountDue - p.amountPaid, 0);
  const monthLabel = new Date(p.month).toLocaleDateString("ar-DZ", { year: "numeric", month: "long" });
  const dateObj = p.paidAt ? new Date(p.paidAt) : new Date();
  const dateLabel = dateObj.toLocaleString("ar-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const school = p.schoolName || "ProfManager";
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:24px;background:#ecf2f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <h2 style="text-align:center;font-size:20px;margin:0 0 4px;">فاتورة الدفع</h2>
    <p style="text-align:center;color:#64748b;font-size:13px;margin:0 0 16px;">${school}</p>
    <hr style="border:none;border-top:1px solid #cbd5e1;margin:0 0 16px;" />
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:4px 0;color:#475569;">الطالب</td><td style="padding:4px 0;font-weight:600;text-align:left;">${p.studentName}</td></tr>
      <tr><td style="padding:4px 0;color:#475569;">المجموعة</td><td style="padding:4px 0;font-weight:600;text-align:left;">${p.groupName || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#475569;">الشهر</td><td style="padding:4px 0;font-weight:600;text-align:left;">${monthLabel}</td></tr>
      <tr><td style="padding:4px 0;color:#475569;">التاريخ</td><td style="padding:4px 0;font-weight:600;text-align:left;">${dateLabel}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0;" />
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      ${
        pct > 0
          ? `<tr><td style="padding:6px 0;">السعر الأساسي</td><td style="text-align:left;">${formatCurrency(baseDue)}</td></tr>
      <tr><td style="padding:6px 0;color:#16a34a;">التخفيض (${pct}%)</td><td style="text-align:left;color:#16a34a;">−${formatCurrency(discountAmount)}</td></tr>`
          : ""
      }
      <tr><td style="padding:6px 0;">المبلغ المستحق</td><td style="text-align:left;">${formatCurrency(p.amountDue)}</td></tr>
      <tr><td style="padding:6px 0;">المبلغ المدفوع</td><td style="text-align:left;">${formatCurrency(p.amountPaid)}</td></tr>
      <tr><td style="padding:6px 0;font-weight:700;">المتبقي</td><td style="text-align:left;font-weight:700;">${formatCurrency(remaining)}</td></tr>
    </table>
    <p style="font-weight:700;margin:16px 0 0;">الحالة: ${statusLabel(p.amountDue, p.amountPaid)}</p>
    <p style="text-align:center;font-size:12px;color:#64748b;margin:20px 0 0;">شكراً لكم</p>
  </div>
</body>
</html>`;
}

export async function sendPaymentInvoiceEmail(opts: {
  tenant: TenantMail;
  to: string | null | undefined;
  invoice: InvoicePayload;
}): Promise<InvoiceEmailResult> {
  return sendSchoolMail({
    tenant: opts.tenant,
    to: opts.to,
    subject: `فاتورة الدفع — ${opts.invoice.studentName}`,
    html: buildInvoiceEmailHtml({ ...opts.invoice, schoolName: opts.tenant.name }),
  });
}

export async function emailInvoiceForCreatedPayment(
  supabase: any,
  tenantId: string,
  payment: any
): Promise<InvoiceEmailResult> {
  const [{ data: tenant }, { data: student }] = await Promise.all([
    supabase.from("tenants").select("name, schoolEmail, smtpPassword").eq("id", tenantId).maybeSingle(),
    supabase.from("students").select("fullName, email").eq("id", payment.studentId).maybeSingle(),
  ]);
  let groupName = groupNameFromPayment(payment, payment.groupId);
  if (!groupName && payment.groupId) {
    const { data: g } = await supabase.from("groups").select("name").eq("id", payment.groupId).maybeSingle();
    groupName = g?.name || "";
  }
  return sendPaymentInvoiceEmail({
    tenant: tenant || {},
    to: student?.email,
    invoice: {
      studentName: student?.fullName || payment.students?.fullName || "",
      groupName,
      month: payment.month,
      paidAt: payment.paidAt,
      amountDue: Number(payment.amountDue),
      amountPaid: Number(payment.amountPaid),
      discountPercent: payment.discountPercent,
    },
  });
}

export function groupNameFromPayment(payment: any, groupId?: string | null) {
  const rows = payment?.students?.group_students || payment?.students?.groupStudents || [];
  const match = rows.find((gs: any) => (gs.groups?.id || gs.group?.id) === groupId);
  if (match) return match.groups?.name || match.group?.name || "";
  const fallback = rows.map((gs: any) => gs.groups?.name || gs.group?.name).find(Boolean);
  return fallback || "";
}

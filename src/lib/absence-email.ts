import { sendSchoolMail, escapeHtml, type TenantMail, type SchoolMailResult } from "@/lib/school-mail";

export async function sendAbsenceNotice(opts: {
  tenant: TenantMail;
  to: string | null | undefined;
  studentName: string;
  groupName: string;
}): Promise<SchoolMailResult> {
  const studentName = opts.studentName || "التلميذ";
  const groupName = opts.groupName || "الحصة";
  const school = opts.tenant.name || "ProfManager";
  const text = `ابنكم ${studentName} غائب اليوم في حصة ${groupName}.`;
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:24px;background:#ecf2f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <h2 style="text-align:center;font-size:20px;margin:0 0 4px;">إشعار غياب</h2>
    <p style="text-align:center;color:#64748b;font-size:13px;margin:0 0 16px;">${escapeHtml(school)}</p>
    <hr style="border:none;border-top:1px solid #cbd5e1;margin:0 0 16px;" />
    <p style="font-size:16px;line-height:1.7;margin:0;">ابنكم <strong>${escapeHtml(studentName)}</strong> غائب اليوم في حصة <strong>${escapeHtml(groupName)}</strong>.</p>
  </div>
</body>
</html>`;

  return sendSchoolMail({
    tenant: opts.tenant,
    to: opts.to,
    subject: `إشعار غياب — ${studentName}`,
    html,
    text,
  });
}

export async function emailAbsenceForNewMark(
  supabase: any,
  tenantId: string,
  opts: { studentId: string; groupId?: string | null; groupName?: string | null }
): Promise<SchoolMailResult> {
  const [{ data: tenant }, { data: student }] = await Promise.all([
    supabase.from("tenants").select("name, schoolEmail, smtpPassword").eq("id", tenantId).maybeSingle(),
    supabase.from("students").select("fullName, email").eq("id", opts.studentId).maybeSingle(),
  ]);
  let groupName = String(opts.groupName || "").trim();
  if (!groupName && opts.groupId) {
    const { data: g } = await supabase.from("groups").select("name").eq("id", opts.groupId).maybeSingle();
    groupName = g?.name || "";
  }
  return sendAbsenceNotice({
    tenant: tenant || {},
    to: student?.email,
    studentName: student?.fullName || "",
    groupName,
  });
}

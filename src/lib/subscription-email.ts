import { sendSchoolMail, escapeHtml, type TenantMail, type SchoolMailResult } from "@/lib/school-mail";

export async function sendSubscriptionEndedNotice(opts: {
  tenant: TenantMail;
  to: string | null | undefined;
  studentName: string;
  groupName: string;
}): Promise<SchoolMailResult> {
  const studentName = opts.studentName || "التلميذ";
  const groupName = opts.groupName || "المجموعة";
  const school = opts.tenant.name || "المؤسسة";
  const phone = String(opts.tenant.schoolPhone || "").trim();
  const text = [
    `إشعار من ${school}`,
    ``,
    `السلام عليكم،`,
    `نعلمكم أن حصص ابنكم ${studentName} في مجموعة ${groupName} قد اكتملت.`,
    `لتجديد الاشتراك يرجى التواصل مع الإدارة.`,
    phone ? `هاتف المؤسسة: ${phone}` : "",
    ``,
    `مع التحية،`,
    school,
  ]
    .filter((line) => line !== "")
    .join("\n");
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:28px;">
    <p style="margin:0 0 4px;font-size:13px;color:#64748b;">${escapeHtml(school)}</p>
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">إشعار اكتمال الحصص</h2>
    <p style="font-size:15px;line-height:1.8;margin:0 0 12px;">السلام عليكم،</p>
    <p style="font-size:15px;line-height:1.8;margin:0 0 12px;">نعلمكم أن حصص ابنكم <strong>${escapeHtml(studentName)}</strong> في مجموعة <strong>${escapeHtml(groupName)}</strong> قد اكتملت.</p>
    <p style="font-size:15px;line-height:1.8;margin:0 0 16px;">لتجديد الاشتراك يرجى التواصل مع الإدارة.</p>
    ${phone ? `<p style="font-size:14px;color:#334155;margin:0 0 16px;">هاتف المؤسسة: ${escapeHtml(phone)}</p>` : ""}
    <p style="font-size:13px;color:#64748b;margin:0;">مع التحية<br/>${escapeHtml(school)}</p>
  </div>
</body>
</html>`;

  return sendSchoolMail({
    tenant: opts.tenant,
    to: opts.to,
    subject: `إشعار من ${school}: اكتمال حصص ${studentName}`,
    html,
    text,
  });
}

export async function emailSubscriptionEnded(
  supabase: any,
  tenantId: string,
  members: { studentId: string; groupId: string; groupName?: string | null }[]
): Promise<{ studentId: string; groupId: string; sent: boolean }[]> {
  if (members.length === 0) return [];

  const studentIds = [...new Set(members.map((m) => m.studentId).filter(Boolean))];
  const groupIds = [...new Set(members.map((m) => m.groupId).filter(Boolean))];
  const [{ data: tenant }, { data: students }, { data: groups }] = await Promise.all([
    supabase.from("tenants").select("name, schoolEmail, schoolPhone, smtpPassword").eq("id", tenantId).maybeSingle(),
    studentIds.length
      ? supabase.from("students").select("id, fullName, email").eq("tenantId", tenantId).in("id", studentIds)
      : Promise.resolve({ data: [] }),
    groupIds.length
      ? supabase.from("groups").select("id, name").eq("tenantId", tenantId).in("id", groupIds)
      : Promise.resolve({ data: [] }),
  ]);

  const studentById = new Map((students || []).map((s: any) => [s.id, s]));
  const groupById = new Map((groups || []).map((g: any) => [g.id, g.name || ""]));

  const results = await Promise.all(
    members.map(async (m) => {
      const student = studentById.get(m.studentId);
      const result = await sendSubscriptionEndedNotice({
        tenant: tenant || {},
        to: student?.email,
        studentName: student?.fullName || "",
        groupName: m.groupName || groupById.get(m.groupId) || "",
      });
      if (!result.sent) {
        console.error("subscription-ended email failed:", result.reason, m.studentId, student?.email || "(no email)");
      }
      return { studentId: m.studentId, groupId: m.groupId, sent: !!result.sent };
    })
  );
  return results;
}

/** Send the renewal notice for every exhausted pack that was not emailed yet. */
export async function notifyExhaustedSubscriptions(supabase: any, tenantId: string): Promise<number> {
  const { data: tenantGroups } = await supabase.from("groups").select("id").eq("tenantId", tenantId);
  const groupIds = (tenantGroups || []).map((g: any) => g.id).filter(Boolean);
  if (groupIds.length === 0) return 0;

  const { data: enrollments } = await supabase
    .from("group_students")
    .select("*")
    .eq("status", "active")
    .in("groupId", groupIds);
  if (!enrollments?.length) return 0;

  const [{ data: groups }, { data: payments }] = await Promise.all([
    supabase.from("groups").select("id, name, sessionsIncluded").eq("tenantId", tenantId).in("id", groupIds),
    supabase
      .from("payments")
      .select("studentId, groupId, amountPaid")
      .eq("tenantId", tenantId)
      .gt("amountPaid", 0)
      .in("groupId", groupIds),
  ]);

  const includedByGroup = new Map<string, number>();
  const nameByGroup = new Map<string, string>();
  for (const g of groups || []) {
    includedByGroup.set(g.id, Number(g.sessionsIncluded) || 0);
    nameByGroup.set(g.id, g.name || "");
  }

  const paidCount = new Map<string, number>();
  for (const p of payments || []) {
    if (!p.groupId || Number(p.amountPaid) <= 0) continue;
    const key = `${p.studentId}|${p.groupId}`;
    paidCount.set(key, (paidCount.get(key) || 0) + 1);
  }

  const due = (enrollments as any[]).filter((gs) => {
    const included = includedByGroup.get(gs.groupId) || 0;
    if (included <= 0) return false;
    const paid = (paidCount.get(`${gs.studentId}|${gs.groupId}`) || 0) * included;
    const consumed = Number(gs.consumedSessions ?? 0);
    const already = Number(gs.renewalNoticeForPaid ?? 0);
    return paid > 0 && consumed >= paid && already < paid;
  });
  if (due.length === 0) return 0;

  const results = await emailSubscriptionEnded(
    supabase,
    tenantId,
    due.map((gs) => ({
      studentId: gs.studentId,
      groupId: gs.groupId,
      groupName: nameByGroup.get(gs.groupId) || "",
    }))
  );
  const sentKeys = new Set(results.filter((r) => r.sent).map((r) => `${r.studentId}|${r.groupId}`));
  const now = new Date().toISOString();
  let sent = 0;
  for (const gs of due) {
    const included = includedByGroup.get(gs.groupId) || 0;
    const paid = (paidCount.get(`${gs.studentId}|${gs.groupId}`) || 0) * included;
    if (!sentKeys.has(`${gs.studentId}|${gs.groupId}`)) continue;
    await supabase
      .from("group_students")
      .update({ renewalNoticeSentAt: now, renewalNoticeForPaid: paid })
      .eq("id", gs.id)
      .eq("tenantId", tenantId);
    sent++;
  }
  return sent;
}

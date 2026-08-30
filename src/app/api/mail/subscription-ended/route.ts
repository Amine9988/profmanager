import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { notifyExhaustedSubscriptions, sendSubscriptionEndedNotice } from "@/lib/subscription-email";

export const dynamic = "force-dynamic";

async function loadExhausted(supabase: any, tenantId: string) {
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name, sessionsIncluded")
    .eq("tenantId", tenantId);
  const groupIds = (groups || []).map((g: any) => g.id);
  const includedByGroup = new Map<string, number>(
    (groups || []).map((g: any) => [String(g.id), Number(g.sessionsIncluded) || 0])
  );
  const nameByGroup = new Map<string, string>((groups || []).map((g: any) => [String(g.id), String(g.name || "")]));

  const { data: enrollments } = groupIds.length
    ? await supabase.from("group_students").select("*").eq("status", "active").in("groupId", groupIds)
    : { data: [] };
  const { data: payments } = groupIds.length
    ? await supabase
        .from("payments")
        .select("studentId, groupId, amountPaid")
        .eq("tenantId", tenantId)
        .gt("amountPaid", 0)
        .in("groupId", groupIds)
    : { data: [] };

  const paidCount = new Map<string, number>();
  for (const p of payments || []) {
    if (!p.groupId) continue;
    const key = `${p.studentId}|${p.groupId}`;
    paidCount.set(key, (paidCount.get(key) || 0) + 1);
  }

  const studentIds = [...new Set((enrollments || []).map((e: any) => e.studentId))];
  const { data: students } = studentIds.length
    ? await supabase.from("students").select("id, fullName, email").in("id", studentIds)
    : { data: [] };
  const studentById = new Map<string, { fullName?: string; email?: string }>(
    (students || []).map((s: any) => [String(s.id), { fullName: s.fullName, email: s.email }])
  );

  const rows = (enrollments || []).map((gs: any) => {
    const included = Number(includedByGroup.get(gs.groupId) || 0);
    const paid = Number(paidCount.get(`${gs.studentId}|${gs.groupId}`) || 0) * included;
    const consumed = Number(gs.consumedSessions ?? 0);
    const student = studentById.get(gs.studentId);
    return {
      enrollmentId: gs.id,
      studentId: gs.studentId,
      studentName: student?.fullName || "",
      email: student?.email || "",
      groupId: gs.groupId,
      groupName: nameByGroup.get(gs.groupId) || "",
      consumed,
      paid,
      included,
      notifiedFor: Number(gs.renewalNoticeForPaid ?? 0),
      exhausted: included > 0 && paid > 0 && consumed >= paid,
    };
  });

  return { rows, nameByGroup };
}

export async function GET() {
  try {
    const { supabase, tenantId } = await getTenantContext();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, schoolEmail, schoolPhone, smtpPassword")
      .eq("id", tenantId)
      .maybeSingle();
    const { rows } = await loadExhausted(supabase, tenantId);
    return NextResponse.json({
      smtp: {
        schoolEmail: String(tenant?.schoolEmail || "").trim() || null,
        hasPassword: Boolean(String(tenant?.smtpPassword || "").replace(/\s+/g, "")),
      },
      exhausted: rows.filter((r) => r.exhausted),
    });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, tenantId } = await getTenantContext();
    const body = await req.json().catch(() => ({}));
    const force = body?.force !== false;
    const studentId = body?.studentId ? String(body.studentId) : null;

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, schoolEmail, schoolPhone, smtpPassword")
      .eq("id", tenantId)
      .maybeSingle();

    const { rows } = await loadExhausted(supabase, tenantId);
    const targets = rows.filter((r) => r.exhausted && (!studentId || r.studentId === studentId));
    if (targets.length === 0) {
      return NextResponse.json({ sent: 0, results: [], reason: "none_exhausted" });
    }

    if (force) {
      for (const row of targets) {
        await supabase
          .from("group_students")
          .update({ renewalNoticeForPaid: 0, renewalNoticeSentAt: null })
          .eq("id", row.enrollmentId);
      }
    }

    const results: Array<Record<string, unknown>> = [];
    for (const row of targets) {
      const result = await sendSubscriptionEndedNotice({
        tenant: tenant || {},
        to: row.email,
        studentName: row.studentName,
        groupName: row.groupName,
      });
      if (result.sent) {
        const paid = row.paid;
        await supabase
          .from("group_students")
          .update({
            renewalNoticeSentAt: new Date().toISOString(),
            renewalNoticeForPaid: paid,
          })
          .eq("id", row.enrollmentId);
      }
      results.push({
        studentName: row.studentName,
        email: row.email,
        groupName: row.groupName,
        ...result,
      });
    }

    await notifyExhaustedSubscriptions(supabase, tenantId);
    return NextResponse.json({
      sent: results.filter((r) => r.sent).length,
      smtp: {
        schoolEmail: String(tenant?.schoolEmail || "").trim() || null,
        hasPassword: Boolean(String(tenant?.smtpPassword || "").replace(/\s+/g, "")),
      },
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

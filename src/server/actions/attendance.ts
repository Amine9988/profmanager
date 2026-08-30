"use server";

import { randomUUID } from "crypto";
import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import { toCamelArray } from "@/lib/db";
import type { ActionResult } from "./students";
import { sessionEndTimestamp, sessionDateUpperBound, sessionDateKey } from "@/lib/session-time";
import { daysAgoIsoDate, runThrottled } from "@/lib/bg-jobs";
import { getSchoolYearSettings } from "./sessions";
import { emailAbsenceForNewMark } from "@/lib/absence-email";
import { notifyExhaustedSubscriptions } from "@/lib/subscription-email";

const SESSION_LOOKBACK_DAYS = 14;

/** Fire-and-forget maintenance, coalesced to at most once per 10 minutes. */
export async function scheduleAttendanceMaintenance(): Promise<void> {
  runThrottled("attendance-maintenance", 10 * 60 * 1000, async () => {
    await autoMarkAbsentForPastSessions();
    await consumeExpiredSessionCredits();
  });
}

/**
 * Once a session's end time has passed, every active group member who was
 * never marked for that session is recorded as absent automatically. Runs on
 * read paths only; already-marked students are never overwritten.
 * Bounded to recent sessions only to stay fast at scale.
 */
export async function autoMarkAbsentForPastSessions(): Promise<number> {
  const { tenantId, supabase } = await getTenantContext();
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const sinceStr = daysAgoIsoDate(SESSION_LOOKBACK_DAYS);

    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime")
      .eq("tenantId", tenantId)
      .eq("status", "scheduled")
      .gte("sessionDate", sinceStr)
      .lte("sessionDate", sessionDateUpperBound(todayStr))
      .order("sessionDate", { ascending: false })
      .limit(500);

    const past = (sessions || []).filter((s: any) => {
      const end = sessionEndTimestamp(s);
      return end !== null && end < now.getTime();
    });
    if (past.length === 0) return 0;

    const sessionIds = past.map((s: any) => s.id);
    const groupIds = [...new Set(past.map((s: any) => s.groupId).filter(Boolean))];

    const [{ data: groupStudents }, { data: attendances }] = await Promise.all([
      supabase
        .from("group_students")
        .select("groupId, studentId, enrolledAt")
        .in("groupId", groupIds.length > 0 ? groupIds : [""])
        .eq("status", "active"),
      supabase
        .from("attendances")
        .select("sessionId, studentId")
        .in("sessionId", sessionIds),
    ]);

    const markedKeys = new Set((attendances || []).map((a: any) => `${a.sessionId}|${a.studentId}`));
    const studentsByGroup = new Map<string, string[]>();
    const enrolledAtByKey = new Map<string, number>();
    for (const g of groupStudents || []) {
      const list = studentsByGroup.get(g.groupId) || [];
      list.push(g.studentId);
      studentsByGroup.set(g.groupId, list);
      if (g.enrolledAt) {
        const ts = new Date(g.enrolledAt).getTime();
        if (!Number.isNaN(ts)) enrolledAtByKey.set(`${g.groupId}|${g.studentId}`, ts);
      }
    }

    const toInsert: Record<string, unknown>[] = [];
    for (const s of past as any[]) {
      const ids = studentsByGroup.get(s.groupId) || [];
      for (const studentId of ids) {
        const enrolledAt = enrolledAtByKey.get(`${s.groupId}|${studentId}`);
        if (enrolledAt !== undefined) {
          const endMs = sessionEndTimestamp(s);
          if (endMs !== null && endMs < enrolledAt) continue;
        }
        if (markedKeys.has(`${s.id}|${studentId}`)) continue;
        toInsert.push({
          id: randomUUID(),
          tenantId,
          sessionId: s.id,
          studentId,
          status: "absent",
          markedAt: now.toISOString(),
        });
        markedKeys.add(`${s.id}|${studentId}`);
      }
    }

    // Batch upsert in chunks of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100);
      await supabase.from("attendances").upsert(chunk as any, { onConflict: "sessionId,studentId" });
    }

    const todayAbsences = toInsert.filter((row) => {
      const session = past.find((s: any) => s.id === row.sessionId);
      return sessionDateKey(session?.sessionDate) === todayStr;
    });
    if (todayAbsences.length > 0) {
      const groupById = new Map<string, string>(past.map((s: any) => [String(s.id), String(s.groupId || "")]));
      void Promise.allSettled(
        todayAbsences.map((row) =>
          emailAbsenceForNewMark(supabase, tenantId, {
            studentId: String(row.studentId),
            groupId: groupById.get(String(row.sessionId)) || null,
          })
        )
      ).then((results) => {
        const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value && !r.value.sent));
        if (failed.length) console.error("auto-absence emails:", failed.length, "/", todayAbsences.length);
      });
    }

    return toInsert.length;
  } catch (e) {
    console.error("[autoMarkAbsentForPastSessions]", e);
    return 0;
  }
}

/**
 * For groups configured with a paid session package (sessionsIncluded), each
 * session whose end time has passed consumes one session credit from every
 * active member. Runs on read paths; a session is consumed at most once
 * (guarded by sessions.creditsConsumed).
 */
export async function consumeExpiredSessionCredits(): Promise<number> {
  const { tenantId, supabase } = await getTenantContext();
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const sinceStr = daysAgoIsoDate(SESSION_LOOKBACK_DAYS);

    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime, creditsConsumed")
      .eq("tenantId", tenantId)
      .eq("status", "scheduled")
      .eq("creditsConsumed", 0)
      .gte("sessionDate", sinceStr)
      .lte("sessionDate", sessionDateUpperBound(todayStr))
      .order("sessionDate", { ascending: false })
      .limit(300);

    const past = (sessions || []).filter((s: any) => {
      const end = sessionEndTimestamp(s);
      return end !== null && end < now.getTime();
    });
    if (past.length === 0) {
      await notifyExhaustedSubscriptions(supabase, tenantId);
      return 0;
    }

    const groupIds = [...new Set(past.map((s: any) => s.groupId).filter(Boolean))];
    const { data: groups } = await supabase
      .from("groups")
      .select("id, name, sessionsIncluded")
      .eq("tenantId", tenantId)
      .in("id", groupIds.length > 0 ? groupIds : [""]);

    const sessionsIncludedByGroup = new Map<string, number>();
    const groupNameById = new Map<string, string>();
    for (const g of groups || []) {
      sessionsIncludedByGroup.set(g.id, Number(g.sessionsIncluded) || 0);
      groupNameById.set(g.id, g.name || "");
    }
    const packageGroupIds = new Set(
      [...sessionsIncludedByGroup.entries()].filter(([, n]) => n > 0).map(([id]) => id)
    );
    const eligible = past.filter((s: any) => packageGroupIds.has(s.groupId));
    if (eligible.length === 0) {
      await notifyExhaustedSubscriptions(supabase, tenantId);
      return 0;
    }

    const eligibleGroupIds = [...packageGroupIds];
    const [{ data: groupStudents }, { data: paymentRows }] = await Promise.all([
      supabase
        .from("group_students")
        .select("id, groupId, studentId, remainingSessions, consumedSessions")
        .eq("tenantId", tenantId)
        .eq("status", "active")
        .in("groupId", eligibleGroupIds),
      // Only payments for students in these package groups — not the entire payments table
      supabase
        .from("payments")
        .select("studentId, groupId, amountPaid, paidAt, createdAt")
        .eq("tenantId", tenantId)
        .gt("amountPaid", 0)
        .in("groupId", eligibleGroupIds.length > 0 ? eligibleGroupIds : [""]),
    ]);

    const lastPaidByStudent = new Map<string, number>();
    const firstPaidByStudentGroup = new Map<string, number>();
    const paidCountByStudentGroup = new Map<string, number>();
    for (const p of (paymentRows || []) as any[]) {
      const ts = p.paidAt
        ? new Date(p.paidAt).getTime()
        : p.createdAt
          ? new Date(p.createdAt).getTime()
          : 0;
      if (ts > (lastPaidByStudent.get(p.studentId) ?? 0)) {
        lastPaidByStudent.set(p.studentId, ts);
      }
      if (p.groupId && Number(p.amountPaid) > 0) {
        const key = `${p.studentId}|${p.groupId}`;
        paidCountByStudentGroup.set(key, (paidCountByStudentGroup.get(key) || 0) + 1);
        if (ts > 0 && ts < (firstPaidByStudentGroup.get(key) ?? Infinity)) {
          firstPaidByStudentGroup.set(key, ts);
        }
      }
    }

    let consumed = 0;
    const consumedByMember = new Map<string, { gs: any; count: number; remainingDec: number }>();
    const membersByGroup = new Map<string, any[]>();
    for (const gs of groupStudents || []) {
      const list = membersByGroup.get(gs.groupId) || [];
      list.push(gs);
      membersByGroup.set(gs.groupId, list);
    }

    for (const s of eligible as any[]) {
      const members = membersByGroup.get(s.groupId) || [];
      for (const gs of members) {
        const endMs = sessionEndTimestamp(s);
        const entry = consumedByMember.get(gs.id) || { gs, count: 0, remainingDec: 0 };
        const firstPay = firstPaidByStudentGroup.get(`${gs.studentId}|${s.groupId}`);
        if (endMs !== null && firstPay !== undefined && endMs >= firstPay) {
          entry.count++;
        }
        const current = Number(gs.remainingSessions ?? 0) - entry.remainingDec;
        if (current > 0) {
          const lastPay = lastPaidByStudent.get(gs.studentId);
          if (!(endMs !== null && lastPay !== undefined && endMs < lastPay)) {
            entry.remainingDec++;
            consumed++;
          }
        }
        consumedByMember.set(gs.id, entry);
      }
      await supabase.from("sessions").update({ creditsConsumed: 1 }).eq("id", s.id);
    }
    for (const { gs, count, remainingDec } of consumedByMember.values()) {
      const patch: Record<string, number> = {};
      if (count > 0) patch.consumedSessions = Number(gs.consumedSessions ?? 0) + count;
      if (remainingDec > 0) patch.remainingSessions = Math.max(0, Number(gs.remainingSessions ?? 0) - remainingDec);
      if (Object.keys(patch).length > 0) {
        await supabase.from("group_students").update(patch).eq("id", gs.id);
      }
    }

    await notifyExhaustedSubscriptions(supabase, tenantId);
    return consumed;
  } catch (e) {
    console.error("[consumeExpiredSessionCredits]", e);
    return 0;
  }
}

export async function getUpcomingSessions() {
  const { tenantId, supabase } = await getTenantContext();

  await autoMarkAbsentForPastSessions();
  await consumeExpiredSessionCredits();
  void scheduleAttendanceMaintenance();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const schoolYear = await getSchoolYearSettings();
  const yearEnd = schoolYear?.schoolYearEnd || "9999-12-31";

  const { data } = await supabase
    .from("sessions")
    .select("id, sessionDate, startTime, endTime, status, groupId, groups(id, name, subjects(id, name))")
    .eq("tenantId", tenantId)
    .eq("status", "scheduled")
    .gte("sessionDate", todayStr)
    .lte("sessionDate", yearEnd)
    .order("sessionDate", { ascending: true })
    .order("startTime", { ascending: true })
    .limit(20000);

  return toCamelArray(data || []).map((s: any) => ({
    ...s,
    group: (s as any).groups || null,
    tenantId: (s as any).tenantId,
  }));
}

export async function getStudentAttendanceView(studentId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const { data: enrollments } = await supabase
    .from("group_students")
    .select("groupId, groups(*, subjects(*), teachers(id, firstName, lastName), group_students(*))")
    .eq("studentId", studentId)
    .eq("status", "active");

  const groupIds = (enrollments || []).map((e: any) => e.groupId).filter(Boolean);

  const groups = (enrollments || [])
    .map((e: any) => {
      const g = e.groups;
      if (!g) return null;
      return {
        id: g.id,
        name: g.name,
        subject: g.subjects ?? null,
        teacher: g.teachers ?? null,
        studentCount: ((g.group_students || []) as any[]).filter((gs: any) => gs.status === "active").length,
      };
    })
    .filter(Boolean);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const end = new Date();
  end.setDate(end.getDate() + 45);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  let sessions: any[] = [];
  let roomById: Record<string, string> = {};
  if (groupIds.length > 0) {
    const [sessionsRes, roomsRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("*, groups(*, subjects(*))")
        .eq("tenantId", tenantId)
        .eq("status", "scheduled")
        .gte("sessionDate", todayStr)
        .lte("sessionDate", endStr)
        .in("groupId", groupIds)
        .order("sessionDate", { ascending: true })
        .order("startTime", { ascending: true }),
      supabase.from("rooms").select("id, name").eq("tenantId", tenantId),
    ]);
    sessions = toCamelArray(sessionsRes.data || []).map((s: any) => ({
      ...s,
      sessionDate: typeof s.sessionDate === "string" ? s.sessionDate.slice(0, 10) : new Date(s.sessionDate).toISOString().slice(0, 10),
      group: (s as any).groups || null,
    }));
    roomById = Object.fromEntries((roomsRes.data || []).map((r: any) => [r.id, r.name]));
  }

  if (sessions.length > 0) {
    const sessionIds = sessions.map((s: any) => s.id);
    const { data: atts } = await supabase
      .from("attendances")
      .select("sessionId, status")
      .eq("studentId", studentId)
      .eq("tenantId", tenantId)
      .in("sessionId", sessionIds);
    const attMap = new Map<string, string>((atts || []).map((a: any) => [a.sessionId, a.status]));
    sessions = sessions.map((s: any) => ({
      ...s,
      attendanceStatus:
        attMap.get(s.id) ??
        (() => {
          const end = sessionEndTimestamp(s);
          return end !== null && end < Date.now() ? "absent" : null;
        })(),
    }));
  }

  return { groups, sessions, roomById };
}

export async function getSessionWithAttendance(sessionId: string) {
  const { tenantId, supabase } = await getTenantContext();

  await autoMarkAbsentForPastSessions();
  await consumeExpiredSessionCredits();
  void scheduleAttendanceMaintenance();

  const { data: session } = await supabase
    .from("sessions")
    .select("*, groups(*, subjects(*))")
    .eq("id", sessionId)
    .eq("tenantId", tenantId)
    .single();

  if (!session) return null;
  if (!session.groups) return null;

  const group = session.groups as Record<string, unknown>;
  (group as any).room = null;

  const { data: groupStudents } = await supabase
    .from("group_students")
    .select("*, students(*)")
    .eq("groupId", (group as any).id);

  const { data: attendances } = await supabase
    .from("attendances")
    .select("*")
    .eq("sessionId", sessionId);

  const attendanceByStudent = new Map<string, any>((attendances || []).map((a: any) => [a.studentId, a]));
  const sessionEndMs = sessionEndTimestamp(session);
  // Only members who were already enrolled when this session took place
  // belong on the roster; someone who joined the group later has no business
  // in an earlier session.
  const activeGroupStudents = (groupStudents || [])
    .filter((gs: any) => gs.status === "active" && gs.students != null)
    .filter((gs: any) => {
      if (!gs.enrolledAt || sessionEndMs === null) return true;
      return sessionEndMs >= new Date(gs.enrolledAt).getTime();
    });

  const roster = activeGroupStudents.map((gs: any) => ({
    student: gs.students,
    attendance: attendanceByStudent.get(gs.studentId) ?? null,
  }));

  return { session: { ...session, group }, roster };
}

export async function markAttendance(
  sessionId: string,
  studentId: string,
  status: "present" | "absent" | "late" | "excused"
): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("attendance.mark");

    const [{ data: session }, { data: existing }] = await Promise.all([
      ctx.supabase
        .from("sessions")
        .select("id, groupId, groups(name)")
        .eq("id", sessionId)
        .eq("tenantId", ctx.tenantId)
        .single(),
      ctx.supabase
        .from("attendances")
        .select("status")
        .eq("sessionId", sessionId)
        .eq("studentId", studentId)
        .maybeSingle(),
    ]);
    if (!session) return { error: t("errors.session_not_found") };

    const { data: student } = await ctx.supabase.from("students").select("id").eq("id", studentId).eq("tenantId", ctx.tenantId).single();
    if (!student) return { error: t("errors.student_not_found") };

    await ctx.supabase.from("attendances").upsert({
      id: randomUUID(),
      sessionId: sessionId,
      studentId: studentId,
      status,
      tenantId: ctx.tenantId,
      markedById: ctx.userId,
      markedAt: new Date().toISOString(),
    }, { onConflict: "sessionId,studentId" });

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "attendance.marked", entityType: "session", entityId: sessionId,
      metadata: { studentId, status },
    });

    if (status === "absent" && existing?.status !== "absent") {
      const groupRow = Array.isArray((session as any).groups) ? (session as any).groups[0] : (session as any).groups;
      try {
        await emailAbsenceForNewMark(ctx.supabase, ctx.tenantId, {
          studentId,
          groupId: (session as any).groupId,
          groupName: groupRow?.name || "",
        });
      } catch (e) {
        console.error("absence email failed:", e);
      }
    }

    await consumeExpiredSessionCredits();
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function markAllPresent(sessionId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("attendance.mark");

    const { data: session } = await ctx.supabase
      .from("sessions")
      .select("groupId, startTime, endTime, groups(group_students(*, students(*)))")
      .eq("id", sessionId)
      .eq("tenantId", ctx.tenantId)
      .single();

    if (!session) return { error: t("errors.session_not_found") };

    const groupArr = session.groups as any[];
    const group = Array.isArray(groupArr) ? groupArr[0] : groupArr;
    const groupStudents = (group?.group_students || []) as any[];
    const sessionEndMs = sessionEndTimestamp(session);

    for (const gs of groupStudents) {
      if (gs.status !== "active") continue;
      if (sessionEndMs !== null && gs.enrolledAt && sessionEndMs < new Date(gs.enrolledAt).getTime()) continue;
      await ctx.supabase.from("attendances").upsert({
        id: randomUUID(),
        sessionId: sessionId,
        studentId: gs.studentId,
        status: "present",
        tenantId: ctx.tenantId,
        markedById: ctx.userId,
        markedAt: new Date().toISOString(),
      }, { onConflict: "sessionId,studentId" });
    }

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "attendance.bulk_marked_present", entityType: "session", entityId: sessionId,
    });

    await consumeExpiredSessionCredits();
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function getAttendanceRegister(groupId: string) {
  const { tenantId, supabase } = await getTenantContext();

  await autoMarkAbsentForPastSessions();
  await consumeExpiredSessionCredits();
  void scheduleAttendanceMaintenance();

  const [{ data: sessionsData }, { data: groupStudentsData }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, sessionDate, startTime, endTime, status")
      .eq("tenantId", tenantId)
      .eq("groupId", groupId)
      .neq("status", "cancelled")
      .order("sessionDate", { ascending: true })
      .order("startTime", { ascending: true })
      .limit(20000),
    supabase
      .from("group_students")
      .select("id, studentId, status, enrolledAt, students(id, fullName, gradeLevel, phone)")
      .eq("groupId", groupId)
      .eq("status", "active"),
  ]);

  const sessions = toCamelArray(sessionsData || []).map((s: any) => ({
    id: s.id,
    sessionDate: typeof s.sessionDate === "string" ? s.sessionDate.slice(0, 10) : new Date(s.sessionDate).toISOString().slice(0, 10),
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  const groupStudents = (groupStudentsData || []).filter((gs: any) => gs.status === "active");
  const studentIds = groupStudents.map((gs: any) => gs.studentId).filter(Boolean);
  const sessionIds = sessions.map((s: any) => s.id);

  let attendancesByStudent: Record<string, { sessionId: string; status: string }[]> = {};
  if (studentIds.length > 0 && sessionIds.length > 0) {
    const { data: atts } = await supabase
      .from("attendances")
      .select("sessionId, studentId, status")
      .eq("tenantId", tenantId)
      .in("studentId", studentIds)
      .in("sessionId", sessionIds);
    attendancesByStudent = {};
    for (const a of atts || []) {
      if (!attendancesByStudent[a.studentId]) attendancesByStudent[a.studentId] = [];
      attendancesByStudent[a.studentId].push({ sessionId: a.sessionId, status: a.status });
    }
  }

  const students = groupStudents.map((gs: any) => {
    const atts = attendancesByStudent[gs.studentId] || [];
    const attBySession = new Map(atts.map((a) => [a.sessionId, a.status]));
    const enrolledMs = gs.enrolledAt ? new Date(gs.enrolledAt).getTime() : 0;
    // Only sessions the student could have attended (ended on/after their
    // enrollment) appear in their register.
    const eligibleSessions = sessions.filter((s: any) => {
      if (!enrolledMs) return true;
      const end = sessionEndTimestamp(s);
      if (end === null) return true;
      return end >= enrolledMs;
    });
    const records = eligibleSessions.map((s: any) => ({
      sessionId: s.id,
      sessionDate: s.sessionDate,
      startTime: s.startTime,
      status: attBySession.get(s.id) ?? "unmarked",
    }));
    const presentDays = records.filter((r) => r.status === "present" || r.status === "late").map((r) => r.sessionDate);
    const absentDays = records.filter((r) => r.status === "absent").map((r) => r.sessionDate);
    const excusedDays = records.filter((r) => r.status === "excused").map((r) => r.sessionDate);
    const markedCount = records.filter((r) => r.status !== "unmarked").length;
    const presentCount = records.filter((r) => r.status === "present" || r.status === "late").length;
    const absentCount = records.filter((r) => r.status === "absent").length;
    return {
      studentId: gs.studentId,
      fullName: gs.students?.fullName
        || (gs.students?.firstName && gs.students?.lastName
          ? `${gs.students.firstName} ${gs.students.lastName}`.trim()
          : gs.students?.firstName ?? ""),
      records,
      presentDays,
      absentDays,
      excusedDays,
      presentCount,
      absentCount,
      markedCount,
      rate: markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0,
    };
  }).filter((s: any) => s.fullName);

  return { sessions, students };
}

export async function getAttendanceRateByStudent(studentId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const { data: attendances } = await supabase
    .from("attendances")
    .select("status")
    .eq("studentId", studentId)
    .eq("tenantId", tenantId)
    .order("markedAt", { ascending: false })
    .limit(30);

  if (!attendances || attendances.length === 0) return { rate: 0, total: 0 };

  const presentCount = attendances.filter((a) => a.status === "present" || a.status === "late").length;
  return { rate: Math.round((presentCount / attendances.length) * 100), total: attendances.length };
}

export async function getAttendanceRateByGroup(groupId: string) {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const [{ count: activeStudentCount }, { data: activeEnrollments }, { data: groupSessions }] = await Promise.all([
      supabase.from("group_students").select("*", { count: "exact", head: true }).eq("groupId", groupId).eq("status", "active"),
      supabase.from("group_students").select("studentId").eq("groupId", groupId).eq("status", "active"),
      supabase.from("sessions").select("id").eq("tenantId", tenantId).eq("groupId", groupId),
    ]);

    if (!activeStudentCount || activeStudentCount === 0) return { rate: 0, total: 0 };

    const activeStudentIds = (activeEnrollments || []).map((e) => e.studentId);
    const sessionIds = (groupSessions || []).map((s) => s.id);

    const { data: attendances } = await supabase
      .from("attendances")
      .select("status")
      .eq("tenantId", tenantId)
      .in("studentId", activeStudentIds.length > 0 ? activeStudentIds : [""])
      .in("sessionId", sessionIds.length > 0 ? sessionIds : [""]);

    if (!attendances || attendances.length === 0) return { rate: 0, total: 0 };

    const presentCount = attendances.filter((a) => a.status === "present" || a.status === "late").length;
    return { rate: Math.round((presentCount / attendances.length) * 100), total: attendances.length };
  } catch (e) {
    console.error("[getAttendanceRateByGroup] error:", e);
    return { rate: 0, total: 0 };
  }
}

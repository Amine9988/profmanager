"use server";

import { randomUUID } from "crypto";
import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import { toCamelArray } from "@/lib/db";
import type { ActionResult } from "./students";

export async function getUpcomingSessions() {
  const { tenantId, supabase } = await getTenantContext();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const { data } = await supabase
    .from("sessions")
    .select("*, groups(*, subjects(*))")
    .eq("tenantId", tenantId)
    .eq("status", "scheduled")
    .gte("sessionDate", todayStr)
    .order("sessionDate", { ascending: true })
    .order("startTime", { ascending: true });

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
    sessions = sessions.map((s: any) => ({ ...s, attendanceStatus: attMap.get(s.id) ?? null }));
  }

  return { groups, sessions, roomById };
}

export async function getSessionWithAttendance(sessionId: string) {
  const { tenantId, supabase } = await getTenantContext();

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
  const activeGroupStudents = (groupStudents || []).filter((gs: any) => gs.status === "active" && gs.students != null);

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

    const { data: session } = await ctx.supabase.from("sessions").select("id").eq("id", sessionId).eq("tenantId", ctx.tenantId).single();
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
      .select("groupId, groups(group_students(*, students(*)))")
      .eq("id", sessionId)
      .eq("tenantId", ctx.tenantId)
      .single();

    if (!session) return { error: t("errors.session_not_found") };

    const groupArr = session.groups as any[];
    const group = Array.isArray(groupArr) ? groupArr[0] : groupArr;
    const groupStudents = (group?.group_students || []) as any[];

    for (const gs of groupStudents) {
      if (gs.status !== "active") continue;
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

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function getAttendanceRegister(groupId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const [{ data: sessionsData }, { data: groupStudentsData }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, sessionDate, startTime, endTime, status")
      .eq("tenantId", tenantId)
      .eq("groupId", groupId)
      .neq("status", "cancelled")
      .order("sessionDate", { ascending: true })
      .order("startTime", { ascending: true }),
    supabase
      .from("group_students")
      .select("id, studentId, status, students(*)")
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
    const records = sessions.map((s: any) => ({
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

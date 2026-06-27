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

export async function getSessionWithAttendance(sessionId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const { data: session } = await supabase
    .from("sessions")
    .select("*, groups(*, subjects(*), group_students(*, students(*)))")
    .eq("id", sessionId)
    .eq("tenantId", tenantId)
    .single();

  if (!session) return null;
  if (!session.groups) return null;

  const group = session.groups as Record<string, unknown>;
  (group as any).room = null;
  const groupStudents = (group.group_students as any[]) || [];

  const { data: attendances } = await supabase
    .from("attendances")
    .select("*")
    .eq("sessionId", sessionId);

  const attendanceByStudent = new Map((attendances || []).map((a: any) => [a.studentId, a]));

  const roster = groupStudents
    .filter((gs: any) => gs.status === "active")
    .map((gs: any) => ({
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
}

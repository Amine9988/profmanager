"use server";

import { randomUUID } from "crypto";
import { getTenantContext, requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./students";
import { repairStudentId } from "@/lib/student-qr";
import { autoMarkAbsentForPastSessions, consumeExpiredSessionCredits, scheduleAttendanceMaintenance } from "./attendance";
import { sessionEndTimestamp } from "@/lib/session-time";

export interface GroupCredit {
  groupId: string;
  groupName: string;
  roomName: string | null;
  color: string | null;
  sessionsIncluded: number | null;
  consumedSessions: number;
  paidSessions: number;
}

export interface BarcodeSummary {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  monthlyFee: number;
  advanceBalance: number;
  currentDebt: number;
  totalPaid: number;
  totalDue: number;
  lastPayment: { month: string; amountPaid: number; paidAt: string | null; date: string | null } | null;
  groupCredits: GroupCredit[];
  todaySessions: Array<{
    sessionId: string;
    groupId: string;
    groupName: string;
    roomName: string | null;
    color: string | null;
    startTime: string | null;
    endTime: string | null;
    attendanceStatus: string | null;
  }>;
}

export async function getBarcodeSummary(studentId: string): Promise<BarcodeSummary | null> {
  const { supabase, tenantId } = await getTenantContext();
  const rawId = (studentId || "").trim().toLowerCase();
  if (!rawId) return null;
  // Repair keyboard-layout garble from physical readers ("-" -> "6", "/" -> ">")
  // before hitting the DB.
  const id = repairStudentId(rawId);

  await autoMarkAbsentForPastSessions();
  await consumeExpiredSessionCredits();
  void scheduleAttendanceMaintenance();

  const baseSelect =
    "id, fullName, gradeLevel, monthlyFee, advanceBalance, group_students(status, consumedSessions, groups(id, name, sessionsIncluded, color, roomId))";

  let { data: student } = await supabase
    .from("students")
    .select(baseSelect)
    .eq("id", id)
    .eq("tenantId", tenantId)
    .single();

  // Fuzzy rescue: reader dropped/added a character — try a prefix match.
  if (!student && id.length >= 14) {
    const { data: found } = await supabase
      .from("students")
      .select(baseSelect)
      .ilike("id", id.slice(0, 14) + "%")
      .eq("tenantId", tenantId)
      .limit(1);
    student = (found || [])[0] || null;
  }

  // Unknown but valid UUID: register it so every printed card always appears.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!student && UUID_RE.test(id)) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("students").insert({
      id,
      tenantId,
      fullName: "بطاقة غير مسجلة",
      status: "active",
      enrolledAt: now,
      createdAt: now,
      updatedAt: now,
      monthlyFee: 0,
      advanceBalance: 0,
    });
    if (error) {
      // Already created by a concurrent request — fall back to reading it.
      const { error: ignored } = error;
      void ignored;
    }
    student = {
      id,
      fullName: "بطاقة غير مسجلة",
      gradeLevel: null,
      monthlyFee: 0,
      advanceBalance: 0,
      payments: [],
      group_students: [],
      attendances: [],
    };
  }

  if (!student) return null;

  const [{ data: paymentsData }, { data: todaySessionsData }, { data: roomsData }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, month, amountDue, amountPaid, paidAt, createdAt, groupId")
      .eq("studentId", student.id)
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false })
      .limit(36),
    supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime, groups(id, name, color, roomId)")
      .eq("tenantId", tenantId)
      .eq("sessionDate", (() => {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
      })())
      .neq("status", "cancelled"),
    supabase.from("rooms").select("id, name").eq("tenantId", tenantId),
  ]);
  const roomById = Object.fromEntries((roomsData || []).map((r: any) => [r.id, r.name]));

  const payments = (paymentsData || []) as any[];
  const totalDue = payments.reduce((s: number, p: any) => s + Number(p.amountDue), 0);
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amountPaid), 0);
  const currentDebt = Math.max(totalDue - totalPaid, 0);

  const lastPaid = payments.find((p: any) => Number(p.amountPaid) > 0);
  const lastPayment = lastPaid
    ? {
        month: lastPaid.month,
        amountPaid: Number(lastPaid.amountPaid),
        paidAt: lastPaid.paidAt,
        date: lastPaid.paidAt || lastPaid.createdAt || null,
      }
    : null;

  const activeGroups = ((student as any).group_students || []).filter((gs: any) => gs.status === "active");
  const activeGroupIds = new Set(activeGroups.map((gs: any) => gs.groups?.id).filter(Boolean));

  const groupCredits: GroupCredit[] = activeGroups
    .filter((gs: any) => gs.groups)
    .map((gs: any) => {
      const sessionsIncluded = gs.groups.sessionsIncluded != null ? Number(gs.groups.sessionsIncluded) : null;
      const paidCount = payments.filter((p: any) => p.groupId === gs.groups.id && Number(p.amountPaid) > 0).length;
      return {
        groupId: gs.groups.id,
        groupName: gs.groups.name,
        roomName: gs.groups.roomId ? roomById[gs.groups.roomId] || null : null,
        color: gs.groups.color || null,
        sessionsIncluded,
        consumedSessions: gs.consumedSessions != null ? Number(gs.consumedSessions) : 0,
        paidSessions: sessionsIncluded != null ? paidCount * sessionsIncluded : 0,
      };
    });

  const todayForStudent = (todaySessionsData || []).filter((s: any) => activeGroupIds.has(s.groupId));
  const todaySessionIds = todayForStudent.map((s: any) => s.id);
  const attBySession = new Map<string, string>();
  if (todaySessionIds.length > 0) {
    const { data: atts } = await supabase
      .from("attendances")
      .select("sessionId, status")
      .eq("studentId", student.id)
      .in("sessionId", todaySessionIds);
    for (const a of atts || []) attBySession.set(a.sessionId, a.status);
  }

  const todaySessions: BarcodeSummary["todaySessions"] = todayForStudent.map((sess: any) => {
    let status = attBySession.get(sess.id) || null;
    if (!status) {
      const end = sessionEndTimestamp(sess);
      if (end !== null && end < Date.now()) status = "absent";
    }
    return {
      sessionId: sess.id,
      groupId: sess.groupId,
      groupName: sess.groups?.name || "",
      roomName: sess.groups?.roomId ? roomById[sess.groups.roomId] || null : null,
      color: sess.groups?.color || null,
      startTime: sess.startTime,
      endTime: sess.endTime,
      attendanceStatus: status,
    };
  });

  todaySessions.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  return {
    id: student.id,
    fullName: student.fullName,
    gradeLevel: student.gradeLevel,
    monthlyFee: Number(student.monthlyFee),
    advanceBalance: Number(student.advanceBalance),
    currentDebt,
    totalPaid,
    totalDue,
    lastPayment,
    groupCredits,
    todaySessions,
  };
}

export async function markAttendanceByBarcode(
  sessionId: string,
  studentId: string
): Promise<ActionResult> {
  try {
    const ctx = await requirePermission("attendance.mark");
    const now = new Date().toISOString();

    const { data: session } = await ctx.supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime")
      .eq("id", sessionId)
      .eq("tenantId", ctx.tenantId)
      .single();
    if (!session) return { error: "Session not found" };

    // Only an active member may be marked, and never for a session that ended
    // before they enrolled in the group.
    const { data: enrollment } = await ctx.supabase
      .from("group_students")
      .select("enrolledAt")
      .eq("groupId", session.groupId)
      .eq("studentId", studentId)
      .eq("status", "active")
      .maybeSingle();
    if (!enrollment) return { error: "Student is not enrolled in this group" };
    if (enrollment.enrolledAt) {
      const enrolledMs = new Date(enrollment.enrolledAt).getTime();
      const endMs = sessionEndTimestamp(session);
      if (endMs !== null && endMs < enrolledMs) {
        return { error: "Session predates student enrollment" };
      }
    }

    const { error } = await ctx.supabase.from("attendances").upsert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      sessionId,
      studentId,
      status: "present",
      arrivedAt: now,
      markedById: ctx.userId,
      markedAt: now,
    }, {
      onConflict: "sessionId, studentId",
    });

    if (error) return { error: String(error) };

    await consumeExpiredSessionCredits();
    revalidatePath("/", "layout");
    return { success: true };
  } catch (e: any) {
    return { error: e.message || String(e) };
  }
}

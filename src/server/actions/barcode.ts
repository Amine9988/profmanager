"use server";

import { randomUUID } from "crypto";
import { getTenantContext, requirePermission } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./students";

export interface BarcodeSummary {
  id: string;
  fullName: string;
  gradeLevel: string | null;
  monthlyFee: number;
  advanceBalance: number;
  currentDebt: number;
  totalPaid: number;
  totalDue: number;
  lastPayment: { month: string; amountPaid: number; paidAt: string | null } | null;
  todaySessions: Array<{
    sessionId: string;
    groupId: string;
    groupName: string;
    startTime: string | null;
    endTime: string | null;
    attendanceStatus: string | null;
  }>;
}

export async function getBarcodeSummary(studentId: string): Promise<BarcodeSummary | null> {
  const { supabase, tenantId } = await getTenantContext();
  const id = (studentId || "").trim().toLowerCase();
  if (!id) return null;

  const baseSelect =
    "id, fullName, gradeLevel, monthlyFee, advanceBalance, payments(*), group_students(*, groups(id, name)), attendances(*, sessions(id, sessionDate, startTime, endTime))";

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

  const totalDue = (student.payments || []).reduce((s: number, p: any) => s + Number(p.amountDue), 0);
  const totalPaid = (student.payments || []).reduce((s: number, p: any) => s + Number(p.amountPaid), 0);
  const currentDebt = Math.max(totalDue - totalPaid, 0);

  const payments = (student.payments || []) as any[];
  payments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastPayment = payments.length > 0 && Number(payments[0].amountPaid) > 0
    ? { month: payments[0].month, amountPaid: Number(payments[0].amountPaid), paidAt: payments[0].paidAt }
    : null;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const activeGroups = ((student as any).group_students || []).filter((gs: any) => gs.status === "active");

  const todaySessions: BarcodeSummary["todaySessions"] = [];

  for (const gs of activeGroups) {
    const group = gs.groups;
    if (!group) continue;
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, startTime, endTime")
      .eq("groupId", group.id)
      .eq("sessionDate", todayStr)
      .neq("status", "cancelled");

    for (const sess of sessions || []) {
      const { data: att } = await supabase
        .from("attendances")
        .select("status")
        .eq("sessionId", sess.id)
        .eq("studentId", studentId)
        .maybeSingle();

      todaySessions.push({
        sessionId: sess.id,
        groupId: group.id,
        groupName: group.name,
        startTime: sess.startTime,
        endTime: sess.endTime,
        attendanceStatus: att?.status || null,
      });
    }
  }

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

    revalidatePath("/", "layout");
    return { success: true };
  } catch (e: any) {
    return { error: e.message || String(e) };
  }
}

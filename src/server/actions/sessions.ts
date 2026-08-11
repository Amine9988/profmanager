"use server";

import { randomUUID } from "crypto";
import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import type { ActionResult } from "./students";

export type SessionType = "regular" | "extra" | "makeup";
export type SessionStatus = "scheduled" | "completed" | "cancelled";

export async function getSchoolYearSettings() {
  const ctx = await getTenantContext();
  let { data } = await ctx.supabase
    .from("settings")
    .select("schoolYearStart, schoolYearEnd")
    .eq("userId", ctx.userId)
    .eq("tenantId", ctx.tenantId)
    .maybeSingle();
  if (!data) {
    const { data: d2 } = await ctx.supabase
      .from("settings")
      .select("schoolYearStart, schoolYearEnd")
      .eq("tenantId", ctx.tenantId)
      .limit(1)
      .maybeSingle();
    data = d2;
  }
  return data ? { schoolYearStart: data.schoolYearStart, schoolYearEnd: data.schoolYearEnd } : null;
}

export async function updateSchoolYearSettings(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.update");
    const schoolYearStart = formData.get("schoolYearStart") as string;
    const schoolYearEnd = formData.get("schoolYearEnd") as string;
    if (!schoolYearStart || !schoolYearEnd) return { error: t("errors.invalid_data") };

    const { data: existing } = await ctx.supabase
      .from("settings")
      .select("userId")
      .eq("userId", ctx.userId)
      .eq("tenantId", ctx.tenantId)
      .maybeSingle();

    if (existing) {
      await ctx.supabase
        .from("settings")
        .update({ schoolYearStart, schoolYearEnd })
        .eq("userId", ctx.userId)
        .eq("tenantId", ctx.tenantId);
    } else {
      await ctx.supabase
        .from("settings")
        .insert({ userId: ctx.userId, tenantId: ctx.tenantId, schoolYearStart, schoolYearEnd });
    }

    const result = await regenerateAllFutureSessions();
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function generateAllSessions(): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await getTenantContext();
    const schoolYear = await getSchoolYearSettings();
    const yearStart = schoolYear?.schoolYearStart;
    const yearEnd = schoolYear?.schoolYearEnd;
    if (!yearStart || !yearEnd) return { error: t("errors.school_year_not_set") };

    const { data: groups } = await ctx.supabase.from("groups").select("id, name").eq("tenantId", ctx.tenantId).eq("status", "active");
    if (!groups || groups.length === 0) return { error: t("errors.no_active_groups") };

    const startDate = new Date(yearStart);
    const endDate = new Date(yearEnd);
    const now = new Date().toISOString();
    for (const group of groups) {
      const { data: slots } = await ctx.supabase.from("schedule_slots").select("*").eq("groupId", group.id).eq("tenantId", ctx.tenantId);
      if (!slots || slots.length === 0) continue;

      const existingRes = await ctx.supabase.from("sessions").select("sessionDate, scheduleSlotId, status").eq("groupId", group.id).eq("tenantId", ctx.tenantId);
      const existingMap = new Map<string, string>();
      for (const ex of existingRes.data || []) {
        existingMap.set(`${ex.sessionDate}|${ex.scheduleSlotId}`, ex.status);
      }

      const sessionsToCreate: Record<string, unknown>[] = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        for (const slot of slots) {
          if (slot.dayOfWeek === current.getDay()) {
            const key = `${dateStr}|${slot.id}`;
            const existingStatus = existingMap.get(key);
            if (existingStatus === "cancelled" || existingStatus === "completed") continue;
            sessionsToCreate.push({
              id: randomUUID(),
              tenantId: ctx.tenantId,
              groupId: group.id,
              scheduleSlotId: slot.id,
              sessionDate: dateStr,
              startTime: slot.startTime,
              endTime: slot.endTime,
              status: "scheduled",
              type: "regular",
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        current.setDate(current.getDate() + 1);
      }

      if (sessionsToCreate.length > 0) {
        await ctx.supabase.from("sessions").delete().eq("groupId", group.id).eq("tenantId", ctx.tenantId).eq("status", "scheduled");
        const { error: insertError } = await ctx.supabase.from("sessions").insert(sessionsToCreate);
        if (insertError) return { error: insertError.message };
      }
    }

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : t("common.error") };
  }
}

export async function regenerateAllFutureSessions(): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.update");
    const { data: groups } = await ctx.supabase.from("groups").select("id").eq("tenantId", ctx.tenantId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    for (const group of groups || []) {
      const { data: futureUnattended } = await ctx.supabase
        .from("sessions")
        .select("id")
        .eq("groupId", group.id)
        .eq("tenantId", ctx.tenantId)
        .gte("sessionDate", todayStr)
        .not("status", "in", "('completed','cancelled')");
      const toDelete = (futureUnattended || []).map((s: any) => s.id);
      if (toDelete.length > 0) {
        await ctx.supabase.from("attendances").delete().in("sessionId", toDelete).eq("tenantId", ctx.tenantId);
        await ctx.supabase.from("sessions").delete().in("id", toDelete).eq("tenantId", ctx.tenantId);
      }
      await generateGroupSessions(group.id);
    }
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function generateGroupSessions(groupId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    
    const schoolYear = await getSchoolYearSettings();

    const yearStart = schoolYear?.schoolYearStart;
    const yearEnd = schoolYear?.schoolYearEnd;
    if (!yearStart || !yearEnd) {
      return { error: t("errors.school_year_not_set") };
    }

    const startDate = new Date(yearStart);
    const endDate = new Date(yearEnd);

    const now = new Date().toISOString();
    const { data: slots } = await ctx.supabase.from("schedule_slots").select("*").eq("groupId", groupId).eq("tenantId", ctx.tenantId);
    if (!slots || slots.length === 0) {
      return { success: true };
    }

    const existingRes = await ctx.supabase.from("sessions").select("sessionDate, scheduleSlotId, status").eq("groupId", groupId).eq("tenantId", ctx.tenantId);
    const existingMap = new Map<string, Set<string>>();
    for (const ex of existingRes.data || []) {
      const key = `${ex.sessionDate}|${ex.scheduleSlotId}`;
      if (!existingMap.has(key)) existingMap.set(key, new Set());
      existingMap.get(key)!.add(ex.status);
    }
    
    const sessionsToCreate: Record<string, unknown>[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
      for (const slot of slots) {
        if (slot.dayOfWeek === current.getDay()) {
          const key = `${dateStr}|${slot.id}`;
          const existing = existingMap.get(key);
          if (existing) {
            if (existing.has("cancelled") || existing.has("completed")) continue;
          }
          sessionsToCreate.push({
            id: randomUUID(),
            tenantId: ctx.tenantId,
            groupId: groupId,
            scheduleSlotId: slot.id,
            sessionDate: dateStr,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: "scheduled",
            type: "regular",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    // Delete previously generated scheduled sessions
    await ctx.supabase.from("sessions").delete().eq("groupId", groupId).eq("tenantId", ctx.tenantId).eq("status", "scheduled");

    if (sessionsToCreate.length > 0) {
      const { error: insertError } = await ctx.supabase.from("sessions").insert(sessionsToCreate);
      if (insertError) {
        return { error: insertError.message };
      }
    }

    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function regenerateGroupFutureSessions(groupId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data: futureUnattended } = await ctx.supabase
      .from("sessions")
      .select("id")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId)
      .gte("sessionDate", todayStr)
      .not("status", "in", "('completed','cancelled')");
    const toDelete = (futureUnattended || []).map((s: any) => s.id);
    if (toDelete.length > 0) {
      await ctx.supabase.from("attendances").delete().in("sessionId", toDelete).eq("tenantId", ctx.tenantId);
      await ctx.supabase.from("sessions").delete().in("id", toDelete).eq("tenantId", ctx.tenantId);
    }
    return await generateGroupSessions(groupId);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function createExtraSession(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const groupId = formData.get("groupId") as string;
    const sessionDate = formData.get("sessionDate") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    if (!groupId || !sessionDate || !startTime || !endTime) return { error: t("errors.invalid_data") };
    const { data: group } = await ctx.supabase.from("groups").select("id").eq("id", groupId).eq("tenantId", ctx.tenantId).single();
    if (!group) return { error: t("errors.group_not_found") };
    const now = new Date().toISOString();
    await ctx.supabase.from("sessions").insert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      groupId: groupId,
      sessionDate: sessionDate,
      startTime: startTime,
      endTime: endTime,
      status: "scheduled",
      type: "extra",
      createdAt: now,
      updatedAt: now,
    });
    await createAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: "session.extra_created", entityType: "session", entityId: groupId });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function createMakeupSession(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const groupId = formData.get("groupId") as string;
    const sessionDate = formData.get("sessionDate") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    if (!groupId || !sessionDate || !startTime || !endTime) return { error: t("errors.invalid_data") };
    const { data: group } = await ctx.supabase.from("groups").select("id").eq("id", groupId).eq("tenantId", ctx.tenantId).single();
    if (!group) return { error: t("errors.group_not_found") };
    const now = new Date().toISOString();
    await ctx.supabase.from("sessions").insert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      groupId: groupId,
      sessionDate: sessionDate,
      startTime: startTime,
      endTime: endTime,
      status: "scheduled",
      type: "makeup",
      createdAt: now,
      updatedAt: now,
    });
    await createAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: "session.makeup_created", entityType: "session", entityId: groupId });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function cancelSession(sessionId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const { data: session } = await ctx.supabase.from("sessions").select("id").eq("id", sessionId).eq("tenantId", ctx.tenantId).single();
    if (!session) return { error: t("errors.session_not_found") };
    await ctx.supabase.from("sessions").update({ status: "cancelled" }).eq("id", sessionId);
    await createAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: "session.cancelled", entityType: "session", entityId: sessionId });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function getSessionStats() {
  const ctx = await getTenantContext();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const schoolYear = await getSchoolYearSettings();
  const [{ count: total }, { count: completed }, { count: cancelled }, { count: extra }, { count: makeup }, { count: remaining }] = await Promise.all([
    ctx.supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", ctx.tenantId),
    ctx.supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", ctx.tenantId).eq("status", "completed"),
    ctx.supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", ctx.tenantId).eq("status", "cancelled"),
    ctx.supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", ctx.tenantId).eq("type", "extra"),
    ctx.supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", ctx.tenantId).eq("type", "makeup"),
    schoolYear?.schoolYearEnd
      ? ctx.supabase.from("sessions").select("*", { count: "exact", head: true }).eq("tenantId", ctx.tenantId).eq("status", "scheduled").gte("sessionDate", todayStr).lte("sessionDate", schoolYear.schoolYearEnd)
      : { count: null },
  ]);
  return { total: total ?? 0, completed: completed ?? 0, cancelled: cancelled ?? 0, extra: extra ?? 0, makeup: makeup ?? 0, remaining: remaining ?? 0 };
}

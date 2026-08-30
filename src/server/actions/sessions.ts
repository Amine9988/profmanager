"use server";

import { randomUUID } from "crypto";
import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import type { ActionResult } from "./students";
import { toDateInputValue } from "@/lib/group-form";
import {
  formatLocalYmd,
  isLikelyBakedYearEnd,
  pickEarlierYmd,
  pickLaterYmd,
  resolveGroupSessionRange,
} from "@/lib/session-dates";

export type SessionType = "regular" | "extra" | "makeup";

/** Finds an IDENTICAL non-cancelled session (same group, date, start AND end
 *  time) — a pure double-click duplicate. Multiple lessons per day at
 *  different times are intentionally allowed. */
async function findIdenticalSession(
  supabase: any,
  tenantId: string,
  groupId: string,
  sessionDate: string,
  startTime: string,
  endTime: string
): Promise<any | null> {
  const date10 = String(sessionDate).slice(0, 10);
  const { data } = await supabase
    .from("sessions")
    .select("id")
    .eq("tenantId", tenantId)
    .eq("groupId", groupId)
    .like("sessionDate", `${date10}%`)
    .eq("startTime", startTime)
    .eq("endTime", endTime)
    .neq("status", "cancelled");
  return (data && data[0]) || null;
}

/** Future regular lessons only — never extras, makeups, or already-taught days. */
async function deleteFutureRegularScheduled(
  supabase: any,
  tenantId: string,
  groupId: string
): Promise<void> {
  const todayStr = formatLocalYmd(new Date());
  const { data: rows } = await supabase
    .from("sessions")
    .select("id, sessionDate, type")
    .eq("tenantId", tenantId)
    .eq("groupId", groupId)
    .eq("status", "scheduled");
  const toDelete = (rows || [])
    .filter((s: any) => {
      if (s.type === "extra" || s.type === "makeup") return false;
      const day = toDateInputValue(s.sessionDate);
      return !!day && day > todayStr;
    })
    .map((s: any) => s.id);
  if (toDelete.length === 0) return;
  await supabase.from("sessions").delete().in("id", toDelete).eq("tenantId", tenantId);
}

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
  const { data: tenant } = await ctx.supabase
    .from("tenants")
    .select("schoolYearStart, schoolYearEnd")
    .eq("id", ctx.tenantId)
    .maybeSingle();
  const schoolYearStart = pickEarlierYmd(data?.schoolYearStart, tenant?.schoolYearStart);
  // If one source still has 2027 and the other 2032, keep the later end
  const schoolYearEnd = pickLaterYmd(data?.schoolYearEnd, tenant?.schoolYearEnd);
  return schoolYearStart && schoolYearEnd
    ? { schoolYearStart, schoolYearEnd }
    : null;
}

function isExplicitCustomEnd(row: { expiresAtCustom?: unknown }): boolean {
  return Number((row as any)?.expiresAtCustom) === 1;
}

async function customEndForGroup(
  supabase: any,
  tenantId: string,
  yearEnd: unknown,
  groupRow: { expiresAt?: unknown; expiresAtCustom?: unknown }
): Promise<boolean> {
  if (isExplicitCustomEnd(groupRow)) return true;
  const { data: all } = await supabase
    .from("groups")
    .select("expiresAt")
    .eq("tenantId", tenantId);
  const baked = isLikelyBakedYearEnd(
    groupRow?.expiresAt,
    yearEnd,
    (all || []).map((g: any) => g.expiresAt)
  );
  return !baked && !!toDateInputValue(groupRow?.expiresAt);
}

async function insertSessionBatches(
  supabase: any,
  rows: Record<string, unknown>[]
): Promise<string | null> {
  const SIZE = 400;
  for (let i = 0; i < rows.length; i += SIZE) {
    const { error } = await supabase.from("sessions").insert(rows.slice(i, i + SIZE));
    if (error) return error.message;
  }
  return null;
}

export async function updateSchoolYearSettings(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.update");
    const schoolYearStart = toDateInputValue(formData.get("schoolYearStart"));
    const schoolYearEnd = toDateInputValue(formData.get("schoolYearEnd"));
    if (!schoolYearStart || !schoolYearEnd) return { error: t("errors.invalid_data") };

    const { data: existing } = await ctx.supabase
      .from("settings")
      .select("userId, schoolYearEnd")
      .eq("userId", ctx.userId)
      .eq("tenantId", ctx.tenantId)
      .maybeSingle();

    const oldEnd = toDateInputValue(existing?.schoolYearEnd);

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

    // Groups that had the old/new year-end baked into expiresAt → follow year (null)
    const { data: groups } = await ctx.supabase
      .from("groups")
      .select("id, expiresAt")
      .eq("tenantId", ctx.tenantId);
    for (const g of groups || []) {
      const gEnd = toDateInputValue((g as any).expiresAt);
      if (gEnd && (gEnd === oldEnd || gEnd === schoolYearEnd)) {
        await ctx.supabase
          .from("groups")
          .update({ expiresAt: null })
          .eq("id", (g as any).id)
          .eq("tenantId", ctx.tenantId);
      }
    }

    const result = await regenerateAllFutureSessions();
    revalidateFullApp();
    return result?.error ? result : { success: true };
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

    const { data: groups } = await ctx.supabase
      .from("groups")
      .select("id, name, expiresAt, expiresAtCustom")
      .eq("tenantId", ctx.tenantId)
      .eq("status", "active");
    if (!groups || groups.length === 0) return { error: t("errors.no_active_groups") };

    const allEnds = groups.map((g: any) => g.expiresAt);
    const now = new Date().toISOString();
    for (const group of groups) {
      const baked = !isExplicitCustomEnd(group) &&
        isLikelyBakedYearEnd((group as any).expiresAt, yearEnd, allEnds);
      if (baked && (group as any).expiresAt) {
        await ctx.supabase
          .from("groups")
          .update({ expiresAt: null, expiresAtCustom: 0 })
          .eq("id", group.id)
          .eq("tenantId", ctx.tenantId);
        (group as any).expiresAt = null;
      }
      const range = resolveGroupSessionRange(yearStart, yearEnd, (group as any).expiresAt, {
        customEnd: !baked && !!toDateInputValue((group as any).expiresAt),
      });
      if (!range) continue;

      const { data: slots } = await ctx.supabase
        .from("schedule_slots")
        .select("*")
        .eq("groupId", group.id)
        .eq("tenantId", ctx.tenantId);
      if (!slots || slots.length === 0) continue;

      const existingRes = await ctx.supabase
        .from("sessions")
        .select("sessionDate, scheduleSlotId, status")
        .eq("groupId", group.id)
        .eq("tenantId", ctx.tenantId);
      const existingMap = new Map<string, string>();
      for (const ex of existingRes.data || []) {
        existingMap.set(`${toDateInputValue(ex.sessionDate)}|${ex.scheduleSlotId}`, ex.status);
      }

      const sessionsToCreate: Record<string, unknown>[] = [];
      const current = new Date(range.start);
      while (current.getTime() <= range.end.getTime()) {
        const dateStr = formatLocalYmd(current);
        for (const slot of slots) {
          if (Number(slot.dayOfWeek) === current.getDay()) {
            const key = `${dateStr}|${slot.id}`;
            const existingStatus = existingMap.get(key);
            if (existingStatus) continue;
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
        await deleteFutureRegularScheduled(ctx.supabase, ctx.tenantId, group.id);
        const insertError = await insertSessionBatches(ctx.supabase, sessionsToCreate);
        if (insertError) return { error: insertError };
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
    const schoolYear = await getSchoolYearSettings();
    const yearEnd = toDateInputValue(schoolYear?.schoolYearEnd);

    // Repair: baked copies of school-year end → follow year dynamically
    if (yearEnd) {
      const { data: groupsFix } = await ctx.supabase
        .from("groups")
        .select("id, expiresAt")
        .eq("tenantId", ctx.tenantId);
      const yearStart = toDateInputValue(schoolYear?.schoolYearStart);
      for (const g of groupsFix || []) {
        const gEnd = toDateInputValue((g as any).expiresAt);
        if (!gEnd) continue;
        // Exact match on current year end = "follow year"
        if (gEnd === yearEnd) {
          await ctx.supabase
            .from("groups")
            .update({ expiresAt: null })
            .eq("id", (g as any).id)
            .eq("tenantId", ctx.tenantId);
          continue;
        }
        // Stale copy from a previous year end: before current year start
        // (custom ends are always within the active school year)
        if (yearStart && gEnd < yearStart) {
          await ctx.supabase
            .from("groups")
            .update({ expiresAt: null })
            .eq("id", (g as any).id)
            .eq("tenantId", ctx.tenantId);
        }
      }
    }

    const { data: groups } = await ctx.supabase.from("groups").select("id").eq("tenantId", ctx.tenantId);
    for (const group of groups || []) {
      await deleteFutureRegularScheduled(ctx.supabase, ctx.tenantId, group.id);
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

    const { data: groupRow } = await ctx.supabase
      .from("groups")
      .select("expiresAt, expiresAtCustom")
      .eq("id", groupId)
      .eq("tenantId", ctx.tenantId)
      .maybeSingle();

    const customEnd = await customEndForGroup(ctx.supabase, ctx.tenantId, yearEnd, groupRow || {});
    if (!customEnd && groupRow?.expiresAt) {
      await ctx.supabase
        .from("groups")
        .update({ expiresAt: null, expiresAtCustom: 0 })
        .eq("id", groupId)
        .eq("tenantId", ctx.tenantId);
      (groupRow as any).expiresAt = null;
    }

    const range = resolveGroupSessionRange(yearStart, yearEnd, groupRow?.expiresAt, { customEnd });
    if (!range) {
      return { error: t("errors.school_year_not_set") };
    }
    const { start: startDate, end: endDate } = range;

    const now = new Date().toISOString();
    const { data: slots } = await ctx.supabase
      .from("schedule_slots")
      .select("*")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    if (!slots || slots.length === 0) {
      return { success: true };
    }

    const existingRes = await ctx.supabase
      .from("sessions")
      .select("sessionDate, scheduleSlotId, status")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    const existingMap = new Map<string, Set<string>>();
    for (const ex of existingRes.data || []) {
      const key = `${toDateInputValue(ex.sessionDate)}|${ex.scheduleSlotId}`;
      if (!existingMap.has(key)) existingMap.set(key, new Set());
      existingMap.get(key)!.add(ex.status);
    }

    const sessionsToCreate: Record<string, unknown>[] = [];
    const seenInBatch = new Set<string>();
    const current = new Date(startDate);
    // Inclusive through the last day of school year / group end
    while (current.getTime() <= endDate.getTime()) {
      const dateStr = formatLocalYmd(current);
      for (const slot of slots) {
        if (Number(slot.dayOfWeek) === current.getDay()) {
          const key = `${dateStr}|${slot.id}`;
          const existing = existingMap.get(key);
          if (existing && existing.size > 0) continue;
          if (seenInBatch.has(key)) continue;
          seenInBatch.add(key);
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

    await deleteFutureRegularScheduled(ctx.supabase, ctx.tenantId, groupId);

    const survivorsRes = await ctx.supabase
      .from("sessions")
      .select("sessionDate, scheduleSlotId")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    const survivorKeys = new Set(
      (survivorsRes.data || []).map((ex: any) => `${toDateInputValue(ex.sessionDate)}|${ex.scheduleSlotId}`)
    );
    const finalBatch = sessionsToCreate.filter((s) => {
      const key = `${String(s.sessionDate)}|${String(s.scheduleSlotId)}`;
      return !survivorKeys.has(key);
    });

    if (finalBatch.length > 0) {
      const insertError = await insertSessionBatches(ctx.supabase, finalBatch);
      if (insertError) {
        return { error: insertError };
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
    await deleteFutureRegularScheduled(ctx.supabase, ctx.tenantId, groupId);
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

    // Block duplicate lessons: reject when a non-cancelled session of this
    // group already covers the same date with an overlapping time window.
    const overlap = await findIdenticalSession(ctx.supabase, ctx.tenantId, groupId, sessionDate, startTime, endTime);
    if (overlap) return { error: t("errors.session_overlap") };

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

    // Block duplicate lessons (same rule as extra sessions).
    const overlapMakeup = await findIdenticalSession(ctx.supabase, ctx.tenantId, groupId, sessionDate, startTime, endTime);
    if (overlapMakeup) return { error: t("errors.session_overlap") };

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
    const { data: session } = await ctx.supabase.from("sessions").select("id, groupId, creditsConsumed").eq("id", sessionId).eq("tenantId", ctx.tenantId).single();
    if (!session) return { error: t("errors.session_not_found") };

    // A cancelled session must never consume a student's remaining session
    // credits. If this session had already consumed credits (its end time
    // passed while it was scheduled), give every active member their credit
    // back before marking it cancelled.
    if (Number(session.creditsConsumed) === 1 && session.groupId) {
      const { data: group } = await ctx.supabase.from("groups").select("id, sessionsIncluded").eq("id", session.groupId).single();
      if (group && Number(group.sessionsIncluded) > 0) {
        const { data: members } = await ctx.supabase
          .from("group_students")
          .select("id, remainingSessions, consumedSessions")
          .eq("groupId", session.groupId)
          .eq("status", "active");
        for (const m of members || []) {
          await ctx.supabase
            .from("group_students")
            .update({
              remainingSessions: Number(m.remainingSessions ?? 0) + 1,
              consumedSessions: Math.max(Number(m.consumedSessions ?? 0) - 1, 0),
            })
            .eq("id", m.id);
        }
      }
      await ctx.supabase.from("sessions").update({ creditsConsumed: 0 }).eq("id", sessionId);
    }

    await ctx.supabase.from("sessions").update({ status: "cancelled" }).eq("id", sessionId);
    await createAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: "session.cancelled", entityType: "session", entityId: sessionId });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function updateExtraSession(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const sessionId = formData.get("sessionId") as string;
    const sessionDate = formData.get("sessionDate") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    if (!sessionId || !sessionDate || !startTime || !endTime) return { error: t("errors.invalid_data") };
    const { data: existing } = await ctx.supabase
      .from("sessions")
      .select("id, type")
      .eq("id", sessionId)
      .eq("tenantId", ctx.tenantId)
      .single();
    if (!existing) return { error: t("errors.session_not_found") };
    if (existing.type !== "extra" && existing.type !== "makeup") {
      return { error: t("errors.invalid_data") };
    }
    const now = new Date().toISOString();
    await ctx.supabase
      .from("sessions")
      .update({ sessionDate, startTime, endTime, updatedAt: now })
      .eq("id", sessionId)
      .eq("tenantId", ctx.tenantId);
    await createAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: "session.updated", entityType: "session", entityId: sessionId });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function deleteExtraSession(sessionId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const { data: existing } = await ctx.supabase
      .from("sessions")
      .select("id, type")
      .eq("id", sessionId)
      .eq("tenantId", ctx.tenantId)
      .single();
    if (!existing) return { error: t("errors.session_not_found") };
    if (existing.type !== "extra" && existing.type !== "makeup") {
      return { error: t("errors.invalid_data") };
    }
    await ctx.supabase.from("attendances").delete().eq("sessionId", sessionId).eq("tenantId", ctx.tenantId);
    await ctx.supabase.from("sessions").delete().eq("id", sessionId).eq("tenantId", ctx.tenantId);
    await createAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: "session.deleted", entityType: "session", entityId: sessionId });
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


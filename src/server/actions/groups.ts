"use server";

import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { groupSchema, scheduleSlotSchema } from "@/lib/validations/group";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import { randomUUID } from "crypto";
import { toCamelArray, toCamelCase } from "@/lib/db";
import type { ActionResult } from "./students";
import { generateGroupSessions, getSchoolYearSettings } from "./sessions";
import { checkRoomConflictsForSlots, checkRoomConflict } from "@/lib/room-conflict";
import { parseSlotsFromFormData, toSqlDate } from "@/lib/group-form";

export async function getRooms() {
  try {
    const { supabase } = await getTenantContext();
    const { data: roomsData } = await supabase
      .from("rooms")
      .select("id, name, code")
      .order("name");
    return toCamelArray(roomsData || []);
  } catch (e) {
    console.error("[getRooms] error:", e);
    return [];
  }
}

export async function getGroups() {
  const t0 = Date.now();
  const { tenantId, supabase } = await getTenantContext();
  const t1 = Date.now();

    const { data: groups } = await supabase
      .from("groups")
      .select("id, name, level, maxCapacity, status, pricePerSession, priceType, roomId, color, expiresAt, teacherId, subjectId, subjects(id, name), teachers(id, firstName, lastName), group_students(id, status)")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false })
      .limit(100);
  const t2 = Date.now();
  console.log(`[perf] getGroups: getTenantContext ${t1-t0}ms, query ${t2-t1}ms, total ${Date.now()-t0}ms, rows=${groups?.length||0}`);

  const groupsData = toCamelArray(groups || []).map((g: any) => ({
    ...g,
    subject: g.subjects,
    teacher: g.teachers,
    room: null,
    roomId: g.roomId ?? null,
    expiresAt: g.expiresAt ?? null,
    groupStudents: ((g.groupStudents || []) as any[]).filter((gs: any) => gs.status === "active"),
    scheduleSlots: g.scheduleSlots || [],
  }));
  // Attach schedule slots for the card count + edit dialog prefill (list view)
  if (groupsData.length > 0) {
    const groupIds = groupsData.map((g: any) => g.id);
    const { data: slots } = await supabase.from("schedule_slots").select("*").in("groupId", groupIds).eq("tenantId", tenantId);
    const slotMap = new Map<string, any[]>();
    for (const s of toCamelArray(slots || [])) {
      const arr = slotMap.get(s.groupId) || [];
      arr.push(s);
      slotMap.set(s.groupId, arr);
    }
    for (const g of groupsData) {
      g.scheduleSlots = slotMap.get(g.id) || [];
    }
  }
  const missingTeacherIds = [...new Set(groupsData.filter((g: any) => !g.teacher && g.teacherId).map((g: any) => g.teacherId))] as string[];
  if (missingTeacherIds.length > 0) {
    const { supabase } = await getTenantContext();
    const { data: teachers } = await supabase.from("teachers").select("id, firstName, lastName").in("id", missingTeacherIds);
    const teacherMap = Object.fromEntries((teachers || []).map((t: any) => [t.id, t]));
    for (const g of groupsData) {
      if (!g.teacher && g.teacherId) g.teacher = teacherMap[g.teacherId] || null;
    }
  }
  return groupsData;
}

export async function getGroup(groupId: string) {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .select("*, subjects(*), teachers(id, firstName, lastName)")
      .eq("id", groupId)
      .eq("tenantId", tenantId)
      .maybeSingle();

    if (groupErr) {
      console.error("[getGroup] error:", JSON.stringify(groupErr));
      return null;
    }
    if (!group) return null;

    const [{ data: groupStudents }, { data: scheduleSlots }, { data: sessions }] = await Promise.all([
      supabase.from("group_students").select("*, students(*)").eq("groupId", groupId),
      supabase.from("schedule_slots").select("*").eq("tenantId", tenantId).eq("groupId", groupId),
      supabase.from("sessions").select("*").eq("tenantId", tenantId).eq("groupId", groupId),
    ]);

    const g = toCamelCase(group) as any;
    g.groupStudents = toCamelArray(groupStudents || []).filter((gs: any) => gs.status === "active");
    g.scheduleSlots = toCamelArray(scheduleSlots || []);
    const allSessions = toCamelArray(sessions || []).sort(
      (a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime()
    );
    g.extraSessions = allSessions
      .filter((s: any) => s.type === "extra" || s.type === "makeup")
      .slice(0, 20);
    g.sessions = allSessions.filter((s: any) => s.type !== "extra" && s.type !== "makeup").slice(0, 10);

    let teacher = g.teachers;
    if (!teacher && g.teacherId) {
      const { data: t } = await supabase.from("teachers").select("id, firstName, lastName").eq("id", g.teacherId).maybeSingle();
      teacher = t || null;
    }

    return {
      ...g,
      subject: g.subjects,
      teacher,
      room: null,
    };
  } catch (e) {
    console.error("[getGroup] exception:", e);
    return null;
  }
}

export async function getSubjects() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data } = await supabase.from("subjects").select("*").eq("tenantId", tenantId).order("name");
    return toCamelArray(data || []);
  } catch (e) {
    console.error("[getSubjects] error:", e);
    return [];
  }
}

export async function createSubject(name: string, color = "#6366f1"): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.create");
    const now = new Date().toISOString();
    const { data: subject } = await ctx.supabase.from("subjects").insert({ id: randomUUID(), tenantId: ctx.tenantId, name, color, createdAt: now }).select().single();
    revalidateFullApp();
    return { success: true, id: subject!.id };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function createGroup(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.create");

    const parsed = groupSchema.safeParse({
      name: formData.get("name"),
      subjectId: formData.get("subjectId") || null,
      level: formData.get("level") || null,
      maxCapacity: formData.get("maxCapacity") || 10,
      pricePerSession: formData.get("pricePerSession") || null,
      priceType: formData.get("priceType") || "per_session",
      sessionsIncluded: formData.get("sessionsIncluded") || null,
      teacherId: formData.get("teacherId") || null,
      roomId: formData.get("roomId") || null,
      color: formData.get("color") || null,
      expiresAt: formData.get("expiresAt") || null,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    // Robust expiry resolution: accept both expiresAt and legacy expiresAtField,
    // trim whitespace, and treat missing useExpiresAt as "1" when a date is present.
    const rawUse = formData.get("useExpiresAt");
    const rawExpires = (formData.get("expiresAt") ?? formData.get("expiresAtField") ?? "") as string;
    const useExpiresAt = rawUse === "1" || (rawUse == null && String(rawExpires).trim() !== "");
    let expiresAt: string | null = null;
    if (useExpiresAt) {
      expiresAt = toSqlDate(rawExpires);
      if (!expiresAt) return { error: t("groups.expires_required") };
    } else {
      try {
        const sy = await getSchoolYearSettings();
        expiresAt = toSqlDate(sy?.schoolYearEnd);
      } catch {
        expiresAt = null;
      }
    }

    const { slots: slotsToCheck, incomplete } = parseSlotsFromFormData(formData);
    if (incomplete) return { error: t("groups.slot_times_required") };

    // Validate room conflicts before creating
    if (parsed.data.roomId && slotsToCheck.length > 0) {
      const conflict = await checkRoomConflictsForSlots(ctx.supabase, {
        tenantId: ctx.tenantId,
        roomId: parsed.data.roomId,
        slots: slotsToCheck,
      });
      if (conflict) {
        return { error: conflict.message ?? t("errors.room_conflict") };
      }
    }

    const now = new Date().toISOString();
    const { data: group, error: insertErr } = await ctx.supabase.from("groups").insert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      name: parsed.data.name,
      subjectId: parsed.data.subjectId,
      level: parsed.data.level,
      maxCapacity: parsed.data.maxCapacity,
      pricePerSession: parsed.data.pricePerSession,
      priceType: parsed.data.priceType,
      sessionsIncluded: parsed.data.sessionsIncluded ?? null,
      status: "active",
      teacherId: parsed.data.teacherId || null,
      roomId: parsed.data.roomId || null,
      color: parsed.data.color || null,
      expiresAt: expiresAt || null,
      createdAt: now,
      updatedAt: now,
    }).select().single();

    if (insertErr || !group) {
      return { error: insertErr?.message ?? t("common.error") };
    }

    if (slotsToCheck.length > 0) {
      const slotsToInsert = slotsToCheck.map((slot) => ({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        groupId: group.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        createdAt: now,
      }));
      const { error: slotErr } = await ctx.supabase.from("schedule_slots").insert(slotsToInsert);
      if (slotErr) return { error: slotErr.message };
    }

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "group.created", entityType: "group", entityId: group.id,
      metadata: { name: parsed.data.name },
    });

    revalidateFullApp();
    try { await generateGroupSessions(group.id); } catch {}
    return { success: true, id: group.id };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function addScheduleSlot(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");

    const parsed = scheduleSlotSchema.safeParse({
      groupId: formData.get("groupId"),
      dayOfWeek: formData.get("dayOfWeek"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      location: formData.get("location") || null,
      isOnline: formData.get("isOnline") === "on",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    const { data: group } = await ctx.supabase.from("groups").select("id, roomId").eq("id", parsed.data.groupId).eq("tenantId", ctx.tenantId).single();
    if (!group) return { error: t("errors.group_not_found") };

    // Validate room conflict if group has a room assigned
    if (group.roomId) {
      const conflict = await checkRoomConflict(ctx.supabase, {
        tenantId: ctx.tenantId,
        roomId: group.roomId,
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        excludeGroupId: parsed.data.groupId,
      });
      if (conflict.hasConflict) {
        return { error: conflict.message ?? t("errors.room_conflict") };
      }
    }

    const { data: slot } = await ctx.supabase.from("schedule_slots").insert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      groupId: parsed.data.groupId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      location: parsed.data.location,
      isOnline: parsed.data.isOnline,
    }).select().single();

    revalidateFullApp();
    await generateGroupSessions(parsed.data.groupId);
    return { success: true, id: slot!.id };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function generateSessions(groupId: string, weeksAhead = 8): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");

    const { data: group } = await ctx.supabase.from("groups").select("*, schedule_slots(*)").eq("id", groupId).eq("tenantId", ctx.tenantId).single();
    if (!group) return { error: t("errors.group_not_found") };

    const sessionsToCreate: Record<string, unknown>[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date().toISOString();
    const expiresAt = (group as any).expiresAt ? new Date((group as any).expiresAt) : null;
    if (expiresAt) expiresAt.setHours(23, 59, 59, 999);

    // Idempotency guard: never create a session that already exists for the
    // same slot on the same date (repeated invocations must be safe).
    const { data: existingSessions } = await ctx.supabase
      .from("sessions")
      .select("sessionDate, scheduleSlotId, status")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    const existingKeys = new Set<string>();
    const preserved = new Set<string>();
    for (const ex of existingSessions || []) {
      existingKeys.add(`${ex.sessionDate}|${ex.scheduleSlotId}`);
      if (ex.status === "completed" || ex.status === "cancelled") preserved.add(`${ex.sessionDate}|${ex.scheduleSlotId}`);
    }

    for (const slot of (group.scheduleSlots || group.schedule_slots || []) as any[]) {
      for (let week = 0; week < weeksAhead; week++) {
        const date = new Date(today);
        const dayDiff = (slot.dayOfWeek - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + dayDiff + week * 7);
        if (expiresAt && date > expiresAt) continue;
        const sessionDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const key = `${sessionDate}|${slot.id}`;
        if (existingKeys.has(key) || preserved.has(key)) continue;
        sessionsToCreate.push({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          groupId: groupId,
          scheduleSlotId: slot.id,
          sessionDate: sessionDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "scheduled",
          type: "regular",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (sessionsToCreate.length > 0) {
      await ctx.supabase.from("sessions").insert(sessionsToCreate);
    }

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function enrollStudent(groupId: string, studentId: string, clientType: string = "institution"): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const type = clientType === "teacher" ? "teacher" : "institution";

    const [{ data: group }, { data: student }] = await Promise.all([
      ctx.supabase.from("groups").select("id").eq("id", groupId).eq("tenantId", ctx.tenantId).single(),
      ctx.supabase.from("students").select("id").eq("id", studentId).eq("tenantId", ctx.tenantId).single(),
    ]);
    if (!group || !student) return { error: t("common.error") };

    const { data: existing } = await ctx.supabase.from("group_students").select("id").eq("groupId", groupId).eq("studentId", studentId).maybeSingle();
    if (existing) {
      await ctx.supabase.from("group_students").update({ status: "active", clientType: type }).eq("id", existing.id);
    } else {
      await ctx.supabase.from("group_students").insert({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        groupId: groupId,
        studentId: studentId,
        status: "active",
        clientType: type,
        enrolledAt: new Date().toISOString(),
      });
    }

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "group.student_enrolled", entityType: "group", entityId: groupId,
      metadata: { studentId },
    });

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function updateEnrollmentClientType(groupId: string, studentId: string, clientType: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const type = clientType === "teacher" ? "teacher" : "institution";

    const { data } = await ctx.supabase
      .from("group_students")
      .update({ clientType: type })
      .eq("groupId", groupId)
      .eq("studentId", studentId)
      .eq("tenantId", ctx.tenantId)
      .select();
    if (!data || data.length === 0) return { error: t("errors.enrollment_not_found") };

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function unenrollStudent(groupId: string, studentId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");

    const { data } = await ctx.supabase.from("group_students").update({ status: "withdrawn" }).eq("groupId", groupId).eq("studentId", studentId).eq("tenantId", ctx.tenantId).select();
    if (!data || data.length === 0) return { error: t("errors.enrollment_not_found") };

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function deleteGroup(groupId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.delete");
    const { data: group } = await ctx.supabase.from("groups").select("id").eq("id", groupId).eq("tenantId", ctx.tenantId).single();
    if (!group) return { error: t("errors.group_not_found") };

    await ctx.supabase.from("group_students").delete().eq("groupId", groupId);
    await ctx.supabase.from("schedule_slots").delete().eq("groupId", groupId);

    // Delete every payment scoped to this group, and the cash movements it
    // generated, so no traces remain in payments or the caisse.
    const { data: groupPayments } = await ctx.supabase
      .from("payments")
      .select("id")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    if (groupPayments && groupPayments.length > 0) {
      const paymentIds = groupPayments.map((p: any) => p.id);
      await ctx.supabase
        .from("cash_movements")
        .delete()
        .in("referenceId", paymentIds)
        .eq("autoGenerated", true);
      await ctx.supabase.from("payments").delete().in("id", paymentIds).eq("tenantId", ctx.tenantId);
    }

    const { data: sessions } = await ctx.supabase
      .from("sessions")
      .select("id")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    const sessionIds = (sessions || []).map((s: any) => s.id);
    if (sessionIds.length > 0) {
      await ctx.supabase.from("attendances").delete().in("sessionId", sessionIds).eq("tenantId", ctx.tenantId);
      await ctx.supabase.from("sessions").delete().in("id", sessionIds).eq("tenantId", ctx.tenantId);
    }
    await ctx.supabase.from("groups").delete().eq("id", groupId);

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "group.deleted", entityType: "group", entityId: groupId,
    });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function archiveGroup(groupId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");
    const { data: group } = await ctx.supabase.from("groups").select("status").eq("id", groupId).eq("tenantId", ctx.tenantId).single();
    if (!group) return { error: t("errors.group_not_found") };

    const newStatus = group.status === "active" ? "archived" : "active";
    await ctx.supabase.from("groups").update({ status: newStatus }).eq("id", groupId);

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: newStatus === "archived" ? "group.archived" : "group.restored",
      entityType: "group", entityId: groupId,
    });
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function updateGroup(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");

    const groupId = formData.get("groupId") as string;
    if (!groupId) return { error: t("common.error") };

    const { data: existing } = await ctx.supabase.from("groups").select("id, roomId, name").eq("id", groupId).eq("tenantId", ctx.tenantId).single();
    if (!existing) return { error: t("errors.group_not_found") };

    const parsed = groupSchema.safeParse({
      name: formData.get("name"),
      subjectId: formData.get("subjectId") || null,
      level: formData.get("level") || null,
      maxCapacity: formData.get("maxCapacity") || 10,
      pricePerSession: formData.get("pricePerSession") || null,
      priceType: formData.get("priceType") || "per_session",
      sessionsIncluded: formData.get("sessionsIncluded") || null,
      teacherId: formData.get("teacherId") || null,
      roomId: formData.get("roomId") || null,
      color: formData.get("color") || null,
      expiresAt: formData.get("expiresAt") || null,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    const rawUse2 = formData.get("useExpiresAt");
    const rawExpires2 = (formData.get("expiresAt") ?? formData.get("expiresAtField") ?? "") as string;
    const useExpiresAt = rawUse2 === "1" || (rawUse2 == null && String(rawExpires2).trim() !== "");
    let expiresAt: string | null = null;
    if (useExpiresAt) {
      expiresAt = toSqlDate(rawExpires2);
      if (!expiresAt) return { error: t("groups.expires_required") };
    } else {
      try {
        const sy = await getSchoolYearSettings();
        expiresAt = toSqlDate(sy?.schoolYearEnd);
      } catch {
        expiresAt = null;
      }
    }

    // Validate slots BEFORE mutating the group – prevents partial update that
    // left the name/price saved but schedule rejected (the “as if not entered” bug).
    const { slots: submittedSlotsEarly, incomplete: incompleteEarly } = parseSlotsFromFormData(formData);
    if (incompleteEarly) return { error: t("groups.slot_times_required") };

    // If room changed, check existing slots for conflicts (use submitted if present, else stored)
    if (parsed.data.roomId && parsed.data.roomId !== existing.roomId) {
      let slotsForConflict: any[] = submittedSlotsEarly as any[];
      if (slotsForConflict.length === 0) {
        const { data: slots } = await ctx.supabase
          .from("schedule_slots")
          .select("dayOfWeek, startTime, endTime")
          .eq("groupId", groupId)
          .eq("tenantId", ctx.tenantId);
        slotsForConflict = (slots as any[]) || [];
      }
      if (slotsForConflict.length > 0) {
        const conflict = await checkRoomConflictsForSlots(ctx.supabase, {
          tenantId: ctx.tenantId,
          roomId: parsed.data.roomId,
          slots: slotsForConflict as any[],
          excludeGroupId: groupId,
        });
        if (conflict) {
          return { error: conflict.message ?? t("errors.room_conflict") };
        }
      }
    }

    const { error: updateErr } = await ctx.supabase.from("groups").update({
      name: parsed.data.name,
      subjectId: parsed.data.subjectId,
      level: parsed.data.level,
      maxCapacity: parsed.data.maxCapacity,
      pricePerSession: parsed.data.pricePerSession,
      priceType: parsed.data.priceType,
      sessionsIncluded: parsed.data.sessionsIncluded ?? null,
      teacherId: parsed.data.teacherId || null,
      roomId: parsed.data.roomId || null,
      color: parsed.data.color || null,
      expiresAt: expiresAt || null,
    }).eq("id", groupId);
    if (updateErr) return { error: updateErr.message };

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "group.updated", entityType: "group", entityId: groupId,
    });

    // ------------------------------------------------------------------
    // Schedule slots: submitted rows replace the current set. Rows carry an
    // optional slot id (existing) — new rows have none. Missing existing ids
    // means the slot was removed by the user. Reuse the already-validated
    // early parse so we never return an error AFTER the group was mutated.
    // ------------------------------------------------------------------
    const submittedSlots = submittedSlotsEarly;
    // (incompleteEarly already checked before the group update)

    const { data: existingSlots } = await ctx.supabase
      .from("schedule_slots")
      .select("id")
      .eq("groupId", groupId)
      .eq("tenantId", ctx.tenantId);
    const existingSlotIds = new Set((existingSlots || []).map((s: any) => s.id));
    const submittedSlotIds = new Set(submittedSlots.filter((s) => s.id).map((s) => s.id as string));

    // Remove slots the user deleted
    for (const id of existingSlotIds) {
      if (typeof id === "string" && !submittedSlotIds.has(id)) {
        await ctx.supabase.from("schedule_slots").delete().eq("id", id).eq("tenantId", ctx.tenantId);
      }
    }

    // Upsert the submitted slots (update existing, insert new)
    for (const slot of submittedSlots) {
      if (slot.id && existingSlotIds.has(slot.id)) {
        await ctx.supabase
          .from("schedule_slots")
          .update({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime })
          .eq("id", slot.id)
          .eq("tenantId", ctx.tenantId);
      } else {
        await ctx.supabase.from("schedule_slots").insert({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          groupId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Rebuild future sessions from the new schedule whenever the schedule
    // changed relative to what was stored.
    try {
      if (submittedSlots.length === 0 && existingSlotIds.size > 0) {
        // All slots were removed: drop leftover scheduled sessions.
        await ctx.supabase.from("sessions").delete().eq("groupId", groupId).eq("tenantId", ctx.tenantId).eq("status", "scheduled");
      } else if (submittedSlots.length > 0 || existingSlotIds.size > 0) {
        await generateGroupSessions(groupId);
      }
    } catch {
      // Session regeneration is best-effort; group + slots already saved.
    }

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function deleteScheduleSlot(slotId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");

    const { data: slot } = await ctx.supabase.from("schedule_slots").select("*, groups(id)").eq("id", slotId).eq("tenantId", ctx.tenantId).single();
    if (!slot) return { error: t("common.error") };

    const groupId = (slot.groups as any).id;

    await ctx.supabase.from("schedule_slots").delete().eq("id", slotId);

    // Remove future scheduled sessions for this slot only — keep past attendance
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const { data: futureSessions } = await ctx.supabase
      .from("sessions")
      .select("id")
      .eq("scheduleSlotId", slotId)
      .eq("tenantId", ctx.tenantId)
      .gte("sessionDate", todayStr)
      .eq("status", "scheduled");
    const toDelete = (futureSessions || []).map((s: any) => s.id);
    if (toDelete.length > 0) {
      await ctx.supabase.from("attendances").delete().in("sessionId", toDelete).eq("tenantId", ctx.tenantId);
      await ctx.supabase.from("sessions").delete().in("id", toDelete).eq("tenantId", ctx.tenantId);
    }

    await generateGroupSessions(groupId);
    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

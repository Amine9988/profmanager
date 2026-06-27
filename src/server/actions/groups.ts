"use server";

import { getTenantContext, requirePermission, createAuditLog, AuthError } from "@/lib/auth";
import { groupSchema, scheduleSlotSchema } from "@/lib/validations/group";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import { randomUUID } from "crypto";
import { toCamelArray, toCamelCase } from "@/lib/db";
import type { ActionResult } from "./students";
import { generateGroupSessions } from "./sessions";
import { checkRoomConflictsForSlots, checkRoomConflict } from "@/lib/room-conflict";

export async function getRooms() {
  const { supabase } = await getTenantContext();
  const { data: roomsData } = await supabase
    .from("rooms")
    .select("id, name, code")
    .order("name");
  return toCamelArray(roomsData || []);
}

export async function getGroups() {
  const { tenantId, supabase } = await getTenantContext();

    const { data: groups } = await supabase
      .from("groups")
      .select("*, subjects(*), teachers(id, firstName, lastName), group_students(*), schedule_slots(*)")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false });

  return toCamelArray(groups || []).map((g: any) => ({
    ...g,
    subject: g.subjects,
    teacher: g.teachers,
    room: null,
    roomId: g.roomId ?? null,
    groupStudents: ((g.groupStudents || []) as any[]).filter((gs: any) => gs.status === "active"),
    scheduleSlots: g.scheduleSlots || [],
  }));
}

export async function getGroup(groupId: string) {
  const { tenantId, supabase } = await getTenantContext();

  const { data: group } = await supabase
    .from("groups")
    .select("*, subjects(*), teachers(id, firstName, lastName), group_students(*, students(*)), schedule_slots(*), sessions(*)")
    .eq("id", groupId)
    .eq("tenantId", tenantId)
    .single();

  if (!group) return null;

  const g = toCamelCase(group) as any;
  return {
    ...g,
    subject: g.subjects,
    teacher: g.teachers,
    room: null,
    groupStudents: ((g.groupStudents || []) as any[]).filter((gs: any) => gs.status === "active"),
    scheduleSlots: g.scheduleSlots || [],
    sessions: ((g.sessions || []) as any[]).sort((a: any, b: any) => new Date(b.sessionDate || b.sessionDate).getTime() - new Date(a.sessionDate || a.sessionDate).getTime()).slice(0, 10),
  };
}

export async function getSubjects() {
  const { tenantId, supabase } = await getTenantContext();
  const { data } = await supabase.from("subjects").select("*").eq("tenantId", tenantId).order("name");
  return toCamelArray(data || []);
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
      teacherId: formData.get("teacherId") || null,
      roomId: formData.get("roomId") || null,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    // Build slots to check for conflicts
    const slotCount = parseInt((formData.get("slotCount") as string) || "0", 10);
    const slotsToInsert: Record<string, unknown>[] = [];
    const slotsToCheck: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
    for (let i = 0; i < slotCount; i++) {
      const dayOfWeek = formData.get(`slot_day_${i}`);
      const startTime = formData.get(`slot_start_${i}`);
      const endTime = formData.get(`slot_end_${i}`);
      if (dayOfWeek && startTime && endTime) {
        const slot = { dayOfWeek: parseInt(dayOfWeek as string, 10), startTime: startTime as string, endTime: endTime as string };
        slotsToCheck.push(slot);
      }
    }

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
    const { data: group } = await ctx.supabase.from("groups").insert({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      name: parsed.data.name,
      subjectId: parsed.data.subjectId,
      level: parsed.data.level,
      maxCapacity: parsed.data.maxCapacity,
      pricePerSession: parsed.data.pricePerSession,
      priceType: parsed.data.priceType,
      status: "active",
      teacherId: parsed.data.teacherId || null,
      roomId: parsed.data.roomId || null,
      createdAt: now,
      updatedAt: now,
    }).select().single();

    // Create schedule slots from form
    for (let i = 0; i < slotCount; i++) {
      const dayOfWeek = formData.get(`slot_day_${i}`);
      const startTime = formData.get(`slot_start_${i}`);
      const endTime = formData.get(`slot_end_${i}`);
      if (dayOfWeek && startTime && endTime) {
        slotsToInsert.push({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          groupId: group!.id,
          dayOfWeek: parseInt(dayOfWeek as string, 10),
          startTime,
          endTime,
        });
      }
    }
    if (slotsToInsert.length > 0) {
      await ctx.supabase.from("schedule_slots").insert(slotsToInsert);
    }

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "group.created", entityType: "group", entityId: group!.id,
      metadata: { name: parsed.data.name },
    });

    revalidateFullApp();
    await generateGroupSessions(group!.id);
    return { success: true, id: group!.id };
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

    for (const slot of (group.scheduleSlots || group.schedule_slots || []) as any[]) {
      for (let week = 0; week < weeksAhead; week++) {
        const date = new Date(today);
        const dayDiff = (slot.dayOfWeek - date.getDay() + 7) % 7;
        date.setDate(date.getDate() + dayDiff + week * 7);
        sessionsToCreate.push({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          groupId: groupId,
          scheduleSlotId: slot.id,
          sessionDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
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

export async function enrollStudent(groupId: string, studentId: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("groups.update");

    const [{ data: group }, { data: student }] = await Promise.all([
      ctx.supabase.from("groups").select("id").eq("id", groupId).eq("tenantId", ctx.tenantId).single(),
      ctx.supabase.from("students").select("id").eq("id", studentId).eq("tenantId", ctx.tenantId).single(),
    ]);
    if (!group || !student) return { error: t("common.error") };

    const { data: existing } = await ctx.supabase.from("group_students").select("id").eq("groupId", groupId).eq("studentId", studentId).maybeSingle();
    if (existing) {
      await ctx.supabase.from("group_students").update({ status: "active" }).eq("id", existing.id);
    } else {
      await ctx.supabase.from("group_students").insert({ id: randomUUID(), tenantId: ctx.tenantId, groupId: groupId, studentId: studentId });
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
      teacherId: formData.get("teacherId") || null,
      roomId: formData.get("roomId") || null,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
    }

    // If room changed, check existing slots for conflicts
    if (parsed.data.roomId && parsed.data.roomId !== existing.roomId) {
      const { data: slots } = await ctx.supabase
        .from("schedule_slots")
        .select("dayOfWeek, startTime, endTime")
        .eq("groupId", groupId)
        .eq("tenantId", ctx.tenantId);
      if (slots && slots.length > 0) {
        const conflict = await checkRoomConflictsForSlots(ctx.supabase, {
          tenantId: ctx.tenantId,
          roomId: parsed.data.roomId,
          slots: slots as any[],
          excludeGroupId: groupId,
        });
        if (conflict) {
          return { error: conflict.message ?? t("errors.room_conflict") };
        }
      }
    }

    await ctx.supabase.from("groups").update({
      name: parsed.data.name,
      subjectId: parsed.data.subjectId,
      level: parsed.data.level,
      maxCapacity: parsed.data.maxCapacity,
      pricePerSession: parsed.data.pricePerSession,
      priceType: parsed.data.priceType,
      teacherId: parsed.data.teacherId || null,
      roomId: parsed.data.roomId || null,
    }).eq("id", groupId);

    await createAuditLog({
      tenantId: ctx.tenantId, userId: ctx.userId,
      action: "group.updated", entityType: "group", entityId: groupId,
    });
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

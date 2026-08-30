import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { checkRoomConflictsForSlots } from "@/lib/room-conflict";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const schedule = searchParams.get("schedule");
    const withStudents = searchParams.get("withStudents") === "true";
    const groupId = searchParams.get("id") || searchParams.get("groupId");

    // Never embed all enrollments for every group — that freezes at scale.
    // Callers must pass id/groupId to load one roster, or omit withStudents.
    const selectCols = "id, name, level, maxCapacity, status, pricePerSession, priceType, roomId, expiresAt";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "100", 10) || 100));
    const offset = (page - 1) * limit;
    const hasPagination = searchParams.get("page") !== null || searchParams.get("limit") !== null;

    let query = supabase
      .from("groups")
      .select(selectCols)
      .eq("tenantId", tenantId)
      .order("name");

    if (groupId) query = query.eq("id", groupId);
    if (status) query = query.eq("status", status);
    if (hasPagination) query = (query as any).range(offset, offset + limit - 1);
    else query = (query as any).limit(200);

    let { data: groups, error: groupsError } = await query;
    if (groupsError || !groups) {
      console.error("[api/groups GET]", groupsError);
      const fallback = await supabase.from("groups").select("id, name").eq("tenantId", tenantId);
      groups = fallback.data || [];
    }

    if (schedule === "true" && groups) {
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("groupId, dayOfWeek, startTime, endTime, location")
        .eq("tenantId", tenantId);
      return NextResponse.json(
        groups.map((g: any) => ({
          ...g,
          scheduleSlots: (slots || []).filter((s: any) => s.groupId === g.id),
        }))
      );
    }

    if (withStudents && groups) {
      // Only load roster for the requested group (or first group if id given).
      // Refuse unbounded withStudents without id — return empty student arrays.
      const targetIds = groupId ? [groupId] : [];
      const rosterByGroup = new Map<string, { id: string; fullName: string }[]>();
      if (targetIds.length > 0) {
        const { data: gs } = await supabase
          .from("group_students")
          .select("groupId, status, students(id, fullName)")
          .eq("tenantId", tenantId)
          .eq("groupId", targetIds[0])
          .eq("status", "active");
        const list = (gs || [])
          .filter((row: any) => row.students)
          .map((row: any) => ({ id: row.students.id, fullName: row.students.fullName }));
        rosterByGroup.set(targetIds[0], list);
      }
      return NextResponse.json(
        groups.map((g: any) => ({
          id: g.id,
          name: g.name,
          level: g.level,
          pricePerSession: g.pricePerSession,
          priceType: g.priceType,
          students: rosterByGroup.get(g.id) || [],
        }))
      );
    }

    return NextResponse.json(groups || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    // Validate room conflicts for schedule slots if provided
    const slots = body.slots || [];
    const roomId = body.roomId || null;

    if (roomId && slots.length > 0) {
      const conflict = await checkRoomConflictsForSlots(supabase, {
        tenantId,
        roomId,
        slots: slots.map((s: any) => ({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })),
      });
      if (conflict) {
        return NextResponse.json({ error: conflict.message || "Room conflict detected" }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    // null expiresAt = follow school year end (do not bake a fixed copy)
    const expiresAt: string | null = body.expiresAt ? String(body.expiresAt).slice(0, 10) : null;
    const { data: group, error } = await supabase
      .from("groups")
      .insert({
        id: crypto.randomUUID(),
        tenantId,
        name: body.name,
        subjectId: body.subjectId || null,
        level: body.level || null,
        maxCapacity: body.maxCapacity || 10,
        pricePerSession: body.pricePerSession || null,
        priceType: body.priceType || "per_session",
        status: "active",
        roomId: roomId,
        expiresAt: expiresAt || null,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(group, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Group id is required" }, { status: 400 });
    }

    // Get existing group to check room change
    const { data: existing } = await supabase
      .from("groups")
      .select("id, roomId")
      .eq("id", id)
      .eq("tenantId", tenantId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const newRoomId = body.roomId || null;

    // If room changed, check existing slots for conflicts
    if (newRoomId && newRoomId !== existing.roomId) {
      const { data: slots } = await supabase
        .from("schedule_slots")
        .select("dayOfWeek, startTime, endTime")
        .eq("groupId", id)
        .eq("tenantId", tenantId);
      if (slots && slots.length > 0) {
        const conflict = await checkRoomConflictsForSlots(supabase, {
          tenantId,
          roomId: newRoomId,
          slots: slots as any[],
          excludeGroupId: id,
        });
        if (conflict) {
          return NextResponse.json({ error: conflict.message || "Room conflict detected" }, { status: 409 });
        }
      }
    }

    let patchExpiresAt: string | null = null;
    if (body.expiresAt !== undefined) {
      const raw = body.expiresAt;
      patchExpiresAt = raw ? String(raw).slice(0, 10) : null;
    } else {
      // Field omitted → leave existing; only clear when explicitly empty string
      patchExpiresAt = undefined as unknown as null;
    }
    const updatePayload: Record<string, unknown> = {
      name: body.name,
      subjectId: body.subjectId || null,
      level: body.level || null,
      maxCapacity: body.maxCapacity || 10,
      pricePerSession: body.pricePerSession || null,
      priceType: body.priceType || "per_session",
      roomId: newRoomId,
      updatedAt: new Date().toISOString(),
    };
    if (body.expiresAt !== undefined) {
      updatePayload.expiresAt = patchExpiresAt || null;
    }
    const { data, error } = await supabase
      .from("groups")
      .update(updatePayload)
      .eq("id", id)
      .eq("tenantId", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Group id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", id)
      .eq("tenantId", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}

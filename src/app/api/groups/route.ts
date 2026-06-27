import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { checkRoomConflictsForSlots } from "@/lib/room-conflict";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const schedule = searchParams.get("schedule");

    let query = supabase
      .from("groups")
      .select("id, name, level, subject, capacity, status, pricePerSession, monthlyPrice, roomId")
      .eq("tenantId", tenantId)
      .order("name");

    if (status) query = query.eq("status", status);

    const { data: groups } = await query;

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
    const { data: group, error } = await supabase
      .from("groups")
      .insert({
        tenantId,
        name: body.name,
        subjectId: body.subjectId || null,
        level: body.level || null,
        maxCapacity: body.maxCapacity || 10,
        pricePerSession: body.pricePerSession || null,
        priceType: body.priceType || "per_session",
        status: "active",
        roomId: roomId,
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

    const { data, error } = await supabase
      .from("groups")
      .update({
        name: body.name,
        subjectId: body.subjectId || null,
        level: body.level || null,
        maxCapacity: body.maxCapacity || 10,
        pricePerSession: body.pricePerSession || null,
        priceType: body.priceType || "per_session",
        roomId: newRoomId,
        updatedAt: new Date().toISOString(),
      })
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

import { getTenantContext } from "@/lib/auth";
import { generateGroupSessions } from "@/server/actions/sessions";
import { checkRoomConflict } from "@/lib/room-conflict";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { tenantId, supabase } = await getTenantContext();

  const { data, error } = await supabase
    .from("schedule_slots")
    .select("*")
    .eq("groupId", id)
    .eq("tenantId", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getTenantContext();
  const supabase = ctx.supabase;
  const tenantId = ctx.tenantId;

  const body = await request.json();

  // Verify this group exists and belongs to this tenant
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, roomId, name")
    .eq("id", id)
    .eq("tenantId", tenantId)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Validate room conflict if group has a room
  if (group.roomId) {
    const conflict = await checkRoomConflict(supabase, {
      tenantId,
      roomId: group.roomId,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      excludeGroupId: id,
    });
    if (conflict.hasConflict) {
      return NextResponse.json({ error: conflict.message || "Room conflict" }, { status: 409 });
    }
  }

  // DB columns are camelCase: tenantId, groupId, dayOfWeek, startTime, endTime
  const insertData: Record<string, unknown> = {
    id: randomUUID(),
    tenantId,
    groupId: id,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
  };

  const { data, error } = await supabase
    .from("schedule_slots")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-generate sessions for this group
  await generateGroupSessions(id);

  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
) {
  const { supabase } = await getTenantContext();

  const { searchParams } = new URL(request.url);
  const slotId = searchParams.get("slotId");

  if (!slotId) return NextResponse.json({ error: "slotId required" }, { status: 400 });

  const { error } = await supabase
    .from("schedule_slots")
    .delete()
    .eq("id", slotId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

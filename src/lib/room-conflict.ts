import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConflictCheck {
  hasConflict: boolean;
  conflictingGroupName?: string;
  conflictingGroupId?: string;
  conflictDay?: number;
  conflictStart?: string;
  conflictEnd?: string;
  message?: string;
}

/**
 * Check if a room has a time conflict with another group's schedule slot.
 * Two groups sharing the same room with overlapping times on the same day is a conflict.
 */
export async function checkRoomConflict(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    roomId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    excludeGroupId?: string;
  }
): Promise<ConflictCheck> {
  const { tenantId, roomId, dayOfWeek, startTime, endTime, excludeGroupId } = params;

  let query = supabase
    .from("schedule_slots")
    .select("id, dayOfWeek, startTime, endTime, groups!inner(id, name, roomId)")
    .eq("groups.tenantId", tenantId)
    .eq("groups.roomId", roomId)
    .eq("dayOfWeek", dayOfWeek)
    .lt("startTime", endTime)
    .gt("endTime", startTime);

  if (excludeGroupId) {
    query = query.neq("groups.id", excludeGroupId);
  }

  const { data, error } = await query;

  if (error) {
    return { hasConflict: false };
  }

  if (data && data.length > 0) {
    const conflict = data[0] as any;
    const group = conflict.groups as any;
    return {
      hasConflict: true,
      conflictingGroupName: group.name,
      conflictingGroupId: group.id,
      conflictDay: conflict.dayOfWeek,
      conflictStart: conflict.startTime,
      conflictEnd: conflict.endTime,
      message: `The room is already occupied by "${group.name}" on this day from ${conflict.startTime} to ${conflict.endTime}.`,
    };
  }

  return { hasConflict: false };
}

/**
 * Check room conflicts for multiple schedule slots at once.
 */
export async function checkRoomConflictsForSlots(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    roomId: string;
    slots: { dayOfWeek: number; startTime: string; endTime: string }[];
    excludeGroupId?: string;
  }
): Promise<ConflictCheck | null> {
  for (const slot of params.slots) {
    const result = await checkRoomConflict(supabase, {
      tenantId: params.tenantId,
      roomId: params.roomId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      excludeGroupId: params.excludeGroupId,
    });
    if (result.hasConflict) return result;
  }
  return null;
}

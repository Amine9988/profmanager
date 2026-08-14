import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { toCamelArray } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { id } = await params;

    const { data: groups } = await supabase
      .from("groups")
      .select("id")
      .eq("tenantId", tenantId)
      .eq("teacherId", id);

    const groupIds = (groups || []).map((g: any) => g.id);
    if (groupIds.length === 0) {
      return NextResponse.json({ sessions: [], total: 0 });
    }

    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, groupId, sessionDate, startTime, endTime, status, type, groups(*, subjects(*))")
      .eq("tenantId", tenantId)
      .in("groupId", groupIds)
      .order("sessionDate", { ascending: false })
      .order("startTime", { ascending: false });

    const now = Date.now();
    const taught = (sessions || []).filter((s: any) => {
      if (s.status === "cancelled") return false;
      const time = s.endTime || s.startTime || "00:00";
      const endMs = new Date(`${s.sessionDate}T${time}`).getTime();
      return !isNaN(endMs) && endMs < now;
    });

    const sessionIds = taught.map((s: any) => s.id);
    const presentBySession = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: attendances } = await supabase
        .from("attendances")
        .select("sessionId, status")
        .eq("tenantId", tenantId)
        .in("sessionId", sessionIds);
      for (const a of attendances || []) {
        if (a.status === "present" || a.status === "late") {
          presentBySession.set(a.sessionId, (presentBySession.get(a.sessionId) || 0) + 1);
        }
      }
    }

    const result = toCamelArray(taught).map((s: any) => {
      const group = Array.isArray(s.groups) ? s.groups[0] : s.groups;
      return {
        id: s.id,
        sessionDate: typeof s.sessionDate === "string" ? s.sessionDate.slice(0, 10) : new Date(s.sessionDate).toISOString().slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        type: s.type,
        groupName: group?.name || null,
        subjectName: group?.subjects?.name ?? (Array.isArray(group?.subjects) ? group.subjects[0]?.name : null) ?? null,
        presentCount: presentBySession.get(s.id) || 0,
      };
    });

    return NextResponse.json({ sessions: result, total: result.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch teaching log" }, { status: 500 });
  }
}

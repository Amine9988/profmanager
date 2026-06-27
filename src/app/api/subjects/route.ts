import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const { data: subjects } = await supabase
      .from("subjects")
      .select("*")
      .eq("tenantId", tenantId)
      .order("name");

    const { data: groups } = await supabase
      .from("groups")
      .select("id, subjectId, teacherId")
      .eq("tenantId", tenantId);

    if (groups && groups.length > 0) {
      const { data: groupStudents } = await supabase
        .from("group_students")
        .select("groupId, status")
        .in("groupId", groups.map((g) => g.id));

      const teacherSetBySubject = new Map<string, Set<string>>();
      const studentCountBySubject = new Map<string, number>();

      for (const g of groups) {
        if (!g.subjectId) continue;
        if (g.teacherId) {
          if (!teacherSetBySubject.has(g.subjectId)) teacherSetBySubject.set(g.subjectId, new Set());
          teacherSetBySubject.get(g.subjectId)!.add(g.teacherId);
        }
        const activeStudents = (groupStudents || []).filter(
          (gs: any) => gs.groupId === g.id && gs.status === "active"
        ).length;
        studentCountBySubject.set(
          g.subjectId,
          (studentCountBySubject.get(g.subjectId) || 0) + activeStudents
        );
      }

      const result = (subjects || []).map((s) => ({
        ...s,
        teacherCount: teacherSetBySubject.get(s.id)?.size || 0,
        studentCount: studentCountBySubject.get(s.id) || 0,
      }));

      return NextResponse.json(result);
    }

    return NextResponse.json((subjects || []).map((s) => ({ ...s, teacherCount: 0, studentCount: 0 })));
  } catch {
    return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { name, color, code, sessionDuration, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Subject name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("subjects")
      .insert({
        id: randomUUID(),
        tenantId,
        name,
        color: color || "#6366f1",
        code: code || null,
        sessionDuration: sessionDuration ?? 60,
        description: description || null,
        createdAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to create subject" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { id, name, color, code, sessionDuration, status, description } = body;

    if (!id) {
      return NextResponse.json({ error: "Subject id is required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (color !== undefined) updateData.color = color;
    if (code !== undefined) updateData.code = code;
    if (sessionDuration !== undefined) updateData.sessionDuration = sessionDuration;
    if (status !== undefined) updateData.status = status;
    if (description !== undefined) updateData.description = description;

    const { data, error } = await supabase
      .from("subjects")
      .update(updateData)
      .eq("id", id)
      .eq("tenantId", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to update subject" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Subject id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", id)
      .eq("tenantId", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete subject" }, { status: 500 });
  }
}

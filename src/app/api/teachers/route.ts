import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "100", 10) || 100));
    const offset = (page - 1) * limit;
    const hasPagination = searchParams.get("page") !== null || searchParams.get("limit") !== null;

    let q = supabase
      .from("teachers")
      .select("*")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false });
    if (hasPagination) q = (q as any).range(offset, offset + limit - 1);
    else q = (q as any).limit(200);
    const { data: teachers } = await q;

    if (!teachers || teachers.length === 0) {
      return NextResponse.json([]);
    }

    const teacherIds = teachers.map((t) => t.id);
    const { data: links } = await supabase
      .from("teacher_subjects")
      .select("teacherId, subjectId")
      .in("teacherId", teacherIds);

    const { data: allSubjects } = await supabase
      .from("subjects")
      .select("id, name, color")
      .eq("tenantId", tenantId);

    const allSubjectsArr = (allSubjects || []) as { id: string; name: string; color: string }[];
    const subjectMap = new Map(allSubjectsArr.map((s) => [s.id, s]));
    const linkMap = new Map<string, { id: string; name: string; color: string }[]>();
    for (const link of links || []) {
      if (!linkMap.has(link.teacherId)) linkMap.set(link.teacherId, []);
      const subject = subjectMap.get(link.subjectId);
      if (subject) {
        linkMap.get(link.teacherId)!.push(subject);
      }
    }

    const result = teachers.map((t) => ({
      ...t,
      subjects: linkMap.get(t.id) || [],
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to fetch teachers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();
    const { firstName, lastName, fullName, phone, email, salaryType, salaryAmount, salaryAmountTeacher, subjectIds } = body;

    const rawName = (fullName || [firstName, lastName].filter(Boolean).join(" ") || "").trim();
    if (!rawName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const spaceIdx = rawName.indexOf(" ");
    const firstNameVal = spaceIdx > -1 ? rawName.substring(0, spaceIdx) : rawName;
    const lastNameVal = spaceIdx > -1 ? rawName.substring(spaceIdx + 1).trim() : "";

    const id = crypto.randomUUID();
    const { data: teacher, error } = await supabase
      .from("teachers")
      .insert({
        id,
        tenantId,
        firstName: firstNameVal,
        lastName: lastNameVal,
        phone: phone || null,
        email: email || null,
        salaryType: salaryType || "fixed",
        salaryAmount: salaryAmount || 0,
        salaryAmountTeacher: salaryAmountTeacher || 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (subjectIds && Array.isArray(subjectIds) && subjectIds.length > 0) {
      const links = subjectIds.map((subjectId: string) => ({
        id: crypto.randomUUID(),
        teacherId: id,
        subjectId,
        tenantId,
      }));
      await supabase.from("teacher_subjects").insert(links);
    }

    return NextResponse.json({ ...teacher, subjects: [] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create teacher" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();
    const { id, subjectIds, fullName, ...fields } = body;

    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const updateFields: Record<string, any> = { ...fields };
    if (fullName !== undefined) {
      const rawName = fullName.trim();
      const spaceIdx = rawName.indexOf(" ");
      updateFields.firstName = spaceIdx > -1 ? rawName.substring(0, spaceIdx) : rawName;
      updateFields.lastName = spaceIdx > -1 ? rawName.substring(spaceIdx + 1).trim() : "";
    }

    const { data: teacher, error } = await supabase
      .from("teachers")
      .update({ ...updateFields, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .eq("tenantId", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (subjectIds !== undefined) {
      await supabase.from("teacher_subjects").delete().eq("teacherId", id);

      if (Array.isArray(subjectIds) && subjectIds.length > 0) {
        const links = subjectIds.map((subjectId: string) => ({
          id: crypto.randomUUID(),
          teacherId: id,
          subjectId,
          tenantId,
        }));
        await supabase.from("teacher_subjects").insert(links);
      }
    }

    return NextResponse.json(teacher);
  } catch {
    return NextResponse.json({ error: "Failed to update teacher" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await supabase.from("teachers").delete().eq("id", id).eq("tenantId", tenantId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete teacher" }, { status: 500 });
  }
}

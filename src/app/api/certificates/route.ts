import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data, error } = await supabase
      .from("certificates")
      .select("*, students(fullName)")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const result = (data || []).map((c: any) => ({
      ...c,
      studentName: (c.students as any)?.fullName ?? "?",
    }));

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("id", body.studentId)
      .eq("tenantId", tenantId)
      .single();
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const meta: Record<string, string> = {};
    if (body.courseName) meta.courseName = body.courseName;
    if (body.courseType) meta.courseType = body.courseType;

    const lang = body.template;
    const template = lang === "ar" || lang === "en" || lang === "fr" ? lang : "standard";

    const { error } = await supabase.from("certificates").insert({
      id: randomUUID(),
      tenantId,
      studentId: body.studentId,
      type: body.type || "enrollment",
      title: body.title,
      description: body.description || null,
      template,
      issueDate: new Date().toISOString(),
      metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
      createdAt: new Date().toISOString(),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const updates: Record<string, any> = {};
    if (body.description !== undefined) updates.description = body.description;
    if (body.studentId) updates.studentId = body.studentId;

    const { error } = await supabase.from("certificates").update(updates).eq("id", id).eq("tenantId", tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabase.from("certificates").delete().eq("id", id).eq("tenantId", tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

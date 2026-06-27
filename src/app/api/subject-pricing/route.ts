import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data: pricing } = await supabase
      .from("subject_pricing")
      .select("*, subjects(name, color)")
      .eq("tenantId", tenantId)
      .order("level");
    return NextResponse.json(pricing || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch pricing" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();
    const { subjectId, level, monthlyPrice, sessionPrice } = body;

    if (!subjectId || !level) {
      return NextResponse.json({ error: "Subject and level are required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("subject_pricing")
      .select("id")
      .eq("tenantId", tenantId)
      .eq("subjectId", subjectId)
      .eq("level", level)
      .maybeSingle();

    if (existing) {
      const { data: updated } = await supabase
        .from("subject_pricing")
        .update({ monthlyPrice: monthlyPrice || 0, sessionPrice: sessionPrice || 0 })
        .eq("id", existing.id)
        .select()
        .single();
      return NextResponse.json(updated);
    }

    const { data: pricing, error } = await supabase
      .from("subject_pricing")
      .insert({
        id: crypto.randomUUID(),
        tenantId,
        subjectId,
        level,
        monthlyPrice: monthlyPrice || 0,
        sessionPrice: sessionPrice || 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(pricing, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save pricing" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await supabase.from("subject_pricing").delete().eq("id", id).eq("tenantId", tenantId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete pricing" }, { status: 500 });
  }
}

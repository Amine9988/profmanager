import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();
    const { ids, updates } = body as { ids: string[]; updates: Record<string, unknown> };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No levels selected" }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.nameAr !== undefined) updateFields.nameAr = updates.nameAr;
    if (updates.nameFr !== undefined) updateFields.nameFr = updates.nameFr;
    if (updates.nameEn !== undefined) updateFields.nameEn = updates.nameEn;
    if (updates.cycle !== undefined) updateFields.cycle = updates.cycle;
    if (updates.status !== undefined) updateFields.status = updates.status;

    if (Object.keys(updateFields).length === 1) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("levels")
      .update(updateFields)
      .in("id", ids)
      .eq("tenantId", tenantId)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, updated: (data || []).length });
  } catch (err: any) {
    if (err?.message?.includes?.("relation") || err?.code === "42P01") {
      return NextResponse.json({ error: "levels_table_missing" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to update levels" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await req.json();
    const { ids } = body as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No levels selected" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("levels")
      .delete()
      .in("id", ids)
      .eq("tenantId", tenantId)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, deleted: (data || []).length });
  } catch {
    return NextResponse.json({ error: "Failed to delete levels" }, { status: 500 });
  }
}

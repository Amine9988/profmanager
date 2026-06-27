import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data } = await supabase
      .from("levels")
      .select("*")
      .eq("tenantId", tenantId)
      .order("sortOrder", { ascending: true });
    return NextResponse.json(data || []);
  } catch (err: any) {
    if (err?.message?.includes?.("relation") || err?.code === "42P01") {
      return NextResponse.json({ error: "levels_table_missing" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to fetch levels" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { nameAr, nameFr, nameEn, cycle } = body;

    if (!nameAr || !nameFr || !nameEn) {
      return NextResponse.json({ error: "Arabic, French, and English names are required" }, { status: 400 });
    }

    const { data: maxOrder } = await supabase
      .from("levels")
      .select("sortOrder")
      .eq("tenantId", tenantId)
      .order("sortOrder", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sortOrder = (maxOrder?.sortOrder ?? -1) + 1;

    const { data, error } = await supabase
      .from("levels")
      .insert({
        id: crypto.randomUUID(),
        tenantId,
        nameAr,
        nameFr,
        nameEn,
        cycle: cycle || "primary",
        sortOrder,
        status: "active",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    if (err?.message?.includes?.("relation") || err?.code === "42P01") {
      return NextResponse.json({ error: "levels_table_missing" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to create level" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { id, nameAr, nameFr, nameEn, cycle, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Level id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (nameAr !== undefined) updates.nameAr = nameAr;
    if (nameFr !== undefined) updates.nameFr = nameFr;
    if (nameEn !== undefined) updates.nameEn = nameEn;
    if (cycle !== undefined) updates.cycle = cycle;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from("levels")
      .update(updates)
      .eq("id", id)
      .eq("tenantId", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err: any) {
    if (err?.message?.includes?.("relation") || err?.code === "42P01") {
      return NextResponse.json({ error: "levels_table_missing" }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to update level" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Level id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("levels")
      .delete()
      .eq("id", id)
      .eq("tenantId", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete level" }, { status: 500 });
  }
}

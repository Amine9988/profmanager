import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("*")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false });
    return NextResponse.json(workspaces || []);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const { data: workspace, error } = await supabase
      .from("workspaces")
      .insert({ id: crypto.randomUUID(), tenantId, name, isActive: false })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(workspace, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { id, isActive, name } = await req.json();
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (isActive === true) {
      await supabase.from("workspaces").update({ isActive: false }).eq("tenantId", tenantId);
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (isActive !== undefined) updateFields.isActive = isActive;
    if (name) updateFields.name = name;

    const { data: workspace } = await supabase
      .from("workspaces")
      .update(updateFields)
      .eq("id", id)
      .eq("tenantId", tenantId)
      .select()
      .single();

    return NextResponse.json(workspace);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await supabase.from("workspaces").delete().eq("id", id).eq("tenantId", tenantId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

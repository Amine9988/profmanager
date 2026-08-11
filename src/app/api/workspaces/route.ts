import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { supabase } = await getTenantContext();
    const { data } = await supabase.from("workspaces").select("*").order("name");
    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { name } = await req.json();
    const { data } = await supabase.from("workspaces").insert({ id: crypto.randomUUID(), name, tenantId }).select().single();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { supabase } = await getTenantContext();
    const { id, name } = await req.json();
    await supabase.from("workspaces").update({ name }).eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { supabase } = await getTenantContext();
    const { id } = await req.json();
    await supabase.from("workspaces").delete().eq("id", id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

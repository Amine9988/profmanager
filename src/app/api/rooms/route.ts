import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data } = await supabase
      .from("rooms")
      .select("*")
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false });
    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { code, name, capacity, floor, status } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        tenantId,
        code,
        name,
        capacity: capacity ?? 0,
        floor: floor ?? null,
        status: status ?? "active",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const body = await request.json();
    const { id, code, name, capacity, floor, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Room id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("rooms")
      .update({ code, name, capacity, floor, status, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .eq("tenantId", tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Room id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("rooms")
      .delete()
      .eq("id", id)
      .eq("tenantId", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
  }
}

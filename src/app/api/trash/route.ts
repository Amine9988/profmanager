import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const { data: items, error } = await supabase
      .from("deleted_items")
      .select("*")
      .eq("tenantId", tenantId)
      .order("deletedAt", { ascending: false });

    if (error) throw error;
    return NextResponse.json(items || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch trash" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { tenantId, supabase } = await getTenantContext();

    const { error } = await supabase
      .from("deleted_items")
      .delete()
      .eq("tenantId", tenantId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to empty trash" }, { status: 500 });
  }
}

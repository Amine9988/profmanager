import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await getTenantContext();
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    await supabase.from("payments").delete().in("studentId", ids);
    await supabase.from("attendances").delete().in("studentId", ids);
    await supabase.from("group_students").delete().in("studentId", ids);

    const { error } = await supabase.from("students").delete().in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("students")
      .select("id, fullName, monthlyFee, advanceBalance, status")
      .eq("tenantId", tenantId)
      .order("fullName", { ascending: true });

    if (status) query = query.eq("status", status);

    const { data: students } = await query;
    return NextResponse.json(students || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export async function GET() {
  try {
    const { tenantId, supabase } = await getTenantContext();
    const { data: sessions } = await supabase
      .from("sessions")
      .select("*, groups(name)")
      .eq("tenantId", tenantId)
      .order("sessionDate", { ascending: false });

    return NextResponse.json(sessions || []);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

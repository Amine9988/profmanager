import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, tenantId } = await getTenantContext();

    let { data } = await supabase
      .from("certificate_settings")
      .select("*")
      .eq("tenantId", tenantId)
      .maybeSingle();

    if (!data) {
      data = { tenantId, directorName: "", coachName: "", coachTitle: "", schoolName: "", referencePrefix: "DSK-" };
      const { error } = await supabase.from("certificate_settings").insert(data);
      if (error) throw error;
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { supabase, tenantId } = await getTenantContext();
    const body = await req.json();
    const { directorName, coachName, coachTitle, schoolName, referencePrefix } = body;

    const { error } = await supabase
      .from("certificate_settings")
      .upsert({ tenantId, directorName, coachName, coachTitle, schoolName, referencePrefix }, { onConflict: "tenantId" });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

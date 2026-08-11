import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { regenerateAllFutureSessions } from "@/server/actions/sessions";

export async function GET() {
  const { supabase, userId, tenantId } = await getTenantContext();

  const { data } = await supabase
    .from("settings")
    .select("*")
    .eq("userId", userId)
    .eq("tenantId", tenantId)
    .single();

  return NextResponse.json({ data: data ?? {} });
}

export async function POST(request: NextRequest) {
  const { supabase, userId, tenantId } = await getTenantContext();

  const body = await request.json();

  // check if row exists
  const { data: existing } = await supabase
    .from("settings")
    .select("userId")
    .eq("userId", userId)
    .eq("tenantId", tenantId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("settings")
      .update({ schoolYearStart: body.schoolYearStart, schoolYearEnd: body.schoolYearEnd })
      .eq("userId", userId)
      .eq("tenantId", tenantId);
  } else {
    await supabase
      .from("settings")
      .insert({ userId, tenantId, schoolYearStart: body.schoolYearStart, schoolYearEnd: body.schoolYearEnd });
  }

  await regenerateAllFutureSessions();

  return NextResponse.json({ success: true });
}

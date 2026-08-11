import { NextRequest, NextResponse } from "next/server";
import { createLocalClient } from "@/lib/db/supabase-shim";
import { regenerateAllFutureSessions } from "@/server/actions/sessions";

export async function GET() {
  const client = createLocalClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await client
    .from("settings")
    .select("*")
    .eq("userId", user.id)
    .single();

  return NextResponse.json({ data: data ?? {} });
}

export async function POST(request: NextRequest) {
  const client = createLocalClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const tenantId = "default-tenant-id";

  // check if row exists
  const { data: existing } = await client
    .from("settings")
    .select("userId")
    .eq("userId", user.id)
    .eq("tenantId", tenantId)
    .maybeSingle();

  if (existing) {
    await client
      .from("settings")
      .update({ schoolYearStart: body.schoolYearStart, schoolYearEnd: body.schoolYearEnd })
      .eq("userId", user.id)
      .eq("tenantId", tenantId);
  } else {
    await client
      .from("settings")
      .insert({ userId: user.id, tenantId, schoolYearStart: body.schoolYearStart, schoolYearEnd: body.schoolYearEnd });
  }

  await regenerateAllFutureSessions();

  return NextResponse.json({ success: true });
}

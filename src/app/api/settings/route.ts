import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { regenerateAllFutureSessions } from "@/server/actions/sessions";
import { toDateInputValue } from "@/lib/group-form";

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
  const newStart = toDateInputValue(body.schoolYearStart);
  const newEnd = toDateInputValue(body.schoolYearEnd);

  // Read previous year end so we can unlock groups that were following it
  const { data: prevSettings } = await supabase
    .from("settings")
    .select("schoolYearStart, schoolYearEnd")
    .eq("tenantId", tenantId)
    .maybeSingle();
  const oldEnd = toDateInputValue(prevSettings?.schoolYearEnd);

  const { data: existing } = await supabase
    .from("settings")
    .select("userId")
    .eq("userId", userId)
    .eq("tenantId", tenantId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("settings")
      .update({ schoolYearStart: newStart || body.schoolYearStart, schoolYearEnd: newEnd || body.schoolYearEnd })
      .eq("userId", userId)
      .eq("tenantId", tenantId);
  } else {
    await supabase
      .from("settings")
      .insert({
        userId,
        tenantId,
        schoolYearStart: newStart || body.schoolYearStart,
        schoolYearEnd: newEnd || body.schoolYearEnd,
      });
  }

  // Also keep tenant copy in sync when present
  try {
    await supabase
      .from("tenants")
      .update({
        schoolYearStart: newStart || body.schoolYearStart,
        schoolYearEnd: newEnd || body.schoolYearEnd,
      })
      .eq("id", tenantId);
  } catch {
    /* tenant columns may be absent in older DBs */
  }

  // Groups that copied the old school-year end as expiresAt should follow the
  // new year end dynamically (null). Custom earlier ends are left untouched.
  if (oldEnd) {
    const { data: groups } = await supabase
      .from("groups")
      .select("id, expiresAt")
      .eq("tenantId", tenantId);
    for (const g of groups || []) {
      const gEnd = toDateInputValue((g as any).expiresAt);
      if (gEnd && gEnd === oldEnd) {
        await supabase.from("groups").update({ expiresAt: null }).eq("id", (g as any).id).eq("tenantId", tenantId);
      }
    }
  }

  // Also clear expiresAt that exactly equals the NEW year end (means "follow year")
  if (newEnd) {
    const { data: groups } = await supabase
      .from("groups")
      .select("id, expiresAt")
      .eq("tenantId", tenantId);
    for (const g of groups || []) {
      const gEnd = toDateInputValue((g as any).expiresAt);
      if (gEnd && gEnd === newEnd) {
        await supabase.from("groups").update({ expiresAt: null }).eq("id", (g as any).id).eq("tenantId", tenantId);
      }
    }
  }

  await regenerateAllFutureSessions();

  return NextResponse.json({ success: true });
}

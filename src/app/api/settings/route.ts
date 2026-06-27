import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { regenerateAllFutureSessions } from "@/server/actions/sessions";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("settings")
    .select("*")
    .eq("userId", user.id)
    .single();

  return NextResponse.json({ data: data ?? {} });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  // Lookup tenantId for this user
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: tu } = await admin
    .from("tenant_users")
    .select("tenantId")
    .eq("userId", user.id)
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("settings")
    .upsert({
      userId: user.id,
      tenantId: (tu as any)?.tenantId ?? null,
      ...body,
    }, {
      onConflict: "userId"
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await regenerateAllFutureSessions();

  return NextResponse.json({ data });
}

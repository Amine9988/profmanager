"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function getTodayPayments() {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await admin.auth.getUser();
  if (!user) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data } = await admin
    .from("payments")
    .select("*, students(name)")
    .eq("userId", user.id)
    .gte("paidAt", today.toISOString())
    .lt("paidAt", tomorrow.toISOString())
    .gt("amountPaid", 0);

  return data ?? [];
}

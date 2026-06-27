import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: existing } = await admin
    .from("tenant_users")
    .select("id")
    .eq("userId", user.id)
    .limit(1);

  if (existing && existing.length > 0) {
    redirect("/overview");
  }

  const now = new Date().toISOString();

  let ownerRoleId: string;
  const { data: existingRole } = await admin
    .from("roles")
    .select("id")
    .eq("name", "owner")
    .single();

  if (existingRole) {
    ownerRoleId = existingRole.id;
  } else {
    const { data: newRole, error: roleError } = await admin
      .from("roles")
      .insert({ id: randomUUID(), name: "owner", description: "Propriétaire du tenant — accès total" })
      .select()
      .single();
    if (roleError || !newRole) throw new Error("Failed to create role: " + roleError?.message);
    ownerRoleId = newRole.id;
  }

  const { data: existingUser } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingUser) {
    const { error: userError } = await admin.from("users").insert({
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
      createdAt: now,
      updatedAt: now,
    });
    if (userError) throw new Error("Failed to create user: " + userError.message);
  }

  const slug = "default-" + Math.random().toString(36).slice(2, 7);
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ id: randomUUID(), name: "My School", slug, createdAt: now, updatedAt: now })
    .select()
    .single();

  if (tenantError || !tenant) throw new Error("Failed to create tenant: " + tenantError?.message);

  const { error: tuError } = await admin.from("tenant_users").insert({
    id: randomUUID(),
    tenantId: tenant.id,
    userId: user.id,
    roleId: ownerRoleId,
    status: "active",
    createdAt: now,
  });

  if (tuError) throw new Error("Failed to create tenant_user: " + tuError.message);

  redirect("/overview");
}

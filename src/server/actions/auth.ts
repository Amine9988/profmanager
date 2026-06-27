"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { signupSchema, loginSchema } from "@/lib/validations/auth";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { randomUUID } from "crypto";

export type ActionState = { error?: string; success?: boolean } | null;

export async function signup(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const raw = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    tenantName: formData.get("tenantName"),
  };

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
  }

  const { fullName, email, password, tenantName } = parsed.data;

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { fullName: fullName } },
  });

  if (authError || !authData.user) {
    return { error: authError?.message ?? t("auth.signup_error") };
  }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date().toISOString();

  try {
    let { data: ownerRole } = await admin.from("roles").select("id").eq("name", "owner").single();
    if (!ownerRole) {
      const { data: newRole } = await admin.from("roles").insert({ id: randomUUID(), name: "owner", description: "Propriétaire du tenant — accès total" }).select().single();
      ownerRole = newRole;
    }

    const slug = tenantName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) + "-" + Math.random().toString(36).slice(2, 7);

    const { data: existingUser } = await admin.from("users").select("id").eq("id", authData.user.id).maybeSingle();
    if (!existingUser) {
      await admin.from("users").insert({ id: authData.user.id, email, fullName: fullName, createdAt: now, updatedAt: now });
    }

    const { data: tenant } = await admin.from("tenants").insert({ id: randomUUID(), name: tenantName, slug, createdAt: now, updatedAt: now }).select().single();

    await admin.from("tenant_users").insert({
      id: randomUUID(),
      tenantId: tenant!.id,
      userId: authData.user.id,
      roleId: ownerRole!.id,
      status: "active",
      createdAt: now,
    });
  } catch {
    return { error: t("auth.workspace_error") };
  }

  redirect("/onboarding");
}

export async function login(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getT();
  const raw = { email: formData.get("email"), password: formData.get("password") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.invalid_data") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t("auth.login_error") };

  redirect("/overview");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

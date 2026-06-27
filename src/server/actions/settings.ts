"use server";

import { getTenantContext, requirePermission, AuthError } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import type { ActionResult } from "./students";

export async function getTenantSettings() {
  const { tenantId, supabase, userId } = await getTenantContext();
  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenantId).single();

  // School year is saved to the `settings` table (by /api/settings),
  // not the `tenants` table — fetch it separately
  const { data: settings } = await supabase
    .from("settings")
    .select("schoolYearStart, schoolYearEnd")
    .eq("userId", userId)
    .maybeSingle();

  return {
    ...tenant,
    schoolYearStart: settings?.schoolYearStart ?? tenant?.schoolYearStart ?? null,
    schoolYearEnd: settings?.schoolYearEnd ?? tenant?.schoolYearEnd ?? null,
  };
}

export async function updateTenantSettings(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.update");

    const name = formData.get("name") as string;
    const timezone = formData.get("timezone") as string;
    const schoolYearStart = formData.get("schoolYearStart") as string;
    const schoolYearEnd = formData.get("schoolYearEnd") as string;

    const updateData: Record<string, unknown> = { name, timezone };
    if (schoolYearStart) updateData.schoolYearStart = schoolYearStart;
    if (schoolYearEnd) updateData.schoolYearEnd = schoolYearEnd;

    const { error } = await ctx.supabase
      .from("tenants")
      .update(updateData)
      .eq("id", ctx.tenantId);

    if (error) {
      return { error: error.message };
    }

    revalidateFullApp();
    return { success: true };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("common.error") };
  }
}

export async function getTeamMembers() {
  const { tenantId, supabase } = await getTenantContext();

  const { data } = await supabase
    .from("tenant_users")
    .select("*, users(*), roles(*)")
    .eq("tenantId", tenantId)
    .order("createdAt", { ascending: true });

  return (data || []).map((tu: any) => ({
    ...tu,
    user: tu.users,
    role: tu.roles,
  })) as any[];
}

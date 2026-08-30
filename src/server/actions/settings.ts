"use server";

import { getTenantContext, requirePermission, AuthError } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import type { ActionResult } from "./students";
import { pickEarlierYmd, pickLaterYmd } from "@/lib/session-dates";

export async function getTenantSettings() {
  const { tenantId, supabase, userId } = await getTenantContext();
  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenantId).single();

  const { data: settings } = await supabase
    .from("settings")
    .select("schoolYearStart, schoolYearEnd")
    .eq("userId", userId)
    .eq("tenantId", tenantId)
    .maybeSingle();

  return {
    ...tenant,
    schoolYearStart:
      pickEarlierYmd(settings?.schoolYearStart, tenant?.schoolYearStart) ??
      settings?.schoolYearStart ??
      tenant?.schoolYearStart ??
      null,
    schoolYearEnd:
      pickLaterYmd(settings?.schoolYearEnd, tenant?.schoolYearEnd) ??
      settings?.schoolYearEnd ??
      tenant?.schoolYearEnd ??
      null,
  };
}

export async function updateTenantSettings(formData: FormData): Promise<ActionResult> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.update");

    const name = formData.get("name") as string;
    const schoolYearStart = formData.get("schoolYearStart") as string;
    const schoolYearEnd = formData.get("schoolYearEnd") as string;
    const schoolPhone = formData.get("schoolPhone") as string;
    const schoolEmail = String(formData.get("schoolEmail") ?? "").trim();
    const smtpPassword = String(formData.get("smtpPassword") ?? "").trim();
    const schoolLogo = formData.get("schoolLogo") as string;

    const tenantData: Record<string, unknown> = {
      id: ctx.tenantId,
      name,
      slug: ctx.tenantId,
      updatedAt: new Date().toISOString(),
    };
    if (schoolYearStart) tenantData.schoolYearStart = schoolYearStart;
    if (schoolYearEnd) tenantData.schoolYearEnd = schoolYearEnd;
    if (schoolPhone) tenantData.schoolPhone = schoolPhone;
    tenantData.schoolEmail = schoolEmail || null;
    if (smtpPassword) tenantData.smtpPassword = smtpPassword;
    tenantData.schoolLogo = schoolLogo || null;

    const { error } = await ctx.supabase
      .from("tenants")
      .upsert(tenantData, { onConflict: "id" });

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

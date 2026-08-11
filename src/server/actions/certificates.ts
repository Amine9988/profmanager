"use server";

import { randomUUID } from "crypto";
import { getTenantContext } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getT } from "@/lib/i18n";
import type { ActionResult } from "./students";

export async function getCertificates() {
  const { tenantId, supabase } = await getTenantContext();
  const { data } = await supabase
    .from("certificates")
    .select("*, students(fullName)")
    .eq("tenantId", tenantId)
    .order("createdAt", { ascending: false });
  return (data || []).map((c: any) => ({
    ...c,
    studentName: (c.students as any)?.fullName ?? "?",
  }));
}

export async function generateCertificate(
  studentId: string,
  type: string,
  title: string,
  description?: string
): Promise<ActionResult> {
  const t = await getT();
  try {
    const { tenantId, supabase, userId } = await getTenantContext();

    const { data: student } = await supabase
      .from("students")
      .select("id, fullName")
      .eq("id", studentId)
      .eq("tenantId", tenantId)
      .single();
    if (!student) return { error: t("errors.student_not_found") };

    await supabase.from("certificates").insert({
      id: randomUUID(),
      tenantId,
      studentId,
      type,
      title,
      description: description || null,
      template: "standard",
      issueDate: new Date().toISOString(),
      metadata: null,
      createdAt: new Date().toISOString(),
    });

    revalidateFullApp();
    return { success: true };
  } catch {
    return { error: t("common.error") };
  }
}

export async function deleteCertificate(id: string): Promise<ActionResult> {
  const t = await getT();
  try {
    const { tenantId, supabase } = await getTenantContext();
    await supabase.from("certificates").delete().eq("id", id).eq("tenantId", tenantId);
    revalidateFullApp();
    return { success: true };
  } catch {
    return { error: t("common.error") };
  }
}

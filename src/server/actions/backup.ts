"use server";

import { requirePermission, AuthError } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export type BackupData = {
  version: number;
  exportedAt: string;
  tenantId: string;
  levels: any[];
  students: any[];
  guardians: any[];
  studentGuardians: any[];
  subjects: any[];
  groups: any[];
  groupStudents: any[];
  scheduleSlots: any[];
  sessions: any[];
  attendances: any[];
  payments: any[];
};

async function fetchAllPaged(
  supabase: any,
  table: string,
  tenantId: string,
  pageSize = 500
): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("tenantId", tenantId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message || `Failed to read ${table}`);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

export async function createBackup(): Promise<{ data?: BackupData; error?: string }> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.edit");

    // Sequential paged reads — avoids loading every table at once into RAM
    const levels = await fetchAllPaged(ctx.supabase, "levels", ctx.tenantId);
    const students = await fetchAllPaged(ctx.supabase, "students", ctx.tenantId);
    const guardians = await fetchAllPaged(ctx.supabase, "guardians", ctx.tenantId);
    const studentGuardians = await fetchAllPaged(ctx.supabase, "student_guardians", ctx.tenantId);
    const subjects = await fetchAllPaged(ctx.supabase, "subjects", ctx.tenantId);
    const groups = await fetchAllPaged(ctx.supabase, "groups", ctx.tenantId);
    const groupStudents = await fetchAllPaged(ctx.supabase, "group_students", ctx.tenantId);
    const scheduleSlots = await fetchAllPaged(ctx.supabase, "schedule_slots", ctx.tenantId);
    const sessions = await fetchAllPaged(ctx.supabase, "sessions", ctx.tenantId);
    const attendances = await fetchAllPaged(ctx.supabase, "attendances", ctx.tenantId);
    const payments = await fetchAllPaged(ctx.supabase, "payments", ctx.tenantId);

    const data: BackupData = {
      version: 3,
      exportedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      levels,
      students,
      guardians,
      studentGuardians,
      subjects,
      groups,
      groupStudents,
      scheduleSlots,
      sessions,
      attendances,
      payments,
    };

    return { data };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("errors.backup_error") };
  }
}

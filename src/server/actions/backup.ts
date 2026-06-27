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

export async function createBackup(): Promise<{ data?: BackupData; error?: string }> {
  const t = await getT();
  try {
    const ctx = await requirePermission("settings.edit");

    const tables = [
      "levels", "students", "guardians", "student_guardians", "subjects",
      "groups", "group_students", "schedule_slots", "sessions",
      "attendances", "payments",
    ] as const;

    const results = await Promise.all(
      tables.map((table) =>
        ctx.supabase.from(table).select("*").eq("tenantId", ctx.tenantId)
      )
    );

    const [levels, students, guardians, studentGuardians, subjects, groups,
      groupStudents, scheduleSlots, sessions, attendances, payments] = results.map((r) => r.data || []);

    const data: BackupData = {
      version: 3,
      exportedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      levels, students, guardians, studentGuardians, subjects, groups,
      groupStudents, scheduleSlots, sessions, attendances, payments,
    };

    return { data };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: t("errors.backup_error") };
  }
}

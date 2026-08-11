"use server";

import { getTenantContext } from "@/lib/auth";
import { revalidateFullApp } from "@/lib/cache";
import { getDb } from "@/lib/db/supabase-shim";
import { SEED_SQL } from "@/lib/db/schema";
import type { ActionResult } from "./students";

const TABLES: { name: string; hasTenantId: boolean }[] = [
  { name: "student_guardians", hasTenantId: false },
  { name: "attendances", hasTenantId: true },
  { name: "notifications", hasTenantId: true },
  { name: "audit_logs", hasTenantId: true },
  { name: "teacher_payments", hasTenantId: true },
  { name: "teacher_subjects", hasTenantId: true },
  { name: "subject_pricing", hasTenantId: true },
  { name: "payments", hasTenantId: true },
  { name: "sessions", hasTenantId: true },
  { name: "schedule_slots", hasTenantId: true },
  { name: "group_students", hasTenantId: true },
  { name: "cash_movements", hasTenantId: true },
  { name: "groups", hasTenantId: true },
  { name: "students", hasTenantId: true },
  { name: "guardians", hasTenantId: true },
  { name: "teachers", hasTenantId: true },
  { name: "subjects", hasTenantId: true },
  { name: "rooms", hasTenantId: true },
  { name: "levels", hasTenantId: true },
  { name: "workspaces", hasTenantId: true },
  { name: "cash_categories", hasTenantId: true },
  { name: "settings", hasTenantId: true },
];

export async function resetSystem(): Promise<ActionResult> {
  try {
    const { tenantId, supabase } = await getTenantContext();

    for (const { name, hasTenantId } of TABLES) {
      const q = supabase.from(name).delete();
      if (hasTenantId) {
        q.eq("tenantId", tenantId);
      }
      const { error } = await q;
      if (error) return { error: error.message };
    }

    const db = await getDb();
    db.exec(SEED_SQL);

    revalidateFullApp();
    return { success: true };
  } catch {
    return { error: "Reset failed" };
  }
}

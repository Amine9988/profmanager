import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";

const TABLES = [
  "notifications", "audit_logs", "attendances", "payments",
  "group_students", "sessions", "schedule_slots", "guardians",
  "levels", "students", "groups", "subjects",
] as const;

export async function POST() {
  try {
    const { tenantId, supabase } = await getTenantContext();

    for (const table of TABLES) {
      await supabase.from(table).delete().eq("tenantId", tenantId);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}

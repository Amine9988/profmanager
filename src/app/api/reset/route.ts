import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth";
import { resetDatabase } from "@/lib/db/supabase-shim";
import { revalidateFullApp } from "@/lib/cache";

// Hard factory reset: rebuild the database from schema + seed only.
// Deletes ALL business data (students, teachers, payments, groups, rooms,
// cash movements, certificates, workspaces, ...) — account bootstrap tables
// (tenants/users/roles/...) are re-created empty, then seeded defaults.
export async function POST() {
  try {
    await getTenantContext();
    await resetDatabase();
    revalidateFullApp();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
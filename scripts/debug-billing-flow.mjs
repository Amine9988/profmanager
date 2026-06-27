import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(resolve(__dirname, "../.env"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TENANT_ID = "7a5306fc-bf2d-4101-8bcd-fd2a97c52150";
const USER_ID = "20a32140-7629-47f5-b292-c6176734211b";

async function main() {
  // STEP 1: Check all existing students in this tenant
  console.log("=== STEP 1: All existing students with billingType ===");
  const { data: students } = await admin
    .from("students")
    .select("id, fullName, billingType, status, monthlyFee")
    .eq("tenantId", TENANT_ID);
  
  for (const s of students || []) {
    console.log(`  [${s.status}] ${s.fullName}: billingType=${JSON.stringify(s.billingType)}, monthlyFee=${s.monthlyFee}`);
  }
  
  const nullBilling = (students || []).filter(s => s.billingType === null || s.billingType === undefined);
  console.log(`\n  Students with NULL billingType: ${nullBilling.length}`);
  for (const s of nullBilling) {
    console.log(`    ${s.fullName} (${s.id})`);
  }

  // STEP 2: Create a brand new student with billingType=monthly
  console.log("\n=== STEP 2: Create NEW student with billingType=monthly ===");
  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const { data: created, error: createErr } = await admin
    .from("students")
    .insert({
      id: uuid,
      tenantId: TENANT_ID,
      fullName: "TEST-DEBUG " + uuid.slice(0, 6),
      gradeLevel: null,
      schoolName: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      monthlyFee: 5000,
      subscriptionStart: "2026-06-01",
      billingType: "monthly",
      status: "active",
      enrolledAt: now,
      createdById: USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();
  
  console.log("  Create error:", createErr?.message ?? "none");
  console.log("  Created student:", JSON.stringify(created, null, 2));

  // STEP 3: Query DB directly - stored value
  console.log("\n=== STEP 3: Direct DB query ===");
  const { data: dbValue } = await admin
    .from("students")
    .select("id, fullName, billingType, monthlyFee, subscriptionStart")
    .eq("id", uuid)
    .single();
  console.log("  DB stored value:", JSON.stringify(dbValue, null, 2));

  // STEP 4: Update billingType to per_session (simulating the edit dialog change)
  console.log("\n=== STEP 4: Update billingType to per_session ===");
  const { data: updated, error: updateErr } = await admin
    .from("students")
    .update({ billingType: "per_session" })
    .eq("id", uuid)
    .select()
    .single();
  console.log("  Update error:", updateErr?.message ?? "none");
  console.log("  After update:", JSON.stringify(updated, null, 2));

  // STEP 5: Read it back again
  console.log("\n=== STEP 5: Read back after update ===");
  const { data: readback } = await admin
    .from("students")
    .select("id, fullName, billingType")
    .eq("id", uuid)
    .single();
  console.log("  Readback billingType:", readback?.billingType);

  // STEP 6: Update back to monthly (the actual user action)
  console.log("\n=== STEP 6: Update back to monthly ===");
  const { data: updated2 } = await admin
    .from("students")
    .update({ billingType: "monthly" })
    .eq("id", uuid)
    .select()
    .single();
  console.log("  After update to monthly:", JSON.stringify(updated2, null, 2));

  // STEP 7: Verify invoice generation behavior
  console.log("\n=== STEP 7: Simulating invoice generation query ===");
  // The exact same query used by /api/payments/generate
  const { data: invoiceStudents } = await admin
    .from("students")
    .select("id, fullName, monthlyFee, billingType")
    .eq("tenantId", TENANT_ID)
    .eq("status", "active")
    .gt("monthlyFee", 0);
  
  console.log("  Active students with monthlyFee > 0:");
  for (const s of invoiceStudents || []) {
    const included = s.billingType === "per_session" ? "SKIPPED (per_session)" : "INCLUDED";
    console.log(`    ${s.fullName}: billingType=${s.billingType} -> ${included}`);
  }

  // Cleanup
  await admin.from("students").delete().eq("id", uuid);
  console.log("\n=== Cleanup: Test student deleted ===");
}

main().catch(console.error);

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

async function main() {
  // 1. All students with billingType
  const { data: students } = await admin
    .from("students")
    .select("id, fullName, billingType, status, monthlyFee, subscriptionStart, createdAt")
    .eq("tenantId", TENANT_ID)
    .order("createdAt", { ascending: false });

  console.log("=== ALL STUDENTS ===");
  for (const s of students || []) {
    const bt = JSON.stringify(s.billingType);
    console.log(`  ${s.fullName.padEnd(30)} billingType=${bt.padEnd(10)} status=${s.status} monthlyFee=${s.monthlyFee}`);
  }

  // 2. Check for null billingType
  const nullBT = (students || []).filter(s => s.billingType === null || s.billingType === undefined);
  console.log(`\n=== Students with NULL billingType: ${nullBT.length} ===`);

  // 3. Check DB default by inserting without billingType
  console.log("\n=== Testing DB DEFAULT for billingType ===");
  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: inserted } = await admin
    .from("students")
    .insert({
      id: uuid,
      tenantId: TENANT_ID,
      fullName: "BILLING-DEFAULT-TEST",
      monthlyFee: 1000,
      subscriptionStart: "2026-06-01",
      status: "active",
      enrolledAt: now,
      createdById: "20a32140-7629-47f5-b292-c6176734211b",
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();

  console.log("  Inserted without billingType:", JSON.stringify(inserted?.billingType));
  console.log("  Full row:", JSON.stringify(inserted, null, 2));

  await admin.from("students").delete().eq("id", uuid);
  console.log("  Cleaned up");

  // 4. Test full update cycle
  console.log("\n=== Testing FULL update cycle ===");
  const uuid2 = crypto.randomUUID();
  const { data: created } = await admin
    .from("students")
    .insert({
      id: uuid2,
      tenantId: TENANT_ID,
      fullName: "FULL-CYCLE-TEST",
      monthlyFee: 2000,
      subscriptionStart: "2026-06-01",
      billingType: "monthly",
      status: "active",
      enrolledAt: now,
      createdById: "20a32140-7629-47f5-b292-c6176734211b",
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();

  console.log("  Created with billingType=monthly:", created?.billingType);

  // Update to per_session
  await admin.from("students").update({ billingType: "per_session" }).eq("id", uuid2);
  const { data: afterUpdate } = await admin.from("students").select("billingType").eq("id", uuid2).single();
  console.log("  After update to per_session:", afterUpdate?.billingType);

  // Update back to monthly (exactly what the app form does)
  await admin.from("students").update({ billingType: "monthly" }).eq("id", uuid2);
  const { data: afterUpdate2 } = await admin.from("students").select("billingType").eq("id", uuid2).single();
  console.log("  After update back to monthly:", afterUpdate2?.billingType);

  // Cleanup
  await admin.from("students").delete().eq("id", uuid2);
  console.log("  Cleaned up full cycle test");

  // 5. Test the getStudent query pattern
  console.log("\n=== Testing getStudent query pattern (with joins) ===");
  const { data: sample } = await admin
    .from("students")
    .select("*, group_students(*, groups(*, subjects(*))), attendances(*, sessions(*)), guardians(*), payments(*)")
    .eq("tenantId", TENANT_ID)
    .limit(1);

  if (sample && sample.length > 0) {
    console.log("  billingType from full join query:", JSON.stringify(sample[0].billingType));
    console.log("  All keys:", Object.keys(sample[0]).join(", "));
  }
}

main().catch(console.error);

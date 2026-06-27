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
  // Step 1: Count students with simple query (like dashboard)
  const { count: simpleCount, error: countErr } = await admin
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("tenantId", TENANT_ID)
    .eq("status", "active");
  console.log("1. Simple count query:", simpleCount, "error:", countErr?.message ?? "none");

  // Step 2: Query with join (like getStudents) — the exact same pattern
  const { data: joined, error: joinErr } = await admin
    .from("students")
    .select("*, group_students(*, groups(*))")
    .eq("tenantId", TENANT_ID)
    .order("fullName", { ascending: true });
  console.log("2. Joined query count:", joined?.length ?? 0, "error:", joinErr?.message ?? "none");
  if (joined && joined.length > 0) {
    console.log("   Students:", joined.map(s => ({ id: s.id, fullName: s.fullName, status: s.status })));
  } else {
    console.log("   NO STUDENTS RETURNED BY JOINED QUERY!");
  }

  // Step 3: Create a student using the EXACT same fields as createStudent()
  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  const { data: created, error: createErr } = await admin
    .from("students")
    .insert({
      id: uuid,
      tenantId: TENANT_ID,
      fullName: "Test Flow " + uuid.slice(0, 6),
      dateOfBirth: null,
      gradeLevel: "أولى متوسط",
      schoolName: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      monthlyFee: 0,
      subscriptionStart: null,
      status: "active",
      enrolledAt: now,
      createdById: USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();
  console.log("3. Create result:", created?.fullName ?? "NULL", "error:", createErr?.message ?? "none");

  // Step 4: Query again with join
  const { data: afterCreate } = await admin
    .from("students")
    .select("*, group_students(*, groups(*))")
    .eq("tenantId", TENANT_ID)
    .order("fullName", { ascending: true });
  console.log("4. After create — joined count:", afterCreate?.length ?? 0);

  // Step 5: Cleanup
  await admin.from("students").delete().eq("id", uuid);
  console.log("5. Cleaned up test student");
}

main().catch(console.error);

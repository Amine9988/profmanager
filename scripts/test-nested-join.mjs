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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TENANT_ID = "7a5306fc-bf2d-4101-8bcd-fd2a97c52150";

async function main() {
  // Test the EXACT pattern getStudents() should use — no explicit fkey
  console.log("=== Test 1: students → group_students → groups (NO fkey) ===");
  const { data: d1, error: e1 } = await supabase
    .from("students")
    .select("*, group_students(*, groups(*))", { count: "exact" })
    .eq("tenantId", TENANT_ID)
    .order("fullName", { ascending: true });
  console.log("Result:", e1?.message ?? "OK");
  console.log("Count:", d1?.length ?? 0);
  if (d1 && d1.length > 0) {
    console.log("First student:", d1[0].fullName, "group_students:", d1[0].group_students?.length ?? 0);
  }

  console.log("\n=== Test 2: groups → group_students → students (NO fkey) ===");
  const { data: d2, error: e2 } = await supabase
    .from("groups")
    .select("*, group_students(*, students(*))")
    .eq("tenantId", TENANT_ID)
    .limit(3);
  console.log("Result:", e2?.message ?? "OK");
  console.log("Count:", d2?.length ?? 0);
  if (d2 && d2.length > 0) {
    console.log("First group:", d2[0].name, "group_students:", d2[0].group_students?.length ?? 0);
  }

  // Check group_students columns
  console.log("\n=== Test 3: group_students columns ===");
  const { data: gs } = await supabase.from("group_students").select("*").limit(1);
  if (gs && gs.length > 0) {
    console.log("Columns:", Object.keys(gs[0]).join(", "));
    console.log("Row:", JSON.stringify(gs[0], null, 2));
  } else {
    console.log("No data in group_students — trying to find any rows");
    const { count } = await supabase.from("group_students").select("*", { count: "exact", head: true });
    console.log("Total rows in group_students:", count);
  }
}

main().catch(console.error);

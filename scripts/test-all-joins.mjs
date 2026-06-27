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

const patterns = [
  // getStudent patterns
  "group_students(*, groups(*, subjects(*)))",
  "attendances(*, sessions(*))",
  "guardians(*, guardians(*))",
  "guardians(*)",
  "payments(*)",

  // getGroups patterns
  "subjects(*)",
  "users(*)",
  "group_students(*)",
  "schedule_slots(*)",

  // getGroup patterns
  "group_students(*, students(*))",
  "sessions(*)",
];

for (const pattern of patterns) {
  const { data, error } = await supabase
    .from("students")
    .select(`id, fullName, ${pattern}`)
    .eq("tenantId", "7a5306fc-bf2d-4101-8bcd-fd2a97c52150")
    .limit(1);
  const ok = !error;
  console.log(`  students.${pattern}:`, ok ? "OK" : error.message, "rows:", data?.length ?? 0);
}

// Also test groups joins
const groupPatterns = [
  "subjects(*)",
  "users(*)",
  "group_students(*)",
  "schedule_slots(*)",
  "group_students(*, students(*))",
  "sessions(*)",
];

for (const pattern of groupPatterns) {
  const { data, error } = await supabase
    .from("groups")
    .select(`id, name, ${pattern}`)
    .eq("tenantId", "7a5306fc-bf2d-4101-8bcd-fd2a97c52150")
    .limit(1);
  const ok = !error;
  console.log(`  groups.${pattern}:`, ok ? "OK" : error.message, "rows:", data?.length ?? 0);
}
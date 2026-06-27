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

const tables = ["students", "groups", "group_students", "payments", "attendances", "sessions", "subjects", "schedule_slots", "tenant_users", "users", "tenants", "roles"];

for (const table of tables) {
  const { data: sample, error } = await admin.from(table).select("*").limit(1);
  if (error) {
    console.log(`${table}: ERROR - ${error.message}`);
    continue;
  }
  console.log(`${table}: columns = ${sample && sample.length > 0 ? Object.keys(sample[0]).join(", ") : "no data"}`);
}

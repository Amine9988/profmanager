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

const tables = ["students", "groups", "group_students", "payments", "attendances", "sessions", "subjects", "schedule_slots", "notifications", "tenant_users"];

for (const table of tables) {
  const { data, error } = await admin
    .from("information_schema.columns")
    .select("column_name, is_nullable, column_default, data_type")
    .eq("table_name", table)
    .eq("table_schema", "public")
    .order("ordinal_position");

  if (error) {
    console.log(`${table}: ERROR - ${error.message}`);
    continue;
  }
  console.log(`\n${table}:`);
  for (const c of data) {
    console.log(
      `  ${c.column_name} ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.column_default ? " default=" + c.column_default.substring(0, 80) : " no default"}`
    );
  }
}

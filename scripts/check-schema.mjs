import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = readFileSync(envPath, "utf-8");
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) {
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL.replace("?sslmode=require", ""), ssl: { rejectUnauthorized: false } });

// Check schedule_slots for room reference
const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'schedule_slots' ORDER BY ordinal_position");
console.log("schedule_slots columns:");
r.rows.forEach((c) => console.log("  " + c.column_name + " (" + c.data_type + ")"));
console.log();

// Also check groups for room reference
const r2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'groups' ORDER BY ordinal_position");
console.log("groups columns:");
r2.rows.forEach((c) => console.log("  " + c.column_name + " (" + c.data_type + ")"));

await pool.end();

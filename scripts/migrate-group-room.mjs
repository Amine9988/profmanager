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

await pool.query(`ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS "roomId" text`);
console.log("Migration applied: added roomId to groups");

const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'roomId'");
console.log("roomId column exists:", r.rows.length > 0);

await pool.end();

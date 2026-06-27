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

const sql = readFileSync(resolve(__dirname, "../migration-rooms.sql"), "utf-8");
await pool.query(sql);
console.log("Migration applied successfully");

const r = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rooms')");
console.log("rooms table exists:", r.rows[0].exists);

await pool.end();

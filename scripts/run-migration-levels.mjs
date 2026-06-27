import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
let env;
try {
  env = readFileSync(envPath, "utf-8");
} catch {
  envPathFallback = resolve(__dirname, "../.env");
  env = readFileSync(envPathFallback, "utf-8");
}
for (const line of env.split("\n")) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) {
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error("DIRECT_URL not found in .env or .env.local");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: directUrl.replace("?sslmode=require", ""),
  ssl: { rejectUnauthorized: false },
});

try {
  const sql = readFileSync(resolve(__dirname, "../migration-levels.sql"), "utf-8");
  await pool.query(sql);
  console.log("Migration applied successfully");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
}

const r = await pool.query(
  "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'levels')"
);
console.log("levels table exists:", r.rows[0].exists);

await pool.end();

import pg from "pg";
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

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL.replace("?sslmode=require", ""),
  ssl: { rejectUnauthorized: false },
});

const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
console.log("Today:", todayStr);

// Total future scheduled sessions
const { rows: totalFuture } = await pool.query(`
  SELECT COUNT(*) FROM public.sessions
  WHERE status = 'scheduled'
  AND "sessionDate" >= $1
`, [todayStr]);
console.log("Total future scheduled sessions in DB:", totalFuture[0].count);

// How many would .limit(50) return?
console.log("With .limit(50) — returns only first 50, hides", Number(totalFuture[0].count) - 50, "sessions");

// Per group breakdown of future sessions
const { rows: perGroup } = await pool.query(`
  SELECT g.name,
    COUNT(*) as future_scheduled,
    MIN(s."sessionDate") as first,
    MAX(s."sessionDate") as last
  FROM public.sessions s
  JOIN public.groups g ON g.id = s."groupId"
  WHERE s.status = 'scheduled'
  AND s."sessionDate" >= $1
  GROUP BY g.id, g.name
  ORDER BY MIN(s."sessionDate")
`, [todayStr]);
console.log("\nFuture scheduled sessions per group:");
for (const r of perGroup) {
  const f = r.first ? new Date(r.first).toISOString().split('T')[0] : 'N/A';
  const l = r.last ? new Date(r.last).toISOString().split('T')[0] : 'N/A';
  console.log(`  ${r.name}: ${r.future_scheduled} sessions, ${f} → ${l}`);
}

await pool.end();

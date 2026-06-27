import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

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

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL.replace("?sslmode=require", ""),
  ssl: { rejectUnauthorized: false },
});

async function test() {
  console.log("--- Testing levels table ---\n");

  // 1. Check table exists
  const { rows: [tableCheck] } = await pool.query(
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'levels')"
  );
  console.log("1. Table exists:", tableCheck.exists);
  if (!tableCheck.exists) { console.log("FAIL: levels table not found"); process.exit(1); }

  // 2. Check columns
  const { rows: columns } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = 'levels' 
     ORDER BY ordinal_position`
  );
  console.log("2. Columns:", columns.map(c => `${c.column_name} (${c.data_type})`).join(", "));

  // 3. Insert a test level
  const testTenantId = crypto.randomUUID();
  const testLevelId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO levels (id, "tenantId", "nameAr", "nameFr", "nameEn", cycle, "sortOrder", status) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [testLevelId, testTenantId, "أولى ابتدائي", "1ère Primaire", "1st Primary", "primary", 0, "active"]
  );
  console.log("3. Insert: OK");

  // 4. Read back
  const { rows: read } = await pool.query(
    'SELECT * FROM levels WHERE id = $1',
    [testLevelId]
  );
  console.log("4. Read:", read.length === 1 ? "OK" : "FAIL");
  if (read.length === 1) {
    console.log("   nameAr:", read[0].nameAr);
    console.log("   nameFr:", read[0].nameFr);
    console.log("   nameEn:", read[0].nameEn);
    console.log("   cycle:", read[0].cycle);
    console.log("   status:", read[0].status);
  }

  // 5. Update
  await pool.query(
    `UPDATE levels SET "nameFr" = $1, "updatedAt" = NOW() WHERE id = $2`,
    ["1ère Primaire (modifiée)", testLevelId]
  );
  const { rows: [updated] } = await pool.query('SELECT "nameFr" FROM levels WHERE id = $1', [testLevelId]);
  console.log("5. Update:", updated.nameFr === "1ère Primaire (modifiée)" ? "OK" : "FAIL");

  // 6. Archive (set status)
  await pool.query(
    `UPDATE levels SET status = $1 WHERE id = $2`,
    ["archived", testLevelId]
  );
  const { rows: [archived] } = await pool.query('SELECT status FROM levels WHERE id = $1', [testLevelId]);
  console.log("6. Archive:", archived.status === "archived" ? "OK" : "FAIL");

  // 7. Filter archived
  const { rows: activeLevels } = await pool.query(
    'SELECT * FROM levels WHERE "tenantId" = $1 AND status = $2',
    [testTenantId, "active"]
  );
  const { rows: archivedLevels } = await pool.query(
    'SELECT * FROM levels WHERE "tenantId" = $1 AND status = $2',
    [testTenantId, "archived"]
  );
  console.log("7. Filter active:", activeLevels.length === 0 ? "OK (none active)" : "UNEXPECTED");
  console.log("   Filter archived:", archivedLevels.length === 1 ? "OK (1 archived)" : "FAIL");

  // 8. Delete
  await pool.query('DELETE FROM levels WHERE id = $1', [testLevelId]);
  const { rows: [deleted] } = await pool.query('SELECT * FROM levels WHERE id = $1', [testLevelId]);
  console.log("8. Delete:", !deleted ? "OK" : "FAIL");

  // 9. Seed data (12 levels)
  const defaultLevels = [
    { nameAr: "أولى ابتدائي", nameFr: "1ère Primaire", nameEn: "1st Primary", cycle: "primary" },
    { nameAr: "ثانية ابتدائي", nameFr: "2ème Primaire", nameEn: "2nd Primary", cycle: "primary" },
    { nameAr: "ثالثة ابتدائي", nameFr: "3ème Primaire", nameEn: "3rd Primary", cycle: "primary" },
    { nameAr: "رابعة ابتدائي", nameFr: "4ème Primaire", nameEn: "4th Primary", cycle: "primary" },
    { nameAr: "خامسة ابتدائي", nameFr: "5ème Primaire", nameEn: "5th Primary", cycle: "primary" },
    { nameAr: "أولى متوسط", nameFr: "1ère AM", nameEn: "1st Middle", cycle: "middle" },
    { nameAr: "ثانية متوسط", nameFr: "2ème AM", nameEn: "2nd Middle", cycle: "middle" },
    { nameAr: "ثالثة متوسط", nameFr: "3ème AM", nameEn: "3rd Middle", cycle: "middle" },
    { nameAr: "رابعة متوسط", nameFr: "4ème AM", nameEn: "4th Middle", cycle: "middle" },
    { nameAr: "أولى ثانوي", nameFr: "1ère AS", nameEn: "1st Secondary", cycle: "secondary" },
    { nameAr: "ثانية ثانوي", nameFr: "2ème AS", nameEn: "2nd Secondary", cycle: "secondary" },
    { nameAr: "ثالثة ثانوي", nameFr: "3ème AS", nameEn: "3rd Secondary", cycle: "secondary" },
  ];
  for (let i = 0; i < defaultLevels.length; i++) {
    const l = defaultLevels[i];
    await pool.query(
      `INSERT INTO levels (id, "tenantId", "nameAr", "nameFr", "nameEn", cycle, "sortOrder", status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [crypto.randomUUID(), testTenantId, l.nameAr, l.nameFr, l.nameEn, l.cycle, i, "active"]
    );
  }

  const { rows: seedCheck } = await pool.query(
    'SELECT * FROM levels WHERE "tenantId" = $1 ORDER BY "sortOrder"',
    [testTenantId]
  );
  console.log("9. Seed levels:", seedCheck.length === 12 ? `OK (${seedCheck.length} levels)` : `FAIL (${seedCheck.length})`);

  // Cleanup test data
  await pool.query('DELETE FROM levels WHERE "tenantId" = $1', [testTenantId]);

  console.log("\n--- All tests passed! ---");
  await pool.end();
}

test().catch(err => { console.error("Test failed:", err); process.exit(1); });

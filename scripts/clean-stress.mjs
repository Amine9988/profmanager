import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

const DBS = [
  path.join(process.cwd(), "profmanager.db"),
  "C:\\Users\\issam\\AppData\\Roaming\\profmanager-desktop\\profmanager.db",
  process.env.LOCAL_DB_PATH,
].filter(Boolean);

const TABLES = [
  "cash_movements",
  "payments",
  "group_students",
  "sessions",
  "schedule_slots",
  "groups",
  "students",
  "teachers",
  "rooms",
  "subjects",
];

const SQL = await initSqlJs({
  locateFile: f => path.join(process.cwd(), "node_modules", "sql.js", "dist", f),
});

for (const dbPath of [...new Set(DBS)]) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    console.log(`skip (not found): ${dbPath}`);
    continue;
  }
  console.log(`\nCleaning: ${dbPath} (${(fs.statSync(dbPath).size/1024/1024).toFixed(2)} MB)`);
  const db = new SQL.Database(fs.readFileSync(dbPath));
  let total = 0;
  for (const tbl of TABLES) {
    try {
      const before = db.exec(`SELECT count(*) FROM "${tbl}" WHERE id LIKE 'stress-%'`)[0]?.values[0][0] || 0;
      if (before > 0) {
        db.exec(`DELETE FROM "${tbl}" WHERE id LIKE 'stress-%'`);
        // also handle non-quoted
        try { db.exec(`DELETE FROM ${tbl} WHERE id LIKE 'stress-%'`); } catch {}
        console.log(`  ${tbl}: ${before} → 0`);
        total += Number(before);
      }
    } catch (e) {
      // table may not exist
    }
  }
  // Also clean any stress cash with different prefix
  try {
    const c = db.exec(`SELECT count(*) FROM cash_movements WHERE description LIKE 'حركة ضغط%'`)[0]?.values[0][0] || 0;
    if (c > 0) {
      db.exec(`DELETE FROM cash_movements WHERE description LIKE 'حركة ضغط%'`);
      console.log(`  cash_movements (by description): ${c}`);
      total += Number(c);
    }
  } catch {}

  if (total > 0) {
    // Vacuum to reclaim space
    try { db.exec("VACUUM"); } catch {}
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log(`  → saved ${(fs.statSync(dbPath).size/1024/1024).toFixed(2)} MB, removed ${total} rows`);
  } else {
    console.log("  nothing to clean");
  }
  db.close();
}
console.log("\n✓ Done — restart the app (npm run dev or relaunch desktop) to see light DB");

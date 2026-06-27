import pg from 'pg';
const { Pool } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
  connectionString: 'postgresql://postgres.ovhvblmlsljkkyeyktsd:SLIMANIAMINE%26%C3%A9%22%27@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});
try {
  // 1. sessions columns
  console.log('=== 1. sessions table columns ===');
  let { rows: sc } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sessions' ORDER BY ordinal_position`);
  sc.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // 2. schedule_slots columns
  console.log('\n=== 2. schedule_slots table columns ===');
  let { rows: sl } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schedule_slots' ORDER BY ordinal_position`);
  sl.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // 3. settings values
  console.log('\n=== 3. settings table values ===');
  let { rows: sv } = await pool.query(`SELECT * FROM settings`);
  if (sv.length === 0) console.log('  (empty)');
  else sv.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  // Also check tenants for school year
  console.log('\n=== 3b. tenants schoolYear values ===');
  let { rows: tv } = await pool.query(`SELECT id, name, "schoolYearStart", "schoolYearEnd" FROM tenants WHERE "schoolYearStart" IS NOT NULL OR "schoolYearEnd" IS NOT NULL`);
  if (tv.length === 0) console.log('  (all null)');
  else tv.forEach(r => console.log(`  ${r.name}: start=${r.schoolYearStart} end=${r.schoolYearEnd}`));

  // 4. schedule_slots data
  console.log('\n=== 4. schedule_slots data ===');
  let { rows: sd } = await pool.query(`SELECT * FROM schedule_slots LIMIT 20`);
  if (sd.length === 0) console.log('  (empty)');
  else sd.forEach(r => console.log(`  ${JSON.stringify(r)}`));

  // 5. total session count
  console.log('\n=== 5. sessions count ===');
  let { rows: cnt } = await pool.query(`SELECT COUNT(*) FROM sessions`);
  console.log(`  ${cnt[0].count} sessions`);

} catch (e) { console.error('Error:', e.message); } finally { await pool.end(); }

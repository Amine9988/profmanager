import pg from 'pg';
const { Pool } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
  connectionString: 'postgresql://postgres.ovhvblmlsljkkyeyktsd:SLIMANIAMINE%26%C3%A9%22%27@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});
try {
  console.log('=== settings table columns ===');
  let { rows } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'settings' ORDER BY ordinal_position`);
  if (rows.length === 0) console.log('settings table does NOT exist');
  else rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  console.log('');
  console.log('=== settings table values ===');
  try {
    let { rows: vals } = await pool.query(`SELECT * FROM settings LIMIT 5`);
    if (vals.length === 0) console.log('  (empty)');
    else vals.forEach(r => console.log(`  ${JSON.stringify(r)}`));
  } catch (e) { console.log('  Error:', e.message); }
  console.log('');
  console.log('=== tenants table school year columns ===');
  let { rows: tcols } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tenants' AND (column_name LIKE '%year%' OR column_name LIKE '%school%') ORDER BY ordinal_position`);
  if (tcols.length === 0) console.log('  No school year columns found');
  else tcols.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  console.log('');
  console.log('=== tenants table current values ===');
  let { rows: tv } = await pool.query(`SELECT id, name, "schoolYearStart", "schoolYearEnd" FROM tenants LIMIT 5`);
  tv.forEach(r => console.log(`  ${r.id?.substring(0,8)}... | ${r.name} | start=${r.schoolYearStart} | end=${r.schoolYearEnd}`));
} catch (e) { console.error('Script Error:', e.message); } finally { await pool.end(); }

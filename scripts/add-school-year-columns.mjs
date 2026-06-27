import pg from 'pg';
const { Pool } = pg;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: 'postgresql://postgres.ovhvblmlsljkkyeyktsd:SLIMANIAMINE%26%C3%A9%22%27@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});

try {
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "schoolYearStart" DATE;`);
  console.log('ADDED schoolYearStart');
  await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "schoolYearEnd" DATE;`);
  console.log('ADDED schoolYearEnd');
  
  const { rows } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tenants' ORDER BY ordinal_position`);
  console.log('tenants columns:', rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}

import pg from 'pg';
const { Pool } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
  connectionString: 'postgresql://postgres.ovhvblmlsljkkyeyktsd:SLIMANIAMINE%26%C3%A9%22%27@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});
try {
  // Step 7: Create settings table
  await pool.query(`CREATE TABLE IF NOT EXISTS "settings" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID REFERENCES auth.users(id) NOT NULL,
    "schoolYearStart" DATE,
    "schoolYearEnd" DATE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
  );`);
  console.log('CREATED settings table');

  // Add unique constraint for upsert
  await pool.query(`ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_userId_key;`);
  await pool.query(`ALTER TABLE settings ADD CONSTRAINT settings_userId_key UNIQUE ("userId");`);
  console.log('ADDED unique constraint on userId');

  // Step 8: RLS
  await pool.query(`ALTER TABLE settings ENABLE ROW LEVEL SECURITY;`);
  await pool.query(`DROP POLICY IF EXISTS "settings_select" ON settings;`);
  await pool.query(`DROP POLICY IF EXISTS "settings_insert" ON settings;`);
  await pool.query(`DROP POLICY IF EXISTS "settings_update" ON settings;`);
  await pool.query(`CREATE POLICY "settings_select" ON settings FOR SELECT USING (auth.uid() = "userId");`);
  await pool.query(`CREATE POLICY "settings_insert" ON settings FOR INSERT WITH CHECK (auth.uid() = "userId");`);
  await pool.query(`CREATE POLICY "settings_update" ON settings FOR UPDATE USING (auth.uid() = "userId");`);
  console.log('ADDED RLS policies');

  // Verify
  const { rows: cols } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'settings' ORDER BY ordinal_position`);
  console.log('\nsettings columns:', cols.map(r => `${r.column_name} (${r.data_type})`).join(', '));

  const { rows: policies } = await pool.query(`SELECT policyname FROM pg_policies WHERE tablename = 'settings'`);
  console.log('RLS policies:', policies.map(r => r.policyname).join(', '));
} catch (e) { console.error('Error:', e.message); } finally { await pool.end(); }

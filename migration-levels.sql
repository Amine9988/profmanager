-- ============================================
-- Migration: Levels Table
-- ============================================
CREATE TABLE IF NOT EXISTS levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "tenantId" UUID NOT NULL,
  "nameAr" TEXT NOT NULL,
  "nameFr" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  cycle TEXT NOT NULL DEFAULT 'primary',
  "sortOrder" INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE("tenantId", "nameAr")
);

-- RLS
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;

-- Policy: tenant isolation for SELECT
DROP POLICY IF EXISTS "tenant_isolation_select" ON levels;
CREATE POLICY "tenant_isolation_select" ON levels
  FOR SELECT
  USING ("tenantId" = current_setting('app.tenant_id', true)::UUID);

-- Policy: tenant isolation for INSERT
DROP POLICY IF EXISTS "tenant_isolation_insert" ON levels;
CREATE POLICY "tenant_isolation_insert" ON levels
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true)::UUID);

-- Policy: tenant isolation for UPDATE
DROP POLICY IF EXISTS "tenant_isolation_update" ON levels;
CREATE POLICY "tenant_isolation_update" ON levels
  FOR UPDATE
  USING ("tenantId" = current_setting('app.tenant_id', true)::UUID);

-- Policy: tenant isolation for DELETE
DROP POLICY IF EXISTS "tenant_isolation_delete" ON levels;
CREATE POLICY "tenant_isolation_delete" ON levels
  FOR DELETE
  USING ("tenantId" = current_setting('app.tenant_id', true)::UUID);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_levels_tenantId ON levels("tenantId");
CREATE INDEX IF NOT EXISTS idx_levels_status ON levels("tenantId", "status");

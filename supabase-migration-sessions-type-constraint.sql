-- Migration: Add type column and unique constraint to sessions table
-- Run this in your Supabase SQL editor

-- 1. Add type column (regular/extra/makeup) with default 'regular'
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'regular';

-- 2. Remove duplicates before adding unique constraint
DELETE FROM sessions
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "sessionDate", "scheduleSlotId", "groupId"
      ORDER BY "createdAt" ASC
    ) AS rn
    FROM sessions
  ) t WHERE t.rn > 1
);

-- 3. Add unique constraint to prevent duplicate sessions
ALTER TABLE sessions ADD CONSTRAINT unique_session_date_slot_group UNIQUE ("sessionDate", "scheduleSlotId", "groupId");

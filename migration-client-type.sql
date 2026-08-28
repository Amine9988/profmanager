-- Add clientType to students: 'institution' (زبون المؤسسة) | 'teacher' (زبون الأستاذ)
ALTER TABLE students ADD COLUMN IF NOT EXISTS "clientType" TEXT NOT NULL DEFAULT 'institution';

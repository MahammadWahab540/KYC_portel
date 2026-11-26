-- 002_journey_and_documents.sql
-- Adds journey state persistence and production document metadata columns

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS student_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS history_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS state_payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(32) DEFAULT 'IN_PROGRESS',
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_applications_student_phone ON applications(student_phone);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS student_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(32) DEFAULT 'UPLOADED',
  ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_password_protected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_student_phone ON documents(student_phone);

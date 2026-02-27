ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS sessions_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_session_date DATE;

CREATE INDEX IF NOT EXISTS idx_patients_last_session_date ON patients(last_session_date);

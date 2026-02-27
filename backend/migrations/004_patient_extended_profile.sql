ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS school_type TEXT CHECK (school_type IN ('bilingue', 'mission', 'autre')),
  ADD COLUMN IF NOT EXISTS school_level TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS parent_first_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_last_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_email TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone_1 TEXT,
  ADD COLUMN IF NOT EXISTS parent_phone_2 TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_parent_phone_1 ON patients(parent_phone_1);
CREATE INDEX IF NOT EXISTS idx_patients_diagnosis ON patients(diagnosis);

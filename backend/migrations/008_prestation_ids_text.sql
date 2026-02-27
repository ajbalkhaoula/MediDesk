ALTER TABLE consultation_acts
  ALTER COLUMN prestation_id TYPE TEXT USING prestation_id::text;

ALTER TABLE invoice_lines
  ALTER COLUMN prestation_id TYPE TEXT USING prestation_id::text;

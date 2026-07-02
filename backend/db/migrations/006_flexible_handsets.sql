-- Remove unique constraint on adb_serial — phones can move between handset slots
ALTER TABLE handsets DROP CONSTRAINT IF EXISTS handsets_adb_serial_key;

-- Add agent_url column if missing
ALTER TABLE handsets ADD COLUMN IF NOT EXISTS agent_url VARCHAR(200);

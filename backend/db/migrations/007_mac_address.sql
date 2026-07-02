-- Add MAC address column for phone identification
-- MAC never changes even when IP changes — use it to auto-identify phones
ALTER TABLE handsets ADD COLUMN IF NOT EXISTS mac_address VARCHAR(20);
ALTER TABLE handsets DROP CONSTRAINT IF EXISTS handsets_adb_serial_key;

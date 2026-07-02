-- Migration 002: Add agent_url column to handsets
-- This stores the TelecomTestAgent APK HTTP server URL
-- Examples:
--   Same WiFi:  http://192.168.1.45:8765
--   ngrok:      https://xxxx.ngrok.io

ALTER TABLE handsets ADD COLUMN IF NOT EXISTS agent_url VARCHAR(255);

COMMENT ON COLUMN handsets.agent_url IS
  'URL of TelecomTestAgent APK HTTP server. E.g. http://192.168.1.45:8765 or https://xxxx.ngrok.io';

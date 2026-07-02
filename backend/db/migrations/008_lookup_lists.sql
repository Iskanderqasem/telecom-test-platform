-- Lookup lists for configurable dropdowns
CREATE TABLE IF NOT EXISTS lookup_lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    VARCHAR(50) NOT NULL,  -- 'network_type', 'profile', 'handset_label', 'flow_type', etc.
  value       VARCHAR(100) NOT NULL,
  label       VARCHAR(100) NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Default values
INSERT INTO lookup_lists (category, value, label, sort_order) VALUES
  ('network_type', '2D - VoLTE', '2D - VoLTE', 1),
  ('network_type', '2D - VoWiFi', '2D - VoWiFi', 2),
  ('network_type', '3G', '3G', 3),
  ('network_type', '5G', '5G', 4),
  ('network_type', 'CS', 'CS', 5),
  ('profile', 'Prepaid', 'Prepaid', 1),
  ('profile', 'Postpaid', 'Postpaid', 2),
  ('handset_label', 'A', 'A', 1),
  ('handset_label', 'B', 'B', 2),
  ('handset_label', 'C', 'C', 3),
  ('handset_label', 'D', 'D', 4),
  ('handset_label', 'E', 'E', 5),
  ('call_type', 'VoLTE', 'VoLTE', 1),
  ('call_type', 'VoWiFi', 'VoWiFi', 2),
  ('call_type', 'CS', 'CS', 3),
  ('call_type', '5G', '5G', 4),
  ('test_reason', 'CR', 'CR', 1),
  ('test_reason', 'Regression', 'Regression', 2),
  ('test_reason', 'Confirmation', 'Confirmation', 3),
  ('test_reason', 'Pre-test', 'Pre-test', 4),
  ('test_reason', 'Post-test', 'Post-test', 5),
  ('test_reason', 'Sanity', 'Sanity', 6),
  ('test_reason', 'BAU', 'BAU', 7),
  ('test_reason', 'Other', 'Other', 8),
  ('environment', 'Prod', 'Production', 1),
  ('environment', 'Preprod', 'Pre-production', 2)
ON CONFLICT DO NOTHING;

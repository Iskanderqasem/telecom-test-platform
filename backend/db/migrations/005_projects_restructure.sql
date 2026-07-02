-- ── Migration 005: Project & Work Type restructure ────────────────────────────

-- Add project_number to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_number VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name VARCHAR(120);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

-- Update existing projects to have a project number
UPDATE projects SET project_number = code WHERE project_number IS NULL;

-- Add work categorisation to test cases
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS work_type VARCHAR(20) DEFAULT 'Individual';
  -- 'Project' or 'Individual'
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS work_ref_number VARCHAR(50);
  -- e.g. 'PRJ-001' or 'IND-001'
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS work_ref_name VARCHAR(200);
  -- e.g. 'VoLTE Core Upgrade'
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS work_owner VARCHAR(120);
  -- owner name (auto-filled from project or logged-in user)

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS test_reason_type VARCHAR(30) DEFAULT 'BAU';
  -- CR | Regression | Confirmation | Pre-test | Post-test | Sanity | BAU | Other
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS test_reason_ref VARCHAR(100);
  -- e.g. 'CR123-IMS-Upgrade' or 'REG-2026-Q2'

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS created_by VARCHAR(120);
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Backfill project_id linked test cases
UPDATE test_cases tc
SET work_type = 'Project',
    work_ref_number = p.project_number,
    work_ref_name = p.name,
    work_owner = p.owner_name
FROM projects p
WHERE tc.project_id = p.id
  AND tc.work_type IS NULL OR tc.work_type = 'Individual';

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_tc_work_type ON test_cases(work_type);
CREATE INDEX IF NOT EXISTS idx_tc_test_reason ON test_cases(test_reason_type);
CREATE INDEX IF NOT EXISTS idx_tc_project_id ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_tc_created_by ON test_cases(created_by);

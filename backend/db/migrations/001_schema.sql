-- ================================================================
-- Telecom Test Automation Platform v2 - Full Schema
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Handsets registered and connected via ADB
CREATE TABLE handsets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label           VARCHAR(10) NOT NULL UNIQUE,   -- 'A', 'B', 'C' etc.
    make            VARCHAR(100),
    model           VARCHAR(100),
    android_version VARCHAR(30),
    adb_serial      VARCHAR(120) UNIQUE,
    msisdn          VARCHAR(30),                   -- SIM number in this handset
    operator        VARCHAR(60),
    network_type    VARCHAR(20),                   -- VoLTE, VoWiFi, CS, 5G
    profile         VARCHAR(20),                   -- Prepaid, Postpaid
    status          VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available','in_use','offline','faulty')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Test Cases - matching the confirmed spreadsheet format exactly
CREATE TABLE test_cases (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tc_id                   VARCHAR(50) NOT NULL,          -- e.g. SMSC-001
    traceability_label      VARCHAR(100),                  -- e.g. A, B, C, AS, O, AX
    flow                    VARCHAR(100),                  -- e.g. P2P, On-net > Off-net
    environment             VARCHAR(20) NOT NULL DEFAULT 'Prod'
        CHECK (environment IN ('Prod','Preprod')),
    description             TEXT,

    -- A-Party
    a_party_msisdn          VARCHAR(30),
    a_party_network         VARCHAR(30),                   -- 2D-VoLTE, 2D-VoWiFi, 3G, 5G
    a_party_profile         VARCHAR(20),                   -- Prepaid, Postpaid
    a_party_handset_label   VARCHAR(10),                   -- A, B, C

    -- B-Party
    b_party_msisdn          VARCHAR(30),
    b_party_network         VARCHAR(30),
    b_party_profile         VARCHAR(20),
    b_party_handset_label   VARCHAR(10),

    -- Expected results (Y/N)
    exp_call_mo             VARCHAR(1) DEFAULT 'Y' CHECK (exp_call_mo IN ('Y','N')),
    exp_call_mt             VARCHAR(1) DEFAULT 'Y' CHECK (exp_call_mt IN ('Y','N')),
    exp_sms                 VARCHAR(1) DEFAULT 'Y' CHECK (exp_sms IN ('Y','N')),
    exp_sms_notification    VARCHAR(1) DEFAULT 'Y' CHECK (exp_sms_notification IN ('Y','N')),
    exp_delivery_report     VARCHAR(1) DEFAULT 'N' CHECK (exp_delivery_report IN ('Y','N')),

    -- Execution parameters
    call_duration_seconds   INTEGER NOT NULL DEFAULT 15,   -- 10 or 20 or custom
    call_type               VARCHAR(20) DEFAULT 'VoLTE'
        CHECK (call_type IN ('VoLTE','VoWiFi','CS','5G')),
    sms_text                TEXT DEFAULT 'Test 123',

    -- Assignment
    assigned_to             VARCHAR(120),

    -- Status
    status                  VARCHAR(20) NOT NULL DEFAULT 'Not Run'
        CHECK (status IN ('Not Run','Running','Passed','Failed','Blocked')),

    -- Ordering for execution queue
    sort_order              INTEGER DEFAULT 0,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tc_status ON test_cases (status);
CREATE INDEX idx_tc_environment ON test_cases (environment);

-- Execution results - actual outcomes vs expected
CREATE TABLE executions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id            UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,

    -- Actual results (Y/N/ERR)
    actual_call_mo          VARCHAR(5),
    actual_call_mt          VARCHAR(5),
    actual_sms              VARCHAR(5),
    actual_sms_notification VARCHAR(5),
    actual_delivery_report  VARCHAR(5),

    -- Overall result
    status                  VARCHAR(20) NOT NULL DEFAULT 'Running'
        CHECK (status IN ('Running','Passed','Failed','Blocked','Error')),
    failure_reason          TEXT,

    -- Timing
    started_at              TIMESTAMPTZ DEFAULT now(),
    ended_at                TIMESTAMPTZ,
    duration_ms             INTEGER,

    -- Device info snapshot at time of execution
    a_party_handset_serial  VARCHAR(120),
    b_party_handset_serial  VARCHAR(120),

    -- Evidence paths
    logcat_path             TEXT,
    screenshot_path         TEXT,

    triggered_by            VARCHAR(120) DEFAULT 'manual',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exec_test_case ON executions (test_case_id);
CREATE INDEX idx_exec_status ON executions (status);
CREATE INDEX idx_exec_started ON executions (started_at);

-- Evidence files
CREATE TABLE evidence (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
    evidence_type   VARCHAR(30) NOT NULL
        CHECK (evidence_type IN ('logcat','screenshot','screen_recording','other')),
    file_path       TEXT NOT NULL,
    file_size_bytes BIGINT,
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handsets_updated BEFORE UPDATE ON handsets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_test_cases_updated BEFORE UPDATE ON test_cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Reports table: saved report snapshots
CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    filters         JSONB NOT NULL DEFAULT '{}',
    row_count       INTEGER DEFAULT 0,
    passed          INTEGER DEFAULT 0,
    failed          INTEGER DEFAULT 0,
    blocked         INTEGER DEFAULT 0,
    not_run         INTEGER DEFAULT 0,
    created_by      VARCHAR(120),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

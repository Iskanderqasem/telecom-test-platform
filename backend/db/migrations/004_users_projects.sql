-- Users table
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(60) NOT NULL UNIQUE,
    email           VARCHAR(120) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(120),
    role            VARCHAR(20) NOT NULL DEFAULT 'tester'
        CHECK (role IN ('admin','tester','viewer')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(120) NOT NULL,
    code            VARCHAR(20) NOT NULL UNIQUE,
    type            VARCHAR(30) NOT NULL DEFAULT 'BAU'
        CHECK (type IN ('BAU','CR','Project','Regression','Sanity','Other')),
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active','Completed','On Hold','Cancelled')),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User-Project access control
CREATE TABLE IF NOT EXISTS user_projects (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'tester'
        CHECK (role IN ('lead','tester','viewer')),
    granted_by      UUID REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, project_id)
);

-- Add project_id to test_cases
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           VARCHAR(500) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_tc_project ON test_cases(project_id);

-- Default admin user (password: Admin@2degrees)
INSERT INTO users (username, email, password_hash, full_name, role)
VALUES (
    'admin',
    'admin@telecom.local',
    '$2b$10$fO9yW7G6x4Ui5lDs4R7lQeQK4ZUAsOWvyzHOo8drPJOJjoRPK9AcK',
    'System Administrator',
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- Default BAU project
INSERT INTO projects (name, code, type, description)
VALUES ('Business As Usual', 'BAU', 'BAU', 'Default BAU testing project')
ON CONFLICT (code) DO NOTHING;

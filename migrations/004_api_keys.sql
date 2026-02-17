-- Migration: 004 API Keys & Profile Extensions
-- Target: CockroachDB v23.2 (nexus_auth database)
-- Description: Adds api_keys table for programmatic access tokens

CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        STRING NOT NULL,
    key_prefix  STRING NOT NULL,
    key_hash    STRING NOT NULL,
    permissions STRING[] NOT NULL DEFAULT ARRAY['read'],
    expires_at  TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked     BOOL NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_api_keys_user_id (user_id),
    INDEX idx_api_keys_hash (key_hash),
    UNIQUE (key_hash)
);

-- Seed a sample API key for the dev user
INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, permissions, revoked, created_at)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Development Key',
    'nxk_dev12345',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ARRAY['read', 'write'],
    false,
    NOW()
);

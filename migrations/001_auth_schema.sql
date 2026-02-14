-- Migration: 001_auth_schema.sql
-- Auth Service database schema for CockroachDB
-- Creates users, MFA, refresh tokens, password reset tokens, audit logs

CREATE DATABASE IF NOT EXISTS nexus_auth;
USE nexus_auth;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email STRING NOT NULL UNIQUE,
    password_hash STRING NOT NULL,
    first_name STRING NOT NULL,
    last_name STRING NOT NULL,
    organization STRING DEFAULT '',
    role STRING NOT NULL DEFAULT 'OPERATOR',
    email_verified BOOL NOT NULL DEFAULT false,
    mfa_enabled BOOL NOT NULL DEFAULT false,
    status STRING NOT NULL DEFAULT 'pending_verification',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    INDEX idx_users_email (email),
    INDEX idx_users_status (status)
);

-- User MFA table (TOTP secrets)
CREATE TABLE IF NOT EXISTS user_mfa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    totp_secret STRING NOT NULL,
    backup_codes STRING[] DEFAULT ARRAY[],
    verified BOOL NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE INDEX idx_user_mfa_user_id (user_id)
);

-- Refresh tokens (for token rotation)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash STRING NOT NULL UNIQUE,
    family STRING NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOL NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_refresh_tokens_user_id (user_id),
    INDEX idx_refresh_tokens_family (family),
    INDEX idx_refresh_tokens_expires (expires_at)
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash STRING NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOL NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_password_reset_user_id (user_id),
    INDEX idx_password_reset_expires (expires_at)
);

-- Auth audit logs
CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action STRING NOT NULL,
    ip_address STRING DEFAULT '',
    user_agent STRING DEFAULT '',
    details STRING DEFAULT '',
    success BOOL NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_auth_audit_user_id (user_id),
    INDEX idx_auth_audit_action (action),
    INDEX idx_auth_audit_created (created_at DESC)
);

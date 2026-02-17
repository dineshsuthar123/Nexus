-- Migration: 005_add_tenant_id.sql
-- Description: Adds tenant_id column to all major tables for multi-tenancy isolation.
-- Strategy: Application-level enforcement with default tenant for backward compatibility.
--
-- Default tenant '00000000-0000-0000-0000-000000000000' is used for existing rows
-- and single-tenant deployments. JWT tokens must carry a `tid` claim for multi-tenant
-- deployments; middleware extracts it and injects into request context.
--
-- NOTE: Row-Level Security (RLS) is deferred — enforcement is at the application layer
-- for auditability and speed. See docs/multi_tenancy.md for full strategy.

-- ============================================================================
-- nexus_auth database
-- ============================================================================
USE nexus_auth;

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

-- api_keys
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id);

-- refresh_tokens (tenant-scoping for token isolation)
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant ON refresh_tokens (tenant_id);

-- ============================================================================
-- nexus_ledger database
-- ============================================================================
USE nexus_ledger;

-- accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts (tenant_id);

-- transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions (tenant_id);

-- notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications (tenant_id);

-- notification_preferences
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant ON notification_preferences (tenant_id);

-- reconciliation_cycles
ALTER TABLE reconciliation_cycles ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_recon_cycles_tenant ON reconciliation_cycles (tenant_id);

-- reconciliation_discrepancies
ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_recon_discrep_tenant ON reconciliation_discrepancies (tenant_id);

-- outbox_events (scoped so CDC is tenant-aware)
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON outbox_events (tenant_id);

-- account_audit_logs
ALTER TABLE account_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
CREATE INDEX IF NOT EXISTS idx_account_audit_tenant ON account_audit_logs (tenant_id);

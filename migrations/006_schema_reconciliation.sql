-- Migration: 006_schema_reconciliation.sql
-- Description: Reconciles SQL schema with Go application model structs.
--   Fixes table name mismatches (plural → singular), column name mismatches,
--   adds missing columns, and creates missing tables so Go repositories
--   can query correctly at runtime.
--
-- Context: Go services (payment, account, reconciliation) use singular table
--   names while the original migrations created plural names. Analytics and
--   audit services use plural names via SELECT-only queries, so backward-
--   compatible views are created for them.
--
-- Must run AFTER migrations 001–005.

-- ============================================================================
-- nexus_ledger database
-- ============================================================================

USE nexus_ledger;

-- ============================================================================
-- STEP 1: Rename tables from plural to singular (matching Go repository code)
-- CockroachDB preserves FK constraints through renames.
-- ============================================================================

ALTER TABLE IF EXISTS accounts RENAME TO account;
ALTER TABLE IF EXISTS transactions RENAME TO "transaction";
ALTER TABLE IF EXISTS transaction_legs RENAME TO transaction_leg;
ALTER TABLE IF EXISTS outbox_events RENAME TO outbox;
ALTER TABLE IF EXISTS reconciliation_cycles RENAME TO reconciliation_cycle;
ALTER TABLE IF EXISTS reconciliation_discrepancies RENAME TO reconciliation_record;

-- Drop FK on account_audit_logs before rename — the Go audit_log stores
-- generic entity_id (not exclusively account IDs), so the FK is too narrow.
-- CockroachDB auto-names inline REFERENCES as {table}_{column}_fkey.
ALTER TABLE IF EXISTS account_audit_logs DROP CONSTRAINT IF EXISTS account_audit_logs_account_id_fkey;
ALTER TABLE IF EXISTS account_audit_logs RENAME TO audit_log;

-- Backward-compatible views for analytics-service & audit-service (SELECT only)
CREATE VIEW IF NOT EXISTS accounts AS SELECT * FROM account;
CREATE VIEW IF NOT EXISTS transactions AS SELECT * FROM "transaction";

-- ============================================================================
-- STEP 2: Rename mismatched columns
-- ============================================================================

-- transaction: payment_type → transaction_type (Go: TransactionType)
ALTER TABLE "transaction" RENAME COLUMN payment_type TO transaction_type;

-- transaction: settled_at → settlement_date (Go: SettlementDate)
ALTER TABLE "transaction" RENAME COLUMN settled_at TO settlement_date;

-- transaction_leg: entry_type → leg_type (Go: LegType)
ALTER TABLE transaction_leg RENAME COLUMN entry_type TO leg_type;

-- account: pending_balance → pending_debits (Go: PendingDebits)
ALTER TABLE account RENAME COLUMN pending_balance TO pending_debits;

-- reconciliation_cycle column renames
ALTER TABLE reconciliation_cycle RENAME COLUMN started_at TO start_time;
ALTER TABLE reconciliation_cycle RENAME COLUMN completed_at TO end_time;
ALTER TABLE reconciliation_cycle RENAME COLUMN total_transactions TO total_records;
ALTER TABLE reconciliation_cycle RENAME COLUMN matched_count TO matched_records;

-- reconciliation_record column renames
ALTER TABLE reconciliation_record RENAME COLUMN status TO match_status;
ALTER TABLE reconciliation_record RENAME COLUMN resolution TO resolution_type;

-- audit_log column renames
ALTER TABLE audit_log RENAME COLUMN account_id TO entity_id;
ALTER TABLE audit_log RENAME COLUMN performed_by TO actor_id;
ALTER TABLE audit_log RENAME COLUMN details TO changes;

-- ============================================================================
-- STEP 3: Add missing columns to "transaction"
-- Go Transaction struct has ~35 fields; migration had ~18 columns.
-- ============================================================================

ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS instruction_id STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS settlement_amount DECIMAL(20,4) DEFAULT 0;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS settlement_currency STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(20,8) DEFAULT 0;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(20,4) DEFAULT 0;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS fee_currency STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS charge_bearer STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS status_reason STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS sanctions_score DECIMAL(5,4) DEFAULT 0;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS fraud_status STRING DEFAULT 'PENDING';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS requested_execution_date TIMESTAMPTZ;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS booking_date TIMESTAMPTZ DEFAULT now();
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS value_date TIMESTAMPTZ;
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS original_message JSONB DEFAULT '{}';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS external_rail STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS external_reference STRING DEFAULT '';
ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS created_by STRING DEFAULT '';

-- ============================================================================
-- STEP 4: Add missing columns to transaction_leg
-- ============================================================================

ALTER TABLE transaction_leg ADD COLUMN IF NOT EXISTS description STRING DEFAULT '';
ALTER TABLE transaction_leg ADD COLUMN IF NOT EXISTS sequence_number INT DEFAULT 0;
ALTER TABLE transaction_leg ADD COLUMN IF NOT EXISTS balance_before DECIMAL(20,4) DEFAULT 0;

-- ============================================================================
-- STEP 5: Add missing columns to account
-- ============================================================================

ALTER TABLE account ADD COLUMN IF NOT EXISTS pending_credits DECIMAL(20,4) DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS transaction_limit DECIMAL(20,4) DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS daily_limit DECIMAL(20,4) DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS daily_used DECIMAL(20,4) DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS allow_negative BOOL DEFAULT false;
ALTER TABLE account ADD COLUMN IF NOT EXISTS minimum_balance DECIMAL(20,4) DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS region STRING DEFAULT '';
ALTER TABLE account ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE account ADD COLUMN IF NOT EXISTS external_id STRING DEFAULT '';
ALTER TABLE account ADD COLUMN IF NOT EXISTS risk_score DECIMAL(5,4) DEFAULT 0;
ALTER TABLE account ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

-- ============================================================================
-- STEP 6: Add missing columns to outbox
-- Original schema had: aggregate_type, aggregate_id, event_type, payload,
--   published (BOOL), created_at, published_at
-- Go code expects: topic, partition_key, status, error_message, retry_count
-- ============================================================================

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS topic STRING DEFAULT '';
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS partition_key STRING DEFAULT '';
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS status STRING DEFAULT 'PENDING';
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS error_message STRING DEFAULT '';
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

-- ============================================================================
-- STEP 7: Add missing columns to reconciliation_cycle
-- Original: start_date, end_date, unmatched_count, discrepancy_count, match_rate
-- Go needs: cycle_date, discrepant_records, auto_resolved, updated_at
-- (start_time, end_time, total_records, matched_records already handled by renames)
-- ============================================================================

ALTER TABLE reconciliation_cycle ADD COLUMN IF NOT EXISTS cycle_date TIMESTAMPTZ DEFAULT now();
ALTER TABLE reconciliation_cycle ADD COLUMN IF NOT EXISTS discrepant_records INT DEFAULT 0;
ALTER TABLE reconciliation_cycle ADD COLUMN IF NOT EXISTS auto_resolved INT DEFAULT 0;
ALTER TABLE reconciliation_cycle ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================================
-- STEP 8: Add missing columns to reconciliation_record
-- Original: expected_value, actual_value, severity
-- Go needs: match_score, discrepancy_amount, details, resolution_notes, updated_at
-- (match_status, resolution_type already handled by renames)
-- ============================================================================

ALTER TABLE reconciliation_record ADD COLUMN IF NOT EXISTS match_score DECIMAL(5,4) DEFAULT 0;
ALTER TABLE reconciliation_record ADD COLUMN IF NOT EXISTS discrepancy_amount DECIMAL(20,4) DEFAULT 0;
ALTER TABLE reconciliation_record ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE reconciliation_record ADD COLUMN IF NOT EXISTS resolution_notes STRING DEFAULT '';
ALTER TABLE reconciliation_record ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================================
-- STEP 9: Add missing columns to audit_log
-- Original: account_id (→ entity_id), action, performed_by (→ actor_id),
--   details (→ changes), created_at
-- Go needs: entity_type, actor_type, actor_ip, previous_state, new_state,
--   request_id, session_id
-- ============================================================================

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type STRING DEFAULT 'account';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_type STRING DEFAULT '';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_ip STRING DEFAULT '';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS previous_state JSONB DEFAULT '{}';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_state JSONB DEFAULT '{}';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id STRING DEFAULT '';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS session_id STRING DEFAULT '';

-- ============================================================================
-- STEP 10: Create missing table — pending_credit
-- Used by payment-service to track credits pending settlement.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_credit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL,
    transaction_id  UUID NOT NULL,
    amount          DECIMAL(20,4) NOT NULL,
    currency        STRING NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    tenant_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    INDEX idx_pending_credit_account (account_id),
    INDEX idx_pending_credit_transaction (transaction_id),
    INDEX idx_pending_credit_tenant (tenant_id)
);

-- ============================================================================
-- STEP 11: Add useful indexes for newly added columns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_transaction_instruction ON "transaction" (instruction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_external_ref ON "transaction" (external_reference);
CREATE INDEX IF NOT EXISTS idx_transaction_booking ON "transaction" (booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_fraud_status ON "transaction" (fraud_status);
CREATE INDEX IF NOT EXISTS idx_account_external_id ON account (external_id);
CREATE INDEX IF NOT EXISTS idx_account_region ON account (region);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log (request_id);

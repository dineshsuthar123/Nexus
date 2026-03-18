-- Migration: 007_schema_alignment.sql
-- Purpose: Align migrations/ schema with Go service code and Docker init schema.
--
-- The original migration 002_core_schema.sql created tables with PLURAL names
-- (accounts, transactions, transaction_legs, outbox_events) and was missing
-- many columns that the Go services expect. The Docker init schema
-- (infra/docker/cockroachdb/init/001_init_schema.sql) already has the correct
-- table names and columns.
--
-- This migration drops the broken tables from 002 and recreates them correctly.
-- SAFE because no production data has ever been loaded.
-- ============================================================================

USE nexus_ledger;

-- ============================================================================
-- STEP 1: Drop old tables from migration 002 (plural names, wrong columns)
-- ============================================================================

-- Drop dependent views first (if they exist from 002)
DROP VIEW IF EXISTS v_account_balance;
DROP VIEW IF EXISTS v_transaction_summary;
DROP VIEW IF EXISTS v_daily_settlement;

-- Drop old tables in dependency order
DROP TABLE IF EXISTS account_audit_logs CASCADE;
DROP TABLE IF EXISTS reconciliation_discrepancies CASCADE;
DROP TABLE IF EXISTS reconciliation_cycles CASCADE;
DROP TABLE IF EXISTS outbox_events CASCADE;
DROP TABLE IF EXISTS transaction_legs CASCADE;
DROP TABLE IF EXISTS pending_credit CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

-- Also drop the correct-named tables if re-running this migration
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS reconciliation_record CASCADE;
DROP TABLE IF EXISTS reconciliation_cycle CASCADE;
DROP TABLE IF EXISTS outbox CASCADE;
DROP TABLE IF EXISTS transaction_leg CASCADE;
DROP TABLE IF EXISTS pending_credit CASCADE;
DROP TABLE IF EXISTS "transaction" CASCADE;
DROP TABLE IF EXISTS account CASCADE;
DROP TABLE IF EXISTS customer CASCADE;

-- Drop old enums (safe idempotent re-creation)
DROP TYPE IF EXISTS outbox_status;
DROP TYPE IF EXISTS leg_type;
DROP TYPE IF EXISTS transaction_status;
DROP TYPE IF EXISTS account_type;
DROP TYPE IF EXISTS account_status;

-- ============================================================================
-- STEP 2: Create ENUMs
-- ============================================================================

CREATE TYPE IF NOT EXISTS account_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'CLOSED',
    'FROZEN',
    'PENDING_VERIFICATION'
);

CREATE TYPE IF NOT EXISTS account_type AS ENUM (
    'OPERATING',
    'SETTLEMENT',
    'NOSTRO',
    'VOSTRO',
    'SUSPENSE',
    'INTERNAL',
    'FEE',
    'FX_POSITION'
);

CREATE TYPE IF NOT EXISTS transaction_status AS ENUM (
    'PENDING',
    'SANCTIONED',
    'FRAUD_REVIEW',
    'CLEARED',
    'SETTLED',
    'REJECTED',
    'RETURNED',
    'CANCELLED'
);

CREATE TYPE IF NOT EXISTS leg_type AS ENUM (
    'DEBIT',
    'CREDIT'
);

CREATE TYPE IF NOT EXISTS outbox_status AS ENUM (
    'PENDING',
    'PUBLISHED',
    'FAILED'
);

-- ============================================================================
-- STEP 3: Create CUSTOMER table
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id STRING(64) UNIQUE NOT NULL,
    customer_type STRING(20) NOT NULL DEFAULT 'INDIVIDUAL',
    legal_name STRING(256) NOT NULL,
    display_name STRING(128),
    kyc_status STRING(20) NOT NULL DEFAULT 'PENDING',
    kyc_verified_at TIMESTAMPTZ,
    risk_rating STRING(10) DEFAULT 'MEDIUM',
    country_code STRING(2) NOT NULL,
    address_line1 STRING(256),
    address_line2 STRING(256),
    city STRING(128),
    postal_code STRING(20),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_customer_country (country_code),
    INDEX idx_customer_risk (risk_rating),
    INDEX idx_customer_kyc (kyc_status)
);

-- ============================================================================
-- STEP 4: Create ACCOUNT table
-- Matches both payment-service and account-service Go structs
-- ============================================================================

CREATE TABLE IF NOT EXISTS account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Ownership
    customer_id UUID NOT NULL REFERENCES customer(id),
    external_id STRING(64) DEFAULT '',

    -- Account Details
    account_number STRING(34) UNIQUE NOT NULL,
    account_name STRING(256) DEFAULT '',
    account_type STRING(20) NOT NULL DEFAULT 'SETTLEMENT',
    currency STRING(3) NOT NULL,
    iban STRING(34) DEFAULT '',
    bic STRING(11) DEFAULT '',

    -- Balance Management (DECIMAL(19,4) for precision)
    balance DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    available_balance DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    pending_credits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    pending_debits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,

    -- Limits
    daily_limit DECIMAL(19, 4) DEFAULT 1000000.0000,
    transaction_limit DECIMAL(19, 4) DEFAULT 100000.0000,
    daily_used DECIMAL(19, 4) DEFAULT 0.0000,
    allow_negative BOOLEAN DEFAULT FALSE,
    minimum_balance DECIMAL(19, 4) DEFAULT 0.0000,

    -- Status & KYC
    status STRING(20) NOT NULL DEFAULT 'ACTIVE',
    kyc_status STRING(20) DEFAULT 'PENDING',
    risk_score DECIMAL(5, 4) DEFAULT 0.0000,

    -- Geo-partitioning
    region STRING(20) AS (
        CASE
            WHEN currency IN ('USD', 'CAD', 'MXN') THEN 'us-east-1'
            WHEN currency IN ('EUR', 'GBP', 'CHF') THEN 'eu-central-1'
            WHEN currency IN ('JPY', 'SGD', 'AUD', 'HKD', 'INR') THEN 'ap-southeast-1'
            ELSE 'us-east-1'
        END
    ) STORED,

    -- Metadata
    description STRING(256) DEFAULT '',
    holder_name STRING(256) DEFAULT '',
    holder_type STRING(20) DEFAULT 'INDIVIDUAL',
    metadata JSONB DEFAULT '{}',

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    version INT NOT NULL DEFAULT 1,

    -- Indexes
    INDEX idx_account_number (account_number),
    INDEX idx_account_customer (customer_id),
    INDEX idx_account_type (account_type),
    INDEX idx_account_currency (currency),
    INDEX idx_account_status (status),
    INDEX idx_account_region (region),
    INDEX idx_account_iban (iban) WHERE iban != ''
);

-- ============================================================================
-- STEP 5: Create TRANSACTION table
-- Matches payment-service Go struct (32 fields)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "transaction" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ISO 20022 Identifiers
    uetr UUID UNIQUE NOT NULL,
    message_id STRING(35) NOT NULL DEFAULT '',
    instruction_id STRING(35) DEFAULT '',
    end_to_end_id STRING(35) DEFAULT '',

    -- Transaction Details
    transaction_type STRING(20) NOT NULL DEFAULT 'CREDIT_TRANSFER',
    payment_type STRING(20) DEFAULT 'INSTANT',

    -- Amount
    amount DECIMAL(19, 4) NOT NULL,
    currency STRING(3) NOT NULL DEFAULT 'USD',

    -- Settlement (FX)
    settlement_amount DECIMAL(19, 4),
    settlement_currency STRING(3),
    exchange_rate DECIMAL(18, 8),

    -- Fees
    fee_amount DECIMAL(19, 4) DEFAULT 0.0000,
    fee_currency STRING(3),
    charge_bearer STRING(4) DEFAULT 'SLEV',

    -- Parties
    debtor_account_id UUID NOT NULL REFERENCES account(id),
    creditor_account_id UUID NOT NULL REFERENCES account(id),
    debtor_name STRING(140) DEFAULT '',
    debtor_iban STRING(34) DEFAULT '',
    creditor_name STRING(140) DEFAULT '',
    creditor_iban STRING(34) DEFAULT '',

    -- Status
    status STRING(20) NOT NULL DEFAULT 'PENDING',
    status_reason STRING(256) DEFAULT '',
    settlement_method STRING(20) DEFAULT 'CLRG',

    -- Risk & Compliance
    sanctions_status STRING(20) DEFAULT 'PENDING',
    sanctions_score DECIMAL(5, 4) DEFAULT 0.0000,
    fraud_status STRING(20) DEFAULT 'PENDING',
    fraud_score DECIMAL(5, 4) DEFAULT 0.0000,

    -- Timing
    requested_execution_date TIMESTAMPTZ,
    booking_date TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    value_date TIMESTAMPTZ,
    settlement_date TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,

    -- Remittance & Message
    remittance_info JSONB DEFAULT '{}',
    original_message JSONB,

    -- External Rail
    external_rail STRING(20) DEFAULT '',
    external_reference STRING(64) DEFAULT '',

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    created_by STRING(64) DEFAULT '',

    -- Indexes
    INDEX idx_transaction_uetr (uetr),
    INDEX idx_transaction_status (status),
    INDEX idx_transaction_debtor (debtor_account_id),
    INDEX idx_transaction_creditor (creditor_account_id),
    INDEX idx_transaction_message_id (message_id),
    INDEX idx_transaction_created (created_at DESC),
    INDEX idx_transaction_booking (booking_date DESC)
);

-- ============================================================================
-- STEP 6: Create TRANSACTION_LEG table
-- Double-entry bookkeeping legs
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_leg (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES "transaction"(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES account(id),
    leg_type STRING(6) NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    currency STRING(3) NOT NULL DEFAULT 'USD',
    balance_before DECIMAL(19, 4),
    balance_after DECIMAL(19, 4),
    description STRING(256) DEFAULT '',
    sequence_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_leg_transaction (transaction_id),
    INDEX idx_leg_account (account_id),
    INDEX idx_leg_created (created_at DESC)
);

-- ============================================================================
-- STEP 7: Create PENDING_CREDIT table (Hot Account Pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES account(id),
    amount DECIMAL(19, 4) NOT NULL,
    currency STRING(3) NOT NULL,
    transaction_id UUID NOT NULL REFERENCES "transaction"(id),
    aggregated BOOLEAN NOT NULL DEFAULT FALSE,
    aggregated_at TIMESTAMPTZ,
    batch_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_pending_account (account_id, aggregated) WHERE aggregated = FALSE
);

-- ============================================================================
-- STEP 8: Create OUTBOX table (Transactional Outbox Pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type STRING(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type STRING(64) NOT NULL,
    payload JSONB NOT NULL,
    topic STRING(128) NOT NULL DEFAULT 'nexus.events.raw',
    partition_key STRING(64) DEFAULT '',
    status STRING(20) NOT NULL DEFAULT 'PENDING',
    published_at TIMESTAMPTZ,
    error_message STRING(512) DEFAULT '',
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_outbox_status (status) WHERE status = 'PENDING',
    INDEX idx_outbox_created (created_at)
);

-- ============================================================================
-- STEP 9: Create RECONCILIATION tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_cycle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_date TIMESTAMPTZ NOT NULL,
    status STRING(20) NOT NULL DEFAULT 'PENDING',
    start_time TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    end_time TIMESTAMPTZ,
    total_records INT DEFAULT 0,
    matched_records INT DEFAULT 0,
    discrepant_records INT DEFAULT 0,
    auto_resolved INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_recon_cycle_status (status),
    INDEX idx_recon_cycle_date (cycle_date DESC)
);

CREATE TABLE IF NOT EXISTS reconciliation_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES reconciliation_cycle(id),
    transaction_id UUID REFERENCES "transaction"(id),
    match_status STRING(20) NOT NULL DEFAULT 'UNMATCHED',
    match_score DECIMAL(5, 4) DEFAULT 0.0000,
    discrepancy_type STRING(64) DEFAULT '',
    discrepancy_amount DECIMAL(19, 4) DEFAULT 0.0000,
    details JSONB DEFAULT '{}',
    resolution_type STRING(64) DEFAULT '',
    resolved_by STRING(64) DEFAULT '',
    resolved_at TIMESTAMPTZ,
    resolution_notes STRING(512) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_recon_record_cycle (cycle_id),
    INDEX idx_recon_record_status (match_status),
    INDEX idx_recon_record_transaction (transaction_id)
);

-- ============================================================================
-- STEP 10: Create AUDIT LOG table
-- ============================================================================

CREATE TABLE IF NOT EXISTS account_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES account(id),
    action STRING(20) NOT NULL,
    performed_by STRING(64) DEFAULT '',
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_account_audit (account_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type STRING(64) NOT NULL,
    entity_id UUID NOT NULL,
    action STRING(20) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_fields STRING[],
    user_id STRING(64),
    ip_address STRING(45),
    user_agent STRING(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_time (created_at DESC),
    INDEX idx_audit_user (user_id)
);

-- ============================================================================
-- STEP 11: Create FX and Settlement tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency STRING(3) NOT NULL,
    quote_currency STRING(3) NOT NULL,
    bid_rate DECIMAL(18, 8) NOT NULL,
    ask_rate DECIMAL(18, 8) NOT NULL,
    mid_rate DECIMAL(18, 8) NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    source STRING(32) NOT NULL DEFAULT 'ECB',
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    UNIQUE (base_currency, quote_currency, valid_from),
    INDEX idx_fx_pair (base_currency, quote_currency),
    INDEX idx_fx_valid (valid_from DESC)
);

CREATE TABLE IF NOT EXISTS settlement_cycle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_date DATE NOT NULL,
    cycle_number INT NOT NULL,
    rail STRING(20) NOT NULL,
    opens_at TIMESTAMPTZ NOT NULL,
    closes_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    gross_credits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    gross_debits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    net_position DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    status STRING(20) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    UNIQUE (cycle_date, cycle_number, rail),
    INDEX idx_settlement_status (status),
    INDEX idx_settlement_date (cycle_date DESC)
);

-- ============================================================================
-- STEP 12: Create views
-- ============================================================================

CREATE VIEW IF NOT EXISTS v_account_balance AS
SELECT
    a.id,
    a.account_number,
    a.customer_id,
    a.currency,
    a.balance AS ledger_balance,
    a.pending_credits,
    a.pending_debits,
    a.balance + a.pending_credits - a.pending_debits AS available_balance,
    a.status
FROM account a;

CREATE VIEW IF NOT EXISTS v_transaction_summary AS
SELECT
    t.id,
    t.uetr,
    t.amount,
    t.currency,
    t.status,
    t.debtor_name,
    t.creditor_name,
    t.booking_date,
    t.created_at,
    da.account_number AS debtor_account,
    ca.account_number AS creditor_account,
    t.sanctions_status,
    t.fraud_status
FROM "transaction" t
JOIN account da ON t.debtor_account_id = da.id
JOIN account ca ON t.creditor_account_id = ca.id;

-- ============================================================================
-- STEP 13: Seed data for development
-- ============================================================================

INSERT INTO customer (id, external_id, customer_type, legal_name, country_code, kyc_status)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'SYSTEM', 'CORPORATE', 'Nexus Settlement System', 'US', 'VERIFIED')
ON CONFLICT (external_id) DO NOTHING;

INSERT INTO account (id, customer_id, account_number, account_name, account_type, currency, balance, available_balance, allow_negative, status)
VALUES
    ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'ACC-001-SETTLE', 'Primary Settlement', 'SETTLEMENT', 'USD', 1000000.0000, 1000000.0000, TRUE, 'ACTIVE'),
    ('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'ACC-002-NOSTRO', 'USD Nostro Account', 'NOSTRO', 'USD', 500000.0000, 500000.0000, TRUE, 'ACTIVE'),
    ('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'ACC-003-VOSTRO', 'EUR Vostro Account', 'VOSTRO', 'EUR', 250000.0000, 250000.0000, FALSE, 'ACTIVE'),
    ('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'ACC-004-INT', 'Internal Ledger', 'INTERNAL', 'USD', 100000.0000, 100000.0000, FALSE, 'ACTIVE'),
    ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'NEXUS-NOSTRO-USD', 'USD Nostro', 'NOSTRO', 'USD', 0.0000, 0.0000, TRUE, 'ACTIVE'),
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'NEXUS-NOSTRO-EUR', 'EUR Nostro', 'NOSTRO', 'EUR', 0.0000, 0.0000, TRUE, 'ACTIVE'),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'NEXUS-NOSTRO-GBP', 'GBP Nostro', 'NOSTRO', 'GBP', 0.0000, 0.0000, TRUE, 'ACTIVE'),
    ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'NEXUS-SUSPENSE', 'Suspense Account', 'SUSPENSE', 'USD', 0.0000, 0.0000, TRUE, 'ACTIVE'),
    ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'NEXUS-FEES-USD', 'Fee Collection', 'FEE', 'USD', 0.0000, 0.0000, FALSE, 'ACTIVE')
ON CONFLICT (account_number) DO NOTHING;

INSERT INTO fx_rate (base_currency, quote_currency, bid_rate, ask_rate, mid_rate, valid_from, source)
VALUES
    ('EUR', 'USD', 1.0850, 1.0870, 1.0860, current_timestamp(), 'ECB'),
    ('GBP', 'USD', 1.2650, 1.2680, 1.2665, current_timestamp(), 'ECB'),
    ('USD', 'JPY', 148.50, 148.70, 148.60, current_timestamp(), 'ECB'),
    ('EUR', 'GBP', 0.8550, 0.8570, 0.8560, current_timestamp(), 'ECB')
ON CONFLICT (base_currency, quote_currency, valid_from) DO NOTHING;

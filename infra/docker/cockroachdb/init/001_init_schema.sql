-- ============================================================================
-- Nexus Ledger - CockroachDB Schema
-- Version: 1.0.0
-- Description: Core schema for global real-time payment network
-- ============================================================================

-- Create the database with multi-region support
CREATE DATABASE IF NOT EXISTS nexus_ledger;
USE nexus_ledger;

-- For local development, we simulate regions. In production, these would map
-- to actual CockroachDB localities configured via --locality flags
-- ALTER DATABASE nexus_ledger SET PRIMARY REGION "us-east-1";
-- ALTER DATABASE nexus_ledger ADD REGION "eu-central-1";
-- ALTER DATABASE nexus_ledger ADD REGION "ap-southeast-1";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE IF NOT EXISTS account_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'CLOSED',
    'PENDING_VERIFICATION'
);

CREATE TYPE IF NOT EXISTS account_type AS ENUM (
    'OPERATING',      -- Normal customer account
    'NOSTRO',         -- Our account held at another bank
    'VOSTRO',         -- Their account held at our bank
    'SUSPENSE',       -- Temporary holding account
    'FEE',            -- Fee collection account
    'FX_POSITION'     -- FX trading position account
);

CREATE TYPE IF NOT EXISTS transaction_status AS ENUM (
    'PENDING',        -- Initial state
    'SANCTIONED',     -- Under sanctions review
    'FRAUD_REVIEW',   -- Under fraud review
    'CLEARED',        -- Approved, ready for settlement
    'SETTLED',        -- Funds transferred
    'REJECTED',       -- Failed validation or compliance
    'RETURNED',       -- Refunded/returned
    'CANCELLED'       -- Cancelled by user
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
-- CUSTOMER ENTITY
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    external_id STRING(64) UNIQUE NOT NULL,
    customer_type STRING(20) NOT NULL DEFAULT 'INDIVIDUAL', -- INDIVIDUAL, CORPORATE
    
    -- Legal Name
    legal_name STRING(256) NOT NULL,
    display_name STRING(128),
    
    -- KYC Information
    kyc_status STRING(20) NOT NULL DEFAULT 'PENDING',
    kyc_verified_at TIMESTAMPTZ,
    risk_rating STRING(10) DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH
    
    -- Address (for sanctions screening)
    country_code STRING(2) NOT NULL,
    address_line1 STRING(256),
    address_line2 STRING(256),
    city STRING(128),
    postal_code STRING(20),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Indexes
    INDEX idx_customer_country (country_code),
    INDEX idx_customer_risk (risk_rating),
    INDEX idx_customer_kyc (kyc_status)
);

-- ============================================================================
-- ACCOUNT ENTITY
-- Primary ledger table with geo-partitioning support
-- ============================================================================

CREATE TABLE IF NOT EXISTS account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership
    customer_id UUID NOT NULL REFERENCES customer(id),
    
    -- Account Details
    account_number STRING(34) UNIQUE NOT NULL, -- IBAN-compatible length
    account_type account_type NOT NULL DEFAULT 'OPERATING',
    currency STRING(3) NOT NULL,
    
    -- Balance Management
    -- Using DECIMAL(19,4) for precision: max 999 trillion with 4 decimal places
    balance DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    available_balance DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    pending_credits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    pending_debits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    
    -- Limits
    daily_limit DECIMAL(19, 4) DEFAULT 1000000.0000,
    transaction_limit DECIMAL(19, 4) DEFAULT 100000.0000,
    allow_negative BOOLEAN DEFAULT FALSE,
    minimum_balance DECIMAL(19, 4) DEFAULT 0.0000,
    
    -- Status
    status account_status NOT NULL DEFAULT 'ACTIVE',
    
    -- Geo-partitioning: Computed column based on currency
    -- This determines which region the row resides in
    region STRING(20) AS (
        CASE 
            WHEN currency IN ('USD', 'CAD', 'MXN') THEN 'us-east-1'
            WHEN currency IN ('EUR', 'GBP', 'CHF') THEN 'eu-central-1'
            WHEN currency IN ('JPY', 'SGD', 'AUD', 'HKD', 'INR') THEN 'ap-southeast-1'
            ELSE 'us-east-1'  -- Default region
        END
    ) STORED,
    
    -- Metadata (ISO 20022 rich data)
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    version INT NOT NULL DEFAULT 1,  -- Optimistic locking
    
    -- Constraints
    CONSTRAINT check_positive_balance CHECK (balance >= 0 OR allow_negative = TRUE),
    CONSTRAINT check_valid_currency CHECK (length(currency) = 3),
    CONSTRAINT check_limits CHECK (daily_limit >= transaction_limit),
    
    -- Indexes
    INDEX idx_account_customer (customer_id),
    INDEX idx_account_currency (currency),
    INDEX idx_account_status (status),
    INDEX idx_account_region (region)
);

-- ============================================================================
-- TRANSACTION ENTITY
-- The parent record for a payment instruction (pacs.008)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ISO 20022 Identifiers
    uetr UUID UNIQUE NOT NULL,  -- Unique End-to-End Transaction Reference
    message_id STRING(35) NOT NULL,  -- GrpHdr.MsgId
    instruction_id STRING(35),  -- InstrId
    end_to_end_id STRING(35),  -- EndToEndId
    
    -- Transaction Details
    transaction_type STRING(20) NOT NULL DEFAULT 'CREDIT_TRANSFER', -- CREDIT_TRANSFER, RETURN, FX
    
    -- Amount (Instructed Amount)
    amount DECIMAL(19, 4) NOT NULL,
    currency STRING(3) NOT NULL,
    
    -- Settlement Amount (may differ due to FX)
    settlement_amount DECIMAL(19, 4),
    settlement_currency STRING(3),
    exchange_rate DECIMAL(18, 8),
    
    -- Fees
    fee_amount DECIMAL(19, 4) DEFAULT 0.0000,
    fee_currency STRING(3),
    charge_bearer STRING(4) DEFAULT 'SLEV', -- DEBT, CRED, SHAR, SLEV
    
    -- Parties
    debtor_account_id UUID NOT NULL REFERENCES account(id),
    creditor_account_id UUID NOT NULL REFERENCES account(id),
    
    -- Party Names (for sanctions screening)
    debtor_name STRING(140) NOT NULL,
    creditor_name STRING(140) NOT NULL,
    
    -- Status Tracking
    status transaction_status NOT NULL DEFAULT 'PENDING',
    status_reason STRING(256),
    
    -- Risk & Compliance
    sanctions_status STRING(20) DEFAULT 'PENDING', -- PENDING, CLEAR, BLOCKED, REVIEW
    sanctions_score DECIMAL(5, 4),  -- 0.0000 to 1.0000
    fraud_status STRING(20) DEFAULT 'PENDING', -- PENDING, CLEAR, ALERT, BLOCKED
    fraud_score DECIMAL(5, 4),
    
    -- Timing
    requested_execution_date DATE,
    booking_date DATE NOT NULL DEFAULT current_date(),
    value_date DATE,
    settlement_date DATE,
    
    -- Remittance Information (stored as JSON to prevent truncation)
    remittance_info JSONB DEFAULT '{}',
    
    -- Full ISO 20022 payload
    original_message JSONB,
    
    -- External Rail Information
    external_rail STRING(20),  -- FEDNOW, TIPS, SWIFT, INTERNAL
    external_reference STRING(64),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    created_by STRING(64),
    
    -- Indexes for common queries
    INDEX idx_transaction_status (status),
    INDEX idx_transaction_booking_date (booking_date DESC),
    INDEX idx_transaction_debtor (debtor_account_id),
    INDEX idx_transaction_creditor (creditor_account_id),
    INDEX idx_transaction_message_id (message_id),
    INDEX idx_transaction_created_at (created_at DESC),
    INDEX idx_transaction_sanctions (sanctions_status) WHERE sanctions_status != 'CLEAR',
    INDEX idx_transaction_fraud (fraud_status) WHERE fraud_status != 'CLEAR'
);

-- ============================================================================
-- TRANSACTION LEG ENTITY
-- Double-entry bookkeeping: Every transaction has at least 2 legs (debit + credit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS transaction_leg (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parent Reference
    transaction_id UUID NOT NULL REFERENCES transaction(id) ON DELETE CASCADE,
    
    -- Account Reference
    account_id UUID NOT NULL REFERENCES account(id),
    
    -- Leg Details
    leg_type leg_type NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    currency STRING(3) NOT NULL,
    
    -- Running Balance (snapshot after this leg applied)
    balance_after DECIMAL(19, 4),
    
    -- Description
    description STRING(256),
    
    -- Sequence within transaction (1 = first leg)
    sequence_number INT NOT NULL DEFAULT 1,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Indexes
    INDEX idx_leg_transaction (transaction_id),
    INDEX idx_leg_account (account_id),
    INDEX idx_leg_created (created_at DESC)
);

-- ============================================================================
-- PENDING CREDITS TABLE
-- Used for "Hot Account" pattern to avoid contention
-- High-velocity credits are batched here before aggregating to main balance
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_credit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target Account
    account_id UUID NOT NULL REFERENCES account(id),
    
    -- Credit Details
    amount DECIMAL(19, 4) NOT NULL,
    currency STRING(3) NOT NULL,
    
    -- Source Transaction
    transaction_id UUID NOT NULL REFERENCES transaction(id),
    
    -- Processing Status
    aggregated BOOLEAN NOT NULL DEFAULT FALSE,
    aggregated_at TIMESTAMPTZ,
    batch_id UUID,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Index for efficient aggregation queries
    INDEX idx_pending_account_aggregated (account_id, aggregated) WHERE aggregated = FALSE
);

-- ============================================================================
-- OUTBOX TABLE
-- Transactional Outbox Pattern: Guarantees exactly-once message publishing
-- Debezium CDC monitors this table and publishes to Kafka
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Aggregate Information
    aggregate_type STRING(64) NOT NULL,  -- 'transaction', 'account', etc.
    aggregate_id UUID NOT NULL,
    
    -- Event Information
    event_type STRING(64) NOT NULL,  -- 'PAYMENT_INITIATED', 'PAYMENT_COMPLETED', etc.
    
    -- Payload (JSON event data)
    payload JSONB NOT NULL,
    
    -- Routing
    topic STRING(128) NOT NULL DEFAULT 'nexus.events.raw',
    partition_key STRING(64),  -- Usually account_id for ordering
    
    -- Processing Status
    status outbox_status NOT NULL DEFAULT 'PENDING',
    published_at TIMESTAMPTZ,
    error_message STRING(512),
    retry_count INT NOT NULL DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Indexes
    INDEX idx_outbox_status (status) WHERE status = 'PENDING',
    INDEX idx_outbox_created (created_at)
);

-- ============================================================================
-- FX RATE TABLE
-- Exchange rates for multi-currency transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_rate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Currency Pair
    base_currency STRING(3) NOT NULL,
    quote_currency STRING(3) NOT NULL,
    
    -- Rates
    bid_rate DECIMAL(18, 8) NOT NULL,  -- We buy at this rate
    ask_rate DECIMAL(18, 8) NOT NULL,  -- We sell at this rate
    mid_rate DECIMAL(18, 8) NOT NULL,  -- Mid-market rate
    
    -- Validity
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ,
    
    -- Source
    source STRING(32) NOT NULL DEFAULT 'ECB', -- ECB, BLOOMBERG, INTERNAL
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Unique constraint per currency pair per time
    UNIQUE (base_currency, quote_currency, valid_from),
    
    -- Indexes
    INDEX idx_fx_pair (base_currency, quote_currency),
    INDEX idx_fx_valid (valid_from DESC)
);

-- ============================================================================
-- SETTLEMENT CYCLE TABLE
-- Tracks external rail settlement windows
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlement_cycle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Cycle Identification
    cycle_date DATE NOT NULL,
    cycle_number INT NOT NULL,  -- Multiple cycles per day
    rail STRING(20) NOT NULL,   -- FEDNOW, TIPS, SWIFT
    
    -- Timing
    opens_at TIMESTAMPTZ NOT NULL,
    closes_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    
    -- Position
    gross_credits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    gross_debits DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    net_position DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    
    -- Status
    status STRING(20) NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED, SETTLING, SETTLED
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Unique cycle per day per rail
    UNIQUE (cycle_date, cycle_number, rail),
    
    -- Indexes
    INDEX idx_settlement_status (status),
    INDEX idx_settlement_date (cycle_date DESC)
);

-- ============================================================================
-- RECONCILIATION RECORD TABLE
-- 3-way match between internal ledger, rail ACKs, and bank statements
-- ============================================================================

CREATE TABLE IF NOT EXISTS reconciliation_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source References
    transaction_id UUID REFERENCES transaction(id),
    uetr UUID,
    
    -- Match Data
    internal_amount DECIMAL(19, 4),
    internal_currency STRING(3),
    
    rail_amount DECIMAL(19, 4),
    rail_currency STRING(3),
    rail_reference STRING(64),
    rail_timestamp TIMESTAMPTZ,
    
    statement_amount DECIMAL(19, 4),
    statement_currency STRING(3),
    statement_reference STRING(64),
    statement_date DATE,
    
    -- Match Result
    match_status STRING(20) NOT NULL DEFAULT 'UNMATCHED', -- MATCHED, PARTIAL, UNMATCHED, EXCEPTION
    match_score DECIMAL(5, 4),  -- Fuzzy match confidence
    match_type STRING(20),     -- EXACT, FUZZY, MANUAL
    
    -- Exception Details
    exception_reason STRING(256),
    resolved_at TIMESTAMPTZ,
    resolved_by STRING(64),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Indexes
    INDEX idx_recon_status (match_status),
    INDEX idx_recon_uetr (uetr),
    INDEX idx_recon_transaction (transaction_id)
);

-- ============================================================================
-- AUDIT LOG TABLE
-- Immutable log of all state changes for compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What changed
    entity_type STRING(64) NOT NULL,
    entity_id UUID NOT NULL,
    action STRING(20) NOT NULL,  -- CREATE, UPDATE, DELETE
    
    -- Change Details
    old_value JSONB,
    new_value JSONB,
    changed_fields STRING[],
    
    -- Who changed it
    user_id STRING(64),
    ip_address STRING(45),
    user_agent STRING(256),
    
    -- When
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),
    
    -- Indexes
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_time (created_at DESC),
    INDEX idx_audit_user (user_id)
);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = current_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
-- Note: CockroachDB doesn't support all PostgreSQL trigger features
-- In production, we handle this in application code

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Available balance including pending credits
CREATE VIEW IF NOT EXISTS v_account_balance AS
SELECT 
    a.id,
    a.account_number,
    a.customer_id,
    a.currency,
    a.balance AS ledger_balance,
    COALESCE(pc.total_pending, 0) AS pending_credits,
    a.pending_debits,
    a.balance + COALESCE(pc.total_pending, 0) - a.pending_debits AS available_balance,
    a.status
FROM account a
LEFT JOIN (
    SELECT account_id, SUM(amount) AS total_pending
    FROM pending_credit
    WHERE aggregated = FALSE
    GROUP BY account_id
) pc ON a.id = pc.account_id;

-- View: Transaction summary for reporting
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
FROM transaction t
JOIN account da ON t.debtor_account_id = da.id
JOIN account ca ON t.creditor_account_id = ca.id;

-- View: Daily settlement position
CREATE VIEW IF NOT EXISTS v_daily_settlement AS
SELECT 
    booking_date,
    currency,
    external_rail,
    COUNT(*) AS transaction_count,
    SUM(amount) AS total_volume,
    SUM(CASE WHEN status = 'SETTLED' THEN amount ELSE 0 END) AS settled_volume,
    SUM(CASE WHEN status = 'REJECTED' THEN amount ELSE 0 END) AS rejected_volume
FROM transaction
GROUP BY booking_date, currency, external_rail;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert system accounts (nostro/vostro for settlement)
INSERT INTO customer (id, external_id, customer_type, legal_name, country_code, kyc_status)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'SYSTEM', 'CORPORATE', 'Nexus Settlement System', 'US', 'VERIFIED')
ON CONFLICT (external_id) DO NOTHING;

-- Settlement accounts per currency
INSERT INTO account (id, customer_id, account_number, account_type, currency, allow_negative)
VALUES
    ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'NEXUS-NOSTRO-USD', 'NOSTRO', 'USD', TRUE),
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'NEXUS-NOSTRO-EUR', 'NOSTRO', 'EUR', TRUE),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'NEXUS-NOSTRO-GBP', 'NOSTRO', 'GBP', TRUE),
    ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'NEXUS-SUSPENSE', 'SUSPENSE', 'USD', TRUE),
    ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'NEXUS-FEES-USD', 'FEE', 'USD', FALSE)
ON CONFLICT (account_number) DO NOTHING;

-- Initial FX rates (for testing)
INSERT INTO fx_rate (base_currency, quote_currency, bid_rate, ask_rate, mid_rate, valid_from, source)
VALUES
    ('EUR', 'USD', 1.0850, 1.0870, 1.0860, current_timestamp(), 'ECB'),
    ('GBP', 'USD', 1.2650, 1.2680, 1.2665, current_timestamp(), 'ECB'),
    ('USD', 'JPY', 148.50, 148.70, 148.60, current_timestamp(), 'ECB'),
    ('EUR', 'GBP', 0.8550, 0.8570, 0.8560, current_timestamp(), 'ECB')
ON CONFLICT (base_currency, quote_currency, valid_from) DO NOTHING;

-- ============================================================================
-- GRANTS (for application user)
-- ============================================================================

-- In production, create a dedicated app user with limited privileges
-- CREATE USER nexus_app WITH PASSWORD 'secure_password';
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nexus_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO nexus_app;

COMMIT;

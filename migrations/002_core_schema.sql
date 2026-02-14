-- Migration: 002_core_schema.sql
-- Core platform schema: accounts, transactions, outbox, reconciliation
-- Used by payment-service, account-service, reconciliation-service

CREATE DATABASE IF NOT EXISTS nexus_ledger;
USE nexus_ledger;

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number STRING NOT NULL UNIQUE,
    account_name STRING NOT NULL,
    account_type STRING NOT NULL DEFAULT 'SETTLEMENT',
    currency STRING NOT NULL DEFAULT 'USD',
    status STRING NOT NULL DEFAULT 'ACTIVE',
    balance DECIMAL(20, 4) NOT NULL DEFAULT 0.0000,
    available_balance DECIMAL(20, 4) NOT NULL DEFAULT 0.0000,
    pending_balance DECIMAL(20, 4) NOT NULL DEFAULT 0.0000,
    holder_name STRING DEFAULT '',
    holder_type STRING DEFAULT 'INDIVIDUAL',
    iban STRING DEFAULT '',
    bic STRING DEFAULT '',
    description STRING DEFAULT '',
    kyc_status STRING DEFAULT 'PENDING',
    customer_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_accounts_number (account_number),
    INDEX idx_accounts_type (account_type),
    INDEX idx_accounts_status (status),
    INDEX idx_accounts_customer (customer_id)
);

-- Transactions table (double-entry ledger)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uetr STRING NOT NULL UNIQUE,
    message_id STRING DEFAULT '',
    payment_type STRING NOT NULL DEFAULT 'INSTANT',
    status STRING NOT NULL DEFAULT 'INITIATED',
    amount DECIMAL(20, 4) NOT NULL,
    currency STRING NOT NULL DEFAULT 'USD',
    debtor_account_id UUID REFERENCES accounts(id),
    creditor_account_id UUID REFERENCES accounts(id),
    debtor_name STRING DEFAULT '',
    debtor_iban STRING DEFAULT '',
    creditor_name STRING DEFAULT '',
    creditor_iban STRING DEFAULT '',
    end_to_end_id STRING DEFAULT '',
    remittance_info STRING DEFAULT '',
    sanctions_status STRING DEFAULT 'PENDING',
    fraud_score DECIMAL(5, 4) DEFAULT 0.0000,
    settlement_method STRING DEFAULT 'CLRG',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    INDEX idx_transactions_uetr (uetr),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_debtor (debtor_account_id),
    INDEX idx_transactions_creditor (creditor_account_id),
    INDEX idx_transactions_created (created_at DESC)
);

-- Transaction legs (for double-entry bookkeeping)
CREATE TABLE IF NOT EXISTS transaction_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    entry_type STRING NOT NULL, -- 'DEBIT' or 'CREDIT'
    amount DECIMAL(20, 4) NOT NULL,
    currency STRING NOT NULL DEFAULT 'USD',
    balance_after DECIMAL(20, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_legs_transaction (transaction_id),
    INDEX idx_legs_account (account_id)
);

-- Outbox table (for Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type STRING NOT NULL,
    aggregate_id STRING NOT NULL,
    event_type STRING NOT NULL,
    payload JSONB NOT NULL,
    published BOOL NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    INDEX idx_outbox_published (published, created_at)
);

-- Reconciliation cycles
CREATE TABLE IF NOT EXISTS reconciliation_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status STRING NOT NULL DEFAULT 'PENDING',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    total_transactions INT DEFAULT 0,
    matched_count INT DEFAULT 0,
    unmatched_count INT DEFAULT 0,
    discrepancy_count INT DEFAULT 0,
    match_rate DECIMAL(5, 2) DEFAULT 0.00,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_recon_status (status),
    INDEX idx_recon_created (created_at DESC)
);

-- Reconciliation discrepancies
CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES reconciliation_cycles(id),
    transaction_id UUID REFERENCES transactions(id),
    discrepancy_type STRING NOT NULL,
    expected_value STRING DEFAULT '',
    actual_value STRING DEFAULT '',
    severity STRING DEFAULT 'MEDIUM',
    status STRING DEFAULT 'OPEN',
    resolution STRING DEFAULT '',
    resolved_by STRING DEFAULT '',
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_discrep_cycle (cycle_id),
    INDEX idx_discrep_status (status)
);

-- Account audit log (for account-service)
CREATE TABLE IF NOT EXISTS account_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    action STRING NOT NULL,
    performed_by STRING DEFAULT '',
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    INDEX idx_account_audit (account_id, created_at DESC)
);

-- Insert seed accounts for development
INSERT INTO accounts (id, account_number, account_name, account_type, currency, status, balance, available_balance)
VALUES
    ('a1000000-0000-0000-0000-000000000001', 'ACC-001-SETTLE', 'Primary Settlement', 'SETTLEMENT', 'USD', 'ACTIVE', 1000000.0000, 1000000.0000),
    ('a1000000-0000-0000-0000-000000000002', 'ACC-002-NOSTRO', 'USD Nostro Account', 'NOSTRO', 'USD', 'ACTIVE', 500000.0000, 500000.0000),
    ('a1000000-0000-0000-0000-000000000003', 'ACC-003-VOSTRO', 'EUR Vostro Account', 'VOSTRO', 'EUR', 'ACTIVE', 250000.0000, 250000.0000),
    ('a1000000-0000-0000-0000-000000000004', 'ACC-004-INT', 'Internal Ledger', 'INTERNAL', 'USD', 'ACTIVE', 100000.0000, 100000.0000)
ON CONFLICT (id) DO NOTHING;

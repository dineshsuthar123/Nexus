-- ============================================================================
-- LOCAL DEVELOPMENT SEED DATA
-- Two customers, two accounts, ready for end-to-end payment testing.
-- Run after 001_init_schema.sql
-- ============================================================================

USE nexus_ledger;

-- ============================================================================
-- Customers
-- ============================================================================
INSERT INTO customer (id, external_id, legal_name, display_name, kyc_status, country_code, city)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'CUST-ALICE', 'Alice Wonderland', 'Alice',  'VERIFIED', 'US', 'New York'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'CUST-BOB',   'Bob The Builder',  'Bob',    'VERIFIED', 'GB', 'London')
ON CONFLICT (external_id) DO NOTHING;

-- ============================================================================
-- Accounts  (UUID values are deterministic so curl scripts can reference them)
-- Alice  : USD account  — $50,000 seed balance
-- Bob    : USD account  — $10,000 seed balance
-- ============================================================================
INSERT INTO account (
    id, customer_id, account_number, account_name,
    account_type, currency, iban, bic,
    balance, available_balance, pending_credits, pending_debits,
    daily_limit, transaction_limit, allow_negative, status, kyc_status
) VALUES
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'US12345678901234567890',
    'Alice USD Account',
    'OPERATING', 'USD',
    'US12NEXU00000001234567',
    'NEXUUS33',
    50000.0000, 50000.0000, 0.0000, 0.0000,
    1000000.0000, 100000.0000, FALSE,
    'ACTIVE', 'VERIFIED'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000002',
    'GB12345678901234567890',
    'Bob USD Account',
    'OPERATING', 'USD',
    'GB12NEXU00000001234568',
    'NEXUGB2L',
    10000.0000, 10000.0000, 0.0000, 0.0000,
    1000000.0000, 100000.0000, FALSE,
    'ACTIVE', 'VERIFIED'
  )
ON CONFLICT (account_number) DO NOTHING;

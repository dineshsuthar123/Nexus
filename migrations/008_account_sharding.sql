-- ============================================================================
-- Migration 008: Account Balance Sharding
-- Purpose: Split account balances into K shards to reduce CockroachDB write
--          contention on hot accounts under concurrent debit load.
-- ============================================================================

USE nexus_ledger;

-- ============================================================================
-- 1. Create the shard table
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_shard (
    account_id UUID NOT NULL REFERENCES account(id),
    shard_id   INT2 NOT NULL,                              -- 0..K-1
    balance    DECIMAL(19, 4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp(),

    PRIMARY KEY (account_id, shard_id),

    -- DB-enforced invariant: no shard can go negative.
    -- This means the hot-path UPDATE can skip pre-read validation.
    CONSTRAINT check_shard_balance_non_negative CHECK (balance >= 0)
);

-- ============================================================================
-- 2. Seed shards for all existing ACTIVE accounts
--    Distributes current available_balance evenly across 8 shards.
--    Remainder goes to shard 0.
-- ============================================================================
INSERT INTO account_shard (account_id, shard_id, balance)
SELECT
    a.id,
    s.shard_id,
    CASE
        WHEN s.shard_id = 0
        THEN FLOOR(a.available_balance / 8) + (a.available_balance - FLOOR(a.available_balance / 8) * 8)
        ELSE FLOOR(a.available_balance / 8)
    END
FROM account a
CROSS JOIN (
    SELECT 0 AS shard_id UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
    UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
) s
WHERE a.status = 'ACTIVE'
ON CONFLICT (account_id, shard_id) DO NOTHING;

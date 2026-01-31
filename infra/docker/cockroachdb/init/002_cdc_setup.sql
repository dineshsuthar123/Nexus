-- CockroachDB CDC Setup for Debezium
-- Run this after the main schema is created

-- Create replication slots for Debezium connectors
-- Note: CockroachDB uses changefeeds differently, but Debezium connector emulates PostgreSQL

-- Enable rangefeed for CDC (required for CockroachDB changefeeds)
SET CLUSTER SETTING kv.rangefeed.enabled = true;

-- Create publication for outbox events (PostgreSQL-compatible syntax)
-- Debezium will use this for the outbox pattern
CREATE PUBLICATION outbox_publication FOR TABLE outbox;

-- Create publication for transaction data
CREATE PUBLICATION transactions_publication FOR TABLE transaction, transaction_leg;

-- Create changefeed-compatible indexes for efficient CDC
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox (created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_updated_at ON transaction (updated_at);

-- Grant permissions for CDC user (if using non-root)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO cdc_user;
-- GRANT USAGE ON SCHEMA public TO cdc_user;

-- Verify publications
SHOW CREATE ALL TABLES;

-- For native CockroachDB changefeeds (alternative to Debezium):
-- CREATE CHANGEFEED FOR TABLE outbox
--   INTO 'kafka://kafka1:9092?topic_prefix=nexus.'
--   WITH updated, resolved='10s', min_checkpoint_frequency='10s';

COMMENT ON TABLE outbox IS 'Transactional outbox for CDC-based event publishing. Debezium monitors this table for changes.';

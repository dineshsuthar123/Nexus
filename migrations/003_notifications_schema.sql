-- Migration 003: Notification Service Schema
-- Database: nexus_ledger
-- Description: Creates notification and preference tables for the notification service

-- =============================================================================
-- Notifications table
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    type         STRING NOT NULL DEFAULT 'SYSTEM',
    priority     STRING NOT NULL DEFAULT 'MEDIUM',
    title        STRING NOT NULL,
    message      STRING NOT NULL,
    channel      STRING NOT NULL DEFAULT 'IN_APP',
    reference_id STRING,
    metadata     JSONB DEFAULT '{}',
    read         BOOL NOT NULL DEFAULT false,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_user_read (user_id, read),
    INDEX idx_notifications_user_type (user_id, type),
    INDEX idx_notifications_created (created_at DESC)
);

-- =============================================================================
-- Notification Preferences table
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    type       STRING NOT NULL,
    in_app     BOOL NOT NULL DEFAULT true,
    email      BOOL NOT NULL DEFAULT true,
    sms        BOOL NOT NULL DEFAULT false,
    push       BOOL NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, type)
);

-- =============================================================================
-- Seed: insert sample notifications for dev
-- =============================================================================

INSERT INTO notifications (id, user_id, type, priority, title, message, channel, reference_id, read, created_at, updated_at)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'PAYMENT', 'HIGH', 'Payment Received', 'You received a payment of €1,500.00 from Acme Corp.', 'IN_APP', 'pay-001', false, now() - interval '2 hours', now()),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'SECURITY', 'CRITICAL', 'New Login Detected', 'A new login was detected from 192.168.1.100.', 'IN_APP', NULL, false, now() - interval '1 hour', now()),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'SYSTEM', 'LOW', 'System Maintenance', 'Scheduled maintenance on Jan 15, 2025 from 02:00-04:00 UTC.', 'IN_APP', NULL, true, now() - interval '1 day', now()),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'RECONCILIATION', 'MEDIUM', 'Reconciliation Complete', 'Daily reconciliation completed with 2 discrepancies.', 'IN_APP', 'recon-001', false, now() - interval '30 minutes', now()),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'FRAUD', 'CRITICAL', 'Suspicious Activity', 'Unusual transaction pattern detected on account ACC-12345.', 'IN_APP', 'fraud-001', false, now() - interval '15 minutes', now())
ON CONFLICT DO NOTHING;

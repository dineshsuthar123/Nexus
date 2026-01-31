// Package db provides database repositories for the Payment Service
package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.uber.org/zap"
)

// OutboxEvent represents an event in the transactional outbox
type OutboxEvent struct {
	ID            uuid.UUID       `json:"id"`
	AggregateType string          `json:"aggregateType"`
	AggregateID   uuid.UUID       `json:"aggregateId"`
	EventType     string          `json:"eventType"`
	Payload       json.RawMessage `json:"payload"`
	Topic         string          `json:"topic"`
	PartitionKey  string          `json:"partitionKey"`
	Status        string          `json:"status"`
	PublishedAt   *time.Time      `json:"publishedAt"`
	ErrorMessage  string          `json:"errorMessage"`
	RetryCount    int             `json:"retryCount"`
	CreatedAt     time.Time       `json:"createdAt"`
}

// OutboxRepository provides access to the transactional outbox
type OutboxRepository struct {
	pool   *Pool
	logger *zap.Logger
}

// NewOutboxRepository creates a new outbox repository
func NewOutboxRepository(pool *Pool, logger *zap.Logger) *OutboxRepository {
	return &OutboxRepository{
		pool:   pool,
		logger: logger,
	}
}

// Insert inserts an event into the outbox within a transaction
// This is the core of the Transactional Outbox Pattern
func (r *OutboxRepository) Insert(ctx context.Context, tx pgx.Tx, event *OutboxEvent) error {
	query := `
		INSERT INTO outbox (
			id, aggregate_type, aggregate_id, event_type, payload,
			topic, partition_key, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	if event.Status == "" {
		event.Status = "PENDING"
	}

	_, err := tx.Exec(ctx, query,
		event.ID, event.AggregateType, event.AggregateID, event.EventType, event.Payload,
		event.Topic, event.PartitionKey, event.Status,
	)
	if err != nil {
		return fmt.Errorf("failed to insert outbox event: %w", err)
	}

	r.logger.Debug("Inserted outbox event",
		zap.String("eventType", event.EventType),
		zap.String("aggregateType", event.AggregateType),
		zap.String("aggregateId", event.AggregateID.String()),
	)

	return nil
}

// GetPending retrieves pending events for publishing
func (r *OutboxRepository) GetPending(ctx context.Context, limit int) ([]OutboxEvent, error) {
	query := `
		SELECT id, aggregate_type, aggregate_id, event_type, payload,
		       topic, partition_key, status, published_at, error_message,
		       retry_count, created_at
		FROM outbox
		WHERE status = 'PENDING'
		ORDER BY created_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`

	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending outbox events: %w", err)
	}
	defer rows.Close()

	var events []OutboxEvent
	for rows.Next() {
		var e OutboxEvent
		err := rows.Scan(
			&e.ID, &e.AggregateType, &e.AggregateID, &e.EventType, &e.Payload,
			&e.Topic, &e.PartitionKey, &e.Status, &e.PublishedAt, &e.ErrorMessage,
			&e.RetryCount, &e.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan outbox event: %w", err)
		}
		events = append(events, e)
	}

	return events, nil
}

// MarkPublished marks an event as successfully published
func (r *OutboxRepository) MarkPublished(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE outbox
		SET status = 'PUBLISHED', published_at = current_timestamp()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to mark outbox event as published: %w", err)
	}

	return nil
}

// MarkFailed marks an event as failed
func (r *OutboxRepository) MarkFailed(ctx context.Context, id uuid.UUID, errMsg string) error {
	query := `
		UPDATE outbox
		SET status = 'FAILED', error_message = $2, retry_count = retry_count + 1
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, id, errMsg)
	if err != nil {
		return fmt.Errorf("failed to mark outbox event as failed: %w", err)
	}

	return nil
}

// RetryFailed resets failed events for retry (up to max retries)
func (r *OutboxRepository) RetryFailed(ctx context.Context, maxRetries int) (int, error) {
	query := `
		UPDATE outbox
		SET status = 'PENDING', error_message = NULL
		WHERE status = 'FAILED' AND retry_count < $1
	`

	result, err := r.pool.Exec(ctx, query, maxRetries)
	if err != nil {
		return 0, fmt.Errorf("failed to retry failed outbox events: %w", err)
	}

	return int(result.RowsAffected()), nil
}

// Cleanup removes old published events
func (r *OutboxRepository) Cleanup(ctx context.Context, olderThan time.Duration) (int, error) {
	query := `
		DELETE FROM outbox
		WHERE status = 'PUBLISHED' AND published_at < $1
	`

	cutoff := time.Now().Add(-olderThan)
	result, err := r.pool.Exec(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup outbox: %w", err)
	}

	return int(result.RowsAffected()), nil
}

// Event types
const (
	EventPaymentInitiated    = "PAYMENT_INITIATED"
	EventPaymentValidated    = "PAYMENT_VALIDATED"
	EventPaymentSanctioned   = "PAYMENT_SANCTIONED"
	EventPaymentCleared      = "PAYMENT_CLEARED"
	EventPaymentSettled      = "PAYMENT_SETTLED"
	EventPaymentRejected     = "PAYMENT_REJECTED"
	EventPaymentReturned     = "PAYMENT_RETURNED"
	EventFraudAlertTriggered = "FRAUD_ALERT_TRIGGERED"
	EventAccountDebited      = "ACCOUNT_DEBITED"
	EventAccountCredited     = "ACCOUNT_CREDITED"
)

// Kafka topics
const (
	TopicPaymentsInitiated = "nexus.payments.initiated"
	TopicPaymentsEnriched  = "nexus.payments.enriched"
	TopicPaymentsCompleted = "nexus.payments.completed"
	TopicFraudAlerts       = "nexus.fraud.alerts"
	TopicSanctionsResults  = "nexus.sanctions.results"
	TopicNotifications     = "nexus.notifications"
)

// Package db provides audit repository
package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AuditLog represents an audit log entry
type AuditLog struct {
	ID            uuid.UUID       `json:"id"`
	EntityType    string          `json:"entityType"`
	EntityID      uuid.UUID       `json:"entityId"`
	Action        string          `json:"action"`
	ActorType     string          `json:"actorType"`
	ActorID       string          `json:"actorId"`
	ActorIP       string          `json:"actorIp,omitempty"`
	Changes       json.RawMessage `json:"changes,omitempty"`
	PreviousState json.RawMessage `json:"previousState,omitempty"`
	NewState      json.RawMessage `json:"newState,omitempty"`
	RequestID     string          `json:"requestId,omitempty"`
	SessionID     string          `json:"sessionId,omitempty"`
	CreatedAt     time.Time       `json:"createdAt"`
}

// AuditRepository handles audit log data access
type AuditRepository struct {
	pool *Pool
}

// NewAuditRepository creates a new audit repository
func NewAuditRepository(pool *Pool) *AuditRepository {
	return &AuditRepository{pool: pool}
}

// Create creates a new audit log entry
func (r *AuditRepository) Create(ctx context.Context, log *AuditLog) error {
	if log.ID == uuid.Nil {
		log.ID = uuid.New()
	}

	query := `
		INSERT INTO audit_log (
			id, entity_type, entity_id, action, actor_type, actor_id,
			actor_ip, changes, previous_state, new_state, request_id, session_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING created_at`

	return r.pool.QueryRow(ctx, query,
		log.ID, log.EntityType, log.EntityID, log.Action, log.ActorType,
		log.ActorID, log.ActorIP, log.Changes, log.PreviousState, log.NewState,
		log.RequestID, log.SessionID,
	).Scan(&log.CreatedAt)
}

// GetByEntityID retrieves audit logs for an entity
func (r *AuditRepository) GetByEntityID(ctx context.Context, entityType string, entityID uuid.UUID, limit int) ([]*AuditLog, error) {
	query := `
		SELECT id, entity_type, entity_id, action, actor_type, actor_id,
			actor_ip, changes, previous_state, new_state, request_id, session_id, created_at
		FROM audit_log
		WHERE entity_type = $1 AND entity_id = $2
		ORDER BY created_at DESC
		LIMIT $3`

	rows, err := r.pool.Query(ctx, query, entityType, entityID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*AuditLog
	for rows.Next() {
		var log AuditLog
		if err := rows.Scan(
			&log.ID, &log.EntityType, &log.EntityID, &log.Action, &log.ActorType,
			&log.ActorID, &log.ActorIP, &log.Changes, &log.PreviousState, &log.NewState,
			&log.RequestID, &log.SessionID, &log.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, &log)
	}

	return logs, nil
}

// GetByActor retrieves audit logs for an actor
func (r *AuditRepository) GetByActor(ctx context.Context, actorType, actorID string, limit int) ([]*AuditLog, error) {
	query := `
		SELECT id, entity_type, entity_id, action, actor_type, actor_id,
			actor_ip, changes, previous_state, new_state, request_id, session_id, created_at
		FROM audit_log
		WHERE actor_type = $1 AND actor_id = $2
		ORDER BY created_at DESC
		LIMIT $3`

	rows, err := r.pool.Query(ctx, query, actorType, actorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*AuditLog
	for rows.Next() {
		var log AuditLog
		if err := rows.Scan(
			&log.ID, &log.EntityType, &log.EntityID, &log.Action, &log.ActorType,
			&log.ActorID, &log.ActorIP, &log.Changes, &log.PreviousState, &log.NewState,
			&log.RequestID, &log.SessionID, &log.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, &log)
	}

	return logs, nil
}

// GetByDateRange retrieves audit logs within a date range
func (r *AuditRepository) GetByDateRange(ctx context.Context, start, end time.Time, limit, offset int) ([]*AuditLog, error) {
	query := `
		SELECT id, entity_type, entity_id, action, actor_type, actor_id,
			actor_ip, changes, previous_state, new_state, request_id, session_id, created_at
		FROM audit_log
		WHERE created_at >= $1 AND created_at <= $2
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4`

	rows, err := r.pool.Query(ctx, query, start, end, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*AuditLog
	for rows.Next() {
		var log AuditLog
		if err := rows.Scan(
			&log.ID, &log.EntityType, &log.EntityID, &log.Action, &log.ActorType,
			&log.ActorID, &log.ActorIP, &log.Changes, &log.PreviousState, &log.NewState,
			&log.RequestID, &log.SessionID, &log.CreatedAt,
		); err != nil {
			return nil, err
		}
		logs = append(logs, &log)
	}

	return logs, nil
}

// Common audit action constants
const (
	ActionAccountCreated       = "ACCOUNT_CREATED"
	ActionAccountUpdated       = "ACCOUNT_UPDATED"
	ActionAccountStatusChanged = "ACCOUNT_STATUS_CHANGED"
	ActionKYCStatusChanged     = "KYC_STATUS_CHANGED"
	ActionBalanceUpdated       = "BALANCE_UPDATED"
	ActionLimitsUpdated        = "LIMITS_UPDATED"
	ActionRiskScoreUpdated     = "RISK_SCORE_UPDATED"
)

// Actor types
const (
	ActorTypeUser   = "USER"
	ActorTypeSystem = "SYSTEM"
	ActorTypeAPI    = "API"
)

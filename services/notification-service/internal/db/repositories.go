package db

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/notification-service/internal/models"
)

// NotificationRepository handles notification CRUD operations.
type NotificationRepository struct {
	pool *Pool
}

// NewNotificationRepository creates a new repository.
func NewNotificationRepository(pool *Pool) *NotificationRepository {
	return &NotificationRepository{pool: pool}
}

// Create inserts a new notification.
func (r *NotificationRepository) Create(ctx context.Context, n *models.Notification) error {
	metadataJSON, err := json.Marshal(n.Metadata)
	if err != nil {
		metadataJSON = []byte("{}")
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO notifications (id, user_id, type, priority, title, message, channel, reference_id, metadata, "read", created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		n.ID, n.UserID, n.Type, n.Priority, n.Title, n.Message, n.Channel, n.ReferenceID, metadataJSON, n.Read, n.CreatedAt, n.UpdatedAt,
	)
	return err
}

// GetByID fetches a single notification.
func (r *NotificationRepository) GetByID(ctx context.Context, id string) (*models.Notification, error) {
	n := &models.Notification{}
	var metadataJSON []byte
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, type, priority, title, message, channel, reference_id, metadata, "read", read_at, created_at, updated_at
		 FROM notifications WHERE id = $1`, id,
	).Scan(&n.ID, &n.UserID, &n.Type, &n.Priority, &n.Title, &n.Message, &n.Channel, &n.ReferenceID, &metadataJSON, &n.Read, &n.ReadAt, &n.CreatedAt, &n.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if metadataJSON != nil {
		_ = json.Unmarshal(metadataJSON, &n.Metadata)
	}
	return n, nil
}

// ListByUser returns paginated notifications for a user, optionally filtered.
func (r *NotificationRepository) ListByUser(ctx context.Context, userID string, readFilter *bool, notifType *string, page, pageSize int) (*models.PaginatedNotifications, error) {
	offset := (page - 1) * pageSize

	// Build WHERE clause
	where := " WHERE user_id = $1"
	args := []interface{}{userID}
	argIdx := 2

	if readFilter != nil {
		where += fmt.Sprintf(" AND \"read\" = $%d", argIdx)
		args = append(args, *readFilter)
		argIdx++
	}
	if notifType != nil && *notifType != "" {
		where += fmt.Sprintf(" AND type = $%d", argIdx)
		args = append(args, *notifType)
		argIdx++
	}

	// Count total
	var total int
	countArgs := make([]interface{}, len(args))
	copy(countArgs, args)
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM notifications"+where, countArgs...).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("count query failed: %w", err)
	}

	// Count unread
	var unreadCount int
	err = r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND \"read\" = false", userID).Scan(&unreadCount)
	if err != nil {
		return nil, fmt.Errorf("unread count query failed: %w", err)
	}

	// Fetch page
	query := fmt.Sprintf("SELECT id, user_id, type, priority, title, message, channel, reference_id, metadata, \"read\", read_at, created_at, updated_at FROM notifications%s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", where, argIdx, argIdx+1)
	args = append(args, pageSize, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list query failed: %w", err)
	}
	defer rows.Close()

	var items []models.Notification
	for rows.Next() {
		var n models.Notification
		var metadataJSON []byte
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Priority, &n.Title, &n.Message, &n.Channel, &n.ReferenceID, &metadataJSON, &n.Read, &n.ReadAt, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		if metadataJSON != nil {
			_ = json.Unmarshal(metadataJSON, &n.Metadata)
		}
		items = append(items, n)
	}
	if items == nil {
		items = []models.Notification{}
	}

	totalPages := int(math.Ceil(float64(total) / float64(pageSize)))

	return &models.PaginatedNotifications{
		Items:       items,
		Total:       total,
		Page:        page,
		PageSize:    pageSize,
		TotalPages:  totalPages,
		UnreadCount: unreadCount,
	}, nil
}

// MarkRead marks a single notification as read.
func (r *NotificationRepository) MarkRead(ctx context.Context, id, userID string) error {
	now := time.Now().UTC()
	tag, err := r.pool.Exec(ctx,
		`UPDATE notifications SET "read" = true, read_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3`,
		now, id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// MarkAllRead marks all unread notifications for a user as read.
func (r *NotificationRepository) MarkAllRead(ctx context.Context, userID string) (int64, error) {
	now := time.Now().UTC()
	tag, err := r.pool.Exec(ctx,
		`UPDATE notifications SET "read" = true, read_at = $1, updated_at = $1 WHERE user_id = $2 AND "read" = false`,
		now, userID,
	)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// PreferenceRepository handles notification preference CRUD operations.
type PreferenceRepository struct {
	pool *Pool
}

// NewPreferenceRepository creates a new preference repository.
func NewPreferenceRepository(pool *Pool) *PreferenceRepository {
	return &PreferenceRepository{pool: pool}
}

// GetByUser returns all notification preferences for a user.
func (r *PreferenceRepository) GetByUser(ctx context.Context, userID string) ([]models.NotificationPreference, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, type, in_app, email, sms, push, created_at, updated_at
		 FROM notification_preferences WHERE user_id = $1 ORDER BY type`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prefs []models.NotificationPreference
	for rows.Next() {
		var p models.NotificationPreference
		if err := rows.Scan(&p.ID, &p.UserID, &p.Type, &p.InApp, &p.Email, &p.SMS, &p.Push, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		prefs = append(prefs, p)
	}
	if prefs == nil {
		prefs = []models.NotificationPreference{}
	}
	return prefs, nil
}

// UpsertPreference inserts or updates a single notification preference.
func (r *PreferenceRepository) UpsertPreference(ctx context.Context, p *models.NotificationPreference) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO notification_preferences (id, user_id, type, in_app, email, sms, push, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (user_id, type) DO UPDATE SET
		   in_app = EXCLUDED.in_app,
		   email = EXCLUDED.email,
		   sms = EXCLUDED.sms,
		   push = EXCLUDED.push,
		   updated_at = EXCLUDED.updated_at`,
		p.ID, p.UserID, p.Type, p.InApp, p.Email, p.SMS, p.Push, p.CreatedAt, p.UpdatedAt,
	)
	return err
}

// EnsureSchema creates the notifications tables if they don't exist.
func EnsureSchema(ctx context.Context, pool *Pool) error {
	schema := `
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
	);`

	_, err := pool.Exec(ctx, schema)
	return err
}

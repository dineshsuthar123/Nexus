package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/account-service/internal/db"
)

// AccountStore abstracts account persistence for testability.
type AccountStore interface {
	Create(ctx context.Context, account *db.Account) error
	GetByID(ctx context.Context, id uuid.UUID) (*db.Account, error)
	GetAccountBalance(ctx context.Context, id uuid.UUID) (*db.BalanceInfo, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status string) error
	UpdateKYCStatus(ctx context.Context, id uuid.UUID, kycStatus string) error
	ListAccounts(ctx context.Context, limit, offset int, status string) ([]*db.Account, int, error)
	GetByCustomerID(ctx context.Context, customerID uuid.UUID) ([]*db.Account, error)
}

// AuditLogStore abstracts audit log persistence.
type AuditLogStore interface {
	Create(ctx context.Context, log *db.AuditLog) error
	GetByEntityID(ctx context.Context, entityType string, entityID uuid.UUID, limit int) ([]*db.AuditLog, error)
}

// CacheProvider abstracts cache operations. Can be nil — service checks for nil.
type CacheProvider interface {
	GetJSON(ctx context.Context, key string, dest interface{}) error
	SetJSON(ctx context.Context, key string, value interface{}, expiration time.Duration) error
	Delete(ctx context.Context, keys ...string) error
}

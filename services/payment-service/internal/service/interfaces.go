package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/sanctions"
	"github.com/shopspring/decimal"
)

// TransactionStore abstracts transaction persistence for testability.
type TransactionStore interface {
	Create(ctx context.Context, tx pgx.Tx, t *db.Transaction) error
	CreateLeg(ctx context.Context, tx pgx.Tx, leg *db.TransactionLeg) error
	GetByUETR(ctx context.Context, uetr uuid.UUID) (*db.Transaction, error)
	GetByUETRTx(ctx context.Context, tx pgx.Tx, uetr uuid.UUID) (*db.Transaction, error)
	GetByID(ctx context.Context, id uuid.UUID) (*db.Transaction, error)
	UpdateStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status, reason string) error
	UpdateSanctionsStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error
	UpdateFraudStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error
	ExistsByUETR(ctx context.Context, uetr uuid.UUID) (bool, error)
	ListAll(ctx context.Context, limit, offset int) ([]db.Transaction, int, error)
}

// AccountStore abstracts account persistence for testability.
type AccountStore interface {
	GetByID(ctx context.Context, id uuid.UUID) (*db.Account, error)
	GetForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*db.Account, error)
	GetIDByIBAN(ctx context.Context, iban string) (uuid.UUID, error)
	ReserveFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error
	ReleaseFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error
	DebitAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error)
	CreditAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error)
	AddPendingCredit(ctx context.Context, tx pgx.Tx, accountID, transactionID uuid.UUID, amount decimal.Decimal, currency string) error
}

// ShardStore abstracts sharded balance operations for testability.
type ShardStore interface {
	ReserveFundsShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error
	CreditShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error
	DebitShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error
	NeedsRebalance(ctx context.Context, accountID uuid.UUID) (bool, error)
	Rebalance(ctx context.Context, accountID uuid.UUID) error
}

// OutboxStore abstracts outbox persistence for testability.
type OutboxStore interface {
	Insert(ctx context.Context, tx pgx.Tx, event *db.OutboxEvent) error
}

// SanctionsScreener abstracts sanctions screening for testability.
type SanctionsScreener interface {
	ScreenParties(ctx context.Context, debtorName, creditorName, debtorCountry, creditorCountry string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error)
}

// TxManager abstracts database transaction management for testability.
type TxManager interface {
	RetryTx(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error
}

// EventPublisher abstracts Kafka message publishing for testability.
type EventPublisher interface {
	Publish(ctx context.Context, topic, key string, value interface{}) error
	Close() error
}

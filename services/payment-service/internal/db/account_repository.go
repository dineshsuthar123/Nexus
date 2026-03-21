// Package db provides database repositories for the Payment Service
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

// Account represents an account in the ledger
type Account struct {
	ID               uuid.UUID       `json:"id"`
	CustomerID       uuid.UUID       `json:"customerId"`
	AccountNumber    string          `json:"accountNumber"`
	AccountType      string          `json:"accountType"`
	Currency         string          `json:"currency"`
	Balance          decimal.Decimal `json:"balance"`
	AvailableBalance decimal.Decimal `json:"availableBalance"`
	PendingCredits   decimal.Decimal `json:"pendingCredits"`
	PendingDebits    decimal.Decimal `json:"pendingDebits"`
	DailyLimit       decimal.Decimal `json:"dailyLimit"`
	TransactionLimit decimal.Decimal `json:"transactionLimit"`
	AllowNegative    bool            `json:"allowNegative"`
	MinimumBalance   decimal.Decimal `json:"minimumBalance"`
	Status           string          `json:"status"`
	Region           string          `json:"region"`
	Metadata         []byte          `json:"metadata"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
	Version          int             `json:"version"`
}

// AccountRepository provides access to account data
type AccountRepository struct {
	pool   *Pool
	logger *zap.Logger
}

// NewAccountRepository creates a new account repository
func NewAccountRepository(pool *Pool, logger *zap.Logger) *AccountRepository {
	return &AccountRepository{
		pool:   pool,
		logger: logger,
	}
}

// GetByID retrieves an account by ID
func (r *AccountRepository) GetByID(ctx context.Context, id uuid.UUID) (*Account, error) {
	query := `
		SELECT id, customer_id, account_number, account_type, currency,
		       balance, available_balance, pending_credits, pending_debits,
		       daily_limit, transaction_limit, allow_negative, minimum_balance,
		       status, region, metadata, created_at, updated_at, version
		FROM account
		WHERE id = $1
	`

	var acc Account
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&acc.ID, &acc.CustomerID, &acc.AccountNumber, &acc.AccountType, &acc.Currency,
		&acc.Balance, &acc.AvailableBalance, &acc.PendingCredits, &acc.PendingDebits,
		&acc.DailyLimit, &acc.TransactionLimit, &acc.AllowNegative, &acc.MinimumBalance,
		&acc.Status, &acc.Region, &acc.Metadata, &acc.CreatedAt, &acc.UpdatedAt, &acc.Version,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get account: %w", err)
	}

	return &acc, nil
}

// GetByAccountNumber retrieves an account by account number
func (r *AccountRepository) GetByAccountNumber(ctx context.Context, accountNumber string) (*Account, error) {
	query := `
		SELECT id, customer_id, account_number, account_type, currency,
		       balance, available_balance, pending_credits, pending_debits,
		       daily_limit, transaction_limit, allow_negative, minimum_balance,
		       status, region, metadata, created_at, updated_at, version
		FROM account
		WHERE account_number = $1
	`

	var acc Account
	err := r.pool.QueryRow(ctx, query, accountNumber).Scan(
		&acc.ID, &acc.CustomerID, &acc.AccountNumber, &acc.AccountType, &acc.Currency,
		&acc.Balance, &acc.AvailableBalance, &acc.PendingCredits, &acc.PendingDebits,
		&acc.DailyLimit, &acc.TransactionLimit, &acc.AllowNegative, &acc.MinimumBalance,
		&acc.Status, &acc.Region, &acc.Metadata, &acc.CreatedAt, &acc.UpdatedAt, &acc.Version,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get account by number: %w", err)
	}

	return &acc, nil
}

// GetIDByIBAN retrieves an account ID by IBAN
func (r *AccountRepository) GetIDByIBAN(ctx context.Context, iban string) (uuid.UUID, error) {
	query := `SELECT id FROM account WHERE account_number = $1 AND status = 'ACTIVE' LIMIT 1`

	var id uuid.UUID
	err := r.pool.QueryRow(ctx, query, iban).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, ErrNotFound
		}
		return uuid.Nil, fmt.Errorf("failed to get account by IBAN: %w", err)
	}

	return id, nil
}

// GetForUpdate retrieves an account with a row lock for update
// Must be called within a transaction
func (r *AccountRepository) GetForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*Account, error) {
	query := `
		SELECT id, customer_id, account_number, account_type, currency,
		       balance, available_balance, pending_credits, pending_debits,
		       daily_limit, transaction_limit, allow_negative, minimum_balance,
		       status, region, metadata, created_at, updated_at, version
		FROM account
		WHERE id = $1
		FOR UPDATE
	`

	var acc Account
	err := tx.QueryRow(ctx, query, id).Scan(
		&acc.ID, &acc.CustomerID, &acc.AccountNumber, &acc.AccountType, &acc.Currency,
		&acc.Balance, &acc.AvailableBalance, &acc.PendingCredits, &acc.PendingDebits,
		&acc.DailyLimit, &acc.TransactionLimit, &acc.AllowNegative, &acc.MinimumBalance,
		&acc.Status, &acc.Region, &acc.Metadata, &acc.CreatedAt, &acc.UpdatedAt, &acc.Version,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get account for update: %w", err)
	}

	return &acc, nil
}

// UpdateBalance updates the account balance within a transaction
func (r *AccountRepository) UpdateBalance(ctx context.Context, tx pgx.Tx, id uuid.UUID, newBalance decimal.Decimal, version int) error {
	query := `
		UPDATE account
		SET balance = $2,
		    available_balance = $2 + pending_credits - pending_debits,
		    updated_at = current_timestamp(),
		    version = version + 1
		WHERE id = $1 AND version = $3
	`

	result, err := tx.Exec(ctx, query, id, newBalance, version)
	if err != nil {
		return fmt.Errorf("failed to update balance: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrOptimisticLock
	}

	return nil
}

// ReserveFunds adds a pending debit to the account
func (r *AccountRepository) ReserveFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error {
	query := `
		UPDATE account
		SET pending_debits = pending_debits + $2,
		    available_balance = balance + pending_credits - (pending_debits + $2),
		    updated_at = current_timestamp()
		WHERE id = $1
		AND status = 'ACTIVE'
		AND (balance + pending_credits - (pending_debits + $2) >= minimum_balance OR allow_negative = TRUE)
	`

	result, err := tx.Exec(ctx, query, id, amount)
	if err != nil {
		return fmt.Errorf("failed to reserve funds: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrInsufficientFunds
	}

	return nil
}

// ReleaseFunds removes a pending debit from the account (for rollback)
func (r *AccountRepository) ReleaseFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error {
	query := `
		UPDATE account
		SET pending_debits = pending_debits - $2,
		    available_balance = balance + pending_credits - (pending_debits - $2),
		    updated_at = current_timestamp()
		WHERE id = $1
	`

	_, err := tx.Exec(ctx, query, id, amount)
	if err != nil {
		return fmt.Errorf("failed to release funds: %w", err)
	}

	return nil
}

// DebitAccount debits the account balance (finalizes the reservation)
func (r *AccountRepository) DebitAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error) {
	query := `
		UPDATE account
		SET balance = balance - $2,
		    pending_debits = pending_debits - $2,
		    available_balance = (balance - $2) + pending_credits - (pending_debits - $2),
		    updated_at = current_timestamp(),
		    version = version + 1
		WHERE id = $1
		RETURNING balance
	`

	var newBalance decimal.Decimal
	err := tx.QueryRow(ctx, query, id, amount).Scan(&newBalance)
	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to debit account: %w", err)
	}

	return newBalance, nil
}

// CreditAccount credits the account balance
func (r *AccountRepository) CreditAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error) {
	query := `
		UPDATE account
		SET balance = balance + $2,
		    available_balance = (balance + $2) + pending_credits - pending_debits,
		    updated_at = current_timestamp(),
		    version = version + 1
		WHERE id = $1
		RETURNING balance
	`

	var newBalance decimal.Decimal
	err := tx.QueryRow(ctx, query, id, amount).Scan(&newBalance)
	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to credit account: %w", err)
	}

	return newBalance, nil
}

// AddPendingCredit adds to the pending credits (Hot Account Pattern)
func (r *AccountRepository) AddPendingCredit(ctx context.Context, tx pgx.Tx, accountID, transactionID uuid.UUID, amount decimal.Decimal, currency string) error {
	query := `
		INSERT INTO pending_credit (account_id, transaction_id, amount, currency)
		VALUES ($1, $2, $3, $4)
	`

	_, err := tx.Exec(ctx, query, accountID, transactionID, amount, currency)
	if err != nil {
		return fmt.Errorf("failed to add pending credit: %w", err)
	}

	return nil
}

// Create creates a new account
func (r *AccountRepository) Create(ctx context.Context, acc *Account) error {
	query := `
		INSERT INTO account (
			id, customer_id, account_number, account_type, currency,
			balance, available_balance, pending_credits, pending_debits,
			daily_limit, transaction_limit, allow_negative, minimum_balance,
			status, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		)
	`

	if acc.ID == uuid.Nil {
		acc.ID = uuid.New()
	}

	_, err := r.pool.Exec(ctx, query,
		acc.ID, acc.CustomerID, acc.AccountNumber, acc.AccountType, acc.Currency,
		acc.Balance, acc.AvailableBalance, acc.PendingCredits, acc.PendingDebits,
		acc.DailyLimit, acc.TransactionLimit, acc.AllowNegative, acc.MinimumBalance,
		acc.Status, acc.Metadata,
	)
	if err != nil {
		return fmt.Errorf("failed to create account: %w", err)
	}

	return nil
}

// Errors
var (
	ErrNotFound                 = fmt.Errorf("entity not found")
	ErrOptimisticLock           = fmt.Errorf("optimistic lock conflict")
	ErrInsufficientFunds        = fmt.Errorf("insufficient funds")
	ErrAccountInactive          = fmt.Errorf("account is not active")
	ErrCurrencyMismatch         = fmt.Errorf("currency mismatch")
	ErrTransactionLimitExceeded = fmt.Errorf("amount exceeds transaction limit")
	ErrShardsNotInitialized     = fmt.Errorf("account shards not initialized")
	ErrInvalidTransition        = fmt.Errorf("invalid status transition")
)

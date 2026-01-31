// Package db provides account repository
package db

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Account represents an account
type Account struct {
	ID        uuid.UUID
	Number    string
	Currency  string
	Balance   decimal.Decimal
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// AccountRepository handles account data access
type AccountRepository struct {
	pool *Pool
}

// NewAccountRepository creates a new repository
func NewAccountRepository(pool *Pool) *AccountRepository {
	return &AccountRepository{pool: pool}
}

// GetByID retrieves an account by ID
func (r *AccountRepository) GetByID(ctx context.Context, id uuid.UUID) (*Account, error) {
	query := `
		SELECT id, account_number, currency, balance, status, created_at, updated_at
		FROM account WHERE id = $1
	`
	row := r.pool.QueryRow(ctx, query, id)

	var account Account
	err := row.Scan(
		&account.ID, &account.Number, &account.Currency,
		&account.Balance, &account.Status, &account.CreatedAt, &account.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &account, nil
}

// GetAccountsWithActivity retrieves accounts with activity in a period
func (r *AccountRepository) GetAccountsWithActivity(ctx context.Context, start, end time.Time) ([]*Account, error) {
	query := `
		SELECT DISTINCT a.id, a.account_number, a.currency, a.balance, a.status,
			a.created_at, a.updated_at
		FROM account a
		INNER JOIN transaction_leg tl ON a.id = tl.account_id
		WHERE tl.created_at >= $1 AND tl.created_at < $2
	`
	rows, err := r.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []*Account
	for rows.Next() {
		var account Account
		err := rows.Scan(
			&account.ID, &account.Number, &account.Currency,
			&account.Balance, &account.Status, &account.CreatedAt, &account.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, &account)
	}
	return accounts, nil
}

// GetAllActive retrieves all active accounts
func (r *AccountRepository) GetAllActive(ctx context.Context) ([]*Account, error) {
	query := `
		SELECT id, account_number, currency, balance, status, created_at, updated_at
		FROM account WHERE status = 'ACTIVE'
		ORDER BY account_number
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []*Account
	for rows.Next() {
		var account Account
		err := rows.Scan(
			&account.ID, &account.Number, &account.Currency,
			&account.Balance, &account.Status, &account.CreatedAt, &account.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, &account)
	}
	return accounts, nil
}

// GetBalanceHistory retrieves balance history for an account
func (r *AccountRepository) GetBalanceHistory(ctx context.Context, accountID uuid.UUID, start, end time.Time) ([]BalanceSnapshot, error) {
	query := `
		SELECT tl.created_at, tl.balance_after, tl.leg_type, tl.amount
		FROM transaction_leg tl
		WHERE tl.account_id = $1 AND tl.created_at >= $2 AND tl.created_at < $3
		ORDER BY tl.created_at
	`
	rows, err := r.pool.Query(ctx, query, accountID, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snapshots []BalanceSnapshot
	for rows.Next() {
		var snapshot BalanceSnapshot
		err := rows.Scan(
			&snapshot.Timestamp, &snapshot.Balance, &snapshot.LegType, &snapshot.Amount,
		)
		if err != nil {
			return nil, err
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots, nil
}

// BalanceSnapshot represents a point-in-time balance
type BalanceSnapshot struct {
	Timestamp time.Time
	Balance   decimal.Decimal
	LegType   string
	Amount    decimal.Decimal
}

// Package db provides transaction repository
package db

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// Transaction represents a payment transaction
type Transaction struct {
	ID              uuid.UUID
	UETR            uuid.UUID
	DebtorAccount   uuid.UUID
	CreditorAccount uuid.UUID
	Amount          decimal.Decimal
	Currency        string
	Status          string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// TransactionLeg represents a double-entry leg
type TransactionLeg struct {
	ID            uuid.UUID
	TransactionID uuid.UUID
	AccountID     uuid.UUID
	LegType       string // DEBIT or CREDIT
	Amount        decimal.Decimal
	Currency      string
	BalanceBefore decimal.Decimal
	BalanceAfter  decimal.Decimal
	CreatedAt     time.Time
}

// TransactionRepository handles transaction data access
type TransactionRepository struct {
	pool *Pool
}

// NewTransactionRepository creates a new repository
func NewTransactionRepository(pool *Pool) *TransactionRepository {
	return &TransactionRepository{pool: pool}
}

// GetByID retrieves a transaction by ID
func (r *TransactionRepository) GetByID(ctx context.Context, id uuid.UUID) (*Transaction, error) {
	query := `
		SELECT id, uetr, debtor_account_id, creditor_account_id,
			amount, currency, status, created_at, updated_at
		FROM transaction WHERE id = $1
	`
	row := r.pool.QueryRow(ctx, query, id)

	var tx Transaction
	err := row.Scan(
		&tx.ID, &tx.UETR, &tx.DebtorAccount, &tx.CreditorAccount,
		&tx.Amount, &tx.Currency, &tx.Status, &tx.CreatedAt, &tx.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &tx, nil
}

// GetByDateRange retrieves transactions within a date range
func (r *TransactionRepository) GetByDateRange(ctx context.Context, start, end time.Time) ([]*Transaction, error) {
	query := `
		SELECT id, uetr, debtor_account_id, creditor_account_id,
			amount, currency, status, created_at, updated_at
		FROM transaction
		WHERE created_at >= $1 AND created_at < $2
		ORDER BY created_at
	`
	rows, err := r.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*Transaction
	for rows.Next() {
		var tx Transaction
		err := rows.Scan(
			&tx.ID, &tx.UETR, &tx.DebtorAccount, &tx.CreditorAccount,
			&tx.Amount, &tx.Currency, &tx.Status, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, &tx)
	}
	return transactions, nil
}

// GetLegsByTransactionID retrieves transaction legs
func (r *TransactionRepository) GetLegsByTransactionID(ctx context.Context, txID uuid.UUID) ([]*TransactionLeg, error) {
	query := `
		SELECT id, transaction_id, account_id, leg_type,
			amount, currency, balance_before, balance_after, created_at
		FROM transaction_leg
		WHERE transaction_id = $1
		ORDER BY leg_type
	`
	rows, err := r.pool.Query(ctx, query, txID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var legs []*TransactionLeg
	for rows.Next() {
		var leg TransactionLeg
		err := rows.Scan(
			&leg.ID, &leg.TransactionID, &leg.AccountID, &leg.LegType,
			&leg.Amount, &leg.Currency, &leg.BalanceBefore, &leg.BalanceAfter, &leg.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		legs = append(legs, &leg)
	}
	return legs, nil
}

// CalculateAccountBalance calculates account balance from transaction legs
func (r *TransactionRepository) CalculateAccountBalance(ctx context.Context, accountID uuid.UUID, asOf time.Time) (decimal.Decimal, error) {
	query := `
		SELECT COALESCE(
			SUM(CASE WHEN leg_type = 'CREDIT' THEN amount ELSE -amount END),
			0
		) as balance
		FROM transaction_leg
		WHERE account_id = $1 AND created_at <= $2
	`
	row := r.pool.QueryRow(ctx, query, accountID, asOf)

	var balance decimal.Decimal
	if err := row.Scan(&balance); err != nil {
		if err == pgx.ErrNoRows {
			return decimal.Zero, nil
		}
		return decimal.Zero, err
	}
	return balance, nil
}

// GetTransactionsByStatus retrieves transactions by status
func (r *TransactionRepository) GetTransactionsByStatus(ctx context.Context, status string, limit int) ([]*Transaction, error) {
	query := `
		SELECT id, uetr, debtor_account_id, creditor_account_id,
			amount, currency, status, created_at, updated_at
		FROM transaction
		WHERE status = $1
		ORDER BY created_at
		LIMIT $2
	`
	rows, err := r.pool.Query(ctx, query, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*Transaction
	for rows.Next() {
		var tx Transaction
		err := rows.Scan(
			&tx.ID, &tx.UETR, &tx.DebtorAccount, &tx.CreditorAccount,
			&tx.Amount, &tx.Currency, &tx.Status, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, &tx)
	}
	return transactions, nil
}

// GetUnreconciledTransactions retrieves transactions not yet reconciled
func (r *TransactionRepository) GetUnreconciledTransactions(ctx context.Context, limit int) ([]*Transaction, error) {
	query := `
		SELECT t.id, t.uetr, t.debtor_account_id, t.creditor_account_id,
			t.amount, t.currency, t.status, t.created_at, t.updated_at
		FROM transaction t
		LEFT JOIN reconciliation_record rr ON t.id = rr.transaction_id
		WHERE rr.id IS NULL AND t.status IN ('SETTLED', 'COMPLETED')
		ORDER BY t.created_at
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []*Transaction
	for rows.Next() {
		var tx Transaction
		err := rows.Scan(
			&tx.ID, &tx.UETR, &tx.DebtorAccount, &tx.CreditorAccount,
			&tx.Amount, &tx.Currency, &tx.Status, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, &tx)
	}
	return transactions, nil
}

// Package db provides account repository
package db

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// Account represents an account entity
type Account struct {
	ID               uuid.UUID       `json:"id"`
	ExternalID       string          `json:"externalId,omitempty"`
	CustomerID       uuid.UUID       `json:"customerId"`
	AccountNumber    string          `json:"accountNumber"`
	IBAN             string          `json:"iban,omitempty"`
	BIC              string          `json:"bic,omitempty"`
	Currency         string          `json:"currency"`
	AccountType      string          `json:"accountType"`
	Balance          decimal.Decimal `json:"balance"`
	PendingDebits    decimal.Decimal `json:"pendingDebits"`
	PendingCredits   decimal.Decimal `json:"pendingCredits"`
	TransactionLimit decimal.Decimal `json:"transactionLimit"`
	DailyLimit       decimal.Decimal `json:"dailyLimit"`
	DailyUsed        decimal.Decimal `json:"dailyUsed"`
	AllowNegative    bool            `json:"allowNegative"`
	Status           string          `json:"status"`
	KYCStatus        string          `json:"kycStatus"`
	RiskScore        decimal.Decimal `json:"riskScore"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
	Version          int             `json:"version"`
}

// AccountRepository handles account data access
type AccountRepository struct {
	pool *Pool
}

// NewAccountRepository creates a new account repository
func NewAccountRepository(pool *Pool) *AccountRepository {
	return &AccountRepository{pool: pool}
}

// Create creates a new account
func (r *AccountRepository) Create(ctx context.Context, account *Account) error {
	query := `
		INSERT INTO account (
			id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
		) RETURNING created_at, updated_at, version`

	return r.pool.QueryRow(ctx, query,
		account.ID, account.ExternalID, account.CustomerID, account.AccountNumber,
		account.IBAN, account.BIC, account.Currency, account.AccountType,
		account.Balance, account.PendingDebits, account.PendingCredits,
		account.TransactionLimit, account.DailyLimit, account.DailyUsed,
		account.AllowNegative, account.Status, account.KYCStatus,
		account.RiskScore, account.Metadata,
	).Scan(&account.CreatedAt, &account.UpdatedAt, &account.Version)
}

// GetByID retrieves an account by ID
func (r *AccountRepository) GetByID(ctx context.Context, id uuid.UUID) (*Account, error) {
	query := `
		SELECT id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata, created_at, updated_at, version
		FROM account
		WHERE id = $1`

	var account Account
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&account.ID, &account.ExternalID, &account.CustomerID, &account.AccountNumber,
		&account.IBAN, &account.BIC, &account.Currency, &account.AccountType,
		&account.Balance, &account.PendingDebits, &account.PendingCredits,
		&account.TransactionLimit, &account.DailyLimit, &account.DailyUsed,
		&account.AllowNegative, &account.Status, &account.KYCStatus,
		&account.RiskScore, &account.Metadata, &account.CreatedAt, &account.UpdatedAt,
		&account.Version,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &account, err
}

// GetByAccountNumber retrieves an account by account number
func (r *AccountRepository) GetByAccountNumber(ctx context.Context, accountNumber string) (*Account, error) {
	query := `
		SELECT id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata, created_at, updated_at, version
		FROM account
		WHERE account_number = $1`

	var account Account
	err := r.pool.QueryRow(ctx, query, accountNumber).Scan(
		&account.ID, &account.ExternalID, &account.CustomerID, &account.AccountNumber,
		&account.IBAN, &account.BIC, &account.Currency, &account.AccountType,
		&account.Balance, &account.PendingDebits, &account.PendingCredits,
		&account.TransactionLimit, &account.DailyLimit, &account.DailyUsed,
		&account.AllowNegative, &account.Status, &account.KYCStatus,
		&account.RiskScore, &account.Metadata, &account.CreatedAt, &account.UpdatedAt,
		&account.Version,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &account, err
}

// GetByIBAN retrieves an account by IBAN
func (r *AccountRepository) GetByIBAN(ctx context.Context, iban string) (*Account, error) {
	query := `
		SELECT id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata, created_at, updated_at, version
		FROM account
		WHERE iban = $1`

	var account Account
	err := r.pool.QueryRow(ctx, query, iban).Scan(
		&account.ID, &account.ExternalID, &account.CustomerID, &account.AccountNumber,
		&account.IBAN, &account.BIC, &account.Currency, &account.AccountType,
		&account.Balance, &account.PendingDebits, &account.PendingCredits,
		&account.TransactionLimit, &account.DailyLimit, &account.DailyUsed,
		&account.AllowNegative, &account.Status, &account.KYCStatus,
		&account.RiskScore, &account.Metadata, &account.CreatedAt, &account.UpdatedAt,
		&account.Version,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &account, err
}

// GetByCustomerID retrieves all accounts for a customer
func (r *AccountRepository) GetByCustomerID(ctx context.Context, customerID uuid.UUID) ([]*Account, error) {
	query := `
		SELECT id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata, created_at, updated_at, version
		FROM account
		WHERE customer_id = $1
		ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []*Account
	for rows.Next() {
		var account Account
		if err := rows.Scan(
			&account.ID, &account.ExternalID, &account.CustomerID, &account.AccountNumber,
			&account.IBAN, &account.BIC, &account.Currency, &account.AccountType,
			&account.Balance, &account.PendingDebits, &account.PendingCredits,
			&account.TransactionLimit, &account.DailyLimit, &account.DailyUsed,
			&account.AllowNegative, &account.Status, &account.KYCStatus,
			&account.RiskScore, &account.Metadata, &account.CreatedAt, &account.UpdatedAt,
			&account.Version,
		); err != nil {
			return nil, err
		}
		accounts = append(accounts, &account)
	}

	return accounts, nil
}

// Update updates an account
func (r *AccountRepository) Update(ctx context.Context, account *Account) error {
	query := `
		UPDATE account SET
			external_id = $2,
			account_number = $3,
			iban = $4,
			bic = $5,
			account_type = $6,
			transaction_limit = $7,
			daily_limit = $8,
			allow_negative = $9,
			status = $10,
			kyc_status = $11,
			risk_score = $12,
			metadata = $13,
			updated_at = NOW(),
			version = version + 1
		WHERE id = $1 AND version = $14
		RETURNING updated_at, version`

	result := r.pool.QueryRow(ctx, query,
		account.ID, account.ExternalID, account.AccountNumber, account.IBAN,
		account.BIC, account.AccountType, account.TransactionLimit, account.DailyLimit,
		account.AllowNegative, account.Status, account.KYCStatus, account.RiskScore,
		account.Metadata, account.Version,
	)

	if err := result.Scan(&account.UpdatedAt, &account.Version); err != nil {
		if err == pgx.ErrNoRows {
			return ErrConcurrentModification
		}
		return err
	}

	return nil
}

// UpdateBalance updates account balance with optimistic locking
func (r *AccountRepository) UpdateBalance(ctx context.Context, tx pgx.Tx, id uuid.UUID, newBalance decimal.Decimal, version int) error {
	query := `
		UPDATE account SET
			balance = $2,
			updated_at = NOW(),
			version = version + 1
		WHERE id = $1 AND version = $3`

	result, err := tx.Exec(ctx, query, id, newBalance, version)
	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrConcurrentModification
	}

	return nil
}

// UpdateStatus updates account status
func (r *AccountRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	query := `UPDATE account SET status = $2, updated_at = NOW() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, status)
	return err
}

// UpdateKYCStatus updates account KYC status
func (r *AccountRepository) UpdateKYCStatus(ctx context.Context, id uuid.UUID, kycStatus string) error {
	query := `UPDATE account SET kyc_status = $2, updated_at = NOW() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, kycStatus)
	return err
}

// UpdateRiskScore updates account risk score
func (r *AccountRepository) UpdateRiskScore(ctx context.Context, id uuid.UUID, riskScore decimal.Decimal) error {
	query := `UPDATE account SET risk_score = $2, updated_at = NOW() WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, riskScore)
	return err
}

// ResetDailyUsed resets daily usage for all accounts (called at midnight)
func (r *AccountRepository) ResetDailyUsed(ctx context.Context) error {
	query := `UPDATE account SET daily_used = 0, updated_at = NOW() WHERE daily_used > 0`
	_, err := r.pool.Exec(ctx, query)
	return err
}

// GetForUpdate retrieves an account with a row lock
func (r *AccountRepository) GetForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*Account, error) {
	query := `
		SELECT id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata, created_at, updated_at, version
		FROM account
		WHERE id = $1
		FOR UPDATE`

	var account Account
	err := tx.QueryRow(ctx, query, id).Scan(
		&account.ID, &account.ExternalID, &account.CustomerID, &account.AccountNumber,
		&account.IBAN, &account.BIC, &account.Currency, &account.AccountType,
		&account.Balance, &account.PendingDebits, &account.PendingCredits,
		&account.TransactionLimit, &account.DailyLimit, &account.DailyUsed,
		&account.AllowNegative, &account.Status, &account.KYCStatus,
		&account.RiskScore, &account.Metadata, &account.CreatedAt, &account.UpdatedAt,
		&account.Version,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &account, err
}

// GetAccountBalance retrieves the current and available balance
func (r *AccountRepository) GetAccountBalance(ctx context.Context, id uuid.UUID) (*BalanceInfo, error) {
	query := `
		SELECT 
			balance,
			pending_debits,
			pending_credits,
			balance + pending_credits - pending_debits as available_balance,
			currency
		FROM account
		WHERE id = $1`

	var info BalanceInfo
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&info.CurrentBalance,
		&info.PendingDebits,
		&info.PendingCredits,
		&info.AvailableBalance,
		&info.Currency,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &info, err
}

// BalanceInfo holds balance information
type BalanceInfo struct {
	CurrentBalance   decimal.Decimal `json:"currentBalance"`
	AvailableBalance decimal.Decimal `json:"availableBalance"`
	PendingDebits    decimal.Decimal `json:"pendingDebits"`
	PendingCredits   decimal.Decimal `json:"pendingCredits"`
	Currency         string          `json:"currency"`
}

// ListAccounts retrieves a paginated list of accounts
func (r *AccountRepository) ListAccounts(ctx context.Context, limit, offset int, status string) ([]*Account, int, error) {
	var accounts []*Account
	var total int

	// Count query
	countQuery := `SELECT COUNT(*) FROM account WHERE ($1 = '' OR status = $1)`
	if err := r.pool.QueryRow(ctx, countQuery, status).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Data query
	query := `
		SELECT id, external_id, customer_id, account_number, iban, bic,
			currency, account_type, balance, pending_debits, pending_credits,
			transaction_limit, daily_limit, daily_used, allow_negative,
			status, kyc_status, risk_score, metadata, created_at, updated_at, version
		FROM account
		WHERE ($1 = '' OR status = $1)
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := r.pool.Query(ctx, query, status, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var account Account
		if err := rows.Scan(
			&account.ID, &account.ExternalID, &account.CustomerID, &account.AccountNumber,
			&account.IBAN, &account.BIC, &account.Currency, &account.AccountType,
			&account.Balance, &account.PendingDebits, &account.PendingCredits,
			&account.TransactionLimit, &account.DailyLimit, &account.DailyUsed,
			&account.AllowNegative, &account.Status, &account.KYCStatus,
			&account.RiskScore, &account.Metadata, &account.CreatedAt, &account.UpdatedAt,
			&account.Version,
		); err != nil {
			return nil, 0, err
		}
		accounts = append(accounts, &account)
	}

	return accounts, total, nil
}

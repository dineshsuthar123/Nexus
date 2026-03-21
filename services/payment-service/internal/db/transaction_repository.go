// Package db provides database repositories for the Payment Service
package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

// Transaction represents a payment transaction
type Transaction struct {
	ID                   uuid.UUID       `json:"id"`
	UETR                 uuid.UUID       `json:"uetr"`
	MessageID            string          `json:"messageId"`
	InstructionID        string          `json:"instructionId"`
	EndToEndID           string          `json:"endToEndId"`
	TransactionType      string          `json:"transactionType"`
	Amount               decimal.Decimal `json:"amount"`
	Currency             string          `json:"currency"`
	SettlementAmount     decimal.Decimal `json:"settlementAmount"`
	SettlementCurrency   string          `json:"settlementCurrency"`
	ExchangeRate         decimal.Decimal `json:"exchangeRate"`
	FeeAmount            decimal.Decimal `json:"feeAmount"`
	FeeCurrency          string          `json:"feeCurrency"`
	ChargeBearer         string          `json:"chargeBearer"`
	DebtorAccountID      uuid.UUID       `json:"debtorAccountId"`
	CreditorAccountID    uuid.UUID       `json:"creditorAccountId"`
	DebtorName           string          `json:"debtorName"`
	CreditorName         string          `json:"creditorName"`
	Status               string          `json:"status"`
	StatusReason         string          `json:"statusReason"`
	SanctionsStatus      string          `json:"sanctionsStatus"`
	SanctionsScore       decimal.Decimal `json:"sanctionsScore"`
	FraudStatus          string          `json:"fraudStatus"`
	FraudScore           decimal.Decimal `json:"fraudScore"`
	RequestedExecutionDt *time.Time      `json:"requestedExecutionDate"`
	BookingDate          time.Time       `json:"bookingDate"`
	ValueDate            *time.Time      `json:"valueDate"`
	SettlementDate       *time.Time      `json:"settlementDate"`
	RemittanceInfo       json.RawMessage `json:"remittanceInfo"`
	OriginalMessage      json.RawMessage `json:"originalMessage"`
	ExternalRail         string          `json:"externalRail"`
	ExternalReference    string          `json:"externalReference"`
	CreatedAt            time.Time       `json:"createdAt"`
	UpdatedAt            time.Time       `json:"updatedAt"`
	CreatedBy            string          `json:"createdBy"`
}

// TransactionLeg represents a leg of a double-entry transaction
type TransactionLeg struct {
	ID             uuid.UUID       `json:"id"`
	TransactionID  uuid.UUID       `json:"transactionId"`
	AccountID      uuid.UUID       `json:"accountId"`
	LegType        string          `json:"legType"` // DEBIT or CREDIT
	Amount         decimal.Decimal `json:"amount"`
	Currency       string          `json:"currency"`
	BalanceAfter   decimal.Decimal `json:"balanceAfter"`
	Description    string          `json:"description"`
	SequenceNumber int             `json:"sequenceNumber"`
	CreatedAt      time.Time       `json:"createdAt"`
}

// TransactionRepository provides access to transaction data
type TransactionRepository struct {
	pool   *Pool
	logger *zap.Logger
}

// NewTransactionRepository creates a new transaction repository
func NewTransactionRepository(pool *Pool, logger *zap.Logger) *TransactionRepository {
	return &TransactionRepository{
		pool:   pool,
		logger: logger,
	}
}

// Create creates a new transaction within a database transaction
func (r *TransactionRepository) Create(ctx context.Context, tx pgx.Tx, t *Transaction) error {
	query := `
		INSERT INTO transaction (
			id, uetr, message_id, instruction_id, end_to_end_id,
			transaction_type, amount, currency,
			settlement_amount, settlement_currency, exchange_rate,
			fee_amount, fee_currency, charge_bearer,
			debtor_account_id, creditor_account_id,
			debtor_name, creditor_name,
			status, status_reason,
			sanctions_status, sanctions_score,
			fraud_status, fraud_score,
			requested_execution_date, booking_date, value_date,
			remittance_info, original_message,
			external_rail, external_reference, created_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
			$28, $29, $30, $31, $32
		)
	`

	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}

	_, err := tx.Exec(ctx, query,
		t.ID, t.UETR, t.MessageID, t.InstructionID, t.EndToEndID,
		t.TransactionType, t.Amount, t.Currency,
		t.SettlementAmount, t.SettlementCurrency, t.ExchangeRate,
		t.FeeAmount, t.FeeCurrency, t.ChargeBearer,
		t.DebtorAccountID, t.CreditorAccountID,
		t.DebtorName, t.CreditorName,
		t.Status, t.StatusReason,
		t.SanctionsStatus, t.SanctionsScore,
		t.FraudStatus, t.FraudScore,
		t.RequestedExecutionDt, t.BookingDate, t.ValueDate,
		t.RemittanceInfo, t.OriginalMessage,
		t.ExternalRail, t.ExternalReference, t.CreatedBy,
	)
	if err != nil {
		return fmt.Errorf("failed to create transaction: %w", err)
	}

	return nil
}

// CreateLeg creates a transaction leg within a database transaction
func (r *TransactionRepository) CreateLeg(ctx context.Context, tx pgx.Tx, leg *TransactionLeg) error {
	query := `
		INSERT INTO transaction_leg (
			id, transaction_id, account_id, leg_type, amount, currency,
			balance_after, description, sequence_number
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`

	if leg.ID == uuid.Nil {
		leg.ID = uuid.New()
	}

	_, err := tx.Exec(ctx, query,
		leg.ID, leg.TransactionID, leg.AccountID, leg.LegType, leg.Amount, leg.Currency,
		leg.BalanceAfter, leg.Description, leg.SequenceNumber,
	)
	if err != nil {
		return fmt.Errorf("failed to create transaction leg: %w", err)
	}

	return nil
}

// GetByUETR retrieves a transaction by UETR
func (r *TransactionRepository) GetByUETR(ctx context.Context, uetr uuid.UUID) (*Transaction, error) {
	query := `
		SELECT id, uetr, message_id, instruction_id, end_to_end_id,
		       transaction_type, amount, currency,
		       settlement_amount, settlement_currency, exchange_rate,
		       fee_amount, fee_currency, charge_bearer,
		       debtor_account_id, creditor_account_id,
		       debtor_name, creditor_name,
		       status, status_reason,
		       sanctions_status, sanctions_score,
		       fraud_status, fraud_score,
		       requested_execution_date, booking_date, value_date, settlement_date,
		       remittance_info, original_message,
		       external_rail, external_reference,
		       created_at, updated_at, created_by
		FROM transaction
		WHERE uetr = $1
	`

	var t Transaction
	err := r.pool.QueryRow(ctx, query, uetr).Scan(
		&t.ID, &t.UETR, &t.MessageID, &t.InstructionID, &t.EndToEndID,
		&t.TransactionType, &t.Amount, &t.Currency,
		&t.SettlementAmount, &t.SettlementCurrency, &t.ExchangeRate,
		&t.FeeAmount, &t.FeeCurrency, &t.ChargeBearer,
		&t.DebtorAccountID, &t.CreditorAccountID,
		&t.DebtorName, &t.CreditorName,
		&t.Status, &t.StatusReason,
		&t.SanctionsStatus, &t.SanctionsScore,
		&t.FraudStatus, &t.FraudScore,
		&t.RequestedExecutionDt, &t.BookingDate, &t.ValueDate, &t.SettlementDate,
		&t.RemittanceInfo, &t.OriginalMessage,
		&t.ExternalRail, &t.ExternalReference,
		&t.CreatedAt, &t.UpdatedAt, &t.CreatedBy,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get transaction by UETR: %w", err)
	}

	return &t, nil
}

// GetByUETRTx retrieves a transaction by UETR within an existing transaction.
// This eliminates the TOCTOU race present when using pool-level reads.
func (r *TransactionRepository) GetByUETRTx(ctx context.Context, tx pgx.Tx, uetr uuid.UUID) (*Transaction, error) {
	query := `
		SELECT id, uetr, message_id, instruction_id, end_to_end_id,
		       transaction_type, amount, currency,
		       settlement_amount, settlement_currency, exchange_rate,
		       fee_amount, fee_currency, charge_bearer,
		       debtor_account_id, creditor_account_id,
		       debtor_name, creditor_name,
		       status, status_reason,
		       sanctions_status, sanctions_score,
		       fraud_status, fraud_score,
		       requested_execution_date, booking_date, value_date, settlement_date,
		       remittance_info, original_message,
		       external_rail, external_reference,
		       created_at, updated_at, created_by
		FROM transaction
		WHERE uetr = $1
	`

	var t Transaction
	err := tx.QueryRow(ctx, query, uetr).Scan(
		&t.ID, &t.UETR, &t.MessageID, &t.InstructionID, &t.EndToEndID,
		&t.TransactionType, &t.Amount, &t.Currency,
		&t.SettlementAmount, &t.SettlementCurrency, &t.ExchangeRate,
		&t.FeeAmount, &t.FeeCurrency, &t.ChargeBearer,
		&t.DebtorAccountID, &t.CreditorAccountID,
		&t.DebtorName, &t.CreditorName,
		&t.Status, &t.StatusReason,
		&t.SanctionsStatus, &t.SanctionsScore,
		&t.FraudStatus, &t.FraudScore,
		&t.RequestedExecutionDt, &t.BookingDate, &t.ValueDate, &t.SettlementDate,
		&t.RemittanceInfo, &t.OriginalMessage,
		&t.ExternalRail, &t.ExternalReference,
		&t.CreatedAt, &t.UpdatedAt, &t.CreatedBy,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get transaction by UETR: %w", err)
	}

	return &t, nil
}

// GetByID retrieves a transaction by ID
func (r *TransactionRepository) GetByID(ctx context.Context, id uuid.UUID) (*Transaction, error) {
	query := `
		SELECT id, uetr, message_id, instruction_id, end_to_end_id,
		       transaction_type, amount, currency,
		       settlement_amount, settlement_currency, exchange_rate,
		       fee_amount, fee_currency, charge_bearer,
		       debtor_account_id, creditor_account_id,
		       debtor_name, creditor_name,
		       status, status_reason,
		       sanctions_status, sanctions_score,
		       fraud_status, fraud_score,
		       requested_execution_date, booking_date, value_date, settlement_date,
		       remittance_info, original_message,
		       external_rail, external_reference,
		       created_at, updated_at, created_by
		FROM transaction
		WHERE id = $1
	`

	var t Transaction
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&t.ID, &t.UETR, &t.MessageID, &t.InstructionID, &t.EndToEndID,
		&t.TransactionType, &t.Amount, &t.Currency,
		&t.SettlementAmount, &t.SettlementCurrency, &t.ExchangeRate,
		&t.FeeAmount, &t.FeeCurrency, &t.ChargeBearer,
		&t.DebtorAccountID, &t.CreditorAccountID,
		&t.DebtorName, &t.CreditorName,
		&t.Status, &t.StatusReason,
		&t.SanctionsStatus, &t.SanctionsScore,
		&t.FraudStatus, &t.FraudScore,
		&t.RequestedExecutionDt, &t.BookingDate, &t.ValueDate, &t.SettlementDate,
		&t.RemittanceInfo, &t.OriginalMessage,
		&t.ExternalRail, &t.ExternalReference,
		&t.CreatedAt, &t.UpdatedAt, &t.CreatedBy,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	return &t, nil
}

// UpdateStatus updates the transaction status
// validTransitions defines the allowed state machine transitions for transaction status.
var validTransitions = map[string][]string{
	"PENDING":      {"SANCTIONED", "CLEARED", "REJECTED", "CANCELLED"},
	"SANCTIONED":   {"FRAUD_REVIEW", "CLEARED", "REJECTED"},
	"FRAUD_REVIEW": {"CLEARED", "REJECTED"},
	"CLEARED":      {"SETTLED", "RETURNED"},
	"SETTLED":      {"RETURNED"},
	// Terminal states: REJECTED, RETURNED, CANCELLED — no outgoing transitions
}

// ValidateTransition checks whether a status transition is permitted.
func ValidateTransition(from, to string) error {
	allowed, ok := validTransitions[from]
	if !ok {
		return fmt.Errorf("%w: no transitions from %s", ErrInvalidTransition, from)
	}
	for _, s := range allowed {
		if s == to {
			return nil
		}
	}
	return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, from, to)
}

func (r *TransactionRepository) UpdateStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status, reason string) error {
	// Fetch current status and validate transition
	var currentStatus string
	err := tx.QueryRow(ctx, `SELECT status FROM transaction WHERE id = $1`, id).Scan(&currentStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrNotFound
		}
		return fmt.Errorf("failed to read current status: %w", err)
	}
	if err := ValidateTransition(currentStatus, status); err != nil {
		return err
	}

	query := `
		UPDATE transaction
		SET status = $2, status_reason = $3, updated_at = current_timestamp()
		WHERE id = $1
	`

	_, execErr := tx.Exec(ctx, query, id, status, reason)
	if execErr != nil {
		return fmt.Errorf("failed to update transaction status: %w", execErr)
	}

	return nil
}

// UpdateSanctionsStatus updates the sanctions screening result
func (r *TransactionRepository) UpdateSanctionsStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error {
	query := `
		UPDATE transaction
		SET sanctions_status = $2, sanctions_score = $3, updated_at = current_timestamp()
		WHERE id = $1
	`

	_, err := tx.Exec(ctx, query, id, status, score)
	if err != nil {
		return fmt.Errorf("failed to update sanctions status: %w", err)
	}

	return nil
}

// UpdateFraudStatus updates the fraud detection result
func (r *TransactionRepository) UpdateFraudStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error {
	query := `
		UPDATE transaction
		SET fraud_status = $2, fraud_score = $3, updated_at = current_timestamp()
		WHERE id = $1
	`

	_, err := tx.Exec(ctx, query, id, status, score)
	if err != nil {
		return fmt.Errorf("failed to update fraud status: %w", err)
	}

	return nil
}

// GetLegsByTransactionID retrieves all legs for a transaction
func (r *TransactionRepository) GetLegsByTransactionID(ctx context.Context, transactionID uuid.UUID) ([]TransactionLeg, error) {
	query := `
		SELECT id, transaction_id, account_id, leg_type, amount, currency,
		       balance_after, description, sequence_number, created_at
		FROM transaction_leg
		WHERE transaction_id = $1
		ORDER BY sequence_number
	`

	rows, err := r.pool.Query(ctx, query, transactionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query transaction legs: %w", err)
	}
	defer rows.Close()

	var legs []TransactionLeg
	for rows.Next() {
		var leg TransactionLeg
		err := rows.Scan(
			&leg.ID, &leg.TransactionID, &leg.AccountID, &leg.LegType, &leg.Amount, &leg.Currency,
			&leg.BalanceAfter, &leg.Description, &leg.SequenceNumber, &leg.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan transaction leg: %w", err)
		}
		legs = append(legs, leg)
	}

	return legs, nil
}

// ExistsByUETR checks if a transaction with the given UETR exists (idempotency check)
func (r *TransactionRepository) ExistsByUETR(ctx context.Context, uetr uuid.UUID) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM transaction WHERE uetr = $1)`

	var exists bool
	err := r.pool.QueryRow(ctx, query, uetr).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check transaction existence: %w", err)
	}

	return exists, nil
}

// ListByAccountID retrieves transactions for an account with pagination
func (r *TransactionRepository) ListByAccountID(ctx context.Context, accountID uuid.UUID, limit, offset int) ([]Transaction, error) {
	query := `
		SELECT id, uetr, message_id, instruction_id, end_to_end_id,
		       transaction_type, amount, currency,
		       settlement_amount, settlement_currency, exchange_rate,
		       fee_amount, fee_currency, charge_bearer,
		       debtor_account_id, creditor_account_id,
		       debtor_name, creditor_name,
		       status, status_reason,
		       sanctions_status, sanctions_score,
		       fraud_status, fraud_score,
		       requested_execution_date, booking_date, value_date, settlement_date,
		       remittance_info, original_message,
		       external_rail, external_reference,
		       created_at, updated_at, created_by
		FROM transaction
		WHERE debtor_account_id = $1 OR creditor_account_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.pool.Query(ctx, query, accountID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list transactions: %w", err)
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		err := rows.Scan(
			&t.ID, &t.UETR, &t.MessageID, &t.InstructionID, &t.EndToEndID,
			&t.TransactionType, &t.Amount, &t.Currency,
			&t.SettlementAmount, &t.SettlementCurrency, &t.ExchangeRate,
			&t.FeeAmount, &t.FeeCurrency, &t.ChargeBearer,
			&t.DebtorAccountID, &t.CreditorAccountID,
			&t.DebtorName, &t.CreditorName,
			&t.Status, &t.StatusReason,
			&t.SanctionsStatus, &t.SanctionsScore,
			&t.FraudStatus, &t.FraudScore,
			&t.RequestedExecutionDt, &t.BookingDate, &t.ValueDate, &t.SettlementDate,
			&t.RemittanceInfo, &t.OriginalMessage,
			&t.ExternalRail, &t.ExternalReference,
			&t.CreatedAt, &t.UpdatedAt, &t.CreatedBy,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan transaction: %w", err)
		}
		transactions = append(transactions, t)
	}

	return transactions, nil
}

// ListAll retrieves transactions with pagination, used for the payments list view.
func (r *TransactionRepository) ListAll(ctx context.Context, limit, offset int) ([]Transaction, int, error) {
	// Count total
	var total int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM "transaction"`).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count transactions: %w", err)
	}

	query := `
		SELECT id, uetr, message_id, instruction_id, end_to_end_id,
		       transaction_type, amount, currency,
		       settlement_amount, settlement_currency, exchange_rate,
		       fee_amount, fee_currency, charge_bearer,
		       debtor_account_id, creditor_account_id,
		       debtor_name, creditor_name,
		       status, status_reason,
		       sanctions_status, sanctions_score,
		       fraud_status, fraud_score,
		       requested_execution_date, booking_date, value_date, settlement_date,
		       remittance_info, original_message,
		       external_rail, external_reference,
		       created_at, updated_at, created_by
		FROM "transaction"
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list transactions: %w", err)
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var t Transaction
		err := rows.Scan(
			&t.ID, &t.UETR, &t.MessageID, &t.InstructionID, &t.EndToEndID,
			&t.TransactionType, &t.Amount, &t.Currency,
			&t.SettlementAmount, &t.SettlementCurrency, &t.ExchangeRate,
			&t.FeeAmount, &t.FeeCurrency, &t.ChargeBearer,
			&t.DebtorAccountID, &t.CreditorAccountID,
			&t.DebtorName, &t.CreditorName,
			&t.Status, &t.StatusReason,
			&t.SanctionsStatus, &t.SanctionsScore,
			&t.FraudStatus, &t.FraudScore,
			&t.RequestedExecutionDt, &t.BookingDate, &t.ValueDate, &t.SettlementDate,
			&t.RemittanceInfo, &t.OriginalMessage,
			&t.ExternalRail, &t.ExternalReference,
			&t.CreatedAt, &t.UpdatedAt, &t.CreatedBy,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan transaction: %w", err)
		}
		transactions = append(transactions, t)
	}

	return transactions, total, nil
}

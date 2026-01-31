// Package service provides the core payment processing logic
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/kafka"
	"github.com/nexus-rtp/payment-service/internal/observability"
	"github.com/nexus-rtp/payment-service/internal/sanctions"
	"github.com/shopspring/decimal"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

// PaymentService handles payment processing
type PaymentService struct {
	logger          *zap.Logger
	pool            *db.Pool
	accountRepo     *db.AccountRepository
	transactionRepo *db.TransactionRepository
	outboxRepo      *db.OutboxRepository
	sanctionsClient *sanctions.Client
	kafkaProducer   *kafka.Producer
}

// NewPaymentService creates a new payment service
func NewPaymentService(
	logger *zap.Logger,
	pool *db.Pool,
	accountRepo *db.AccountRepository,
	transactionRepo *db.TransactionRepository,
	outboxRepo *db.OutboxRepository,
	sanctionsClient *sanctions.Client,
	kafkaProducer *kafka.Producer,
) *PaymentService {
	return &PaymentService{
		logger:          logger,
		pool:            pool,
		accountRepo:     accountRepo,
		transactionRepo: transactionRepo,
		outboxRepo:      outboxRepo,
		sanctionsClient: sanctionsClient,
		kafkaProducer:   kafkaProducer,
	}
}

// CreatePaymentRequest represents a payment creation request
type CreatePaymentRequest struct {
	MessageID            string          `json:"messageId" binding:"required,max=35"`
	CreationDateTime     time.Time       `json:"creationDateTime" binding:"required"`
	InstructionID        string          `json:"instructionId,omitempty"`
	EndToEndID           string          `json:"endToEndId" binding:"required,max=35"`
	UETR                 string          `json:"uetr" binding:"required,uuid4"`
	Amount               decimal.Decimal `json:"amount" binding:"required"`
	Currency             string          `json:"currency" binding:"required,len=3"`
	ChargeBearer         string          `json:"chargeBearer,omitempty"`
	DebtorAccountID      string          `json:"debtorAccountId" binding:"required,uuid4"`
	CreditorAccountID    string          `json:"creditorAccountId" binding:"required,uuid4"`
	DebtorName           string          `json:"debtorName" binding:"required,max=140"`
	CreditorName         string          `json:"creditorName" binding:"required,max=140"`
	DebtorCountry        string          `json:"debtorCountry,omitempty"`
	CreditorCountry      string          `json:"creditorCountry,omitempty"`
	RemittanceInfo       json.RawMessage `json:"remittanceInfo,omitempty"`
	RequestedExecutionDt *time.Time      `json:"requestedExecutionDate,omitempty"`
	ExternalRail         string          `json:"externalRail,omitempty"`
}

// CreatePaymentResponse represents a payment creation response
type CreatePaymentResponse struct {
	TransactionID   string    `json:"transactionId"`
	UETR            string    `json:"uetr"`
	Status          string    `json:"status"`
	StatusReason    string    `json:"statusReason,omitempty"`
	SanctionsStatus string    `json:"sanctionsStatus"`
	CreatedAt       time.Time `json:"createdAt"`
	ProcessingTime  int64     `json:"processingTimeMs"`
}

// PaymentStatusResponse represents a payment status response (pacs.002)
type PaymentStatusResponse struct {
	TransactionID    string     `json:"transactionId"`
	UETR             string     `json:"uetr"`
	MessageID        string     `json:"messageId"`
	Status           string     `json:"status"`
	StatusReason     string     `json:"statusReason,omitempty"`
	SanctionsStatus  string     `json:"sanctionsStatus"`
	FraudStatus      string     `json:"fraudStatus"`
	Amount           string     `json:"amount"`
	Currency         string     `json:"currency"`
	DebtorName       string     `json:"debtorName"`
	CreditorName     string     `json:"creditorName"`
	BookingDate      string     `json:"bookingDate"`
	ValueDate        string     `json:"valueDate,omitempty"`
	SettlementDate   string     `json:"settlementDate,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

// CreatePayment processes a new payment (pacs.008 flow)
func (s *PaymentService) CreatePayment(ctx context.Context, req *CreatePaymentRequest) (*CreatePaymentResponse, error) {
	start := time.Now()

	// Start tracing span
	ctx, span := observability.StartSpan(ctx, "PaymentService.CreatePayment",
		trace.WithAttributes(
			attribute.String("uetr", req.UETR),
			attribute.String("currency", req.Currency),
			attribute.String("amount", req.Amount.String()),
		),
	)
	defer span.End()

	// Parse UUIDs
	uetr, err := uuid.Parse(req.UETR)
	if err != nil {
		return nil, fmt.Errorf("invalid UETR: %w", err)
	}

	debtorAccountID, err := uuid.Parse(req.DebtorAccountID)
	if err != nil {
		return nil, fmt.Errorf("invalid debtor account ID: %w", err)
	}

	creditorAccountID, err := uuid.Parse(req.CreditorAccountID)
	if err != nil {
		return nil, fmt.Errorf("invalid creditor account ID: %w", err)
	}

	// =========================================================================
	// Stage 1: Idempotency Check (< 10ms)
	// =========================================================================
	exists, err := s.transactionRepo.ExistsByUETR(ctx, uetr)
	if err != nil {
		return nil, fmt.Errorf("failed to check idempotency: %w", err)
	}
	if exists {
		// Return existing transaction
		existing, err := s.transactionRepo.GetByUETR(ctx, uetr)
		if err != nil {
			return nil, fmt.Errorf("failed to get existing transaction: %w", err)
		}
		return &CreatePaymentResponse{
			TransactionID:   existing.ID.String(),
			UETR:            existing.UETR.String(),
			Status:          existing.Status,
			StatusReason:    existing.StatusReason,
			SanctionsStatus: existing.SanctionsStatus,
			CreatedAt:       existing.CreatedAt,
			ProcessingTime:  time.Since(start).Milliseconds(),
		}, nil
	}

	// =========================================================================
	// Stage 2: Sanctions Screening (Budget: 100ms)
	// =========================================================================
	sanctionsStart := time.Now()
	debtorResult, creditorResult, err := s.sanctionsClient.ScreenParties(
		ctx,
		req.DebtorName, req.CreditorName,
		req.DebtorCountry, req.CreditorCountry,
	)
	sanctionsDuration := time.Since(sanctionsStart)
	observability.RecordSanctionsMetrics("completed", sanctionsDuration)

	if err != nil {
		s.logger.Error("Sanctions screening failed", zap.Error(err), zap.String("uetr", req.UETR))
		// Don't fail the payment, put it in review
		debtorResult = &sanctions.ScreeningResult{RequiresReview: true}
		creditorResult = &sanctions.ScreeningResult{RequiresReview: true}
	}

	// Determine overall sanctions status
	sanctionsStatus := sanctions.StatusClear
	var sanctionsScore decimal.Decimal
	if debtorResult.IsSanctioned || creditorResult.IsSanctioned {
		sanctionsStatus = sanctions.StatusBlocked
		sanctionsScore = decimal.NewFromFloat(1.0)
	} else if debtorResult.RequiresReview || creditorResult.RequiresReview {
		sanctionsStatus = sanctions.StatusReview
		sanctionsScore = decimal.NewFromFloat(max(debtorResult.MatchScore, creditorResult.MatchScore))
	}

	span.SetAttributes(attribute.String("sanctions_status", sanctionsStatus))

	// If blocked by sanctions, reject immediately
	if sanctionsStatus == sanctions.StatusBlocked {
		return &CreatePaymentResponse{
			UETR:            req.UETR,
			Status:          "REJECTED",
			StatusReason:    "SANCTIONS_BLOCKED",
			SanctionsStatus: sanctionsStatus,
			CreatedAt:       time.Now(),
			ProcessingTime:  time.Since(start).Milliseconds(),
		}, nil
	}

	// =========================================================================
	// Stage 3: Ledger Reservation (Budget: 250ms) - Atomic Transaction
	// =========================================================================
	var transactionID uuid.UUID
	var finalStatus string = "PENDING"
	var statusReason string

	ledgerStart := time.Now()
	
	// Use retry transaction for CockroachDB optimistic locking
	err = s.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
		// Get and lock debtor account
		debtorAccount, err := s.accountRepo.GetForUpdate(ctx, tx, debtorAccountID)
		if err != nil {
			if err == db.ErrNotFound {
				return fmt.Errorf("debtor account not found")
			}
			return fmt.Errorf("failed to get debtor account: %w", err)
		}

		// Validate debtor account
		if debtorAccount.Status != "ACTIVE" {
			return fmt.Errorf("debtor account is not active")
		}
		if debtorAccount.Currency != req.Currency {
			return fmt.Errorf("currency mismatch: account is %s, payment is %s", debtorAccount.Currency, req.Currency)
		}

		// Check available balance
		availableBalance := debtorAccount.Balance.Add(debtorAccount.PendingCredits).Sub(debtorAccount.PendingDebits)
		if availableBalance.LessThan(req.Amount) && !debtorAccount.AllowNegative {
			return db.ErrInsufficientFunds
		}

		// Check transaction limit
		if req.Amount.GreaterThan(debtorAccount.TransactionLimit) {
			return fmt.Errorf("amount exceeds transaction limit")
		}

		// Get creditor account (no lock needed for credit)
		creditorAccount, err := s.accountRepo.GetByID(ctx, creditorAccountID)
		if err != nil {
			if err == db.ErrNotFound {
				return fmt.Errorf("creditor account not found")
			}
			return fmt.Errorf("failed to get creditor account: %w", err)
		}

		// Validate creditor account
		if creditorAccount.Status != "ACTIVE" {
			return fmt.Errorf("creditor account is not active")
		}

		// Reserve funds on debtor account
		if err := s.accountRepo.ReserveFunds(ctx, tx, debtorAccountID, req.Amount); err != nil {
			return fmt.Errorf("failed to reserve funds: %w", err)
		}

		// Determine initial status based on sanctions
		initialStatus := "PENDING"
		if sanctionsStatus == sanctions.StatusReview {
			initialStatus = "SANCTIONED" // Under sanctions review
			statusReason = "Pending sanctions review"
		}

		// Create transaction record
		transactionID = uuid.New()
		transaction := &db.Transaction{
			ID:                transactionID,
			UETR:              uetr,
			MessageID:         req.MessageID,
			InstructionID:     req.InstructionID,
			EndToEndID:        req.EndToEndID,
			TransactionType:   "CREDIT_TRANSFER",
			Amount:            req.Amount,
			Currency:          req.Currency,
			ChargeBearer:      req.ChargeBearer,
			DebtorAccountID:   debtorAccountID,
			CreditorAccountID: creditorAccountID,
			DebtorName:        req.DebtorName,
			CreditorName:      req.CreditorName,
			Status:            initialStatus,
			StatusReason:      statusReason,
			SanctionsStatus:   sanctionsStatus,
			SanctionsScore:    sanctionsScore,
			FraudStatus:       "PENDING",
			BookingDate:       time.Now(),
			RemittanceInfo:    req.RemittanceInfo,
			ExternalRail:      req.ExternalRail,
		}

		if err := s.transactionRepo.Create(ctx, tx, transaction); err != nil {
			return fmt.Errorf("failed to create transaction: %w", err)
		}

		// Create outbox event for downstream processing
		eventPayload, _ := json.Marshal(map[string]interface{}{
			"transactionId":   transactionID.String(),
			"uetr":            uetr.String(),
			"amount":          req.Amount.String(),
			"currency":        req.Currency,
			"debtorName":      req.DebtorName,
			"creditorName":    req.CreditorName,
			"sanctionsStatus": sanctionsStatus,
		})

		outboxEvent := &db.OutboxEvent{
			AggregateType: "transaction",
			AggregateID:   transactionID,
			EventType:     db.EventPaymentInitiated,
			Payload:       eventPayload,
			Topic:         db.TopicPaymentsInitiated,
			PartitionKey:  debtorAccountID.String(), // Partition by account for ordering
		}

		if err := s.outboxRepo.Insert(ctx, tx, outboxEvent); err != nil {
			return fmt.Errorf("failed to insert outbox event: %w", err)
		}

		finalStatus = initialStatus
		return nil
	})

	ledgerDuration := time.Since(ledgerStart)
	observability.PaymentLatency.WithLabelValues("ledger_reservation").Observe(ledgerDuration.Seconds())

	if err != nil {
		span.SetAttributes(attribute.String("error", err.Error()))
		s.logger.Error("Payment creation failed",
			zap.Error(err),
			zap.String("uetr", req.UETR),
		)

		// Determine appropriate error response
		if err == db.ErrInsufficientFunds {
			return &CreatePaymentResponse{
				UETR:           req.UETR,
				Status:         "REJECTED",
				StatusReason:   "INSUFFICIENT_FUNDS",
				CreatedAt:      time.Now(),
				ProcessingTime: time.Since(start).Milliseconds(),
			}, nil
		}

		return nil, err
	}

	// =========================================================================
	// Stage 4: Record Metrics and Return
	// =========================================================================
	totalDuration := time.Since(start)
	amountFloat, _ := req.Amount.Float64()
	observability.RecordPaymentMetrics("total", totalDuration, finalStatus, req.Currency, amountFloat)

	s.logger.Info("Payment created successfully",
		zap.String("transactionId", transactionID.String()),
		zap.String("uetr", req.UETR),
		zap.String("status", finalStatus),
		zap.Duration("processingTime", totalDuration),
	)

	return &CreatePaymentResponse{
		TransactionID:   transactionID.String(),
		UETR:            req.UETR,
		Status:          finalStatus,
		StatusReason:    statusReason,
		SanctionsStatus: sanctionsStatus,
		CreatedAt:       time.Now(),
		ProcessingTime:  totalDuration.Milliseconds(),
	}, nil
}

// GetPaymentStatus retrieves the status of a payment by UETR
func (s *PaymentService) GetPaymentStatus(ctx context.Context, uetrStr string) (*PaymentStatusResponse, error) {
	ctx, span := observability.StartSpan(ctx, "PaymentService.GetPaymentStatus")
	defer span.End()

	uetr, err := uuid.Parse(uetrStr)
	if err != nil {
		return nil, fmt.Errorf("invalid UETR: %w", err)
	}

	transaction, err := s.transactionRepo.GetByUETR(ctx, uetr)
	if err != nil {
		if err == db.ErrNotFound {
			return nil, fmt.Errorf("transaction not found")
		}
		return nil, fmt.Errorf("failed to get transaction: %w", err)
	}

	response := &PaymentStatusResponse{
		TransactionID:   transaction.ID.String(),
		UETR:            transaction.UETR.String(),
		MessageID:       transaction.MessageID,
		Status:          transaction.Status,
		StatusReason:    transaction.StatusReason,
		SanctionsStatus: transaction.SanctionsStatus,
		FraudStatus:     transaction.FraudStatus,
		Amount:          transaction.Amount.String(),
		Currency:        transaction.Currency,
		DebtorName:      transaction.DebtorName,
		CreditorName:    transaction.CreditorName,
		BookingDate:     transaction.BookingDate.Format("2006-01-02"),
		CreatedAt:       transaction.CreatedAt,
		UpdatedAt:       transaction.UpdatedAt,
	}

	if transaction.ValueDate != nil {
		response.ValueDate = transaction.ValueDate.Format("2006-01-02")
	}
	if transaction.SettlementDate != nil {
		response.SettlementDate = transaction.SettlementDate.Format("2006-01-02")
	}

	return response, nil
}

// SettlePayment settles a pending payment
func (s *PaymentService) SettlePayment(ctx context.Context, uetrStr string) error {
	ctx, span := observability.StartSpan(ctx, "PaymentService.SettlePayment")
	defer span.End()

	uetr, err := uuid.Parse(uetrStr)
	if err != nil {
		return fmt.Errorf("invalid UETR: %w", err)
	}

	return s.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
		// Get transaction
		transaction, err := s.transactionRepo.GetByUETR(ctx, uetr)
		if err != nil {
			return fmt.Errorf("failed to get transaction: %w", err)
		}

		// Validate status
		if transaction.Status != "CLEARED" && transaction.Status != "PENDING" {
			return fmt.Errorf("transaction cannot be settled in status: %s", transaction.Status)
		}

		// Perform double-entry bookkeeping
		// Debit the debtor
		debtorBalanceAfter, err := s.accountRepo.DebitAccount(ctx, tx, transaction.DebtorAccountID, transaction.Amount)
		if err != nil {
			return fmt.Errorf("failed to debit debtor: %w", err)
		}

		// Credit the creditor
		creditorBalanceAfter, err := s.accountRepo.CreditAccount(ctx, tx, transaction.CreditorAccountID, transaction.Amount)
		if err != nil {
			return fmt.Errorf("failed to credit creditor: %w", err)
		}

		// Create transaction legs
		debitLeg := &db.TransactionLeg{
			TransactionID:  transaction.ID,
			AccountID:      transaction.DebtorAccountID,
			LegType:        "DEBIT",
			Amount:         transaction.Amount,
			Currency:       transaction.Currency,
			BalanceAfter:   debtorBalanceAfter,
			Description:    fmt.Sprintf("Payment to %s", transaction.CreditorName),
			SequenceNumber: 1,
		}
		if err := s.transactionRepo.CreateLeg(ctx, tx, debitLeg); err != nil {
			return fmt.Errorf("failed to create debit leg: %w", err)
		}

		creditLeg := &db.TransactionLeg{
			TransactionID:  transaction.ID,
			AccountID:      transaction.CreditorAccountID,
			LegType:        "CREDIT",
			Amount:         transaction.Amount,
			Currency:       transaction.Currency,
			BalanceAfter:   creditorBalanceAfter,
			Description:    fmt.Sprintf("Payment from %s", transaction.DebtorName),
			SequenceNumber: 2,
		}
		if err := s.transactionRepo.CreateLeg(ctx, tx, creditLeg); err != nil {
			return fmt.Errorf("failed to create credit leg: %w", err)
		}

		// Update transaction status
		if err := s.transactionRepo.UpdateStatus(ctx, tx, transaction.ID, "SETTLED", ""); err != nil {
			return fmt.Errorf("failed to update transaction status: %w", err)
		}

		// Create outbox event
		eventPayload, _ := json.Marshal(map[string]interface{}{
			"transactionId": transaction.ID.String(),
			"uetr":          transaction.UETR.String(),
			"status":        "SETTLED",
		})

		outboxEvent := &db.OutboxEvent{
			AggregateType: "transaction",
			AggregateID:   transaction.ID,
			EventType:     db.EventPaymentSettled,
			Payload:       eventPayload,
			Topic:         db.TopicPaymentsCompleted,
			PartitionKey:  transaction.DebtorAccountID.String(),
		}

		return s.outboxRepo.Insert(ctx, tx, outboxEvent)
	})
}

// Helper functions
func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

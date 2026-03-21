// Package service provides the core payment processing logic
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nexus-rtp/payment-service/internal/db"
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
	pool            TxManager
	accountRepo     AccountStore
	shardRepo       ShardStore
	transactionRepo TransactionStore
	outboxRepo      OutboxStore
	sanctionsClient SanctionsScreener
	kafkaProducer   EventPublisher
}

// NewPaymentService creates a new payment service
func NewPaymentService(
	logger *zap.Logger,
	pool TxManager,
	accountRepo AccountStore,
	shardRepo ShardStore,
	transactionRepo TransactionStore,
	outboxRepo OutboxStore,
	sanctionsClient SanctionsScreener,
	kafkaProducer EventPublisher,
) *PaymentService {
	return &PaymentService{
		logger:          logger,
		pool:            pool,
		accountRepo:     accountRepo,
		shardRepo:       shardRepo,
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
	TransactionID     string    `json:"transactionId"`
	UETR              string    `json:"uetr"`
	MessageID         string    `json:"messageId"`
	Status            string    `json:"status"`
	StatusReason      string    `json:"statusReason,omitempty"`
	SanctionsStatus   string    `json:"sanctionsStatus"`
	FraudStatus       string    `json:"fraudStatus"`
	Amount            string    `json:"amount"`
	Currency          string    `json:"currency"`
	DebtorName        string    `json:"debtorName"`
	CreditorName      string    `json:"creditorName"`
	DebtorAccountId   string    `json:"debtorAccountId,omitempty"`
	CreditorAccountId string    `json:"creditorAccountId,omitempty"`
	BookingDate       string    `json:"bookingDate"`
	ValueDate         string    `json:"valueDate,omitempty"`
	SettlementDate    string    `json:"settlementDate,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
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
	err = s.pool.RetryTx(ctx, 5, func(tx pgx.Tx) error {
		// Sharded fund reservation: debits a single shard row instead of the
		// main account row, reducing write contention from N-on-1 to N/K-on-1.
		// Validates account status, currency, and limit via read-only account lookup.
		if err := s.shardRepo.ReserveFundsShard(ctx, tx, debtorAccountID, req.Amount, req.Currency); err != nil {
			if err == db.ErrInsufficientFunds || err == db.ErrNotFound || err == db.ErrAccountInactive || err == db.ErrCurrencyMismatch || err == db.ErrTransactionLimitExceeded || err == db.ErrShardsNotInitialized {
				return err
			}
			return fmt.Errorf("failed to reserve funds: %w", err)
		}

		// Get creditor account (read-only, no lock needed)
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

		// Double-entry ledger: record debit leg (debtor) and credit leg (creditor)
		debitLeg := &db.TransactionLeg{
			TransactionID:  transactionID,
			AccountID:      debtorAccountID,
			LegType:        "DEBIT",
			Amount:         req.Amount,
			Currency:       req.Currency,
			Description:    fmt.Sprintf("Debit for UETR %s", uetr),
			SequenceNumber: 1,
		}
		if err := s.transactionRepo.CreateLeg(ctx, tx, debitLeg); err != nil {
			return fmt.Errorf("failed to create debit leg: %w", err)
		}

		creditLeg := &db.TransactionLeg{
			TransactionID:  transactionID,
			AccountID:      creditorAccountID,
			LegType:        "CREDIT",
			Amount:         req.Amount,
			Currency:       req.Currency,
			Description:    fmt.Sprintf("Credit for UETR %s", uetr),
			SequenceNumber: 2,
		}
		if err := s.transactionRepo.CreateLeg(ctx, tx, creditLeg); err != nil {
			return fmt.Errorf("failed to create credit leg: %w", err)
		}

		// Create outbox event for downstream processing
		eventPayload, err := json.Marshal(map[string]interface{}{
			"transactionId":   transactionID.String(),
			"uetr":            uetr.String(),
			"amount":          req.Amount.String(),
			"currency":        req.Currency,
			"debtorName":      req.DebtorName,
			"creditorName":    req.CreditorName,
			"sanctionsStatus": sanctionsStatus,
		})
		if err != nil {
			return fmt.Errorf("failed to marshal outbox event payload: %w", err)
		}

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
		if err == db.ErrAccountInactive || err == db.ErrCurrencyMismatch || err == db.ErrTransactionLimitExceeded || err == db.ErrShardsNotInitialized {
			return &CreatePaymentResponse{
				UETR:           req.UETR,
				Status:         "REJECTED",
				StatusReason:   err.Error(),
				CreatedAt:      time.Now(),
				ProcessingTime: time.Since(start).Milliseconds(),
			}, nil
		}

		// UETR duplicate: if Redis idempotency failed open and two concurrent
		// requests created the same UETR, the DB UNIQUE constraint catches it.
		// Return the existing transaction instead of a 500 error.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "uetr") {
			existing, lookupErr := s.transactionRepo.GetByUETR(ctx, uetr)
			if lookupErr == nil {
				s.logger.Warn("UETR duplicate detected, returning existing transaction",
					zap.String("uetr", req.UETR),
					zap.String("existingTxId", existing.ID.String()),
				)
				return &CreatePaymentResponse{
					TransactionID:   existing.ID.String(),
					UETR:            req.UETR,
					Status:          existing.Status,
					StatusReason:    existing.StatusReason,
					SanctionsStatus: existing.SanctionsStatus,
					CreatedAt:       existing.CreatedAt,
					ProcessingTime:  time.Since(start).Milliseconds(),
				}, nil
			}
			s.logger.Error("UETR duplicate detected but lookup failed",
				zap.Error(lookupErr),
				zap.String("uetr", req.UETR),
			)
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

	// Async: check if debtor shards need rebalancing (non-blocking)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Error("shard rebalance panic", zap.Any("panic", r), zap.String("account_id", debtorAccountID.String()))
			}
		}()
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		needs, err := s.shardRepo.NeedsRebalance(bgCtx, debtorAccountID)
		if err != nil {
			s.logger.Warn("shard rebalance check failed", zap.Error(err))
			return
		}
		if needs {
			if err := s.shardRepo.Rebalance(bgCtx, debtorAccountID); err != nil {
				s.logger.Warn("shard rebalance failed", zap.Error(err))
			}
		}
	}()

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

// ListPaymentsPagination matches the frontend PaginatedResponse.pagination shape
type ListPaymentsPagination struct {
	Page        int  `json:"page"`
	PageSize    int  `json:"pageSize"`
	TotalItems  int  `json:"totalItems"`
	TotalPages  int  `json:"totalPages"`
	HasNext     bool `json:"hasNext"`
	HasPrevious bool `json:"hasPrevious"`
}

// ListPaymentsResponse contains paginated payment data matching frontend PaginatedResponse<T>
type ListPaymentsResponse struct {
	Data       []PaymentStatusResponse `json:"data"`
	Pagination ListPaymentsPagination  `json:"pagination"`
}

// ListPayments returns a paginated list of payments
func (s *PaymentService) ListPayments(ctx context.Context, page, pageSize int) (*ListPaymentsResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	transactions, total, err := s.transactionRepo.ListAll(ctx, pageSize, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to list payments: %w", err)
	}

	items := make([]PaymentStatusResponse, 0, len(transactions))
	for _, t := range transactions {
		valueDate := ""
		if t.ValueDate != nil {
			valueDate = t.ValueDate.Format("2006-01-02")
		}
		settlementDate := ""
		if t.SettlementDate != nil {
			settlementDate = t.SettlementDate.Format("2006-01-02")
		}
		items = append(items, PaymentStatusResponse{
			TransactionID:     t.ID.String(),
			UETR:              t.UETR.String(),
			MessageID:         t.MessageID,
			Status:            string(t.Status),
			StatusReason:      t.StatusReason,
			SanctionsStatus:   t.SanctionsStatus,
			FraudStatus:       t.FraudStatus,
			Amount:            t.Amount.String(),
			Currency:          t.Currency,
			DebtorName:        t.DebtorName,
			CreditorName:      t.CreditorName,
			DebtorAccountId:   t.DebtorAccountID.String(),
			CreditorAccountId: t.CreditorAccountID.String(),
			BookingDate:       t.BookingDate.Format("2006-01-02"),
			ValueDate:         valueDate,
			SettlementDate:    settlementDate,
			CreatedAt:         t.CreatedAt,
			UpdatedAt:         t.UpdatedAt,
		})
	}

	totalPages := total / pageSize
	if total%pageSize > 0 {
		totalPages++
	}

	return &ListPaymentsResponse{
		Data: items,
		Pagination: ListPaymentsPagination{
			Page:        page,
			PageSize:    pageSize,
			TotalItems:  total,
			TotalPages:  totalPages,
			HasNext:     page < totalPages,
			HasPrevious: page > 1,
		},
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
		TransactionID:     transaction.ID.String(),
		UETR:              transaction.UETR.String(),
		MessageID:         transaction.MessageID,
		Status:            transaction.Status,
		StatusReason:      transaction.StatusReason,
		SanctionsStatus:   transaction.SanctionsStatus,
		FraudStatus:       transaction.FraudStatus,
		Amount:            transaction.Amount.String(),
		Currency:          transaction.Currency,
		DebtorName:        transaction.DebtorName,
		CreditorName:      transaction.CreditorName,
		DebtorAccountId:   transaction.DebtorAccountID.String(),
		CreditorAccountId: transaction.CreditorAccountID.String(),
		BookingDate:       transaction.BookingDate.Format("2006-01-02"),
		CreatedAt:         transaction.CreatedAt,
		UpdatedAt:         transaction.UpdatedAt,
	}

	if transaction.ValueDate != nil {
		response.ValueDate = transaction.ValueDate.Format("2006-01-02")
	}
	if transaction.SettlementDate != nil {
		response.SettlementDate = transaction.SettlementDate.Format("2006-01-02")
	}

	return response, nil
}

// SettlePayment settles a cleared payment by crediting the creditor's shards.
// The debtor shard was already debited in CreatePayment; no further debtor
// balance operations are needed. Legs were already created in CreatePayment.
func (s *PaymentService) SettlePayment(ctx context.Context, uetrStr string) error {
	ctx, span := observability.StartSpan(ctx, "PaymentService.SettlePayment")
	defer span.End()

	uetr, err := uuid.Parse(uetrStr)
	if err != nil {
		return fmt.Errorf("invalid UETR: %w", err)
	}

	return s.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
		// Read inside the TX to eliminate TOCTOU race
		transaction, err := s.transactionRepo.GetByUETRTx(ctx, tx, uetr)
		if err != nil {
			return fmt.Errorf("failed to get transaction: %w", err)
		}

		// Enforce state machine: only CLEARED → SETTLED is valid
		if err := db.ValidateTransition(transaction.Status, "SETTLED"); err != nil {
			return err
		}

		// Credit the creditor's shards (debtor was already debited in CreatePayment)
		if err := s.shardRepo.CreditShard(ctx, tx, transaction.CreditorAccountID, transaction.Amount); err != nil {
			return fmt.Errorf("failed to credit creditor shards: %w", err)
		}

		// Update transaction status
		if err := s.transactionRepo.UpdateStatus(ctx, tx, transaction.ID, "SETTLED", ""); err != nil {
			return fmt.Errorf("failed to update transaction status: %w", err)
		}

		// Create outbox event
		eventPayload, err := json.Marshal(map[string]interface{}{
			"transactionId": transaction.ID.String(),
			"uetr":          transaction.UETR.String(),
			"status":        "SETTLED",
		})
		if err != nil {
			return fmt.Errorf("failed to marshal outbox event payload: %w", err)
		}

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

// ReturnPaymentResponse represents the result of a payment return.
type ReturnPaymentResponse struct {
	UETR        string    `json:"uetr"`
	ReturnID    string    `json:"returnId"`
	Status      string    `json:"status"`
	ReasonCode  string    `json:"reasonCode"`
	InitiatedAt time.Time `json:"initiatedAt"`
}

// ReturnPayment reverses a settled payment (pacs.004 flow).
// It reverses shard operations: credits debtor shards, debits creditor shards.
func (s *PaymentService) ReturnPayment(ctx context.Context, uetrStr string, reasonCode string) (*ReturnPaymentResponse, error) {
	ctx, span := observability.StartSpan(ctx, "PaymentService.ReturnPayment")
	defer span.End()

	uetr, err := uuid.Parse(uetrStr)
	if err != nil {
		return nil, fmt.Errorf("invalid UETR: %w", err)
	}

	var resp *ReturnPaymentResponse

	err = s.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
		// Read inside the TX to eliminate TOCTOU race
		transaction, err := s.transactionRepo.GetByUETRTx(ctx, tx, uetr)
		if err != nil {
			return fmt.Errorf("transaction not found: %w", err)
		}

		// Enforce state machine: SETTLED → RETURNED or CLEARED → RETURNED
		if err := db.ValidateTransition(transaction.Status, "RETURNED"); err != nil {
			return err
		}

		// Reverse shard operations:
		// 1. Credit debtor shards (reverses the debit from CreatePayment)
		if err := s.shardRepo.CreditShard(ctx, tx, transaction.DebtorAccountID, transaction.Amount); err != nil {
			return fmt.Errorf("failed to reverse debtor shard debit: %w", err)
		}

		// 2. Debit creditor shards (reverses the credit from SettlePayment)
		if err := s.shardRepo.DebitShard(ctx, tx, transaction.CreditorAccountID, transaction.Amount); err != nil {
			return fmt.Errorf("failed to reverse creditor shard credit: %w", err)
		}

		// Create return legs (seq 3, 4 — genuinely new legs for the reversal)
		debitLeg := &db.TransactionLeg{
			TransactionID:  transaction.ID,
			AccountID:      transaction.CreditorAccountID,
			LegType:        "DEBIT",
			Amount:         transaction.Amount,
			Currency:       transaction.Currency,
			Description:    fmt.Sprintf("Return of payment to %s (%s)", transaction.DebtorName, reasonCode),
			SequenceNumber: 3,
		}
		if err := s.transactionRepo.CreateLeg(ctx, tx, debitLeg); err != nil {
			return fmt.Errorf("failed to create return debit leg: %w", err)
		}

		creditLeg := &db.TransactionLeg{
			TransactionID:  transaction.ID,
			AccountID:      transaction.DebtorAccountID,
			LegType:        "CREDIT",
			Amount:         transaction.Amount,
			Currency:       transaction.Currency,
			Description:    fmt.Sprintf("Return of payment from %s (%s)", transaction.CreditorName, reasonCode),
			SequenceNumber: 4,
		}
		if err := s.transactionRepo.CreateLeg(ctx, tx, creditLeg); err != nil {
			return fmt.Errorf("failed to create return credit leg: %w", err)
		}

		// Update transaction status to RETURNED
		if err := s.transactionRepo.UpdateStatus(ctx, tx, transaction.ID, "RETURNED", reasonCode); err != nil {
			return fmt.Errorf("failed to update transaction status: %w", err)
		}

		// Outbox event for downstream consumers
		eventPayload, err := json.Marshal(map[string]interface{}{
			"transactionId": transaction.ID.String(),
			"uetr":          transaction.UETR.String(),
			"status":        "RETURNED",
			"reasonCode":    reasonCode,
		})
		if err != nil {
			return fmt.Errorf("failed to marshal outbox event payload: %w", err)
		}

		outboxEvent := &db.OutboxEvent{
			AggregateType: "transaction",
			AggregateID:   transaction.ID,
			EventType:     db.EventPaymentReturned,
			Payload:       eventPayload,
			Topic:         db.TopicPaymentsCompleted,
			PartitionKey:  transaction.DebtorAccountID.String(),
		}

		if err := s.outboxRepo.Insert(ctx, tx, outboxEvent); err != nil {
			return err
		}

		resp = &ReturnPaymentResponse{
			UETR:        uetrStr,
			ReturnID:    fmt.Sprintf("RTN-%s", transaction.ID.String()[:8]),
			Status:      "RETURNED",
			ReasonCode:  reasonCode,
			InitiatedAt: time.Now(),
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return resp, nil
}

// Helper functions
func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// LookupAccountByIBAN resolves an IBAN to an account UUID string
func (s *PaymentService) LookupAccountByIBAN(ctx context.Context, iban string) (string, error) {
	id, err := s.accountRepo.GetIDByIBAN(ctx, iban)
	if err != nil {
		return "", fmt.Errorf("account not found for IBAN %s: %w", iban, err)
	}
	return id.String(), nil
}

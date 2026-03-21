package service

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/sanctions"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

// ============================================================================
// Mock implementations
// ============================================================================

type mockTxManager struct {
	retryTxFn func(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error
}

func (m *mockTxManager) RetryTx(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error {
	if m.retryTxFn != nil {
		return m.retryTxFn(ctx, maxRetries, fn)
	}
	// Default: execute fn immediately with nil tx
	return fn(nil)
}

type mockTransactionStore struct {
	createFn              func(ctx context.Context, tx pgx.Tx, t *db.Transaction) error
	createLegFn           func(ctx context.Context, tx pgx.Tx, leg *db.TransactionLeg) error
	getByUETRFn           func(ctx context.Context, uetr uuid.UUID) (*db.Transaction, error)
	getByIDFn             func(ctx context.Context, id uuid.UUID) (*db.Transaction, error)
	updateStatusFn        func(ctx context.Context, tx pgx.Tx, id uuid.UUID, status, reason string) error
	updateSanctionsStatFn func(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error
	updateFraudStatusFn   func(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error
	existsByUETRFn        func(ctx context.Context, uetr uuid.UUID) (bool, error)
	listAllFn             func(ctx context.Context, limit, offset int) ([]db.Transaction, int, error)

	// Track calls for assertions
	createCalls    int
	createLegCalls int
}

func (m *mockTransactionStore) Create(ctx context.Context, tx pgx.Tx, t *db.Transaction) error {
	m.createCalls++
	if m.createFn != nil {
		return m.createFn(ctx, tx, t)
	}
	return nil
}

func (m *mockTransactionStore) CreateLeg(ctx context.Context, tx pgx.Tx, leg *db.TransactionLeg) error {
	m.createLegCalls++
	if m.createLegFn != nil {
		return m.createLegFn(ctx, tx, leg)
	}
	return nil
}

func (m *mockTransactionStore) GetByUETR(ctx context.Context, uetr uuid.UUID) (*db.Transaction, error) {
	if m.getByUETRFn != nil {
		return m.getByUETRFn(ctx, uetr)
	}
	return nil, db.ErrNotFound
}

func (m *mockTransactionStore) GetByID(ctx context.Context, id uuid.UUID) (*db.Transaction, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, db.ErrNotFound
}

func (m *mockTransactionStore) UpdateStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status, reason string) error {
	if m.updateStatusFn != nil {
		return m.updateStatusFn(ctx, tx, id, status, reason)
	}
	return nil
}

func (m *mockTransactionStore) UpdateSanctionsStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error {
	if m.updateSanctionsStatFn != nil {
		return m.updateSanctionsStatFn(ctx, tx, id, status, score)
	}
	return nil
}

func (m *mockTransactionStore) UpdateFraudStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error {
	if m.updateFraudStatusFn != nil {
		return m.updateFraudStatusFn(ctx, tx, id, status, score)
	}
	return nil
}

func (m *mockTransactionStore) ExistsByUETR(ctx context.Context, uetr uuid.UUID) (bool, error) {
	if m.existsByUETRFn != nil {
		return m.existsByUETRFn(ctx, uetr)
	}
	return false, nil
}

func (m *mockTransactionStore) ListAll(ctx context.Context, limit, offset int) ([]db.Transaction, int, error) {
	if m.listAllFn != nil {
		return m.listAllFn(ctx, limit, offset)
	}
	return nil, 0, nil
}

type mockAccountStore struct {
	getByIDFn       func(ctx context.Context, id uuid.UUID) (*db.Account, error)
	getForUpdateFn  func(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*db.Account, error)
	getIDByIBANFn   func(ctx context.Context, iban string) (uuid.UUID, error)
	reserveFundsFn  func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error
	releaseFundsFn  func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error
	debitAccountFn  func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error)
	creditAccountFn func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error)
	addPendCreditFn func(ctx context.Context, tx pgx.Tx, accountID, transactionID uuid.UUID, amount decimal.Decimal, currency string) error
}

func (m *mockAccountStore) GetByID(ctx context.Context, id uuid.UUID) (*db.Account, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &db.Account{
		ID:               id,
		Status:           "ACTIVE",
		Currency:         "USD",
		Balance:          decimal.NewFromInt(10000),
		TransactionLimit: decimal.NewFromInt(100000),
	}, nil
}

func (m *mockAccountStore) GetForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*db.Account, error) {
	if m.getForUpdateFn != nil {
		return m.getForUpdateFn(ctx, tx, id)
	}
	return &db.Account{
		ID:               id,
		Status:           "ACTIVE",
		Currency:         "USD",
		Balance:          decimal.NewFromInt(10000),
		AvailableBalance: decimal.NewFromInt(10000),
		TransactionLimit: decimal.NewFromInt(100000),
	}, nil
}

func (m *mockAccountStore) GetIDByIBAN(ctx context.Context, iban string) (uuid.UUID, error) {
	if m.getIDByIBANFn != nil {
		return m.getIDByIBANFn(ctx, iban)
	}
	return uuid.New(), nil
}

func (m *mockAccountStore) ReserveFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error {
	if m.reserveFundsFn != nil {
		return m.reserveFundsFn(ctx, tx, id, amount)
	}
	return nil
}

func (m *mockAccountStore) ReleaseFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) error {
	if m.releaseFundsFn != nil {
		return m.releaseFundsFn(ctx, tx, id, amount)
	}
	return nil
}

func (m *mockAccountStore) DebitAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error) {
	if m.debitAccountFn != nil {
		return m.debitAccountFn(ctx, tx, id, amount)
	}
	return decimal.NewFromInt(9000), nil
}

func (m *mockAccountStore) CreditAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amount decimal.Decimal) (decimal.Decimal, error) {
	if m.creditAccountFn != nil {
		return m.creditAccountFn(ctx, tx, id, amount)
	}
	return decimal.NewFromInt(11000), nil
}

func (m *mockAccountStore) AddPendingCredit(ctx context.Context, tx pgx.Tx, accountID, transactionID uuid.UUID, amount decimal.Decimal, currency string) error {
	if m.addPendCreditFn != nil {
		return m.addPendCreditFn(ctx, tx, accountID, transactionID, amount, currency)
	}
	return nil
}

type mockOutboxStore struct {
	insertFn    func(ctx context.Context, tx pgx.Tx, event *db.OutboxEvent) error
	lastEvent   *db.OutboxEvent
	insertCalls int
}

func (m *mockOutboxStore) Insert(ctx context.Context, tx pgx.Tx, event *db.OutboxEvent) error {
	m.insertCalls++
	m.lastEvent = event
	if m.insertFn != nil {
		return m.insertFn(ctx, tx, event)
	}
	return nil
}

type mockSanctionsScreener struct {
	screenPartiesFn func(ctx context.Context, debtorName, creditorName, debtorCountry, creditorCountry string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error)
}

func (m *mockSanctionsScreener) ScreenParties(ctx context.Context, debtorName, creditorName, debtorCountry, creditorCountry string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error) {
	if m.screenPartiesFn != nil {
		return m.screenPartiesFn(ctx, debtorName, creditorName, debtorCountry, creditorCountry)
	}
	// Default: all clear
	return &sanctions.ScreeningResult{}, &sanctions.ScreeningResult{}, nil
}

type mockEventPublisher struct {
	publishFn func(ctx context.Context, topic, key string, value interface{}) error
}

func (m *mockEventPublisher) Publish(ctx context.Context, topic, key string, value interface{}) error {
	if m.publishFn != nil {
		return m.publishFn(ctx, topic, key, value)
	}
	return nil
}

func (m *mockEventPublisher) Close() error { return nil }

type mockShardStore struct {
	reserveFundsShardFn func(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error
}

func (m *mockShardStore) ReserveFundsShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error {
	if m.reserveFundsShardFn != nil {
		return m.reserveFundsShardFn(ctx, tx, accountID, amount, currency)
	}
	return nil
}
func (m *mockShardStore) CreditShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error {
	return nil
}
func (m *mockShardStore) NeedsRebalance(ctx context.Context, accountID uuid.UUID) (bool, error) {
	return false, nil
}
func (m *mockShardStore) Rebalance(ctx context.Context, accountID uuid.UUID) error {
	return nil
}

// ============================================================================
// Test helpers
// ============================================================================

func newTestLogger() *zap.Logger {
	logger, _ := zap.NewDevelopment()
	return logger
}

func newTestPaymentService(opts ...func(*testServiceOpts)) *PaymentService {
	o := &testServiceOpts{
		txManager:   &mockTxManager{},
		shardStore:  &mockShardStore{},
		txnStore:    &mockTransactionStore{},
		acctStore:   &mockAccountStore{},
		outboxStore: &mockOutboxStore{},
		sanctions:   &mockSanctionsScreener{},
		publisher:   &mockEventPublisher{},
	}
	for _, fn := range opts {
		fn(o)
	}
	return NewPaymentService(
		newTestLogger(),
		o.txManager,
		o.acctStore,
		o.shardStore,
		o.txnStore,
		o.outboxStore,
		o.sanctions,
		o.publisher,
	)
}

type testServiceOpts struct {
	txManager   TxManager
	shardStore  ShardStore
	txnStore    TransactionStore
	acctStore   AccountStore
	outboxStore OutboxStore
	sanctions   SanctionsScreener
	publisher   EventPublisher
}

func withTxManager(m TxManager) func(*testServiceOpts) {
	return func(o *testServiceOpts) { o.txManager = m }
}

func withTransactionStore(m TransactionStore) func(*testServiceOpts) {
	return func(o *testServiceOpts) { o.txnStore = m }
}

func withAccountStore(m AccountStore) func(*testServiceOpts) {
	return func(o *testServiceOpts) { o.acctStore = m }
}

func withShardStore(m ShardStore) func(*testServiceOpts) {
	return func(o *testServiceOpts) { o.shardStore = m }
}

func withOutboxStore(m OutboxStore) func(*testServiceOpts) {
	return func(o *testServiceOpts) { o.outboxStore = m }
}

func withSanctionsScreener(m SanctionsScreener) func(*testServiceOpts) {
	return func(o *testServiceOpts) { o.sanctions = m }
}

func newValidPaymentRequest() *CreatePaymentRequest {
	return &CreatePaymentRequest{
		MessageID:         "MSG-test-001",
		CreationDateTime:  time.Now(),
		EndToEndID:        "E2E-test-001",
		UETR:              uuid.New().String(),
		Amount:            decimal.NewFromFloat(100.50),
		Currency:          "USD",
		DebtorAccountID:   uuid.New().String(),
		CreditorAccountID: uuid.New().String(),
		DebtorName:        "Alice Corp",
		CreditorName:      "Bob Inc",
	}
}

// ============================================================================
// CreatePayment Tests
// ============================================================================

func TestCreatePayment_Success(t *testing.T) {
	svc := newTestPaymentService()
	req := newValidPaymentRequest()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Status != "PENDING" {
		t.Errorf("expected status PENDING, got %s", resp.Status)
	}
	if resp.UETR != req.UETR {
		t.Errorf("expected UETR %s, got %s", req.UETR, resp.UETR)
	}
	if resp.SanctionsStatus != "CLEAR" {
		t.Errorf("expected sanctions status CLEAR, got %s", resp.SanctionsStatus)
	}
	if resp.TransactionID == "" {
		t.Error("expected non-empty TransactionID")
	}
	if resp.ProcessingTime < 0 {
		t.Errorf("expected non-negative processing time, got %d", resp.ProcessingTime)
	}
}

func TestCreatePayment_Idempotency_DuplicateUETR(t *testing.T) {
	existingID := uuid.New()
	uetr := uuid.New()

	txnStore := &mockTransactionStore{
		existsByUETRFn: func(ctx context.Context, u uuid.UUID) (bool, error) {
			return true, nil
		},
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:              existingID,
				UETR:            uetr,
				Status:          "SETTLED",
				SanctionsStatus: "CLEAR",
				CreatedAt:       time.Now().Add(-1 * time.Hour),
			}, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	req := newValidPaymentRequest()
	req.UETR = uetr.String()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "SETTLED" {
		t.Errorf("expected status SETTLED (from existing), got %s", resp.Status)
	}
	if resp.TransactionID != existingID.String() {
		t.Errorf("expected transaction ID %s, got %s", existingID.String(), resp.TransactionID)
	}
}

func TestCreatePayment_InvalidUETR(t *testing.T) {
	svc := newTestPaymentService()
	req := newValidPaymentRequest()
	req.UETR = "not-a-uuid"

	_, err := svc.CreatePayment(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for invalid UETR")
	}
}

func TestCreatePayment_InvalidDebtorAccountID(t *testing.T) {
	svc := newTestPaymentService()
	req := newValidPaymentRequest()
	req.DebtorAccountID = "invalid"

	_, err := svc.CreatePayment(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for invalid debtor account ID")
	}
}

func TestCreatePayment_SanctionsBlocked(t *testing.T) {
	screener := &mockSanctionsScreener{
		screenPartiesFn: func(ctx context.Context, d, c, dc, cc string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error) {
			return &sanctions.ScreeningResult{
				IsSanctioned: true,
				MatchScore:   0.98,
				SDNName:      "Bad Actor",
			}, &sanctions.ScreeningResult{}, nil
		},
	}

	svc := newTestPaymentService(withSanctionsScreener(screener))
	req := newValidPaymentRequest()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "REJECTED" {
		t.Errorf("expected status REJECTED, got %s", resp.Status)
	}
	if resp.StatusReason != "SANCTIONS_BLOCKED" {
		t.Errorf("expected reason SANCTIONS_BLOCKED, got %s", resp.StatusReason)
	}
	if resp.SanctionsStatus != "BLOCKED" {
		t.Errorf("expected sanctions status BLOCKED, got %s", resp.SanctionsStatus)
	}
}

func TestCreatePayment_SanctionsReview(t *testing.T) {
	screener := &mockSanctionsScreener{
		screenPartiesFn: func(ctx context.Context, d, c, dc, cc string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error) {
			return &sanctions.ScreeningResult{
				RequiresReview: true,
				MatchScore:     0.88,
			}, &sanctions.ScreeningResult{}, nil
		},
	}

	svc := newTestPaymentService(withSanctionsScreener(screener))
	req := newValidPaymentRequest()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "SANCTIONED" {
		t.Errorf("expected status SANCTIONED, got %s", resp.Status)
	}
	if resp.SanctionsStatus != "REVIEW" {
		t.Errorf("expected sanctions status REVIEW, got %s", resp.SanctionsStatus)
	}
}

func TestCreatePayment_SanctionsServiceDown_FallsBackToReview(t *testing.T) {
	screener := &mockSanctionsScreener{
		screenPartiesFn: func(ctx context.Context, d, c, dc, cc string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error) {
			return nil, nil, fmt.Errorf("connection refused")
		},
	}

	svc := newTestPaymentService(withSanctionsScreener(screener))
	req := newValidPaymentRequest()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// When sanctions service is down, payment goes to review (not rejected)
	if resp.Status != "SANCTIONED" {
		t.Errorf("expected status SANCTIONED (fallback review), got %s", resp.Status)
	}
}

func TestCreatePayment_InsufficientFunds(t *testing.T) {
	shards := &mockShardStore{
		reserveFundsShardFn: func(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error {
			return db.ErrInsufficientFunds
		},
	}

	svc := newTestPaymentService(withShardStore(shards))
	req := newValidPaymentRequest()
	req.Amount = decimal.NewFromFloat(500.00)

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "REJECTED" {
		t.Errorf("expected status REJECTED, got %s", resp.Status)
	}
	if resp.StatusReason != "INSUFFICIENT_FUNDS" {
		t.Errorf("expected reason INSUFFICIENT_FUNDS, got %s", resp.StatusReason)
	}
}

func TestCreatePayment_InactiveDebtorAccount(t *testing.T) {
	shards := &mockShardStore{
		reserveFundsShardFn: func(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error {
			return db.ErrAccountInactive
		},
	}

	svc := newTestPaymentService(withShardStore(shards))
	req := newValidPaymentRequest()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "REJECTED" {
		t.Errorf("expected status REJECTED, got %s", resp.Status)
	}
}

func TestCreatePayment_CurrencyMismatch(t *testing.T) {
	shards := &mockShardStore{
		reserveFundsShardFn: func(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error {
			return db.ErrCurrencyMismatch
		},
	}

	svc := newTestPaymentService(withShardStore(shards))
	req := newValidPaymentRequest()

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "REJECTED" {
		t.Errorf("expected status REJECTED, got %s", resp.Status)
	}
}

func TestCreatePayment_ExceedsTransactionLimit(t *testing.T) {
	shards := &mockShardStore{
		reserveFundsShardFn: func(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error {
			return db.ErrTransactionLimitExceeded
		},
	}

	svc := newTestPaymentService(withShardStore(shards))
	req := newValidPaymentRequest()
	req.Amount = decimal.NewFromFloat(100.00)

	resp, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "REJECTED" {
		t.Errorf("expected status REJECTED, got %s", resp.Status)
	}
}

func TestCreatePayment_OutboxEventCreated(t *testing.T) {
	outbox := &mockOutboxStore{}

	svc := newTestPaymentService(withOutboxStore(outbox))
	req := newValidPaymentRequest()

	_, err := svc.CreatePayment(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if outbox.insertCalls != 1 {
		t.Errorf("expected 1 outbox insert, got %d", outbox.insertCalls)
	}
	if outbox.lastEvent == nil {
		t.Fatal("expected outbox event to be set")
	}
	if outbox.lastEvent.EventType != db.EventPaymentInitiated {
		t.Errorf("expected event type %s, got %s", db.EventPaymentInitiated, outbox.lastEvent.EventType)
	}
	if outbox.lastEvent.Topic != db.TopicPaymentsInitiated {
		t.Errorf("expected topic %s, got %s", db.TopicPaymentsInitiated, outbox.lastEvent.Topic)
	}

	// Verify payload contains expected fields
	var payload map[string]interface{}
	if err := json.Unmarshal(outbox.lastEvent.Payload, &payload); err != nil {
		t.Fatalf("failed to unmarshal outbox payload: %v", err)
	}
	if payload["debtorName"] != req.DebtorName {
		t.Errorf("expected debtorName %s in payload, got %v", req.DebtorName, payload["debtorName"])
	}
}

// ============================================================================
// SettlePayment Tests
// ============================================================================

func TestSettlePayment_Success(t *testing.T) {
	txnID := uuid.New()
	uetr := uuid.New()
	debtorID := uuid.New()
	creditorID := uuid.New()

	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:                txnID,
				UETR:              uetr,
				Status:            "PENDING",
				Amount:            decimal.NewFromFloat(100.00),
				Currency:          "USD",
				DebtorAccountID:   debtorID,
				CreditorAccountID: creditorID,
				DebtorName:        "Alice",
				CreditorName:      "Bob",
			}, nil
		},
	}
	outbox := &mockOutboxStore{}

	svc := newTestPaymentService(
		withTransactionStore(txnStore),
		withOutboxStore(outbox),
	)

	err := svc.SettlePayment(context.Background(), uetr.String())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if txnStore.createLegCalls != 2 {
		t.Errorf("expected 2 leg creates (debit+credit), got %d", txnStore.createLegCalls)
	}
	if outbox.insertCalls != 1 {
		t.Errorf("expected 1 outbox insert, got %d", outbox.insertCalls)
	}
}

func TestSettlePayment_InvalidUETR(t *testing.T) {
	svc := newTestPaymentService()
	err := svc.SettlePayment(context.Background(), "not-a-uuid")
	if err == nil {
		t.Fatal("expected error for invalid UETR")
	}
}

func TestSettlePayment_WrongStatus(t *testing.T) {
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:     uuid.New(),
				UETR:   u,
				Status: "SETTLED", // Already settled
			}, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	err := svc.SettlePayment(context.Background(), uuid.New().String())
	if err == nil {
		t.Fatal("expected error for already settled transaction")
	}
}

func TestSettlePayment_TransactionNotFound(t *testing.T) {
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return nil, db.ErrNotFound
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	err := svc.SettlePayment(context.Background(), uuid.New().String())
	if err == nil {
		t.Fatal("expected error for missing transaction")
	}
}

func TestSettlePayment_SanctionedStatusAllowed(t *testing.T) {
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:                uuid.New(),
				UETR:              u,
				Status:            "SANCTIONED",
				Amount:            decimal.NewFromFloat(100.00),
				Currency:          "USD",
				DebtorAccountID:   uuid.New(),
				CreditorAccountID: uuid.New(),
				DebtorName:        "Alice",
				CreditorName:      "Bob",
			}, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	err := svc.SettlePayment(context.Background(), uuid.New().String())
	if err != nil {
		t.Fatalf("SANCTIONED status should be settleable, got error: %v", err)
	}
}

// ============================================================================
// ReturnPayment Tests
// ============================================================================

func TestReturnPayment_Success(t *testing.T) {
	txnID := uuid.New()
	uetr := uuid.New()

	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:                txnID,
				UETR:              uetr,
				Status:            "SETTLED",
				Amount:            decimal.NewFromFloat(100.00),
				Currency:          "USD",
				DebtorAccountID:   uuid.New(),
				CreditorAccountID: uuid.New(),
				DebtorName:        "Alice",
				CreditorName:      "Bob",
			}, nil
		},
	}
	outbox := &mockOutboxStore{}

	svc := newTestPaymentService(
		withTransactionStore(txnStore),
		withOutboxStore(outbox),
	)

	resp, err := svc.ReturnPayment(context.Background(), uetr.String(), "FOCR")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "RETURNED" {
		t.Errorf("expected status RETURNED, got %s", resp.Status)
	}
	if resp.ReasonCode != "FOCR" {
		t.Errorf("expected reason code FOCR, got %s", resp.ReasonCode)
	}
	if resp.UETR != uetr.String() {
		t.Errorf("expected UETR %s, got %s", uetr.String(), resp.UETR)
	}
	if txnStore.createLegCalls != 2 {
		t.Errorf("expected 2 return legs, got %d", txnStore.createLegCalls)
	}
	if outbox.insertCalls != 1 {
		t.Errorf("expected 1 outbox event for return, got %d", outbox.insertCalls)
	}
}

func TestReturnPayment_InvalidUETR(t *testing.T) {
	svc := newTestPaymentService()
	_, err := svc.ReturnPayment(context.Background(), "bad-uetr", "FOCR")
	if err == nil {
		t.Fatal("expected error for invalid UETR")
	}
}

func TestReturnPayment_WrongStatus_Pending(t *testing.T) {
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:     uuid.New(),
				UETR:   u,
				Status: "PENDING", // Cannot return a pending payment
			}, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	_, err := svc.ReturnPayment(context.Background(), uuid.New().String(), "FOCR")
	if err == nil {
		t.Fatal("expected error for pending status")
	}
}

func TestReturnPayment_ClearedStatusAllowed(t *testing.T) {
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:                uuid.New(),
				UETR:              u,
				Status:            "CLEARED",
				Amount:            decimal.NewFromFloat(100.00),
				Currency:          "USD",
				DebtorAccountID:   uuid.New(),
				CreditorAccountID: uuid.New(),
				DebtorName:        "Alice",
				CreditorName:      "Bob",
			}, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	resp, err := svc.ReturnPayment(context.Background(), uuid.New().String(), "AC04")
	if err != nil {
		t.Fatalf("CLEARED status should be returnable, got error: %v", err)
	}
	if resp.ReasonCode != "AC04" {
		t.Errorf("expected reason code AC04, got %s", resp.ReasonCode)
	}
}

// ============================================================================
// ListPayments Tests
// ============================================================================

func TestListPayments_EmptyResult(t *testing.T) {
	txnStore := &mockTransactionStore{
		listAllFn: func(ctx context.Context, limit, offset int) ([]db.Transaction, int, error) {
			return []db.Transaction{}, 0, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	resp, err := svc.ListPayments(context.Background(), 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Data) != 0 {
		t.Errorf("expected empty data, got %d items", len(resp.Data))
	}
	if resp.Pagination.TotalItems != 0 {
		t.Errorf("expected 0 total items, got %d", resp.Pagination.TotalItems)
	}
}

func TestListPayments_WithResults(t *testing.T) {
	txnStore := &mockTransactionStore{
		listAllFn: func(ctx context.Context, limit, offset int) ([]db.Transaction, int, error) {
			return []db.Transaction{
				{
					ID:              uuid.New(),
					UETR:            uuid.New(),
					MessageID:       "MSG-1",
					Status:          "SETTLED",
					SanctionsStatus: "CLEAR",
					FraudStatus:     "CLEAR",
					Amount:          decimal.NewFromFloat(100.00),
					Currency:        "USD",
					DebtorName:      "Alice",
					CreditorName:    "Bob",
					BookingDate:     time.Now(),
					CreatedAt:       time.Now(),
					UpdatedAt:       time.Now(),
				},
			}, 1, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	resp, err := svc.ListPayments(context.Background(), 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Data) != 1 {
		t.Fatalf("expected 1 result, got %d", len(resp.Data))
	}
	if resp.Data[0].DebtorName != "Alice" {
		t.Errorf("expected debtor Alice, got %s", resp.Data[0].DebtorName)
	}
	if resp.Pagination.TotalItems != 1 {
		t.Errorf("expected 1 total item, got %d", resp.Pagination.TotalItems)
	}
}

func TestListPayments_PageBounds(t *testing.T) {
	svc := newTestPaymentService()

	// Page < 1 should default to 1
	resp, err := svc.ListPayments(context.Background(), -1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Pagination.Page != 1 {
		t.Errorf("expected page 1 for negative input, got %d", resp.Pagination.Page)
	}
}

// ============================================================================
// GetPaymentStatus Tests
// ============================================================================

func TestGetPaymentStatus_Success(t *testing.T) {
	uetr := uuid.New()
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID:                uuid.New(),
				UETR:              uetr,
				MessageID:         "MSG-1",
				Status:            "SETTLED",
				SanctionsStatus:   "CLEAR",
				FraudStatus:       "CLEAR",
				Amount:            decimal.NewFromFloat(250.00),
				Currency:          "EUR",
				DebtorName:        "Sender Corp",
				CreditorName:      "Receiver Ltd",
				DebtorAccountID:   uuid.New(),
				CreditorAccountID: uuid.New(),
				BookingDate:       time.Now(),
				CreatedAt:         time.Now(),
				UpdatedAt:         time.Now(),
			}, nil
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	resp, err := svc.GetPaymentStatus(context.Background(), uetr.String())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Status != "SETTLED" {
		t.Errorf("expected status SETTLED, got %s", resp.Status)
	}
	if resp.Amount != "250" {
		t.Errorf("expected amount 250, got %s", resp.Amount)
	}
	if resp.Currency != "EUR" {
		t.Errorf("expected currency EUR, got %s", resp.Currency)
	}
}

func TestGetPaymentStatus_NotFound(t *testing.T) {
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return nil, db.ErrNotFound
		},
	}

	svc := newTestPaymentService(withTransactionStore(txnStore))
	_, err := svc.GetPaymentStatus(context.Background(), uuid.New().String())
	if err == nil {
		t.Fatal("expected error for not found")
	}
}

func TestGetPaymentStatus_InvalidUETR(t *testing.T) {
	svc := newTestPaymentService()
	_, err := svc.GetPaymentStatus(context.Background(), "not-a-uuid")
	if err == nil {
		t.Fatal("expected error for invalid UETR")
	}
}

// ============================================================================
// LookupAccountByIBAN Tests
// ============================================================================

func TestLookupAccountByIBAN_Success(t *testing.T) {
	expectedID := uuid.New()
	acctStore := &mockAccountStore{
		getIDByIBANFn: func(ctx context.Context, iban string) (uuid.UUID, error) {
			if iban == "DE89370400440532013000" {
				return expectedID, nil
			}
			return uuid.Nil, fmt.Errorf("not found")
		},
	}

	svc := newTestPaymentService(withAccountStore(acctStore))
	id, err := svc.LookupAccountByIBAN(context.Background(), "DE89370400440532013000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != expectedID.String() {
		t.Errorf("expected %s, got %s", expectedID.String(), id)
	}
}

func TestLookupAccountByIBAN_NotFound(t *testing.T) {
	acctStore := &mockAccountStore{
		getIDByIBANFn: func(ctx context.Context, iban string) (uuid.UUID, error) {
			return uuid.Nil, fmt.Errorf("not found")
		},
	}

	svc := newTestPaymentService(withAccountStore(acctStore))
	_, err := svc.LookupAccountByIBAN(context.Background(), "INVALID")
	if err == nil {
		t.Fatal("expected error for unknown IBAN")
	}
}

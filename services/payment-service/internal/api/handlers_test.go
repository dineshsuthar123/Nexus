package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/sanctions"
	"github.com/nexus-rtp/payment-service/internal/service"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

// ============================================================================
// Mocks implementing service interfaces (exact signatures)
// ============================================================================

type mockTxManager struct{}

func (m *mockTxManager) RetryTx(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error {
	return fn(nil)
}

type mockTransactionStore struct {
	existsFn     func(ctx context.Context, uetr uuid.UUID) (bool, error)
	existsTxFn   func(ctx context.Context, tx pgx.Tx, uetr uuid.UUID) (bool, error)
	createFn     func(ctx context.Context, tx pgx.Tx, txn *db.Transaction) error
	getByUETRFn  func(ctx context.Context, uetr uuid.UUID) (*db.Transaction, error)
	getByIDFn    func(ctx context.Context, id uuid.UUID) (*db.Transaction, error)
	updateStatFn func(ctx context.Context, tx pgx.Tx, id uuid.UUID, status, reason string) error
	updateSanFn  func(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error
	updateFrdFn  func(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error
	createLegFn  func(ctx context.Context, tx pgx.Tx, leg *db.TransactionLeg) error
	listAllFn    func(ctx context.Context, limit, offset int) ([]db.Transaction, int, error)
}

func (m *mockTransactionStore) ExistsByUETR(ctx context.Context, uetr uuid.UUID) (bool, error) {
	if m.existsFn != nil {
		return m.existsFn(ctx, uetr)
	}
	return false, nil
}

func (m *mockTransactionStore) ExistsByUETRTx(ctx context.Context, tx pgx.Tx, uetr uuid.UUID) (bool, error) {
	if m.existsTxFn != nil {
		return m.existsTxFn(ctx, tx, uetr)
	}
	return false, nil
}

func (m *mockTransactionStore) Create(ctx context.Context, tx pgx.Tx, txn *db.Transaction) error {
	if m.createFn != nil {
		return m.createFn(ctx, tx, txn)
	}
	return nil
}

func (m *mockTransactionStore) GetByUETR(ctx context.Context, uetr uuid.UUID) (*db.Transaction, error) {
	if m.getByUETRFn != nil {
		return m.getByUETRFn(ctx, uetr)
	}
	return nil, db.ErrNotFound
}

func (m *mockTransactionStore) GetByUETRTx(ctx context.Context, tx pgx.Tx, uetr uuid.UUID) (*db.Transaction, error) {
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
	if m.updateStatFn != nil {
		return m.updateStatFn(ctx, tx, id, status, reason)
	}
	return nil
}

func (m *mockTransactionStore) UpdateSanctionsStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error {
	if m.updateSanFn != nil {
		return m.updateSanFn(ctx, tx, id, status, score)
	}
	return nil
}

func (m *mockTransactionStore) UpdateFraudStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string, score decimal.Decimal) error {
	if m.updateFrdFn != nil {
		return m.updateFrdFn(ctx, tx, id, status, score)
	}
	return nil
}

func (m *mockTransactionStore) CreateLeg(ctx context.Context, tx pgx.Tx, leg *db.TransactionLeg) error {
	if m.createLegFn != nil {
		return m.createLegFn(ctx, tx, leg)
	}
	return nil
}

func (m *mockTransactionStore) ListAll(ctx context.Context, limit, offset int) ([]db.Transaction, int, error) {
	if m.listAllFn != nil {
		return m.listAllFn(ctx, limit, offset)
	}
	return nil, 0, nil
}

type mockAccountStore struct {
	getByIDFn      func(ctx context.Context, id uuid.UUID) (*db.Account, error)
	getForUpdateFn func(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*db.Account, error)
	getIDByIBANFn  func(ctx context.Context, iban string) (uuid.UUID, error)
	reserveFn      func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) error
	releaseFn      func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) error
	debitFn        func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) (decimal.Decimal, error)
	creditFn       func(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) (decimal.Decimal, error)
	addPendingFn   func(ctx context.Context, tx pgx.Tx, id, txnID uuid.UUID, amt decimal.Decimal, cur string) error
}

func (m *mockAccountStore) GetByID(ctx context.Context, id uuid.UUID) (*db.Account, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &db.Account{
		ID: id, Currency: "USD", Status: "ACTIVE",
		Balance: decimal.NewFromInt(50000), TransactionLimit: decimal.NewFromInt(1000000),
	}, nil
}

func (m *mockAccountStore) GetForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*db.Account, error) {
	if m.getForUpdateFn != nil {
		return m.getForUpdateFn(ctx, tx, id)
	}
	return &db.Account{
		ID: id, Currency: "USD", Status: "ACTIVE",
		Balance: decimal.NewFromInt(50000), TransactionLimit: decimal.NewFromInt(1000000),
	}, nil
}

func (m *mockAccountStore) GetIDByIBAN(ctx context.Context, iban string) (uuid.UUID, error) {
	if m.getIDByIBANFn != nil {
		return m.getIDByIBANFn(ctx, iban)
	}
	return uuid.New(), nil
}

func (m *mockAccountStore) ReserveFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) error {
	if m.reserveFn != nil {
		return m.reserveFn(ctx, tx, id, amt)
	}
	return nil
}

func (m *mockAccountStore) ReleaseFunds(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) error {
	if m.releaseFn != nil {
		return m.releaseFn(ctx, tx, id, amt)
	}
	return nil
}

func (m *mockAccountStore) DebitAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) (decimal.Decimal, error) {
	if m.debitFn != nil {
		return m.debitFn(ctx, tx, id, amt)
	}
	return decimal.NewFromInt(49000), nil
}

func (m *mockAccountStore) CreditAccount(ctx context.Context, tx pgx.Tx, id uuid.UUID, amt decimal.Decimal) (decimal.Decimal, error) {
	if m.creditFn != nil {
		return m.creditFn(ctx, tx, id, amt)
	}
	return decimal.NewFromInt(51000), nil
}

func (m *mockAccountStore) AddPendingCredit(ctx context.Context, tx pgx.Tx, id, txnID uuid.UUID, amt decimal.Decimal, cur string) error {
	if m.addPendingFn != nil {
		return m.addPendingFn(ctx, tx, id, txnID, amt, cur)
	}
	return nil
}

type mockOutboxStore struct{}

func (m *mockOutboxStore) Insert(ctx context.Context, tx pgx.Tx, event *db.OutboxEvent) error {
	return nil
}

type mockSanctionsScreener struct{}

func (m *mockSanctionsScreener) ScreenParties(ctx context.Context, debtor, creditor, debtorCountry, creditorCountry string) (*sanctions.ScreeningResult, *sanctions.ScreeningResult, error) {
	cleared := &sanctions.ScreeningResult{IsSanctioned: false, RequiresReview: false, MatchScore: 0}
	return cleared, cleared, nil
}

type mockEventPublisher struct{}

func (m *mockEventPublisher) Publish(ctx context.Context, topic, key string, value interface{}) error {
	return nil
}

func (m *mockEventPublisher) Close() error { return nil }

type mockShardStore struct{}

func (m *mockShardStore) ReserveFundsShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal, currency string) error {
	return nil
}
func (m *mockShardStore) CreditShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error {
	return nil
}
func (m *mockShardStore) DebitShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error {
	return nil
}
func (m *mockShardStore) NeedsRebalance(ctx context.Context, accountID uuid.UUID) (bool, error) {
	return false, nil
}
func (m *mockShardStore) Rebalance(ctx context.Context, accountID uuid.UUID) error {
	return nil
}

// ============================================================================
// Test setup helper
// ============================================================================

func setupRouter(opts ...func(*testOpts)) *gin.Engine {
	gin.SetMode(gin.TestMode)
	logger, _ := zap.NewDevelopment()

	o := &testOpts{
		txMgr:      &mockTxManager{},
		shardStore: &mockShardStore{},
		txnStore:   &mockTransactionStore{},
		acctStore:  &mockAccountStore{},
		outbox:     &mockOutboxStore{},
		sanctions:  &mockSanctionsScreener{},
		publisher:  &mockEventPublisher{},
	}
	for _, fn := range opts {
		fn(o)
	}

	svc := service.NewPaymentService(
		logger, o.txMgr, o.acctStore, o.shardStore, o.txnStore, o.outbox, o.sanctions, o.publisher,
	)

	router := gin.New()
	RegisterRoutes(router, svc, logger)
	return router
}

type testOpts struct {
	txMgr      service.TxManager
	shardStore service.ShardStore
	txnStore   service.TransactionStore
	acctStore  service.AccountStore
	outbox     service.OutboxStore
	sanctions  service.SanctionsScreener
	publisher  service.EventPublisher
}

func withTxnStore(m service.TransactionStore) func(*testOpts) {
	return func(o *testOpts) { o.txnStore = m }
}

// ============================================================================
// ListPayments Handler Tests
// ============================================================================

func TestListPayments_Empty(t *testing.T) {
	router := setupRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListPayments_WithResults(t *testing.T) {
	txnStore := &mockTransactionStore{
		listAllFn: func(ctx context.Context, limit, offset int) ([]db.Transaction, int, error) {
			return []db.Transaction{
				{
					ID: uuid.New(), UETR: uuid.New(), Status: "PENDING",
					Amount: decimal.NewFromInt(100), Currency: "USD",
					DebtorName: "Alice", CreditorName: "Bob",
					CreatedAt: time.Now(),
				},
			}, 1, nil
		},
	}

	router := setupRouter(withTxnStore(txnStore))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments?page=1&pageSize=10", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ============================================================================
// CreatePayment Handler Tests
// ============================================================================

func TestCreatePayment_Success(t *testing.T) {
	debtorID := uuid.New()
	creditorID := uuid.New()

	router := setupRouter()

	body := map[string]interface{}{
		"amount":            "1000.50",
		"currency":          "USD",
		"debtorName":        "Alice Corp",
		"creditorName":      "Bob Ltd",
		"debtorAccountId":   debtorID.String(),
		"creditorAccountId": creditorID.String(),
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp["uetr"] == nil || resp["uetr"] == "" {
		t.Error("expected non-empty UETR in response")
	}
}

func TestCreatePayment_InvalidAmount(t *testing.T) {
	router := setupRouter()

	body := map[string]interface{}{
		"amount":       "-50",
		"currency":     "USD",
		"debtorName":   "Alice",
		"creditorName": "Bob",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreatePayment_MissingNames(t *testing.T) {
	router := setupRouter()

	body := map[string]interface{}{
		"amount":   "100",
		"currency": "USD",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreatePayment_InvalidCurrency(t *testing.T) {
	router := setupRouter()

	body := map[string]interface{}{
		"amount":            "100",
		"currency":          "ABCD",
		"debtorName":        "Alice",
		"creditorName":      "Bob",
		"debtorAccountId":   uuid.New().String(),
		"creditorAccountId": uuid.New().String(),
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// ============================================================================
// GetPaymentStatus Handler Tests
// ============================================================================

func TestGetPaymentStatus_Success(t *testing.T) {
	uetr := uuid.New()
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID: uuid.New(), UETR: u, Status: "SETTLED",
				Amount: decimal.NewFromInt(500), Currency: "USD",
				DebtorName: "Alice", CreditorName: "Bob",
				DebtorAccountID: uuid.New(), CreditorAccountID: uuid.New(),
				CreatedAt: time.Now(),
			}, nil
		},
	}

	router := setupRouter(withTxnStore(txnStore))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments/"+uetr.String(), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetPaymentStatus_NotFound(t *testing.T) {
	router := setupRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetPaymentStatus_InvalidUETR(t *testing.T) {
	router := setupRouter()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/payments/not-a-uuid", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Handler delegates to service which returns error for invalid UUID → 500
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", w.Code, w.Body.String())
	}
}

// ============================================================================
// SettlePayment Handler Tests
// ============================================================================

func TestSettlePayment_Success(t *testing.T) {
	txnID := uuid.New()
	uetr := uuid.New()
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID: txnID, UETR: u, Status: "CLEARED",
				Amount: decimal.NewFromInt(100), Currency: "USD",
				DebtorAccountID: uuid.New(), CreditorAccountID: uuid.New(),
			}, nil
		},
	}

	router := setupRouter(withTxnStore(txnStore))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/"+uetr.String()+"/settle", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ============================================================================
// ReturnPayment Handler Tests
// ============================================================================

func TestReturnPayment_Success(t *testing.T) {
	uetr := uuid.New()
	txnStore := &mockTransactionStore{
		getByUETRFn: func(ctx context.Context, u uuid.UUID) (*db.Transaction, error) {
			return &db.Transaction{
				ID: uuid.New(), UETR: u, Status: "SETTLED",
				Amount: decimal.NewFromInt(100), Currency: "USD",
				DebtorAccountID: uuid.New(), CreditorAccountID: uuid.New(),
			}, nil
		},
	}

	router := setupRouter(withTxnStore(txnStore))

	body := map[string]interface{}{"reasonCode": "CUST", "reasonText": "Customer requested return"}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments/"+uetr.String()+"/return", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

// ============================================================================
// Error response format Tests
// ============================================================================

func TestErrorResponse_Format(t *testing.T) {
	router := setupRouter()

	body := map[string]interface{}{
		"amount":   "abc",
		"currency": "USD",
	}
	jsonBody, _ := json.Marshal(body)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/payments", bytes.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var errResp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to unmarshal error response: %v", err)
	}
	if errResp.Code == "" {
		t.Error("expected non-empty error code")
	}
	if errResp.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

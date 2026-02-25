package service

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/account-service/internal/db"
	"github.com/nexus-rtp/account-service/internal/observability"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

func TestMain(m *testing.M) {
	observability.InitNoop()
	os.Exit(m.Run())
}

// ============================================================================
// Mock implementations
// ============================================================================

type mockAccountStore struct {
	createFn      func(ctx context.Context, account *db.Account) error
	getByIDFn     func(ctx context.Context, id uuid.UUID) (*db.Account, error)
	getBalanceFn  func(ctx context.Context, id uuid.UUID) (*db.BalanceInfo, error)
	updateStatFn  func(ctx context.Context, id uuid.UUID, status string) error
	updateKYCFn   func(ctx context.Context, id uuid.UUID, kyc string) error
	listFn        func(ctx context.Context, limit, offset int, status string) ([]*db.Account, int, error)
	getByCustomFn func(ctx context.Context, customerID uuid.UUID) ([]*db.Account, error)
	createCalls   int
}

func (m *mockAccountStore) Create(ctx context.Context, account *db.Account) error {
	m.createCalls++
	if m.createFn != nil {
		return m.createFn(ctx, account)
	}
	return nil
}

func (m *mockAccountStore) GetByID(ctx context.Context, id uuid.UUID) (*db.Account, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &db.Account{
		ID:               id,
		CustomerID:       uuid.New(),
		AccountNumber:    "USD000000010000001",
		Currency:         "USD",
		AccountType:      "CHECKING",
		Balance:          decimal.NewFromInt(10000),
		PendingDebits:    decimal.Zero,
		PendingCredits:   decimal.Zero,
		TransactionLimit: decimal.NewFromInt(1000000),
		DailyLimit:       decimal.NewFromInt(10000000),
		DailyUsed:        decimal.Zero,
		Status:           "ACTIVE",
		KYCStatus:        "VERIFIED",
		RiskScore:        decimal.Zero,
	}, nil
}

func (m *mockAccountStore) GetAccountBalance(ctx context.Context, id uuid.UUID) (*db.BalanceInfo, error) {
	if m.getBalanceFn != nil {
		return m.getBalanceFn(ctx, id)
	}
	return &db.BalanceInfo{
		CurrentBalance:   decimal.NewFromInt(10000),
		AvailableBalance: decimal.NewFromInt(10000),
		PendingDebits:    decimal.Zero,
		PendingCredits:   decimal.Zero,
		Currency:         "USD",
	}, nil
}

func (m *mockAccountStore) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	if m.updateStatFn != nil {
		return m.updateStatFn(ctx, id, status)
	}
	return nil
}

func (m *mockAccountStore) UpdateKYCStatus(ctx context.Context, id uuid.UUID, kyc string) error {
	if m.updateKYCFn != nil {
		return m.updateKYCFn(ctx, id, kyc)
	}
	return nil
}

func (m *mockAccountStore) ListAccounts(ctx context.Context, limit, offset int, status string) ([]*db.Account, int, error) {
	if m.listFn != nil {
		return m.listFn(ctx, limit, offset, status)
	}
	return nil, 0, nil
}

func (m *mockAccountStore) GetByCustomerID(ctx context.Context, customerID uuid.UUID) ([]*db.Account, error) {
	if m.getByCustomFn != nil {
		return m.getByCustomFn(ctx, customerID)
	}
	return nil, nil
}

type mockAuditLogStore struct {
	createFn    func(ctx context.Context, log *db.AuditLog) error
	getByEntFn  func(ctx context.Context, entityType string, entityID uuid.UUID, limit int) ([]*db.AuditLog, error)
	createCalls int
}

func (m *mockAuditLogStore) Create(ctx context.Context, log *db.AuditLog) error {
	m.createCalls++
	if m.createFn != nil {
		return m.createFn(ctx, log)
	}
	return nil
}

func (m *mockAuditLogStore) GetByEntityID(ctx context.Context, entityType string, entityID uuid.UUID, limit int) ([]*db.AuditLog, error) {
	if m.getByEntFn != nil {
		return m.getByEntFn(ctx, entityType, entityID, limit)
	}
	return nil, nil
}

// ============================================================================
// Test helpers
// ============================================================================

func newTestAccountService(accounts AccountStore, audit AuditLogStore) *AccountService {
	logger, _ := zap.NewDevelopment()
	return NewAccountService(logger, accounts, audit, nil) // nil cache for tests
}

// ============================================================================
// CreateAccount Tests
// ============================================================================

func TestCreateAccount_Success(t *testing.T) {
	accounts := &mockAccountStore{}
	audit := &mockAuditLogStore{}
	svc := newTestAccountService(accounts, audit)

	resp, err := svc.CreateAccount(context.Background(), &CreateAccountRequest{
		CustomerID:  uuid.New(),
		Currency:    "USD",
		AccountType: "CHECKING",
	}, "actor-1", "127.0.0.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Currency != "USD" {
		t.Errorf("expected currency USD, got %s", resp.Currency)
	}
	if resp.AccountType != "CHECKING" {
		t.Errorf("expected account type CHECKING, got %s", resp.AccountType)
	}
	if resp.Status != "ACTIVE" {
		t.Errorf("expected status ACTIVE, got %s", resp.Status)
	}
	if resp.KYCStatus != "PENDING" {
		t.Errorf("expected KYC PENDING, got %s", resp.KYCStatus)
	}
	if accounts.createCalls != 1 {
		t.Errorf("expected 1 account create call, got %d", accounts.createCalls)
	}
	if audit.createCalls != 1 {
		t.Errorf("expected 1 audit create call, got %d", audit.createCalls)
	}
}

func TestCreateAccount_WithInitialBalance(t *testing.T) {
	accounts := &mockAccountStore{}
	svc := newTestAccountService(accounts, &mockAuditLogStore{})

	resp, err := svc.CreateAccount(context.Background(), &CreateAccountRequest{
		CustomerID:     uuid.New(),
		Currency:       "EUR",
		AccountType:    "SAVINGS",
		InitialBalance: decimal.NewFromFloat(5000.50),
		IBAN:           "DE89370400440532013000",
		BIC:            "COBADEFFXXX",
	}, "actor-1", "127.0.0.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Balance != "5000.5" {
		t.Errorf("expected balance 5000.5, got %s", resp.Balance)
	}
	if resp.IBAN != "DE89370400440532013000" {
		t.Errorf("expected IBAN DE89370400440532013000, got %s", resp.IBAN)
	}
}

func TestCreateAccount_RepoError(t *testing.T) {
	accounts := &mockAccountStore{
		createFn: func(ctx context.Context, account *db.Account) error {
			return errors.New("db connection error")
		},
	}
	svc := newTestAccountService(accounts, &mockAuditLogStore{})

	_, err := svc.CreateAccount(context.Background(), &CreateAccountRequest{
		CustomerID:  uuid.New(),
		Currency:    "USD",
		AccountType: "CHECKING",
	}, "actor-1", "127.0.0.1")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestCreateAccount_DefaultLimits(t *testing.T) {
	var createdAccount *db.Account
	accounts := &mockAccountStore{
		createFn: func(ctx context.Context, account *db.Account) error {
			createdAccount = account
			return nil
		},
	}
	svc := newTestAccountService(accounts, &mockAuditLogStore{})

	_, err := svc.CreateAccount(context.Background(), &CreateAccountRequest{
		CustomerID:  uuid.New(),
		Currency:    "USD",
		AccountType: "CHECKING",
	}, "actor-1", "127.0.0.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if createdAccount == nil {
		t.Fatal("expected account to be created")
	}
	if !createdAccount.TransactionLimit.Equal(decimal.NewFromInt(1000000)) {
		t.Errorf("expected default transaction limit 1000000, got %s", createdAccount.TransactionLimit.String())
	}
	if !createdAccount.DailyLimit.Equal(decimal.NewFromInt(10000000)) {
		t.Errorf("expected default daily limit 10000000, got %s", createdAccount.DailyLimit.String())
	}
}

// ============================================================================
// GetAccount Tests
// ============================================================================

func TestGetAccount_Success(t *testing.T) {
	accountID := uuid.New()
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	resp, err := svc.GetAccount(context.Background(), accountID.String())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ID != accountID.String() {
		t.Errorf("expected account ID %s, got %s", accountID.String(), resp.ID)
	}
}

func TestGetAccount_InvalidID(t *testing.T) {
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	_, err := svc.GetAccount(context.Background(), "not-a-uuid")
	if err == nil {
		t.Fatal("expected error for invalid UUID")
	}
}

func TestGetAccount_NotFound(t *testing.T) {
	accounts := &mockAccountStore{
		getByIDFn: func(ctx context.Context, id uuid.UUID) (*db.Account, error) {
			return nil, db.ErrNotFound
		},
	}
	svc := newTestAccountService(accounts, &mockAuditLogStore{})

	_, err := svc.GetAccount(context.Background(), uuid.New().String())
	if err == nil {
		t.Fatal("expected error for not found")
	}
}

// ============================================================================
// GetBalance Tests
// ============================================================================

func TestGetBalance_Success(t *testing.T) {
	accountID := uuid.New()
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	balance, err := svc.GetBalance(context.Background(), accountID.String())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !balance.CurrentBalance.Equal(decimal.NewFromInt(10000)) {
		t.Errorf("expected balance 10000, got %s", balance.CurrentBalance.String())
	}
	if balance.Currency != "USD" {
		t.Errorf("expected currency USD, got %s", balance.Currency)
	}
}

func TestGetBalance_InvalidID(t *testing.T) {
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	_, err := svc.GetBalance(context.Background(), "invalid")
	if err == nil {
		t.Fatal("expected error for invalid UUID")
	}
}

// ============================================================================
// UpdateAccountStatus Tests
// ============================================================================

func TestUpdateAccountStatus_Success(t *testing.T) {
	accountID := uuid.New()
	audit := &mockAuditLogStore{}
	svc := newTestAccountService(&mockAccountStore{}, audit)

	err := svc.UpdateAccountStatus(context.Background(), accountID.String(), "FROZEN", "admin", "10.0.0.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if audit.createCalls < 1 {
		t.Error("expected audit log for status change")
	}
}

func TestUpdateAccountStatus_InvalidID(t *testing.T) {
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	err := svc.UpdateAccountStatus(context.Background(), "bad-id", "FROZEN", "admin", "10.0.0.1")
	if err == nil {
		t.Fatal("expected error for invalid UUID")
	}
}

// ============================================================================
// UpdateKYCStatus Tests
// ============================================================================

func TestUpdateKYCStatus_Success(t *testing.T) {
	accountID := uuid.New()
	audit := &mockAuditLogStore{}
	svc := newTestAccountService(&mockAccountStore{}, audit)

	err := svc.UpdateKYCStatus(context.Background(), accountID.String(), "VERIFIED", "admin", "10.0.0.1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if audit.createCalls < 1 {
		t.Error("expected audit log for KYC status change")
	}
}

// ============================================================================
// ListAccounts Tests
// ============================================================================

func TestListAccounts_Empty(t *testing.T) {
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	accounts, total, err := svc.ListAccounts(context.Background(), 10, 0, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 0 {
		t.Errorf("expected total 0, got %d", total)
	}
	if len(accounts) != 0 {
		t.Errorf("expected 0 accounts, got %d", len(accounts))
	}
}

func TestListAccounts_WithResults(t *testing.T) {
	acctStore := &mockAccountStore{
		listFn: func(ctx context.Context, limit, offset int, status string) ([]*db.Account, int, error) {
			return []*db.Account{
				{ID: uuid.New(), Currency: "USD", AccountType: "CHECKING", Balance: decimal.NewFromInt(500), Status: "ACTIVE"},
				{ID: uuid.New(), Currency: "EUR", AccountType: "SAVINGS", Balance: decimal.NewFromInt(1000), Status: "ACTIVE"},
			}, 2, nil
		},
	}
	svc := newTestAccountService(acctStore, &mockAuditLogStore{})

	accounts, total, err := svc.ListAccounts(context.Background(), 10, 0, "ACTIVE")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 2 {
		t.Errorf("expected total 2, got %d", total)
	}
	if len(accounts) != 2 {
		t.Errorf("expected 2 accounts, got %d", len(accounts))
	}
}

// ============================================================================
// GetAccountsByCustomer Tests
// ============================================================================

func TestGetAccountsByCustomer_Success(t *testing.T) {
	customerID := uuid.New()
	acctStore := &mockAccountStore{
		getByCustomFn: func(ctx context.Context, cid uuid.UUID) ([]*db.Account, error) {
			return []*db.Account{
				{ID: uuid.New(), CustomerID: cid, Currency: "USD", Balance: decimal.NewFromInt(5000)},
			}, nil
		},
	}
	svc := newTestAccountService(acctStore, &mockAuditLogStore{})

	accounts, err := svc.GetAccountsByCustomer(context.Background(), customerID.String())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(accounts) != 1 {
		t.Errorf("expected 1 account, got %d", len(accounts))
	}
}

func TestGetAccountsByCustomer_InvalidID(t *testing.T) {
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	_, err := svc.GetAccountsByCustomer(context.Background(), "bad-uuid")
	if err == nil {
		t.Fatal("expected error for invalid UUID")
	}
}

// ============================================================================
// GetAuditLog Tests
// ============================================================================

func TestGetAuditLog_Success(t *testing.T) {
	accountID := uuid.New()
	auditStore := &mockAuditLogStore{
		getByEntFn: func(ctx context.Context, entityType string, entityID uuid.UUID, limit int) ([]*db.AuditLog, error) {
			return []*db.AuditLog{
				{EntityType: "account", EntityID: entityID, Action: db.ActionAccountCreated},
			}, nil
		},
	}
	svc := newTestAccountService(&mockAccountStore{}, auditStore)

	logs, err := svc.GetAuditLog(context.Background(), accountID.String(), 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(logs) != 1 {
		t.Errorf("expected 1 audit log, got %d", len(logs))
	}
}

func TestGetAuditLog_InvalidID(t *testing.T) {
	svc := newTestAccountService(&mockAccountStore{}, &mockAuditLogStore{})

	_, err := svc.GetAuditLog(context.Background(), "invalid", 10)
	if err == nil {
		t.Fatal("expected error for invalid UUID")
	}
}

// ============================================================================
// accountToResponse Tests
// ============================================================================

func TestAccountToResponse_AvailableBalance(t *testing.T) {
	account := &db.Account{
		ID:               uuid.New(),
		CustomerID:       uuid.New(),
		AccountNumber:    "USD0001",
		Currency:         "USD",
		AccountType:      "CHECKING",
		Balance:          decimal.NewFromInt(10000),
		PendingDebits:    decimal.NewFromInt(500),
		PendingCredits:   decimal.NewFromInt(200),
		TransactionLimit: decimal.NewFromInt(1000000),
		DailyLimit:       decimal.NewFromInt(10000000),
		DailyUsed:        decimal.Zero,
		Status:           "ACTIVE",
		KYCStatus:        "VERIFIED",
		RiskScore:        decimal.Zero,
		Metadata:         json.RawMessage(`{"tier":"gold"}`),
	}

	resp := accountToResponse(account)

	// Available = Balance + PendingCredits - PendingDebits = 10000 + 200 - 500 = 9700
	if resp.AvailableBalance != "9700" {
		t.Errorf("expected available balance 9700, got %s", resp.AvailableBalance)
	}
	if resp.Balance != "10000" {
		t.Errorf("expected balance 10000, got %s", resp.Balance)
	}
	if resp.PendingDebits != "500" {
		t.Errorf("expected pending debits 500, got %s", resp.PendingDebits)
	}
}

// ============================================================================
// generateAccountNumber Tests
// ============================================================================

func TestGenerateAccountNumber_ContainsCurrency(t *testing.T) {
	num := generateAccountNumber("EUR")
	if len(num) == 0 {
		t.Error("expected non-empty account number")
	}
	if num[:3] != "EUR" {
		t.Errorf("expected account number to start with EUR, got %s", num[:3])
	}
}

func TestGenerateAccountNumber_Uniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		num := generateAccountNumber("USD")
		if seen[num] {
			t.Fatalf("duplicate account number generated: %s", num)
		}
		seen[num] = true
		time.Sleep(time.Millisecond) // ensure different timestamp component
	}
}

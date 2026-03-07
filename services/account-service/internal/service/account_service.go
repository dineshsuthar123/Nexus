// Package service provides business logic for account management
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/account-service/internal/cache"
	"github.com/nexus-rtp/account-service/internal/db"
	"github.com/nexus-rtp/account-service/internal/observability"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

// AccountService handles account business logic
type AccountService struct {
	logger      *zap.Logger
	accountRepo AccountStore
	auditRepo   AuditLogStore
	cache       CacheProvider
}

// NewAccountService creates a new account service
func NewAccountService(
	logger *zap.Logger,
	accountRepo AccountStore,
	auditRepo AuditLogStore,
	cacheClient CacheProvider,
) *AccountService {
	return &AccountService{
		logger:      logger,
		accountRepo: accountRepo,
		auditRepo:   auditRepo,
		cache:       cacheClient,
	}
}

// CreateAccountRequest represents an account creation request
type CreateAccountRequest struct {
	CustomerID       uuid.UUID       `json:"customerId" binding:"required"`
	ExternalID       string          `json:"externalId,omitempty"`
	AccountNumber    string          `json:"accountNumber,omitempty"`
	IBAN             string          `json:"iban,omitempty"`
	BIC              string          `json:"bic,omitempty"`
	Currency         string          `json:"currency" binding:"required,len=3"`
	AccountType      string          `json:"accountType" binding:"required"`
	TransactionLimit decimal.Decimal `json:"transactionLimit,omitempty"`
	DailyLimit       decimal.Decimal `json:"dailyLimit,omitempty"`
	AllowNegative    bool            `json:"allowNegative,omitempty"`
	InitialBalance   decimal.Decimal `json:"initialBalance,omitempty"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
}

// AccountResponse represents an account response
type AccountResponse struct {
	ID               string          `json:"id"`
	ExternalID       string          `json:"externalId,omitempty"`
	CustomerID       string          `json:"customerId"`
	AccountNumber    string          `json:"accountNumber"`
	IBAN             string          `json:"iban,omitempty"`
	BIC              string          `json:"bic,omitempty"`
	Currency         string          `json:"currency"`
	AccountType      string          `json:"accountType"`
	Balance          string          `json:"balance"`
	AvailableBalance string          `json:"availableBalance"`
	PendingDebits    string          `json:"pendingDebits"`
	PendingCredits   string          `json:"pendingCredits"`
	TransactionLimit string          `json:"transactionLimit"`
	DailyLimit       string          `json:"dailyLimit"`
	DailyUsed        string          `json:"dailyUsed"`
	AllowNegative    bool            `json:"allowNegative"`
	Status           string          `json:"status"`
	KYCStatus        string          `json:"kycStatus"`
	RiskScore        string          `json:"riskScore"`
	Metadata         json.RawMessage `json:"metadata,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
}

// CreateAccount creates a new account
func (s *AccountService) CreateAccount(ctx context.Context, req *CreateAccountRequest, actorID, actorIP string) (*AccountResponse, error) {
	ctx, span := observability.StartSpan(ctx, "AccountService.CreateAccount",
		trace.WithAttributes(
			attribute.String("customer_id", req.CustomerID.String()),
			attribute.String("currency", req.Currency),
			attribute.String("account_type", req.AccountType),
		),
	)
	defer span.End()

	// Generate account number if not provided
	accountNumber := req.AccountNumber
	if accountNumber == "" {
		accountNumber = generateAccountNumber(req.Currency)
	}

	// Set defaults
	transactionLimit := req.TransactionLimit
	if transactionLimit.IsZero() {
		transactionLimit = decimal.NewFromInt(1000000) // Default 1M
	}

	dailyLimit := req.DailyLimit
	if dailyLimit.IsZero() {
		dailyLimit = decimal.NewFromInt(10000000) // Default 10M
	}

	account := &db.Account{
		ID:               uuid.New(),
		ExternalID:       req.ExternalID,
		CustomerID:       req.CustomerID,
		AccountNumber:    accountNumber,
		IBAN:             req.IBAN,
		BIC:              req.BIC,
		Currency:         req.Currency,
		AccountType:      req.AccountType,
		Balance:          req.InitialBalance,
		PendingDebits:    decimal.Zero,
		PendingCredits:   decimal.Zero,
		TransactionLimit: transactionLimit,
		DailyLimit:       dailyLimit,
		DailyUsed:        decimal.Zero,
		AllowNegative:    req.AllowNegative,
		Status:           "ACTIVE",
		KYCStatus:        "PENDING",
		RiskScore:        decimal.Zero,
		Metadata:         req.Metadata,
	}

	if err := s.accountRepo.Create(ctx, account); err != nil {
		observability.RecordAccountOperation("create", "error")
		s.logger.Error("Failed to create account", zap.Error(err))
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	// Create audit log
	newState, _ := json.Marshal(account)
	auditLog := &db.AuditLog{
		EntityType: "account",
		EntityID:   account.ID,
		Action:     db.ActionAccountCreated,
		ActorType:  db.ActorTypeAPI,
		ActorID:    actorID,
		ActorIP:    actorIP,
		NewState:   newState,
	}
	if err := s.auditRepo.Create(ctx, auditLog); err != nil {
		s.logger.Warn("Failed to create audit log", zap.Error(err))
	}

	observability.RecordAccountOperation("create", "success")

	s.logger.Info("Account created",
		zap.String("accountId", account.ID.String()),
		zap.String("customerId", account.CustomerID.String()),
		zap.String("currency", account.Currency),
	)

	return accountToResponse(account), nil
}

// GetAccount retrieves an account by ID
func (s *AccountService) GetAccount(ctx context.Context, accountID string) (*AccountResponse, error) {
	ctx, span := observability.StartSpan(ctx, "AccountService.GetAccount")
	defer span.End()

	id, err := uuid.Parse(accountID)
	if err != nil {
		return nil, fmt.Errorf("invalid account ID: %w", err)
	}

	// Try cache first
	if s.cache != nil {
		cacheKey := cache.AccountCacheKey(accountID)
		var account db.Account
		err := s.cache.GetJSON(ctx, cacheKey, &account)
		if err == nil {
			observability.RecordCacheHit("account", true)
			return accountToResponse(&account), nil
		}
		if err != redis.Nil {
			s.logger.Warn("Cache error", zap.Error(err))
		}
		observability.RecordCacheHit("account", false)
	}

	// Get from database
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		if err == db.ErrNotFound {
			return nil, fmt.Errorf("account not found")
		}
		return nil, fmt.Errorf("failed to get account: %w", err)
	}

	// Cache the result
	if s.cache != nil {
		cacheKey := cache.AccountCacheKey(accountID)
		if err := s.cache.SetJSON(ctx, cacheKey, account, cache.AccountCacheTTL); err != nil {
			s.logger.Warn("Failed to cache account", zap.Error(err))
		}
	}

	return accountToResponse(account), nil
}

// GetBalance retrieves account balance with caching
func (s *AccountService) GetBalance(ctx context.Context, accountID string) (*db.BalanceInfo, error) {
	start := time.Now()
	ctx, span := observability.StartSpan(ctx, "AccountService.GetBalance")
	defer span.End()

	id, err := uuid.Parse(accountID)
	if err != nil {
		return nil, fmt.Errorf("invalid account ID: %w", err)
	}

	// Try cache first
	cached := false
	if s.cache != nil {
		cacheKey := cache.BalanceCacheKey(accountID)
		var balance db.BalanceInfo
		err := s.cache.GetJSON(ctx, cacheKey, &balance)
		if err == nil {
			observability.RecordCacheHit("balance", true)
			observability.RecordBalanceQuery(true, time.Since(start))
			cached = true
			return &balance, nil
		}
		if err != redis.Nil {
			s.logger.Warn("Cache error", zap.Error(err))
		}
		observability.RecordCacheHit("balance", false)
	}

	// Get from database
	balance, err := s.accountRepo.GetAccountBalance(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get balance: %w", err)
	}

	// Cache the result
	if s.cache != nil {
		cacheKey := cache.BalanceCacheKey(accountID)
		if err := s.cache.SetJSON(ctx, cacheKey, balance, cache.BalanceCacheTTL); err != nil {
			s.logger.Warn("Failed to cache balance", zap.Error(err))
		}
	}

	observability.RecordBalanceQuery(cached, time.Since(start))
	return balance, nil
}

// UpdateAccountStatus updates account status
func (s *AccountService) UpdateAccountStatus(ctx context.Context, accountID, status, actorID, actorIP string) error {
	ctx, span := observability.StartSpan(ctx, "AccountService.UpdateAccountStatus")
	defer span.End()

	id, err := uuid.Parse(accountID)
	if err != nil {
		return fmt.Errorf("invalid account ID: %w", err)
	}

	// Get current account
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get account: %w", err)
	}

	previousStatus := account.Status

	// Update status
	if err := s.accountRepo.UpdateStatus(ctx, id, status); err != nil {
		observability.RecordAccountOperation("update_status", "error")
		return fmt.Errorf("failed to update status: %w", err)
	}

	// Invalidate cache
	if s.cache != nil {
		s.cache.Delete(ctx, cache.AccountCacheKey(accountID), cache.BalanceCacheKey(accountID))
	}

	// Audit log
	changes, _ := json.Marshal(map[string]string{
		"previous_status": previousStatus,
		"new_status":      status,
	})
	auditLog := &db.AuditLog{
		EntityType: "account",
		EntityID:   id,
		Action:     db.ActionAccountStatusChanged,
		ActorType:  db.ActorTypeAPI,
		ActorID:    actorID,
		ActorIP:    actorIP,
		Changes:    changes,
	}
	s.auditRepo.Create(ctx, auditLog)

	observability.RecordAccountOperation("update_status", "success")
	return nil
}

// UpdateKYCStatus updates KYC status
func (s *AccountService) UpdateKYCStatus(ctx context.Context, accountID, kycStatus, actorID, actorIP string) error {
	ctx, span := observability.StartSpan(ctx, "AccountService.UpdateKYCStatus")
	defer span.End()

	id, err := uuid.Parse(accountID)
	if err != nil {
		return fmt.Errorf("invalid account ID: %w", err)
	}

	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get account: %w", err)
	}

	previousKYC := account.KYCStatus

	if err := s.accountRepo.UpdateKYCStatus(ctx, id, kycStatus); err != nil {
		observability.RecordAccountOperation("update_kyc", "error")
		return fmt.Errorf("failed to update KYC status: %w", err)
	}

	// Invalidate cache
	if s.cache != nil {
		s.cache.Delete(ctx, cache.AccountCacheKey(accountID))
	}

	// Audit log
	changes, _ := json.Marshal(map[string]string{
		"previous_kyc": previousKYC,
		"new_kyc":      kycStatus,
	})
	auditLog := &db.AuditLog{
		EntityType: "account",
		EntityID:   id,
		Action:     db.ActionKYCStatusChanged,
		ActorType:  db.ActorTypeAPI,
		ActorID:    actorID,
		ActorIP:    actorIP,
		Changes:    changes,
	}
	s.auditRepo.Create(ctx, auditLog)

	observability.RecordAccountOperation("update_kyc", "success")
	return nil
}

// ListAccounts retrieves a paginated list of accounts
func (s *AccountService) ListAccounts(ctx context.Context, limit, offset int, status string) ([]*AccountResponse, int, error) {
	ctx, span := observability.StartSpan(ctx, "AccountService.ListAccounts")
	defer span.End()

	accounts, total, err := s.accountRepo.ListAccounts(ctx, limit, offset, status)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list accounts: %w", err)
	}

	responses := make([]*AccountResponse, len(accounts))
	for i, account := range accounts {
		responses[i] = accountToResponse(account)
	}

	return responses, total, nil
}

// GetAccountsByCustomer retrieves all accounts for a customer
func (s *AccountService) GetAccountsByCustomer(ctx context.Context, customerID string) ([]*AccountResponse, error) {
	ctx, span := observability.StartSpan(ctx, "AccountService.GetAccountsByCustomer")
	defer span.End()

	id, err := uuid.Parse(customerID)
	if err != nil {
		return nil, fmt.Errorf("invalid customer ID: %w", err)
	}

	accounts, err := s.accountRepo.GetByCustomerID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer accounts: %w", err)
	}

	responses := make([]*AccountResponse, len(accounts))
	for i, account := range accounts {
		responses[i] = accountToResponse(account)
	}

	return responses, nil
}

// GetAuditLog retrieves audit logs for an account
func (s *AccountService) GetAuditLog(ctx context.Context, accountID string, limit int) ([]*db.AuditLog, error) {
	ctx, span := observability.StartSpan(ctx, "AccountService.GetAuditLog")
	defer span.End()

	id, err := uuid.Parse(accountID)
	if err != nil {
		return nil, fmt.Errorf("invalid account ID: %w", err)
	}

	logs, err := s.auditRepo.GetByEntityID(ctx, "account", id, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get audit logs: %w", err)
	}

	return logs, nil
}

// Helper functions

func accountToResponse(account *db.Account) *AccountResponse {
	availableBalance := account.Balance.Add(account.PendingCredits).Sub(account.PendingDebits)

	return &AccountResponse{
		ID:               account.ID.String(),
		ExternalID:       account.ExternalID,
		CustomerID:       account.CustomerID.String(),
		AccountNumber:    account.AccountNumber,
		IBAN:             account.IBAN,
		BIC:              account.BIC,
		Currency:         account.Currency,
		AccountType:      account.AccountType,
		Balance:          account.Balance.String(),
		AvailableBalance: availableBalance.String(),
		PendingDebits:    account.PendingDebits.String(),
		PendingCredits:   account.PendingCredits.String(),
		TransactionLimit: account.TransactionLimit.String(),
		DailyLimit:       account.DailyLimit.String(),
		DailyUsed:        account.DailyUsed.String(),
		AllowNegative:    account.AllowNegative,
		Status:           account.Status,
		KYCStatus:        account.KYCStatus,
		RiskScore:        account.RiskScore.String(),
		Metadata:         account.Metadata,
		CreatedAt:        account.CreatedAt,
		UpdatedAt:        account.UpdatedAt,
	}
}

func generateAccountNumber(currency string) string {
	// Generate a unique account number
	// Format: CURRENCY + timestamp(8) + random(6)
	timestamp := time.Now().UnixNano() / 1000000 % 100000000
	random := uuid.New().ID() % 1000000
	return fmt.Sprintf("%s%08d%06d", currency, timestamp, random)
}

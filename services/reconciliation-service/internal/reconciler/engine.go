// Package reconciler implements the 3-way reconciliation engine
package reconciler

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nexus-rtp/reconciliation-service/internal/config"
	"github.com/nexus-rtp/reconciliation-service/internal/db"
	"github.com/nexus-rtp/reconciliation-service/internal/observability"
	"github.com/shopspring/decimal"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"
)

// Engine handles the reconciliation logic
type Engine struct {
	logger      *zap.Logger
	pool        *db.Pool
	reconRepo   *db.ReconciliationRepository
	txRepo      *db.TransactionRepository
	accountRepo *db.AccountRepository
	config      config.ReconciliationConfig
}

// NewEngine creates a new reconciliation engine
func NewEngine(
	logger *zap.Logger,
	pool *db.Pool,
	reconRepo *db.ReconciliationRepository,
	txRepo *db.TransactionRepository,
	accountRepo *db.AccountRepository,
	cfg config.ReconciliationConfig,
) *Engine {
	return &Engine{
		logger:      logger,
		pool:        pool,
		reconRepo:   reconRepo,
		txRepo:      txRepo,
		accountRepo: accountRepo,
		config:      cfg,
	}
}

// ReconciliationResult holds the result of a reconciliation run
type ReconciliationResult struct {
	CycleID          uuid.UUID `json:"cycleId"`
	StartTime        time.Time `json:"startTime"`
	EndTime          time.Time `json:"endTime"`
	TotalRecords     int       `json:"totalRecords"`
	MatchedRecords   int       `json:"matchedRecords"`
	DiscrepantCount  int       `json:"discrepantCount"`
	AutoResolved     int       `json:"autoResolved"`
	ManualReview     int       `json:"manualReview"`
	Status           string    `json:"status"`
	ProcessingTimeMs int64     `json:"processingTimeMs"`
}

// RunReconciliation performs a full reconciliation cycle
func (e *Engine) RunReconciliation(ctx context.Context, cycleDate time.Time) (*ReconciliationResult, error) {
	start := time.Now()

	ctx, span := observability.StartSpan(ctx, "Reconciler.RunReconciliation",
		trace.WithAttributes(
			attribute.String("cycle_date", cycleDate.Format("2006-01-02")),
		),
	)
	defer span.End()

	e.logger.Info("Starting reconciliation cycle", zap.Time("cycleDate", cycleDate))

	// Create reconciliation cycle
	cycleID := uuid.New()
	cycle := &db.ReconciliationCycle{
		ID:        cycleID,
		CycleDate: cycleDate,
		Status:    "IN_PROGRESS",
		StartTime: start,
	}
	if err := e.reconRepo.CreateCycle(ctx, cycle); err != nil {
		return nil, fmt.Errorf("failed to create cycle: %w", err)
	}

	result := &ReconciliationResult{
		CycleID:   cycleID,
		StartTime: start,
	}

	// =========================================================================
	// Step 1: Gather transactions for reconciliation period
	// =========================================================================
	startOfDay := time.Date(cycleDate.Year(), cycleDate.Month(), cycleDate.Day(), 0, 0, 0, 0, time.UTC)
	endOfDay := startOfDay.Add(24 * time.Hour)

	transactions, err := e.txRepo.GetByDateRange(ctx, startOfDay, endOfDay)
	if err != nil {
		return nil, fmt.Errorf("failed to get transactions: %w", err)
	}
	result.TotalRecords = len(transactions)

	e.logger.Info("Found transactions for reconciliation",
		zap.Int("count", len(transactions)),
		zap.Time("start", startOfDay),
		zap.Time("end", endOfDay),
	)

	// =========================================================================
	// Step 2: Perform 3-way matching
	// For each transaction:
	// 1. Match transaction record with transaction legs (double-entry)
	// 2. Match debits with credits
	// 3. Verify account balance changes
	// =========================================================================
	var matched, discrepant, autoResolved, manualReview int

	for _, tx := range transactions {
		matchResult, err := e.performThreeWayMatch(ctx, tx)
		if err != nil {
			e.logger.Warn("Match failed for transaction",
				zap.String("transactionId", tx.ID.String()),
				zap.Error(err),
			)
			continue
		}

		// Record the result
		record := &db.ReconciliationRecord{
			ID:            uuid.New(),
			CycleID:       cycleID,
			TransactionID: tx.ID,
			MatchStatus:   matchResult.Status,
			MatchScore:    matchResult.Score,
			Details:       matchResult.Details,
		}

		if matchResult.Status == "MATCHED" {
			matched++
		} else {
			discrepant++
			record.DiscrepancyType = matchResult.DiscrepancyType
			record.DiscrepancyAmount = matchResult.DiscrepancyAmount

			// Attempt auto-resolution
			if e.config.AutoResolveEnabled && matchResult.IsAutoResolvable {
				resolved, err := e.attemptAutoResolution(ctx, tx, matchResult)
				if err == nil && resolved {
					autoResolved++
					record.MatchStatus = "AUTO_RESOLVED"
					record.ResolutionType = matchResult.ResolutionType
				} else {
					manualReview++
					record.MatchStatus = "MANUAL_REVIEW"
				}
			} else {
				manualReview++
				record.MatchStatus = "MANUAL_REVIEW"
			}
		}

		if err := e.reconRepo.CreateRecord(ctx, record); err != nil {
			e.logger.Warn("Failed to create reconciliation record", zap.Error(err))
		}
	}

	// =========================================================================
	// Step 3: Account balance reconciliation
	// Verify that sum of all credits - debits = current balance
	// =========================================================================
	balanceDiscrepancies, err := e.reconcileAccountBalances(ctx, startOfDay, endOfDay)
	if err != nil {
		e.logger.Warn("Balance reconciliation failed", zap.Error(err))
	}
	discrepant += len(balanceDiscrepancies)
	manualReview += len(balanceDiscrepancies)

	// =========================================================================
	// Step 4: Complete cycle
	// =========================================================================
	endTime := time.Now()
	result.EndTime = endTime
	result.MatchedRecords = matched
	result.DiscrepantCount = discrepant
	result.AutoResolved = autoResolved
	result.ManualReview = manualReview
	result.ProcessingTimeMs = endTime.Sub(start).Milliseconds()

	if discrepant == 0 {
		result.Status = "BALANCED"
	} else if manualReview > 0 {
		result.Status = "REQUIRES_REVIEW"
	} else {
		result.Status = "COMPLETED"
	}

	// Update cycle status
	cycle.EndTime = &endTime
	cycle.Status = result.Status
	cycle.TotalRecords = result.TotalRecords
	cycle.MatchedRecords = matched
	cycle.DiscrepantRecords = discrepant
	cycle.AutoResolved = autoResolved
	if err := e.reconRepo.UpdateCycle(ctx, cycle); err != nil {
		e.logger.Error("Failed to update cycle", zap.Error(err))
	}

	// Record metrics
	observability.RecordReconciliationMetrics(result)

	e.logger.Info("Reconciliation cycle completed",
		zap.String("cycleId", cycleID.String()),
		zap.Int("total", result.TotalRecords),
		zap.Int("matched", matched),
		zap.Int("discrepant", discrepant),
		zap.Int("autoResolved", autoResolved),
		zap.Int64("durationMs", result.ProcessingTimeMs),
	)

	return result, nil
}

// MatchResult holds the result of a transaction match
type MatchResult struct {
	Status            string
	Score             decimal.Decimal
	Details           json.RawMessage
	DiscrepancyType   string
	DiscrepancyAmount decimal.Decimal
	IsAutoResolvable  bool
	ResolutionType    string
}

// performThreeWayMatch performs a 3-way match for a transaction
func (e *Engine) performThreeWayMatch(ctx context.Context, tx *db.Transaction) (*MatchResult, error) {
	result := &MatchResult{
		Score: decimal.NewFromInt(100),
	}

	// Get transaction legs
	legs, err := e.txRepo.GetLegsByTransactionID(ctx, tx.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction legs: %w", err)
	}

	// Check 1: Transaction has exactly 2 legs (debit and credit)
	if len(legs) != 2 {
		result.Status = "DISCREPANT"
		result.DiscrepancyType = "MISSING_LEG"
		result.Score = decimal.Zero
		details, _ := json.Marshal(map[string]interface{}{
			"expected_legs": 2,
			"actual_legs":   len(legs),
		})
		result.Details = details
		return result, nil
	}

	// Check 2: Sum of debits equals sum of credits
	var debitTotal, creditTotal decimal.Decimal
	for _, leg := range legs {
		if leg.LegType == "DEBIT" {
			debitTotal = debitTotal.Add(leg.Amount)
		} else if leg.LegType == "CREDIT" {
			creditTotal = creditTotal.Add(leg.Amount)
		}
	}

	if !debitTotal.Equal(creditTotal) {
		result.Status = "DISCREPANT"
		result.DiscrepancyType = "AMOUNT_MISMATCH"
		result.DiscrepancyAmount = debitTotal.Sub(creditTotal).Abs()
		result.Score = decimal.NewFromFloat(50)

		// Small differences may be auto-resolvable (rounding)
		if result.DiscrepancyAmount.LessThan(decimal.NewFromFloat(0.01)) {
			result.IsAutoResolvable = true
			result.ResolutionType = "ROUNDING_ADJUSTMENT"
		}

		details, _ := json.Marshal(map[string]interface{}{
			"debit_total":  debitTotal.String(),
			"credit_total": creditTotal.String(),
			"difference":   result.DiscrepancyAmount.String(),
		})
		result.Details = details
		return result, nil
	}

	// Check 3: Transaction amount matches leg amounts
	if !tx.Amount.Equal(debitTotal) {
		result.Status = "DISCREPANT"
		result.DiscrepancyType = "TRANSACTION_LEG_MISMATCH"
		result.DiscrepancyAmount = tx.Amount.Sub(debitTotal).Abs()
		result.Score = decimal.NewFromFloat(60)
		details, _ := json.Marshal(map[string]interface{}{
			"transaction_amount": tx.Amount.String(),
			"leg_amount":         debitTotal.String(),
		})
		result.Details = details
		return result, nil
	}

	// Check 4: Transaction status is terminal
	if tx.Status != "SETTLED" && tx.Status != "COMPLETED" {
		// Non-terminal transactions get partial match
		result.Status = "MATCHED"
		result.Score = decimal.NewFromFloat(80)
		details, _ := json.Marshal(map[string]interface{}{
			"status":  tx.Status,
			"warning": "Transaction not in terminal status",
		})
		result.Details = details
		return result, nil
	}

	// All checks passed
	result.Status = "MATCHED"
	result.Score = decimal.NewFromInt(100)
	details, _ := json.Marshal(map[string]interface{}{
		"debit_total":  debitTotal.String(),
		"credit_total": creditTotal.String(),
		"status":       tx.Status,
	})
	result.Details = details

	return result, nil
}

// attemptAutoResolution attempts to automatically resolve a discrepancy
func (e *Engine) attemptAutoResolution(ctx context.Context, tx *db.Transaction, match *MatchResult) (bool, error) {
	switch match.ResolutionType {
	case "ROUNDING_ADJUSTMENT":
		// For tiny rounding differences, create an adjustment entry
		e.logger.Info("Auto-resolving rounding discrepancy",
			zap.String("transactionId", tx.ID.String()),
			zap.String("amount", match.DiscrepancyAmount.String()),
		)
		// In production, this would create adjustment entries
		return true, nil

	case "TIMING_DIFFERENCE":
		// Transaction may settle in next cycle
		e.logger.Info("Marking as timing difference",
			zap.String("transactionId", tx.ID.String()),
		)
		return true, nil

	default:
		return false, fmt.Errorf("unsupported resolution type: %s", match.ResolutionType)
	}
}

// reconcileAccountBalances verifies account balances match transaction history
func (e *Engine) reconcileAccountBalances(ctx context.Context, start, end time.Time) ([]BalanceDiscrepancy, error) {
	var discrepancies []BalanceDiscrepancy

	// Get accounts with activity in the period
	accounts, err := e.accountRepo.GetAccountsWithActivity(ctx, start, end)
	if err != nil {
		return nil, err
	}

	for _, account := range accounts {
		// Calculate expected balance from transaction legs
		calculatedBalance, err := e.txRepo.CalculateAccountBalance(ctx, account.ID, end)
		if err != nil {
			continue
		}

		// Compare with current balance
		if !calculatedBalance.Equal(account.Balance) {
			discrepancies = append(discrepancies, BalanceDiscrepancy{
				AccountID:       account.ID,
				ExpectedBalance: calculatedBalance,
				ActualBalance:   account.Balance,
				Difference:      calculatedBalance.Sub(account.Balance).Abs(),
			})
		}
	}

	return discrepancies, nil
}

// BalanceDiscrepancy represents a balance reconciliation issue
type BalanceDiscrepancy struct {
	AccountID       uuid.UUID
	ExpectedBalance decimal.Decimal
	ActualBalance   decimal.Decimal
	Difference      decimal.Decimal
}

// GetCycleStatus retrieves the status of a reconciliation cycle
func (e *Engine) GetCycleStatus(ctx context.Context, cycleID uuid.UUID) (*db.ReconciliationCycle, error) {
	return e.reconRepo.GetCycle(ctx, cycleID)
}

// GetDiscrepancies retrieves discrepancies for a cycle
func (e *Engine) GetDiscrepancies(ctx context.Context, cycleID uuid.UUID) ([]*db.ReconciliationRecord, error) {
	return e.reconRepo.GetDiscrepantRecords(ctx, cycleID)
}

// ResolveDiscrepancy manually resolves a discrepancy
func (e *Engine) ResolveDiscrepancy(ctx context.Context, recordID uuid.UUID, resolution string, resolvedBy string) error {
	record, err := e.reconRepo.GetRecord(ctx, recordID)
	if err != nil {
		return err
	}

	record.MatchStatus = "RESOLVED"
	record.ResolutionType = "MANUAL"
	record.ResolvedBy = resolvedBy
	now := time.Now()
	record.ResolvedAt = &now
	record.ResolutionNotes = resolution

	return e.reconRepo.UpdateRecord(ctx, record)
}

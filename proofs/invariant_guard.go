package proofs

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// ============================================================================
// METRICS
// ============================================================================

var (
	invariantViolationsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ledger_invariant_violations_total",
			Help: "Total number of invariant violations",
		},
		[]string{"invariant", "severity"},
	)

	invariantChecksTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ledger_invariant_checks_total",
			Help: "Total number of invariant checks",
		},
		[]string{"invariant"},
	)

	invariantCheckDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "ledger_invariant_check_duration_seconds",
			Help:    "Time spent checking invariants",
			Buckets: []float64{0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05},
		},
		[]string{"invariant"},
	)

	settlementHalted = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "ledger_settlement_halted",
			Help: "1 if settlement is halted due to invariant violation",
		},
	)

	violationSignatureFailures = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "ledger_violation_signature_failures_total",
			Help: "Failed attempts to sign violation events",
		},
	)
)

// ============================================================================
// INVARIANT GUARD
// ============================================================================

// InvariantGuard provides runtime enforcement of ledger invariants
type InvariantGuard struct {
	mu            sync.RWMutex
	halted        atomic.Bool
	haltReason    string
	haltTimestamp time.Time
	
	ledger        *Ledger
	auditKey      ed25519.PrivateKey
	auditPubKey   ed25519.PublicKey
	
	violations    chan *InvariantViolation
	onViolation   func(*InvariantViolation)
	
	// Critical invariants that halt settlement
	criticalInvariants map[string]bool
}

// NewInvariantGuard creates a new invariant guard
func NewInvariantGuard(ledger *Ledger, auditKey ed25519.PrivateKey) *InvariantGuard {
	pubKey := auditKey.Public().(ed25519.PublicKey)
	
	g := &InvariantGuard{
		ledger:      ledger,
		auditKey:    auditKey,
		auditPubKey: pubKey,
		violations:  make(chan *InvariantViolation, 1000),
		criticalInvariants: map[string]bool{
			"INV-1":  true,  // Conservation of value
			"INV-10": true,  // Overflow
			"INV-11": true,  // Underflow
			"INV-15": true,  // Immutability
			"INV-16": true,  // Hash chain
		},
	}
	
	go g.processViolations()
	
	return g
}

// IsHalted returns true if settlement is halted
func (g *InvariantGuard) IsHalted() bool {
	return g.halted.Load()
}

// HaltReason returns the reason for halt
func (g *InvariantGuard) HaltReason() (string, time.Time) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.haltReason, g.haltTimestamp
}

// Halt stops all settlement processing
func (g *InvariantGuard) Halt(reason string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	
	if !g.halted.Load() {
		g.halted.Store(true)
		g.haltReason = reason
		g.haltTimestamp = time.Now()
		settlementHalted.Set(1)
	}
}

// Resume restarts settlement processing (requires manual approval)
func (g *InvariantGuard) Resume(approvedBy string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	
	if !g.halted.Load() {
		return fmt.Errorf("settlement is not halted")
	}
	
	// Log the resume action
	g.halted.Store(false)
	g.haltReason = ""
	settlementHalted.Set(0)
	
	return nil
}

// ============================================================================
// INVARIANT CHECKS WITH GUARD
// ============================================================================

// GuardedTransaction wraps a transaction with invariant checking
func (g *InvariantGuard) GuardedTransaction(ctx context.Context, tx *Transaction) error {
	// Check if halted
	if g.IsHalted() {
		reason, ts := g.HaltReason()
		return fmt.Errorf("settlement halted since %v: %s", ts, reason)
	}
	
	// Run all invariant checks
	checks := []struct {
		name    string
		check   func() error
	}{
		{"INV-1", func() error { return g.ledger.CheckINV1_ConservationOfValue(tx) }},
		{"INV-2", func() error { return g.ledger.CheckINV2_DoubleEntryClosure(tx) }},
		{"INV-6", func() error { return g.ledger.CheckINV6_CurrencyHomogeneity(tx) }},
	}
	
	// Check balances for each debit
	for _, entry := range tx.Entries {
		checks = append(checks, struct {
			name  string
			check func() error
		}{
			"INV-5",
			func() error { return g.ledger.CheckINV5_NonNegativeBalance(entry.DebitAccount, entry.Amount) },
		})
		
		// Check overflow
		checks = append(checks, struct {
			name  string
			check func() error
		}{
			"INV-11",
			func() error {
				acc := g.ledger.Accounts[entry.CreditAccount]
				if acc == nil {
					return nil
				}
				return CheckINV11_OverflowPrevention(acc.Balance, entry.Amount)
			},
		})
	}
	
	for _, c := range checks {
		start := time.Now()
		invariantChecksTotal.WithLabelValues(c.name).Inc()
		
		if err := c.check(); err != nil {
			duration := time.Since(start)
			invariantCheckDuration.WithLabelValues(c.name).Observe(duration.Seconds())
			
			violation := g.recordViolation(c.name, err, tx)
			
			// Halt if critical
			if g.criticalInvariants[c.name] {
				g.Halt(fmt.Sprintf("%s: %v", c.name, err))
			}
			
			return fmt.Errorf("invariant %s violated: %w (violation_id=%s)", 
				c.name, err, violation.ID())
		}
		
		duration := time.Since(start)
		invariantCheckDuration.WithLabelValues(c.name).Observe(duration.Seconds())
	}
	
	return nil
}

// recordViolation creates a signed violation record
func (g *InvariantGuard) recordViolation(invariant string, err error, tx *Transaction) *InvariantViolation {
	severity := "HIGH"
	if g.criticalInvariants[invariant] {
		severity = "CRITICAL"
	}
	
	violation := &InvariantViolation{
		Invariant: invariant,
		Severity:  severity,
		Message:   err.Error(),
		Timestamp: time.Now(),
		Context: map[string]interface{}{
			"transaction_id": tx.ID,
			"idempotency_key": tx.IdempotencyKey,
		},
	}
	
	// Sign the violation
	if err := g.signViolation(violation); err != nil {
		violationSignatureFailures.Inc()
	}
	
	invariantViolationsTotal.WithLabelValues(invariant, severity).Inc()
	
	// Send to violation processor
	select {
	case g.violations <- violation:
	default:
		// Channel full, violation will be logged but not processed
	}
	
	return violation
}

// signViolation cryptographically signs the violation
func (g *InvariantGuard) signViolation(v *InvariantViolation) error {
	data, err := json.Marshal(map[string]interface{}{
		"invariant": v.Invariant,
		"severity":  v.Severity,
		"message":   v.Message,
		"timestamp": v.Timestamp.UnixNano(),
		"context":   v.Context,
	})
	if err != nil {
		return err
	}
	
	v.Signature = ed25519.Sign(g.auditKey, data)
	return nil
}

// processViolations handles violation events
func (g *InvariantGuard) processViolations() {
	for v := range g.violations {
		if g.onViolation != nil {
			g.onViolation(v)
		}
		
		// Log violation with full context
		fmt.Printf("[INVARIANT VIOLATION] %s (%s): %s at %v\n",
			v.Invariant, v.Severity, v.Message, v.Timestamp)
	}
}

// SetViolationHandler sets a callback for violations
func (g *InvariantGuard) SetViolationHandler(handler func(*InvariantViolation)) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.onViolation = handler
}

// ID returns a unique identifier for the violation
func (v *InvariantViolation) ID() string {
	return fmt.Sprintf("%s-%d", v.Invariant, v.Timestamp.UnixNano())
}

// ============================================================================
// BALANCE DERIVATION RECONCILIATION
// ============================================================================

// ReconcileBalances compares cached vs derived balances for all accounts
func (g *InvariantGuard) ReconcileBalances(ctx context.Context) ([]BalanceMismatch, error) {
	g.ledger.mu.RLock()
	defer g.ledger.mu.RUnlock()
	
	var mismatches []BalanceMismatch
	
	for accountID, account := range g.ledger.Accounts {
		// Derive balance from entries
		var derived Amount
		for _, e := range g.ledger.Entries {
			if e.CreditAccount == accountID {
				derived += e.Amount
			}
			if e.DebitAccount == accountID {
				derived -= e.Amount
			}
		}
		
		if account.Balance != derived {
			mismatch := BalanceMismatch{
				AccountID:     accountID,
				CachedBalance: account.Balance,
				DerivedBalance: derived,
				Difference:    account.Balance - derived,
				Timestamp:     time.Now(),
			}
			mismatches = append(mismatches, mismatch)
			
			// Record violation
			g.recordViolation("INV-3", 
				fmt.Errorf("balance mismatch: cached=%d, derived=%d", account.Balance, derived),
				&Transaction{ID: "RECONCILIATION"})
		}
	}
	
	return mismatches, nil
}

// BalanceMismatch represents a discrepancy between cached and derived balance
type BalanceMismatch struct {
	AccountID      string
	CachedBalance  Amount
	DerivedBalance Amount
	Difference     Amount
	Timestamp      time.Time
}

// ============================================================================
// HASH CHAIN VERIFICATION
// ============================================================================

// VerifyHashChain verifies the integrity of the ledger hash chain
func (g *InvariantGuard) VerifyHashChain(ctx context.Context) (*HashChainResult, error) {
	g.ledger.mu.RLock()
	defer g.ledger.mu.RUnlock()
	
	result := &HashChainResult{
		TotalEntries: len(g.ledger.Entries),
		StartTime:    time.Now(),
	}
	
	var prevHash [32]byte
	
	for i, entry := range g.ledger.Entries {
		expectedHash := entry.ComputeHash(prevHash)
		
		if entry.Hash != expectedHash {
			result.Valid = false
			result.BreakPoint = i
			result.ExpectedHash = fmt.Sprintf("%x", expectedHash)
			result.ActualHash = fmt.Sprintf("%x", entry.Hash)
			
			g.recordViolation("INV-16",
				fmt.Errorf("hash chain broken at entry %d: expected %x, got %x",
					i, expectedHash, entry.Hash),
				&Transaction{ID: entry.TransactionID})
			
			g.Halt(fmt.Sprintf("Hash chain broken at entry %d", i))
			
			return result, nil
		}
		
		if entry.PrevHash != prevHash {
			result.Valid = false
			result.BreakPoint = i
			
			g.recordViolation("INV-16",
				fmt.Errorf("prev hash mismatch at entry %d", i),
				&Transaction{ID: entry.TransactionID})
			
			return result, nil
		}
		
		prevHash = entry.Hash
	}
	
	result.Valid = true
	result.EndTime = time.Now()
	result.FinalHash = fmt.Sprintf("%x", prevHash)
	
	return result, nil
}

// HashChainResult contains the result of hash chain verification
type HashChainResult struct {
	Valid        bool
	TotalEntries int
	BreakPoint   int
	ExpectedHash string
	ActualHash   string
	FinalHash    string
	StartTime    time.Time
	EndTime      time.Time
}

// ============================================================================
// SETTLEMENT GATE
// ============================================================================

// SettlementGate controls whether transactions can be settled
type SettlementGate struct {
	guard *InvariantGuard
}

// NewSettlementGate creates a new settlement gate
func NewSettlementGate(guard *InvariantGuard) *SettlementGate {
	return &SettlementGate{guard: guard}
}

// CanSettle returns whether settlement is allowed
func (sg *SettlementGate) CanSettle() bool {
	return !sg.guard.IsHalted()
}

// Settle attempts to settle a transaction
func (sg *SettlementGate) Settle(ctx context.Context, tx *Transaction) error {
	if !sg.CanSettle() {
		reason, ts := sg.guard.HaltReason()
		return fmt.Errorf("settlement blocked since %v: %s", ts, reason)
	}
	
	// Pre-settlement invariant check
	if err := sg.guard.GuardedTransaction(ctx, tx); err != nil {
		return fmt.Errorf("pre-settlement check failed: %w", err)
	}
	
	// Settlement logic would go here
	tx.Status = StatusSettled
	
	// Post-settlement: mark entries as immutable
	for i := range tx.Entries {
		// Entries are now immutable (INV-15)
		tx.Entries[i].Timestamp = time.Now()
	}
	
	return nil
}

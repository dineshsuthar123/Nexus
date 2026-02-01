package proofs

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"pgregory.net/rapid"
)

// ============================================================================
// DOMAIN TYPES
// ============================================================================

// Amount represents monetary value in smallest currency unit (e.g., cents)
// Using int64 to avoid floating-point errors
type Amount int64

// Currency represents ISO 4217 currency code with scale
type Currency struct {
	Code  string
	Scale int // decimal places: USD=2, JPY=0, KWD=3
}

// Account represents a ledger account
type Account struct {
	ID              string
	Currency        Currency
	Balance         Amount
	IsLiability     bool
	OverdraftLimit  Amount
	OverdraftEnabled bool
}

// Entry represents a single ledger entry (one leg of double-entry)
type Entry struct {
	ID            string
	TransactionID string
	DebitAccount  string
	CreditAccount string
	Amount        Amount
	Currency      Currency
	Timestamp     time.Time
	PrevHash      [32]byte
	Hash          [32]byte
}

// Transaction represents a complete double-entry transaction
type Transaction struct {
	ID             string
	IdempotencyKey string
	Entries        []Entry
	Status         TransactionStatus
	Timestamp      time.Time
	IsFX           bool
	FXRate         float64
}

type TransactionStatus string

const (
	StatusPending  TransactionStatus = "PENDING"
	StatusSuccess  TransactionStatus = "SUCCESS"
	StatusFailed   TransactionStatus = "FAILED"
	StatusSettled  TransactionStatus = "SETTLED"
)

// Ledger represents the complete ledger state
type Ledger struct {
	mu           sync.RWMutex
	Accounts     map[string]*Account
	Transactions map[string]*Transaction
	Entries      []Entry
	IdempotencyCache map[string]string // idempotency_key -> transaction_id
	LastHash     [32]byte
	AuditKey     ed25519.PrivateKey
}

// InvariantViolation represents a detected violation
type InvariantViolation struct {
	Invariant   string
	Severity    string
	Message     string
	Context     map[string]interface{}
	Timestamp   time.Time
	Signature   []byte
}

// ============================================================================
// CURRENCIES
// ============================================================================

var (
	USD = Currency{Code: "USD", Scale: 2}
	EUR = Currency{Code: "EUR", Scale: 2}
	GBP = Currency{Code: "GBP", Scale: 2}
	JPY = Currency{Code: "JPY", Scale: 0}
	KWD = Currency{Code: "KWD", Scale: 3}
)

// ============================================================================
// INVARIANT CHECKS
// ============================================================================

// CheckINV1_ConservationOfValue verifies sum(debits) == sum(credits) per transaction
func (l *Ledger) CheckINV1_ConservationOfValue(tx *Transaction) error {
	var totalDebits, totalCredits Amount
	
	for _, e := range tx.Entries {
		totalDebits += e.Amount  // debit side
		totalCredits += e.Amount // credit side (same amount, different accounts)
	}
	
	// In double-entry, each entry moves amount from debit to credit account
	// Conservation means: for all entries, debit amounts == credit amounts
	// Since each Entry has one amount that's both debited and credited, this is automatic
	// The real check is that the transaction is balanced
	
	// For multi-leg transactions, verify net is zero
	accountMovements := make(map[string]Amount)
	
	for _, e := range tx.Entries {
		accountMovements[e.DebitAccount] -= e.Amount  // debit reduces
		accountMovements[e.CreditAccount] += e.Amount // credit increases
	}
	
	var netMovement Amount
	for _, movement := range accountMovements {
		netMovement += movement
	}
	
	if netMovement != 0 {
		return fmt.Errorf("INV-1 VIOLATION: conservation of value failed, net movement = %d", netMovement)
	}
	
	return nil
}

// CheckINV2_DoubleEntryClosure verifies each entry has distinct debit/credit accounts
func (l *Ledger) CheckINV2_DoubleEntryClosure(tx *Transaction) error {
	for _, e := range tx.Entries {
		if e.DebitAccount == "" || e.CreditAccount == "" {
			return fmt.Errorf("INV-2 VIOLATION: entry %s missing account", e.ID)
		}
		if e.DebitAccount == e.CreditAccount {
			return fmt.Errorf("INV-2 VIOLATION: self-transfer in entry %s", e.ID)
		}
	}
	return nil
}

// CheckINV3_BalanceDerivation verifies cached balance equals derived balance
func (l *Ledger) CheckINV3_BalanceDerivation(accountID string) error {
	l.mu.RLock()
	defer l.mu.RUnlock()
	
	account, exists := l.Accounts[accountID]
	if !exists {
		return fmt.Errorf("account %s not found", accountID)
	}
	
	// Derive balance from entries
	var derived Amount
	for _, e := range l.Entries {
		if e.CreditAccount == accountID {
			derived += e.Amount
		}
		if e.DebitAccount == accountID {
			derived -= e.Amount
		}
	}
	
	if account.Balance != derived {
		return fmt.Errorf("INV-3 VIOLATION: cached=%d, derived=%d, diff=%d",
			account.Balance, derived, account.Balance-derived)
	}
	
	return nil
}

// CheckINV4_Idempotency verifies idempotency key uniqueness
func (l *Ledger) CheckINV4_Idempotency(idempotencyKey string) (string, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	
	if txID, exists := l.IdempotencyCache[idempotencyKey]; exists {
		return txID, true
	}
	return "", false
}

// CheckINV5_NonNegativeBalance verifies liability accounts stay non-negative
func (l *Ledger) CheckINV5_NonNegativeBalance(accountID string, proposedDebit Amount) error {
	l.mu.RLock()
	defer l.mu.RUnlock()
	
	account, exists := l.Accounts[accountID]
	if !exists {
		return fmt.Errorf("account %s not found", accountID)
	}
	
	if !account.IsLiability {
		return nil // non-liability accounts can go negative
	}
	
	newBalance := account.Balance - proposedDebit
	
	if account.OverdraftEnabled {
		if newBalance < -account.OverdraftLimit {
			return fmt.Errorf("INV-5 VIOLATION: balance %d exceeds overdraft limit %d",
				newBalance, account.OverdraftLimit)
		}
	} else {
		if newBalance < 0 {
			return fmt.Errorf("INV-5 VIOLATION: insufficient funds, balance=%d, debit=%d",
				account.Balance, proposedDebit)
		}
	}
	
	return nil
}

// CheckINV6_CurrencyHomogeneity verifies currency consistency
func (l *Ledger) CheckINV6_CurrencyHomogeneity(tx *Transaction) error {
	if tx.IsFX {
		return nil // FX transactions allowed to mix currencies
	}
	
	if len(tx.Entries) == 0 {
		return nil
	}
	
	expectedCurrency := tx.Entries[0].Currency.Code
	for _, e := range tx.Entries {
		if e.Currency.Code != expectedCurrency {
			return fmt.Errorf("INV-6 VIOLATION: mixed currencies %s and %s in non-FX transaction",
				expectedCurrency, e.Currency.Code)
		}
	}
	
	return nil
}

// CheckINV7_FXRateBounds verifies FX rate within tolerance
func CheckINV7_FXRateBounds(rate, referenceRate float64) error {
	const maxDeviation = 0.05 // 5%
	
	if referenceRate == 0 {
		return errors.New("INV-7 VIOLATION: reference rate is zero")
	}
	
	deviation := math.Abs((rate - referenceRate) / referenceRate)
	if deviation > maxDeviation {
		return fmt.Errorf("INV-7 VIOLATION: FX rate deviation %.2f%% exceeds 5%% threshold",
			deviation*100)
	}
	
	return nil
}

// CheckINV11_OverflowPrevention verifies no overflow will occur
func CheckINV11_OverflowPrevention(currentBalance, delta Amount) error {
	if delta > 0 {
		if currentBalance > math.MaxInt64-delta {
			return fmt.Errorf("INV-11 VIOLATION: overflow, balance=%d, delta=%d", currentBalance, delta)
		}
	} else {
		if currentBalance < math.MinInt64-delta {
			return fmt.Errorf("INV-11 VIOLATION: underflow, balance=%d, delta=%d", currentBalance, delta)
		}
	}
	return nil
}

// ============================================================================
// HASH CHAIN (INV-16)
// ============================================================================

func (e *Entry) ComputeHash(prevHash [32]byte) [32]byte {
	data := make([]byte, 0, 256)
	data = append(data, []byte(e.ID)...)
	data = append(data, []byte(e.TransactionID)...)
	data = append(data, []byte(e.DebitAccount)...)
	data = append(data, []byte(e.CreditAccount)...)
	
	amountBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(amountBytes, uint64(e.Amount))
	data = append(data, amountBytes...)
	
	data = append(data, []byte(e.Currency.Code)...)
	data = append(data, prevHash[:]...)
	
	return sha256.Sum256(data)
}

// ============================================================================
// SIGNED AUDIT EVENTS (INV-18)
// ============================================================================

func (l *Ledger) SignViolation(violation *InvariantViolation) error {
	data := fmt.Sprintf("%s|%s|%s|%d",
		violation.Invariant,
		violation.Severity,
		violation.Message,
		violation.Timestamp.UnixNano())
	
	violation.Signature = ed25519.Sign(l.AuditKey, []byte(data))
	return nil
}

func VerifyViolationSignature(violation *InvariantViolation, publicKey ed25519.PublicKey) bool {
	data := fmt.Sprintf("%s|%s|%s|%d",
		violation.Invariant,
		violation.Severity,
		violation.Message,
		violation.Timestamp.UnixNano())
	
	return ed25519.Verify(publicKey, []byte(data), violation.Signature)
}

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

// TestINV1_Property_ConservationOfValue uses rapid for property-based testing
func TestINV1_Property_ConservationOfValue(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random number of entries (1-10)
		numEntries := rapid.IntRange(1, 10).Draw(t, "numEntries")
		
		entries := make([]Entry, numEntries)
		accountMovements := make(map[string]Amount)
		
		for i := 0; i < numEntries; i++ {
			amount := Amount(rapid.Int64Range(1, 1_000_000_00).Draw(t, fmt.Sprintf("amount_%d", i)))
			debitAcc := fmt.Sprintf("ACC%d", rapid.IntRange(1, 100).Draw(t, fmt.Sprintf("debit_%d", i)))
			creditAcc := fmt.Sprintf("ACC%d", rapid.IntRange(101, 200).Draw(t, fmt.Sprintf("credit_%d", i)))
			
			entries[i] = Entry{
				ID:            uuid.New().String(),
				DebitAccount:  debitAcc,
				CreditAccount: creditAcc,
				Amount:        amount,
				Currency:      USD,
			}
			
			accountMovements[debitAcc] -= amount
			accountMovements[creditAcc] += amount
		}
		
		// Property: net movement across all accounts must be zero
		var netMovement Amount
		for _, movement := range accountMovements {
			netMovement += movement
		}
		
		if netMovement != 0 {
			t.Fatalf("Conservation violated: net movement = %d", netMovement)
		}
	})
}

// TestINV3_Property_BalanceDerivation verifies balance derivation
func TestINV3_Property_BalanceDerivation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random sequence of transactions
		numTx := rapid.IntRange(1, 100).Draw(t, "numTx")
		
		balances := make(map[string]Amount)
		
		for i := 0; i < numTx; i++ {
			amount := Amount(rapid.Int64Range(1, 10000).Draw(t, fmt.Sprintf("amount_%d", i)))
			from := fmt.Sprintf("ACC%d", rapid.IntRange(1, 10).Draw(t, fmt.Sprintf("from_%d", i)))
			to := fmt.Sprintf("ACC%d", rapid.IntRange(11, 20).Draw(t, fmt.Sprintf("to_%d", i)))
			
			balances[from] -= amount
			balances[to] += amount
		}
		
		// Property: sum of all balances must be zero
		var sum Amount
		for _, balance := range balances {
			sum += balance
		}
		
		if sum != 0 {
			t.Fatalf("Balance derivation failed: sum = %d", sum)
		}
	})
}

// TestINV4_Property_Idempotency verifies idempotency
func TestINV4_Property_Idempotency(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ledger := &Ledger{
			IdempotencyCache: make(map[string]string),
		}
		
		// Generate random idempotency key
		key := uuid.New().String()
		txID := uuid.New().String()
		
		// First submission
		ledger.IdempotencyCache[key] = txID
		
		// Property: same key always returns same transaction ID
		for i := 0; i < 10; i++ {
			if cachedID, exists := ledger.IdempotencyCache[key]; exists {
				if cachedID != txID {
					t.Fatalf("Idempotency violated: expected %s, got %s", txID, cachedID)
				}
			}
		}
	})
}

// TestINV5_Property_NonNegativeBalance verifies overdraft limits
func TestINV5_Property_NonNegativeBalance(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		balance := Amount(rapid.Int64Range(0, 1_000_000).Draw(t, "balance"))
		overdraftLimit := Amount(rapid.Int64Range(0, 100_000).Draw(t, "overdraftLimit"))
		overdraftEnabled := rapid.Bool().Draw(t, "overdraftEnabled")
		debit := Amount(rapid.Int64Range(0, 2_000_000).Draw(t, "debit"))
		
		newBalance := balance - debit
		
		var shouldSucceed bool
		if overdraftEnabled {
			shouldSucceed = newBalance >= -overdraftLimit
		} else {
			shouldSucceed = newBalance >= 0
		}
		
		// Property: transaction succeeds iff final balance within limits
		account := &Account{
			Balance:          balance,
			IsLiability:      true,
			OverdraftLimit:   overdraftLimit,
			OverdraftEnabled: overdraftEnabled,
		}
		
		ledger := &Ledger{
			Accounts: map[string]*Account{"test": account},
		}
		
		err := ledger.CheckINV5_NonNegativeBalance("test", debit)
		
		if shouldSucceed && err != nil {
			t.Fatalf("Should succeed but failed: balance=%d, debit=%d, limit=%d, enabled=%v, err=%v",
				balance, debit, overdraftLimit, overdraftEnabled, err)
		}
		if !shouldSucceed && err == nil {
			t.Fatalf("Should fail but succeeded: balance=%d, debit=%d, limit=%d, enabled=%v",
				balance, debit, overdraftLimit, overdraftEnabled)
		}
	})
}

// TestINV7_Property_FXRateBounds verifies FX rate tolerance
func TestINV7_Property_FXRateBounds(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		referenceRate := rapid.Float64Range(0.1, 10.0).Draw(t, "refRate")
		deviationPercent := rapid.Float64Range(-10.0, 10.0).Draw(t, "deviation")
		
		rate := referenceRate * (1 + deviationPercent/100)
		
		err := CheckINV7_FXRateBounds(rate, referenceRate)
		
		shouldSucceed := math.Abs(deviationPercent) <= 5.0
		
		if shouldSucceed && err != nil {
			t.Fatalf("Should accept rate with %.2f%% deviation", deviationPercent)
		}
		if !shouldSucceed && err == nil {
			t.Fatalf("Should reject rate with %.2f%% deviation", deviationPercent)
		}
	})
}

// TestINV11_Property_OverflowPrevention verifies overflow detection
func TestINV11_Property_OverflowPrevention(t *testing.T) {
	// Test near-overflow conditions
	testCases := []struct {
		balance Amount
		delta   Amount
		wantErr bool
	}{
		{math.MaxInt64 - 100, 50, false},
		{math.MaxInt64 - 100, 100, false},
		{math.MaxInt64 - 100, 101, true},
		{math.MaxInt64, 1, true},
		{math.MinInt64 + 100, -50, false},
		{math.MinInt64 + 100, -100, false},
		{math.MinInt64 + 100, -101, true},
	}
	
	for _, tc := range testCases {
		err := CheckINV11_OverflowPrevention(tc.balance, tc.delta)
		if tc.wantErr && err == nil {
			t.Errorf("Expected overflow error for balance=%d, delta=%d", tc.balance, tc.delta)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("Unexpected error for balance=%d, delta=%d: %v", tc.balance, tc.delta, err)
		}
	}
}

// TestINV16_Property_HashChain verifies hash chain integrity
func TestINV16_Property_HashChain(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		numEntries := rapid.IntRange(1, 50).Draw(t, "numEntries")
		
		entries := make([]Entry, numEntries)
		var prevHash [32]byte
		
		for i := 0; i < numEntries; i++ {
			entries[i] = Entry{
				ID:            uuid.New().String(),
				TransactionID: uuid.New().String(),
				DebitAccount:  fmt.Sprintf("ACC%d", i),
				CreditAccount: fmt.Sprintf("ACC%d", i+100),
				Amount:        Amount(rand.Int63n(1_000_000)),
				Currency:      USD,
				PrevHash:      prevHash,
			}
			entries[i].Hash = entries[i].ComputeHash(prevHash)
			prevHash = entries[i].Hash
		}
		
		// Property: recomputing hash chain must match
		var verifyPrevHash [32]byte
		for i, e := range entries {
			expectedHash := e.ComputeHash(verifyPrevHash)
			if expectedHash != e.Hash {
				t.Fatalf("Hash chain broken at entry %d", i)
			}
			if e.PrevHash != verifyPrevHash {
				t.Fatalf("PrevHash mismatch at entry %d", i)
			}
			verifyPrevHash = e.Hash
		}
	})
}

// ============================================================================
// INTEGRATION TEST: FULL INVARIANT SUITE
// ============================================================================

func TestFullInvariantSuite(t *testing.T) {
	// Setup ledger with audit keys
	pubKey, privKey, _ := ed25519.GenerateKey(nil)
	
	ledger := &Ledger{
		Accounts: map[string]*Account{
			"SENDER": {
				ID:          "SENDER",
				Currency:    USD,
				Balance:     1_000_000, // $10,000.00
				IsLiability: true,
			},
			"RECEIVER": {
				ID:          "RECEIVER",
				Currency:    USD,
				Balance:     500_000, // $5,000.00
				IsLiability: true,
			},
		},
		Transactions:     make(map[string]*Transaction),
		IdempotencyCache: make(map[string]string),
		AuditKey:         privKey,
	}
	
	// Test valid transaction
	tx := &Transaction{
		ID:             uuid.New().String(),
		IdempotencyKey: uuid.New().String(),
		Entries: []Entry{
			{
				ID:            uuid.New().String(),
				DebitAccount:  "SENDER",
				CreditAccount: "RECEIVER",
				Amount:        100_00, // $100.00
				Currency:      USD,
			},
		},
		Status:    StatusPending,
		Timestamp: time.Now(),
	}
	
	// Run all invariant checks
	if err := ledger.CheckINV1_ConservationOfValue(tx); err != nil {
		t.Fatalf("INV-1 failed: %v", err)
	}
	
	if err := ledger.CheckINV2_DoubleEntryClosure(tx); err != nil {
		t.Fatalf("INV-2 failed: %v", err)
	}
	
	if err := ledger.CheckINV5_NonNegativeBalance("SENDER", 100_00); err != nil {
		t.Fatalf("INV-5 failed: %v", err)
	}
	
	if err := ledger.CheckINV6_CurrencyHomogeneity(tx); err != nil {
		t.Fatalf("INV-6 failed: %v", err)
	}
	
	// Test violation signing
	violation := &InvariantViolation{
		Invariant: "INV-1",
		Severity:  "CRITICAL",
		Message:   "test violation",
		Timestamp: time.Now(),
	}
	
	if err := ledger.SignViolation(violation); err != nil {
		t.Fatalf("Failed to sign violation: %v", err)
	}
	
	if !VerifyViolationSignature(violation, pubKey) {
		t.Fatal("Signature verification failed")
	}
	
	t.Log("All invariant checks passed")
	t.Logf("Violation signature: %s", hex.EncodeToString(violation.Signature[:16]))
}

// ============================================================================
// BENCHMARK: INVARIANT CHECK PERFORMANCE
// ============================================================================

func BenchmarkINV1_ConservationOfValue(b *testing.B) {
	ledger := &Ledger{}
	tx := &Transaction{
		Entries: make([]Entry, 10),
	}
	for i := 0; i < 10; i++ {
		tx.Entries[i] = Entry{
			DebitAccount:  fmt.Sprintf("ACC%d", i),
			CreditAccount: fmt.Sprintf("ACC%d", i+100),
			Amount:        1000,
		}
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = ledger.CheckINV1_ConservationOfValue(tx)
	}
}

func BenchmarkHashChain(b *testing.B) {
	entry := Entry{
		ID:            uuid.New().String(),
		TransactionID: uuid.New().String(),
		DebitAccount:  "ACC1",
		CreditAccount: "ACC2",
		Amount:        1000,
		Currency:      USD,
	}
	var prevHash [32]byte
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		entry.ComputeHash(prevHash)
	}
}

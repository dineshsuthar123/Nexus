package replay

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

// ============================================================================
// DOMAIN TYPES
// ============================================================================

// Amount represents monetary value in smallest currency unit
type Amount int64

// Event represents a ledger event from Kafka
type Event struct {
	ID            string          `json:"id"`
	Type          EventType       `json:"type"`
	Timestamp     time.Time       `json:"timestamp"`
	AccountID     string          `json:"account_id"`
	TransactionID string          `json:"transaction_id"`
	Amount        Amount          `json:"amount"`
	Currency      string          `json:"currency"`
	Direction     Direction       `json:"direction"` // CREDIT or DEBIT
	Metadata      json.RawMessage `json:"metadata"`
	Offset        int64           `json:"offset"`     // Kafka offset
	Partition     int32           `json:"partition"`  // Kafka partition
}

type EventType string

const (
	EventTypeCredit       EventType = "CREDIT"
	EventTypeDebit        EventType = "DEBIT"
	EventTypeReversal     EventType = "REVERSAL"
	EventTypeFXConversion EventType = "FX_CONVERSION"
	EventTypeAdjustment   EventType = "ADJUSTMENT"
)

type Direction string

const (
	DirectionCredit Direction = "CREDIT"
	DirectionDebit  Direction = "DEBIT"
)

// AccountState represents derived account state at a point in time
type AccountState struct {
	AccountID string    `json:"account_id"`
	Balance   Amount    `json:"balance"`
	Currency  string    `json:"currency"`
	AsOf      time.Time `json:"as_of"`
	EventHash string    `json:"event_hash"` // Hash of last applied event
}

// ReplayState represents complete ledger state at a point in time
type ReplayState struct {
	Accounts   map[string]*AccountState `json:"accounts"`
	Timestamp  time.Time                `json:"timestamp"`
	EventCount int64                    `json:"event_count"`
	FinalHash  string                   `json:"final_hash"`
}

// ============================================================================
// REPLAY ENGINE
// ============================================================================

// ReplayEngine rebuilds ledger state from raw Kafka events
type ReplayEngine struct {
	mu sync.RWMutex
	
	// Event storage (in production, this reads from Kafka)
	events       []Event
	eventsByAcct map[string][]Event
	
	// State snapshots for faster replay
	snapshots    map[time.Time]*ReplayState
	
	// Configuration
	snapshotInterval time.Duration
}

// NewReplayEngine creates a new replay engine
func NewReplayEngine() *ReplayEngine {
	return &ReplayEngine{
		events:           make([]Event, 0),
		eventsByAcct:     make(map[string][]Event),
		snapshots:        make(map[time.Time]*ReplayState),
		snapshotInterval: 24 * time.Hour,
	}
}

// IngestEvent adds an event to the replay log
func (r *ReplayEngine) IngestEvent(event Event) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	// Validate event
	if event.ID == "" || event.AccountID == "" {
		return errors.New("invalid event: missing ID or AccountID")
	}
	
	// Append to global log (maintains Kafka ordering)
	r.events = append(r.events, event)
	
	// Index by account
	r.eventsByAcct[event.AccountID] = append(r.eventsByAcct[event.AccountID], event)
	
	return nil
}

// ReplayToTimestamp rebuilds state at exact timestamp
func (r *ReplayEngine) ReplayToTimestamp(ctx context.Context, target time.Time) (*ReplayState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	// Find closest snapshot before target
	var baseSnapshot *ReplayState
	var baseTime time.Time
	
	for t, snap := range r.snapshots {
		if t.Before(target) && t.After(baseTime) {
			baseTime = t
			baseSnapshot = snap
		}
	}
	
	// Initialize state
	state := &ReplayState{
		Accounts:  make(map[string]*AccountState),
		Timestamp: target,
	}
	
	if baseSnapshot != nil {
		// Copy from snapshot
		for accID, accState := range baseSnapshot.Accounts {
			state.Accounts[accID] = &AccountState{
				AccountID: accID,
				Balance:   accState.Balance,
				Currency:  accState.Currency,
			}
		}
	}
	
	// Apply events from baseTime to target
	var lastHash [32]byte
	for _, event := range r.events {
		// Skip events before snapshot
		if baseSnapshot != nil && event.Timestamp.Before(baseTime) {
			continue
		}
		
		// Stop at target time
		if event.Timestamp.After(target) {
			break
		}
		
		// Apply event
		if err := r.applyEvent(state, event); err != nil {
			return nil, fmt.Errorf("failed to apply event %s: %w", event.ID, err)
		}
		
		state.EventCount++
		lastHash = r.computeEventHash(event, lastHash)
	}
	
	state.FinalHash = fmt.Sprintf("%x", lastHash)
	
	return state, nil
}

// applyEvent applies a single event to the state
func (r *ReplayEngine) applyEvent(state *ReplayState, event Event) error {
	// Get or create account state
	acct, exists := state.Accounts[event.AccountID]
	if !exists {
		acct = &AccountState{
			AccountID: event.AccountID,
			Currency:  event.Currency,
			Balance:   0,
		}
		state.Accounts[event.AccountID] = acct
	}
	
	// Apply based on direction
	switch event.Direction {
	case DirectionCredit:
		acct.Balance += event.Amount
	case DirectionDebit:
		acct.Balance -= event.Amount
	default:
		return fmt.Errorf("unknown direction: %s", event.Direction)
	}
	
	acct.AsOf = event.Timestamp
	
	return nil
}

// computeEventHash computes deterministic hash for event chain
func (r *ReplayEngine) computeEventHash(event Event, prevHash [32]byte) [32]byte {
	data := make([]byte, 0, 256)
	data = append(data, []byte(event.ID)...)
	data = append(data, []byte(event.AccountID)...)
	
	amountBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(amountBytes, uint64(event.Amount))
	data = append(data, amountBytes...)
	
	data = append(data, []byte(event.Currency)...)
	data = append(data, []byte(event.Direction)...)
	
	tsBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(tsBytes, uint64(event.Timestamp.UnixNano()))
	data = append(data, tsBytes...)
	
	data = append(data, prevHash[:]...)
	
	return sha256.Sum256(data)
}

// ============================================================================
// REGULATOR REPLAY MODE
// ============================================================================

// RegulatorReplayRequest specifies what to replay for auditors
type RegulatorReplayRequest struct {
	AccountID string    `json:"account_id"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
}

// RegulatorReplayResult is the complete audit trail
type RegulatorReplayResult struct {
	Request        RegulatorReplayRequest `json:"request"`
	OpeningBalance Amount                 `json:"opening_balance"`
	ClosingBalance Amount                 `json:"closing_balance"`
	Events         []EventWithRunning     `json:"events"`
	NetChange      Amount                 `json:"net_change"`
	TotalCredits   Amount                 `json:"total_credits"`
	TotalDebits    Amount                 `json:"total_debits"`
	EventCount     int                    `json:"event_count"`
	HashChain      string                 `json:"hash_chain"` // Final hash
	GeneratedAt    time.Time              `json:"generated_at"`
	VerificationHash string               `json:"verification_hash"`
}

// EventWithRunning includes running balance at each step
type EventWithRunning struct {
	Event          Event  `json:"event"`
	RunningBalance Amount `json:"running_balance"`
	StepHash       string `json:"step_hash"`
}

// RegulatorReplay produces step-by-step balance derivation
func (r *ReplayEngine) RegulatorReplay(ctx context.Context, req RegulatorReplayRequest) (*RegulatorReplayResult, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	result := &RegulatorReplayResult{
		Request:     req,
		GeneratedAt: time.Now(),
		Events:      make([]EventWithRunning, 0),
	}
	
	// Get opening balance (replay to start date)
	openingState, err := r.ReplayToTimestamp(ctx, req.StartDate)
	if err != nil {
		return nil, fmt.Errorf("failed to compute opening balance: %w", err)
	}
	
	if acct, ok := openingState.Accounts[req.AccountID]; ok {
		result.OpeningBalance = acct.Balance
	}
	
	// Get events for this account in date range
	events := r.eventsByAcct[req.AccountID]
	runningBalance := result.OpeningBalance
	var lastHash [32]byte
	
	for _, event := range events {
		// Skip events outside range
		if event.Timestamp.Before(req.StartDate) || event.Timestamp.After(req.EndDate) {
			continue
		}
		
		// Apply event
		switch event.Direction {
		case DirectionCredit:
			runningBalance += event.Amount
			result.TotalCredits += event.Amount
		case DirectionDebit:
			runningBalance -= event.Amount
			result.TotalDebits += event.Amount
		}
		
		lastHash = r.computeEventHash(event, lastHash)
		
		result.Events = append(result.Events, EventWithRunning{
			Event:          event,
			RunningBalance: runningBalance,
			StepHash:       fmt.Sprintf("%x", lastHash),
		})
	}
	
	result.ClosingBalance = runningBalance
	result.NetChange = result.ClosingBalance - result.OpeningBalance
	result.EventCount = len(result.Events)
	result.HashChain = fmt.Sprintf("%x", lastHash)
	
	// Compute verification hash over entire result
	result.VerificationHash = r.computeVerificationHash(result)
	
	return result, nil
}

// computeVerificationHash creates tamper-evident hash of result
func (r *ReplayEngine) computeVerificationHash(result *RegulatorReplayResult) string {
	data := fmt.Sprintf("%s|%d|%d|%d|%d|%s",
		result.Request.AccountID,
		result.OpeningBalance,
		result.ClosingBalance,
		result.EventCount,
		result.GeneratedAt.UnixNano(),
		result.HashChain)
	
	hash := sha256.Sum256([]byte(data))
	return fmt.Sprintf("%x", hash)
}

// ============================================================================
// STATE COMPARISON
// ============================================================================

// ComparisonResult shows differences between two states
type ComparisonResult struct {
	SourceLabel    string              `json:"source_label"`
	TargetLabel    string              `json:"target_label"`
	Match          bool                `json:"match"`
	Discrepancies  []BalanceDiscrepancy `json:"discrepancies,omitempty"`
	MatchedCount   int                 `json:"matched_count"`
	SourceOnly     []string            `json:"source_only,omitempty"`
	TargetOnly     []string            `json:"target_only,omitempty"`
}

// BalanceDiscrepancy represents a balance mismatch
type BalanceDiscrepancy struct {
	AccountID     string `json:"account_id"`
	SourceBalance Amount `json:"source_balance"`
	TargetBalance Amount `json:"target_balance"`
	Difference    Amount `json:"difference"`
}

// CompareStates compares live DB state with replayed state
func CompareStates(source, target *ReplayState, sourceLabel, targetLabel string) *ComparisonResult {
	result := &ComparisonResult{
		SourceLabel:   sourceLabel,
		TargetLabel:   targetLabel,
		Match:         true,
		Discrepancies: make([]BalanceDiscrepancy, 0),
	}
	
	// Track which accounts we've seen
	seen := make(map[string]bool)
	
	// Check source accounts
	for accID, srcAcct := range source.Accounts {
		seen[accID] = true
		
		tgtAcct, exists := target.Accounts[accID]
		if !exists {
			result.SourceOnly = append(result.SourceOnly, accID)
			result.Match = false
			continue
		}
		
		if srcAcct.Balance != tgtAcct.Balance {
			result.Discrepancies = append(result.Discrepancies, BalanceDiscrepancy{
				AccountID:     accID,
				SourceBalance: srcAcct.Balance,
				TargetBalance: tgtAcct.Balance,
				Difference:    srcAcct.Balance - tgtAcct.Balance,
			})
			result.Match = false
		} else {
			result.MatchedCount++
		}
	}
	
	// Check target accounts not in source
	for accID := range target.Accounts {
		if !seen[accID] {
			result.TargetOnly = append(result.TargetOnly, accID)
			result.Match = false
		}
	}
	
	return result
}

// ============================================================================
// SNAPSHOT MANAGEMENT
// ============================================================================

// CreateSnapshot saves current state for faster future replays
func (r *ReplayEngine) CreateSnapshot(ctx context.Context, timestamp time.Time) error {
	state, err := r.ReplayToTimestamp(ctx, timestamp)
	if err != nil {
		return err
	}
	
	r.mu.Lock()
	r.snapshots[timestamp] = state
	r.mu.Unlock()
	
	return nil
}

// ListSnapshots returns available snapshot timestamps
func (r *ReplayEngine) ListSnapshots() []time.Time {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	timestamps := make([]time.Time, 0, len(r.snapshots))
	for t := range r.snapshots {
		timestamps = append(timestamps, t)
	}
	
	sort.Slice(timestamps, func(i, j int) bool {
		return timestamps[i].Before(timestamps[j])
	})
	
	return timestamps
}

// ============================================================================
// KAFKA INTEGRATION (Interface for production use)
// ============================================================================

// EventReader reads events from Kafka
type EventReader interface {
	// ReadEvents reads events in range, calling handler for each
	ReadEvents(ctx context.Context, start, end time.Time, handler func(Event) error) error
	
	// GetLatestOffset returns the latest offset for a topic/partition
	GetLatestOffset(topic string, partition int32) (int64, error)
}

// ReplayFromKafka replays directly from Kafka without loading all events
func (r *ReplayEngine) ReplayFromKafka(ctx context.Context, reader EventReader, target time.Time) (*ReplayState, error) {
	state := &ReplayState{
		Accounts:  make(map[string]*AccountState),
		Timestamp: target,
	}
	
	var lastHash [32]byte
	
	err := reader.ReadEvents(ctx, time.Time{}, target, func(event Event) error {
		if err := r.applyEvent(state, event); err != nil {
			return err
		}
		state.EventCount++
		lastHash = r.computeEventHash(event, lastHash)
		return nil
	})
	
	if err != nil {
		return nil, err
	}
	
	state.FinalHash = fmt.Sprintf("%x", lastHash)
	return state, nil
}

// ============================================================================
// EXPORT FOR AUDIT
// ============================================================================

// ExportReplayResult exports result to JSON for regulators
func (result *RegulatorReplayResult) ExportJSON() ([]byte, error) {
	return json.MarshalIndent(result, "", "  ")
}

// VerifyExported verifies an exported result hasn't been tampered with
func VerifyExported(data []byte) (bool, error) {
	var result RegulatorReplayResult
	if err := json.Unmarshal(data, &result); err != nil {
		return false, err
	}
	
	// Recompute verification hash
	recomputed := fmt.Sprintf("%s|%d|%d|%d|%d|%s",
		result.Request.AccountID,
		result.OpeningBalance,
		result.ClosingBalance,
		result.EventCount,
		result.GeneratedAt.UnixNano(),
		result.HashChain)
	
	hash := sha256.Sum256([]byte(recomputed))
	expected := fmt.Sprintf("%x", hash)
	
	return expected == result.VerificationHash, nil
}

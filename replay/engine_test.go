package replay

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestReplayEngine_BasicReplay(t *testing.T) {
	engine := NewReplayEngine()
	ctx := context.Background()
	
	// Create events
	now := time.Now()
	
	events := []Event{
		{
			ID:            uuid.New().String(),
			Type:          EventTypeCredit,
			Timestamp:     now.Add(-2 * time.Hour),
			AccountID:     "ACC001",
			TransactionID: "TX001",
			Amount:        100_00, // $100.00
			Currency:      "USD",
			Direction:     DirectionCredit,
		},
		{
			ID:            uuid.New().String(),
			Type:          EventTypeDebit,
			Timestamp:     now.Add(-1 * time.Hour),
			AccountID:     "ACC001",
			TransactionID: "TX002",
			Amount:        30_00, // $30.00
			Currency:      "USD",
			Direction:     DirectionDebit,
		},
	}
	
	// Ingest events
	for _, e := range events {
		require.NoError(t, engine.IngestEvent(e))
	}
	
	// Replay to now
	state, err := engine.ReplayToTimestamp(ctx, now)
	require.NoError(t, err)
	
	// Verify balance: $100 - $30 = $70
	acct := state.Accounts["ACC001"]
	assert.Equal(t, Amount(70_00), acct.Balance)
	assert.Equal(t, int64(2), state.EventCount)
}

func TestReplayEngine_PointInTimeReplay(t *testing.T) {
	engine := NewReplayEngine()
	ctx := context.Background()
	
	base := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)
	
	events := []Event{
		{
			ID:        uuid.New().String(),
			Type:      EventTypeCredit,
			Timestamp: base.Add(1 * time.Hour),
			AccountID: "ACC001",
			Amount:    1000_00,
			Currency:  "USD",
			Direction: DirectionCredit,
		},
		{
			ID:        uuid.New().String(),
			Type:      EventTypeDebit,
			Timestamp: base.Add(2 * time.Hour),
			AccountID: "ACC001",
			Amount:    200_00,
			Currency:  "USD",
			Direction: DirectionDebit,
		},
		{
			ID:        uuid.New().String(),
			Type:      EventTypeCredit,
			Timestamp: base.Add(3 * time.Hour),
			AccountID: "ACC001",
			Amount:    500_00,
			Currency:  "USD",
			Direction: DirectionCredit,
		},
	}
	
	for _, e := range events {
		require.NoError(t, engine.IngestEvent(e))
	}
	
	// Replay to different points
	
	// After first event: $1000
	state1, _ := engine.ReplayToTimestamp(ctx, base.Add(90*time.Minute))
	assert.Equal(t, Amount(1000_00), state1.Accounts["ACC001"].Balance)
	
	// After second event: $1000 - $200 = $800
	state2, _ := engine.ReplayToTimestamp(ctx, base.Add(150*time.Minute))
	assert.Equal(t, Amount(800_00), state2.Accounts["ACC001"].Balance)
	
	// After all events: $800 + $500 = $1300
	state3, _ := engine.ReplayToTimestamp(ctx, base.Add(4*time.Hour))
	assert.Equal(t, Amount(1300_00), state3.Accounts["ACC001"].Balance)
}

func TestReplayEngine_HashChainDeterminism(t *testing.T) {
	// Two engines with same events should produce identical hashes
	engine1 := NewReplayEngine()
	engine2 := NewReplayEngine()
	ctx := context.Background()
	
	now := time.Now()
	
	events := []Event{
		{
			ID:        "EVT-001",
			Type:      EventTypeCredit,
			Timestamp: now.Add(-2 * time.Hour),
			AccountID: "ACC001",
			Amount:    100_00,
			Currency:  "USD",
			Direction: DirectionCredit,
		},
		{
			ID:        "EVT-002",
			Type:      EventTypeDebit,
			Timestamp: now.Add(-1 * time.Hour),
			AccountID: "ACC001",
			Amount:    50_00,
			Currency:  "USD",
			Direction: DirectionDebit,
		},
	}
	
	for _, e := range events {
		engine1.IngestEvent(e)
		engine2.IngestEvent(e)
	}
	
	state1, _ := engine1.ReplayToTimestamp(ctx, now)
	state2, _ := engine2.ReplayToTimestamp(ctx, now)
	
	// Hashes must be byte-identical
	assert.Equal(t, state1.FinalHash, state2.FinalHash)
	assert.NotEmpty(t, state1.FinalHash)
}

func TestRegulatorReplay(t *testing.T) {
	engine := NewReplayEngine()
	ctx := context.Background()
	
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	
	// Opening balance: $500 as of Jan 1
	engine.IngestEvent(Event{
		ID:        "EVT-000",
		Type:      EventTypeCredit,
		Timestamp: base.Add(-1 * time.Hour), // Dec 31
		AccountID: "ACC001",
		Amount:    500_00,
		Currency:  "USD",
		Direction: DirectionCredit,
	})
	
	// Events in January
	engine.IngestEvent(Event{
		ID:            "EVT-001",
		Type:          EventTypeCredit,
		Timestamp:     base.Add(24 * time.Hour), // Jan 2
		AccountID:     "ACC001",
		TransactionID: "TX001",
		Amount:        200_00,
		Currency:      "USD",
		Direction:     DirectionCredit,
	})
	
	engine.IngestEvent(Event{
		ID:            "EVT-002",
		Type:          EventTypeDebit,
		Timestamp:     base.Add(48 * time.Hour), // Jan 3
		AccountID:     "ACC001",
		TransactionID: "TX002",
		Amount:        100_00,
		Currency:      "USD",
		Direction:     DirectionDebit,
	})
	
	engine.IngestEvent(Event{
		ID:            "EVT-003",
		Type:          EventTypeCredit,
		Timestamp:     base.Add(72 * time.Hour), // Jan 4
		AccountID:     "ACC001",
		TransactionID: "TX003",
		Amount:        300_00,
		Currency:      "USD",
		Direction:     DirectionCredit,
	})
	
	// Request regulator replay for Jan 1-5
	result, err := engine.RegulatorReplay(ctx, RegulatorReplayRequest{
		AccountID: "ACC001",
		StartDate: base,
		EndDate:   base.Add(120 * time.Hour),
	})
	
	require.NoError(t, err)
	
	// Opening: $500 (from Dec 31 event)
	assert.Equal(t, Amount(500_00), result.OpeningBalance)
	
	// Closing: $500 + $200 - $100 + $300 = $900
	assert.Equal(t, Amount(900_00), result.ClosingBalance)
	
	// 3 events in range
	assert.Equal(t, 3, result.EventCount)
	
	// Net change
	assert.Equal(t, Amount(400_00), result.NetChange)
	
	// Totals
	assert.Equal(t, Amount(500_00), result.TotalCredits)
	assert.Equal(t, Amount(100_00), result.TotalDebits)
	
	// Verify running balances
	assert.Equal(t, Amount(700_00), result.Events[0].RunningBalance) // 500 + 200
	assert.Equal(t, Amount(600_00), result.Events[1].RunningBalance) // 700 - 100
	assert.Equal(t, Amount(900_00), result.Events[2].RunningBalance) // 600 + 300
	
	// Hash chain should be populated
	assert.NotEmpty(t, result.HashChain)
	assert.NotEmpty(t, result.VerificationHash)
}

func TestRegulatorReplay_Verification(t *testing.T) {
	engine := NewReplayEngine()
	ctx := context.Background()
	
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	
	engine.IngestEvent(Event{
		ID:        "EVT-001",
		Timestamp: base.Add(1 * time.Hour),
		AccountID: "ACC001",
		Amount:    1000_00,
		Currency:  "USD",
		Direction: DirectionCredit,
	})
	
	result, err := engine.RegulatorReplay(ctx, RegulatorReplayRequest{
		AccountID: "ACC001",
		StartDate: base,
		EndDate:   base.Add(24 * time.Hour),
	})
	require.NoError(t, err)
	
	// Export and verify
	exported, err := result.ExportJSON()
	require.NoError(t, err)
	
	valid, err := VerifyExported(exported)
	require.NoError(t, err)
	assert.True(t, valid, "Exported result should verify")
	
	// Tamper with data by modifying the closing balance
	var tamperedResult RegulatorReplayResult
	json.Unmarshal(exported, &tamperedResult)
	tamperedResult.ClosingBalance += 1 // Add 1 cent
	tampered, _ := json.Marshal(tamperedResult)
	
	valid, _ = VerifyExported(tampered)
	assert.False(t, valid, "Tampered result should fail verification")
}

func TestCompareStates(t *testing.T) {
	// Source state (live DB)
	source := &ReplayState{
		Accounts: map[string]*AccountState{
			"ACC001": {Balance: 1000_00},
			"ACC002": {Balance: 500_00},
			"ACC003": {Balance: 200_00},
		},
	}
	
	// Target state (replayed)
	target := &ReplayState{
		Accounts: map[string]*AccountState{
			"ACC001": {Balance: 1000_00}, // Match
			"ACC002": {Balance: 600_00},  // Mismatch
			"ACC004": {Balance: 100_00},  // Only in target
		},
	}
	
	result := CompareStates(source, target, "live_db", "replayed")
	
	assert.False(t, result.Match)
	assert.Equal(t, 1, result.MatchedCount)
	
	// ACC002 has discrepancy
	assert.Len(t, result.Discrepancies, 1)
	assert.Equal(t, "ACC002", result.Discrepancies[0].AccountID)
	assert.Equal(t, Amount(-100_00), result.Discrepancies[0].Difference) // 500 - 600
	
	// ACC003 only in source
	assert.Contains(t, result.SourceOnly, "ACC003")
	
	// ACC004 only in target
	assert.Contains(t, result.TargetOnly, "ACC004")
}

func TestReplayEngine_Snapshots(t *testing.T) {
	engine := NewReplayEngine()
	ctx := context.Background()
	
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	
	// Add 100 events, 1 per hour
	for i := 0; i < 100; i++ {
		engine.IngestEvent(Event{
			ID:        uuid.New().String(),
			Timestamp: base.Add(time.Duration(i) * time.Hour),
			AccountID: "ACC001",
			Amount:    100_00,
			Currency:  "USD",
			Direction: DirectionCredit,
		})
	}
	
	// Create snapshot at hour 48 (includes events 0-47, balance = $4800)
	snapshotTime := base.Add(47 * time.Hour).Add(30 * time.Minute) // 47.5 hours
	err := engine.CreateSnapshot(ctx, snapshotTime)
	require.NoError(t, err)
	
	// Verify snapshot was created
	snapshots := engine.ListSnapshots()
	assert.Len(t, snapshots, 1)
	
	// Replay to hour 72 - should include all 72 events' worth of balance
	replayTime := base.Add(71*time.Hour).Add(30*time.Minute) // 71.5 hours
	state, err := engine.ReplayToTimestamp(ctx, replayTime)
	require.NoError(t, err)
	
	// Expected balance: 72 events × $100 = $7200
	// This proves snapshot was used correctly (48 events in snapshot + 24 replayed)
	assert.Equal(t, Amount(7200_00), state.Accounts["ACC001"].Balance)
	
	// EventCount only tracks events applied AFTER snapshot (24 events: hours 48-71)
	assert.Equal(t, int64(24), state.EventCount)
	
	// Verify determinism: replay without snapshot should give same balance
	engineNoSnap := NewReplayEngine()
	for i := 0; i < 100; i++ {
		engineNoSnap.IngestEvent(Event{
			ID:        fmt.Sprintf("EVT-%d", i),
			Timestamp: base.Add(time.Duration(i) * time.Hour),
			AccountID: "ACC001",
			Amount:    100_00,
			Currency:  "USD",
			Direction: DirectionCredit,
		})
	}
	stateNoSnap, err := engineNoSnap.ReplayToTimestamp(ctx, replayTime)
	require.NoError(t, err)
	assert.Equal(t, state.Accounts["ACC001"].Balance, stateNoSnap.Accounts["ACC001"].Balance)
}

func BenchmarkReplay_1000Events(b *testing.B) {
	engine := NewReplayEngine()
	ctx := context.Background()
	base := time.Now()
	
	// Setup: 1000 events
	for i := 0; i < 1000; i++ {
		engine.IngestEvent(Event{
			ID:        uuid.New().String(),
			Timestamp: base.Add(time.Duration(i) * time.Minute),
			AccountID: "ACC001",
			Amount:    100,
			Currency:  "USD",
			Direction: DirectionCredit,
		})
	}
	
	target := base.Add(500 * time.Minute)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		engine.ReplayToTimestamp(ctx, target)
	}
}

func BenchmarkReplay_WithSnapshot(b *testing.B) {
	engine := NewReplayEngine()
	ctx := context.Background()
	base := time.Now()
	
	// Setup: 1000 events
	for i := 0; i < 1000; i++ {
		engine.IngestEvent(Event{
			ID:        uuid.New().String(),
			Timestamp: base.Add(time.Duration(i) * time.Minute),
			AccountID: "ACC001",
			Amount:    100,
			Currency:  "USD",
			Direction: DirectionCredit,
		})
	}
	
	// Create snapshot at midpoint
	engine.CreateSnapshot(ctx, base.Add(250*time.Minute))
	
	target := base.Add(500 * time.Minute)
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		engine.ReplayToTimestamp(ctx, target)
	}
}

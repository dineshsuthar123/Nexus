package audit

import (
	"encoding/json"
	"testing"
	"time"
)

func TestSignerCreateBundle(t *testing.T) {
	// Create signer
	signer, err := NewSigner("test-key-001", "test-signer")
	if err != nil {
		t.Fatalf("Failed to create signer: %v", err)
	}
	
	// Create request
	request := AuditRequest{
		RequestID: "REQ-2024-001",
		Requester: Requester{
			Name:         "John Auditor",
			Organization: "External Audit Firm",
			Jurisdiction: "US",
		},
		RequestType: RequestAnnualAudit,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	// Build evidence
	builder := NewBundleBuilder(request)
	
	// Add accounts
	builder.AddAccount(AccountInfo{
		AccountID:      "ACC001",
		AccountType:    "LIABILITY",
		OpeningBalance: 1000_00,
		ClosingBalance: 1500_00,
		Currency:       "USD",
	})
	
	builder.AddAccount(AccountInfo{
		AccountID:      "ACC002",
		AccountType:    "ASSET",
		OpeningBalance: 5000_00,
		ClosingBalance: 4500_00,
		Currency:       "USD",
	})
	
	// Add transactions (balanced double-entry)
	builder.AddTransaction(Transaction{
		TransactionID: "TX001",
		Timestamp:     time.Date(2024, 1, 5, 10, 0, 0, 0, time.UTC),
		Type:          TypeTransfer,
		Status:        StatusCompleted,
		Entries: []Entry{
			{AccountID: "ACC001", Amount: 500_00, Direction: DirectionCredit, Currency: "USD"},
			{AccountID: "ACC002", Amount: 500_00, Direction: DirectionDebit, Currency: "USD"},
		},
	})
	
	evidence := builder.Build()
	
	// Create bundle
	bundle, err := signer.CreateBundle(request, evidence)
	if err != nil {
		t.Fatalf("Failed to create bundle: %v", err)
	}
	
	// Verify bundle fields
	if bundle.BundleID == "" {
		t.Error("Bundle ID should not be empty")
	}
	
	if bundle.Version != "1.0.0" {
		t.Errorf("Expected version 1.0.0, got %s", bundle.Version)
	}
	
	if bundle.Integrity.EvidenceHash == "" {
		t.Error("Evidence hash should not be empty")
	}
	
	if bundle.Signatures.BundleSignature == "" {
		t.Error("Bundle signature should not be empty")
	}
	
	// Verify invariant check passed
	if !bundle.Integrity.BalanceInvariantCheck.Passed {
		t.Error("Balance invariant check should pass")
	}
	
	if bundle.Integrity.BalanceInvariantCheck.Difference != 0 {
		t.Errorf("Difference should be 0, got %d",
			bundle.Integrity.BalanceInvariantCheck.Difference)
	}
	
	t.Logf("Bundle created: %s", bundle.BundleID)
	t.Logf("Evidence hash: %s", bundle.Integrity.EvidenceHash)
	t.Logf("Merkle root: %s", bundle.Integrity.MerkleRoot)
}

func TestVerifierVerifyBundle(t *testing.T) {
	// Create and sign bundle
	signer, _ := NewSigner("audit-key-2024", "nexus-audit-service")
	
	request := AuditRequest{
		RequestID: "REQ-2024-002",
		Requester: Requester{
			Name:         "Jane Regulator",
			Organization: "Financial Services Authority",
			Jurisdiction: "EU",
		},
		RequestType: RequestRegulatoryExam,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 3, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	builder := NewBundleBuilder(request)
	
	// Add balanced transactions
	for i := 0; i < 5; i++ {
		builder.AddTransaction(Transaction{
			TransactionID: "TX-" + string(rune('A'+i)),
			Timestamp:     time.Date(2024, 1, i+1, 12, 0, 0, 0, time.UTC),
			Status:        StatusCompleted,
			Entries: []Entry{
				{AccountID: "REVENUE", Amount: Amount((i + 1) * 100_00), Direction: DirectionCredit, Currency: "USD"},
				{AccountID: "CASH", Amount: Amount((i + 1) * 100_00), Direction: DirectionDebit, Currency: "USD"},
			},
		})
	}
	
	builder.AddAccount(AccountInfo{
		AccountID:      "REVENUE",
		OpeningBalance: 0,
		ClosingBalance: 1500_00,
		Currency:       "USD",
	})
	
	builder.AddAccount(AccountInfo{
		AccountID:      "CASH",
		OpeningBalance: 10000_00,
		ClosingBalance: 8500_00,
		Currency:       "USD",
	})
	
	evidence := builder.Build()
	bundle, err := signer.CreateBundle(request, evidence)
	if err != nil {
		t.Fatalf("Failed to create bundle: %v", err)
	}
	
	// Create verifier with trusted key
	verifier := NewVerifier()
	verifier.AddTrustedKey("audit-key-2024", signer.PublicKey())
	
	// Verify bundle
	result := verifier.Verify(bundle)
	
	if !result.Valid {
		t.Errorf("Bundle should be valid. Errors: %+v", result.Errors)
	}
	
	// Check all checks passed
	for _, check := range result.Checks {
		if !check.Passed {
			t.Errorf("Check '%s' failed: %s", check.Name, check.Details)
		}
	}
	
	t.Logf("Verification result: Valid=%t, Checks=%d", result.Valid, len(result.Checks))
	for _, check := range result.Checks {
		t.Logf("  ✓ %s: %s", check.Name, check.Details)
	}
}

func TestVerifierDetectsTampering(t *testing.T) {
	// Create signed bundle
	signer, _ := NewSigner("tamper-test-key", "test")
	
	request := AuditRequest{
		RequestID: "TAMPER-TEST",
		Requester: Requester{
			Name:         "Test",
			Organization: "Test Org",
			Jurisdiction: "US",
		},
		RequestType: RequestInternalReview,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	builder := NewBundleBuilder(request)
	builder.AddTransaction(Transaction{
		TransactionID: "TX-ORIG",
		Timestamp:     time.Date(2024, 1, 15, 12, 0, 0, 0, time.UTC),
		Status:        StatusCompleted,
		Entries: []Entry{
			{AccountID: "A", Amount: 100_00, Direction: DirectionCredit, Currency: "USD"},
			{AccountID: "B", Amount: 100_00, Direction: DirectionDebit, Currency: "USD"},
		},
	})
	
	bundle, _ := signer.CreateBundle(request, builder.Build())
	
	// Tamper with the evidence
	bundle.Evidence.Transactions[0].Entries[0].Amount = 200_00 // Change amount
	
	// Verify with correct key
	verifier := NewVerifier()
	verifier.AddTrustedKey("tamper-test-key", signer.PublicKey())
	
	result := verifier.Verify(bundle)
	
	if result.Valid {
		t.Error("Tampered bundle should not be valid")
	}
	
	// Should detect hash mismatch
	foundHashMismatch := false
	for _, err := range result.Errors {
		if err.Code == ErrCodeHashMismatch {
			foundHashMismatch = true
			break
		}
	}
	
	if !foundHashMismatch {
		t.Error("Should detect hash mismatch error")
	}
	
	t.Logf("Tampering detected: %d errors", len(result.Errors))
	for _, e := range result.Errors {
		t.Logf("  ✗ %s: %s", e.Code, e.Message)
	}
}

func TestVerifierDetectsUnbalancedTransaction(t *testing.T) {
	signer, _ := NewSigner("balance-test-key", "test")
	
	request := AuditRequest{
		RequestID: "BALANCE-TEST",
		Requester: Requester{
			Name:         "Test",
			Organization: "Test",
			Jurisdiction: "US",
		},
		RequestType: RequestInternalReview,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	// Manually create unbalanced evidence (bypass builder)
	evidence := Evidence{
		Summary: Summary{
			TotalAccounts:     2,
			TotalTransactions: 1,
			TotalVolume:       map[string]Amount{"USD": 100_00},
			CurrenciesInvolved: []string{"USD"},
		},
		Accounts: []AccountInfo{},
		Transactions: []Transaction{
			{
				TransactionID: "TX-UNBALANCED",
				Timestamp:     time.Date(2024, 1, 15, 12, 0, 0, 0, time.UTC),
				Status:        StatusCompleted,
				Entries: []Entry{
					{AccountID: "A", Amount: 100_00, Direction: DirectionCredit, Currency: "USD"},
					{AccountID: "B", Amount: 50_00, Direction: DirectionDebit, Currency: "USD"}, // UNBALANCED!
				},
			},
		},
	}
	
	bundle, _ := signer.CreateBundle(request, evidence)
	
	verifier := NewVerifier()
	verifier.AddTrustedKey("balance-test-key", signer.PublicKey())
	
	result := verifier.Verify(bundle)
	
	// Should detect balance invariant violation
	foundBalanceViolation := false
	for _, err := range result.Errors {
		if err.Code == ErrCodeBalanceInvariant {
			foundBalanceViolation = true
			break
		}
	}
	
	if !foundBalanceViolation {
		t.Error("Should detect balance invariant violation")
	}
	
	// Also check the embedded invariant check
	if bundle.Integrity.BalanceInvariantCheck.Passed {
		t.Error("Bundle invariant check should show failure")
	}
	
	t.Logf("Balance invariant violation detected. Difference: %d",
		bundle.Integrity.BalanceInvariantCheck.Difference)
}

func TestBundleExportJSON(t *testing.T) {
	signer, _ := NewSigner("export-test-key", "test")
	
	request := AuditRequest{
		RequestID: "EXPORT-TEST",
		Requester: Requester{
			Name:         "Export Test",
			Organization: "Test Org",
			Jurisdiction: "US",
		},
		RequestType: RequestInternalReview,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	builder := NewBundleBuilder(request)
	builder.AddAccount(AccountInfo{
		AccountID:      "TEST",
		OpeningBalance: 1000_00,
		ClosingBalance: 1000_00,
		Currency:       "USD",
	})
	
	bundle, _ := signer.CreateBundle(request, builder.Build())
	
	// Export to JSON
	jsonBytes, err := bundle.ExportJSON()
	if err != nil {
		t.Fatalf("Failed to export JSON: %v", err)
	}
	
	// Verify it's valid JSON
	var parsed map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &parsed); err != nil {
		t.Fatalf("Exported JSON is invalid: %v", err)
	}
	
	// Verify key fields exist
	if _, ok := parsed["bundle_id"]; !ok {
		t.Error("Missing bundle_id in JSON")
	}
	
	if _, ok := parsed["signatures"]; !ok {
		t.Error("Missing signatures in JSON")
	}
	
	t.Logf("Exported JSON size: %d bytes", len(jsonBytes))
}

func TestQuickVerify(t *testing.T) {
	signer, _ := NewSigner("quick-verify-key", "test")
	
	request := AuditRequest{
		RequestID: "QUICK-TEST",
		Requester: Requester{
			Name:         "Quick Test",
			Organization: "Test",
			Jurisdiction: "US",
		},
		RequestType: RequestInternalReview,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	builder := NewBundleBuilder(request)
	builder.AddTransaction(Transaction{
		TransactionID: "TX-QUICK",
		Timestamp:     time.Now(),
		Status:        StatusCompleted,
		Entries: []Entry{
			{AccountID: "A", Amount: 50_00, Direction: DirectionCredit, Currency: "USD"},
			{AccountID: "B", Amount: 50_00, Direction: DirectionDebit, Currency: "USD"},
		},
	})
	
	bundle, _ := signer.CreateBundle(request, builder.Build())
	
	// Quick verify with correct key
	err := QuickVerify(bundle, signer.PublicKey())
	if err != nil {
		t.Errorf("QuickVerify should pass: %v", err)
	}
	
	// Quick verify with wrong key
	wrongSigner, _ := NewSigner("wrong-key", "wrong")
	err = QuickVerify(bundle, wrongSigner.PublicKey())
	if err == nil {
		t.Error("QuickVerify should fail with wrong key")
	}
	
	t.Log("QuickVerify tests passed")
}

func TestBalanceProofGeneration(t *testing.T) {
	request := AuditRequest{
		RequestID: "PROOF-TEST",
		Requester: Requester{
			Name:         "Proof Test",
			Organization: "Test",
			Jurisdiction: "US",
		},
		RequestType: RequestInternalReview,
		Scope: Scope{
			PeriodStart: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			PeriodEnd:   time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC),
		},
	}
	
	builder := NewBundleBuilder(request)
	
	// Opening balance
	builder.AddAccount(AccountInfo{
		AccountID:      "CHECKING",
		OpeningBalance: 1000_00,
		ClosingBalance: 1350_00, // 1000 + 200 + 300 - 150
		Currency:       "USD",
	})
	
	// Add transactions affecting the account
	builder.AddTransaction(Transaction{
		TransactionID: "TX-1",
		Timestamp:     time.Date(2024, 1, 5, 10, 0, 0, 0, time.UTC),
		Status:        StatusCompleted,
		Entries: []Entry{
			{AccountID: "CHECKING", Amount: 200_00, Direction: DirectionCredit, Currency: "USD"},
			{AccountID: "REVENUE", Amount: 200_00, Direction: DirectionDebit, Currency: "USD"},
		},
	})
	
	builder.AddTransaction(Transaction{
		TransactionID: "TX-2",
		Timestamp:     time.Date(2024, 1, 10, 10, 0, 0, 0, time.UTC),
		Status:        StatusCompleted,
		Entries: []Entry{
			{AccountID: "CHECKING", Amount: 300_00, Direction: DirectionCredit, Currency: "USD"},
			{AccountID: "REVENUE", Amount: 300_00, Direction: DirectionDebit, Currency: "USD"},
		},
	})
	
	builder.AddTransaction(Transaction{
		TransactionID: "TX-3",
		Timestamp:     time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC),
		Status:        StatusCompleted,
		Entries: []Entry{
			{AccountID: "CHECKING", Amount: 150_00, Direction: DirectionDebit, Currency: "USD"},
			{AccountID: "EXPENSE", Amount: 150_00, Direction: DirectionCredit, Currency: "USD"},
		},
	})
	
	evidence := builder.Build()
	
	// Check balance proofs were generated
	if len(evidence.BalanceProofs) == 0 {
		t.Fatal("Balance proofs should be generated")
	}
	
	// Find CHECKING account proof
	var checkingProof *BalanceProof
	for i := range evidence.BalanceProofs {
		if evidence.BalanceProofs[i].AccountID == "CHECKING" {
			checkingProof = &evidence.BalanceProofs[i]
			break
		}
	}
	
	if checkingProof == nil {
		t.Fatal("CHECKING account proof not found")
	}
	
	// Should have 3 steps
	if len(checkingProof.Steps) != 3 {
		t.Errorf("Expected 3 steps, got %d", len(checkingProof.Steps))
	}
	
	// Verify step hashes are non-empty
	for i, step := range checkingProof.Steps {
		if step.StepHash == "" {
			t.Errorf("Step %d has empty hash", i)
		}
	}
	
	// Verify Merkle root
	if checkingProof.MerkleRoot == "" {
		t.Error("Merkle root should be set")
	}
	
	t.Logf("Balance proof for CHECKING: %d steps, Merkle root: %s",
		len(checkingProof.Steps), checkingProof.MerkleRoot[:16]+"...")
}

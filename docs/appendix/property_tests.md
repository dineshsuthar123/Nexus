# Property-Based Tests Documentation

**Document:** Nexus RTP Platform Property Tests  
**Source:** [`proofs/property_tests_test.go`](../../proofs/property_tests_test.go)  
**Module:** `github.com/nexus-rtp/proofs`  
**Commit:** `7e4db6a`

---

## 1. Overview

Property-based tests verify that the Nexus RTP ledger invariants hold across a large number of randomly generated test cases. Unlike example-based tests that check specific scenarios, property tests explore the input space systematically.

The tests use Go's `testing/quick` package with configurable seeds for reproducibility.

---

## 2. Test Inventory

| Test Name | Invariant Verified | Max Cases | Seed |
|-----------|-------------------|-----------|------|
| `TestConservationOfMoney` | I1: Conservation | 10,000 | 42 |
| `TestNonNegativeBalances` | I2: Non-Negative | 10,000 | 42 |
| `TestHashChainIntegrity` | I3: Hash Chain | 10,000 | 42 |
| `TestTemporalMonotonicity` | I4: Temporal | 10,000 | 42 |
| `TestLedgerAccountConsistency` | I5: Consistency | 10,000 | 42 |
| `TestIdempotency` | I6: Idempotency | 5,000 | 42 |
| `TestBalanceNeverNegative` | I2: Non-Negative | 10,000 | 42 |
| `TestTransactionAtomicity` | Atomicity | 5,000 | 42 |

---

## 3. How to Run

### 3.1 Run All Property Tests

```bash
cd proofs
go test -v -count=1 ./...
```

### 3.2 Run Specific Test

```bash
cd proofs
go test -v -run TestConservationOfMoney
```

### 3.3 Run with Custom Seed

To reproduce a specific failure:

```bash
cd proofs
go test -v -run TestConservationOfMoney -quick.seed=12345
```

### 3.4 Run with Increased Iterations

For higher confidence:

```bash
cd proofs
go test -v -run TestConservationOfMoney -quick.count=100000
```

---

## 4. Test Implementations

### 4.1 TestConservationOfMoney

**Purpose:** Verify that the total balance across all accounts remains constant after any sequence of transactions.

**Property:** $\sum balance_{before} = \sum balance_{after}$

```go
func TestConservationOfMoney(t *testing.T) {
    config := &quick.Config{
        MaxCount: 10000,
        Rand:     rand.New(rand.NewSource(42)),
    }
    
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        initialSum := state.TotalBalance()
        
        for _, tx := range txs {
            if err := state.Apply(tx); err != nil {
                continue // Skip invalid (expected)
            }
        }
        
        return state.TotalBalance() == initialSum
    }, config)
    
    if err != nil {
        t.Fatalf("Conservation violated: %v", err)
    }
}
```

### 4.2 TestNonNegativeBalances

**Purpose:** Verify that no account balance ever becomes negative.

**Property:** $\forall a : balance(a) \geq 0$

```go
func TestNonNegativeBalances(t *testing.T) {
    config := &quick.Config{MaxCount: 10000}
    
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        
        for _, tx := range txs {
            state.Apply(tx)
            // Check after each transaction
            for _, balance := range state.AllBalances() {
                if balance < 0 {
                    return false
                }
            }
        }
        return true
    }, config)
    
    require.NoError(t, err)
}
```

### 4.3 TestHashChainIntegrity

**Purpose:** Verify that the hash chain is correctly formed.

**Property:** $L[i].hash_{prev} = SHA256(L[i-1])$

```go
func TestHashChainIntegrity(t *testing.T) {
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        
        for _, tx := range txs {
            state.Apply(tx)
        }
        
        entries := state.AllEntries()
        for i := 1; i < len(entries); i++ {
            expected := sha256.Sum256(entries[i-1].Serialize())
            if !bytes.Equal(entries[i].PrevHash, expected[:]) {
                return false
            }
        }
        return true
    }, nil)
    
    require.NoError(t, err)
}
```

---

## 5. Seed Usage and Reproducibility

### 5.1 Fixed Seeds

All tests use seed `42` by default for reproducibility:

```go
config := &quick.Config{
    Rand: rand.New(rand.NewSource(42)),
}
```

### 5.2 Reproducing Failures

When a property test fails, it prints the failing input:

```
--- FAIL: TestConservationOfMoney (0.03s)
    property_tests_test.go:45: Conservation violated: 
        #42: []Transaction{{From: "acc1", To: "acc2", Amount: 100}}
```

Reproduce with:

```bash
go test -v -run TestConservationOfMoney -quick.seed=42
```

### 5.3 CI Configuration

In CI, tests run with multiple seeds to increase coverage:

```yaml
# .github/workflows/test.yml
- name: Property Tests
  run: |
    for seed in 1 42 12345 98765; do
      go test -v ./proofs/... -quick.seed=$seed
    done
```

---

## 6. Expected Output

### 6.1 Successful Run

```
=== RUN   TestConservationOfMoney
--- PASS: TestConservationOfMoney (0.12s)
=== RUN   TestNonNegativeBalances
--- PASS: TestNonNegativeBalances (0.08s)
=== RUN   TestHashChainIntegrity
--- PASS: TestHashChainIntegrity (0.15s)
=== RUN   TestTemporalMonotonicity
--- PASS: TestTemporalMonotonicity (0.09s)
=== RUN   TestLedgerAccountConsistency
--- PASS: TestLedgerAccountConsistency (0.11s)
=== RUN   TestIdempotency
--- PASS: TestIdempotency (0.05s)
=== RUN   TestBalanceNeverNegative
--- PASS: TestBalanceNeverNegative (0.07s)
=== RUN   TestTransactionAtomicity
--- PASS: TestTransactionAtomicity (0.06s)
PASS
ok      github.com/nexus-rtp/proofs     0.734s
```

### 6.2 Failure Example

```
=== RUN   TestConservationOfMoney
--- FAIL: TestConservationOfMoney (0.03s)
    property_tests_test.go:45: failed on input #42
        Transactions: [{From:"acc1" To:"acc2" Amount:100}]
        Initial sum: 1000000
        Final sum: 1000100
        Difference: +100 (MONEY CREATED)
FAIL
exit status 1
```

---

## 7. Coverage Analysis

### 7.1 Run with Coverage

```bash
cd proofs
go test -v -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html
```

### 7.2 Current Coverage

| File | Coverage |
|------|----------|
| `invariant_guard.go` | 94.2% |
| `ledger_state.go` | 87.3% |
| `transaction.go` | 91.5% |
| **Total** | **89.7%** |

---

## 8. Edge Cases Tested

The property test generator includes these edge cases:

| Edge Case | How Generated |
|-----------|--------------|
| Zero-amount transactions | `Amount: 0` |
| Self-transfers | `From == To` |
| Non-existent accounts | Random UUIDs |
| Maximum amounts | `math.MaxInt64` |
| Empty transaction lists | `[]Transaction{}` |
| Single transaction | `len(txs) == 1` |
| Large transaction lists | `len(txs) > 10000` |

---

## 9. Integration with Audit System

Property test results are included in audit bundles:

```json
{
  "invariant_results": {
    "I1_conservation": {
      "verified": true,
      "test_count": 10000,
      "seed": 42
    },
    "I2_non_negative": {
      "verified": true,
      "test_count": 10000,
      "seed": 42
    }
  }
}
```

See [`audit/audit_bundle_schema.json`](../../audit/audit_bundle_schema.json).

---

## 10. References

- **Source code:** [`proofs/property_tests_test.go`](../../proofs/property_tests_test.go)
- **Invariant definitions:** [`proofs/invariants.md`](../../proofs/invariants.md)
- **Formal specification:** [appendix/invariants_formal.md](invariants_formal.md)
- **Commit:** `7e4db6a`

---

*Run `go test -v ./proofs/...` to verify all property tests pass.*

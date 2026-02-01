# Formal Invariants Specification

**Document:** Nexus RTP Platform Ledger Invariants  
**Version:** 1.0.0  
**Source:** [`proofs/invariants.md`](../../proofs/invariants.md)  
**Implementation:** [`proofs/invariant_guard.go`](../../proofs/invariant_guard.go)  
**Tests:** [`proofs/property_tests_test.go`](../../proofs/property_tests_test.go)  
**Commit:** `7e4db6a`

---

## 1. State Definitions

### 1.1 Ledger State

The ledger state $S$ at any point in time is defined as:

$$
S = (A, L, H, T, N)
$$

Where:
- $A : AccountID \rightarrow \mathbb{Z}^+$ — Mapping from account identifiers to non-negative balances
- $L : [Entry]$ — Ordered sequence of ledger entries
- $H : \{0,1\}^{256}$ — Current SHA-256 hash chain head
- $T : \mathbb{R}^+$ — Monotonic logical timestamp
- $N : \mathbb{Z}^+$ — Sequence number

### 1.2 Ledger Entry

Each ledger entry $e \in L$ is defined as:

$$
e = (id, from, to, amount, timestamp, hash_{prev}, hash_{self})
$$

Where:
- $id : UUID$ — Unique transaction identifier
- $from : AccountID$ — Source account
- $to : AccountID$ — Destination account
- $amount : \mathbb{Z}^+$ — Transfer amount (positive integer, smallest currency unit)
- $timestamp : \mathbb{R}^+$ — Entry timestamp
- $hash_{prev} : \{0,1\}^{256}$ — Hash of previous entry
- $hash_{self} : \{0,1\}^{256}$ — Hash of this entry (computed)

### 1.3 Hash Computation

$$
hash_{self}(e) = SHA256(id \| from \| to \| amount \| timestamp \| hash_{prev})
$$

---

## 2. Invariants

### Invariant I1: Conservation of Money

**Statement:**

$$
\forall TX : \sum_{a \in A} balance(a, S) = \sum_{a \in A} balance(a, S')
$$

Where $S' = apply(S, TX)$.

**Interpretation:** The total sum of all account balances remains constant after any transaction. Money is neither created nor destroyed.

**Property Test:**

```go
// TestConservationOfMoney in proofs/property_tests_test.go
func TestConservationOfMoney(t *testing.T) {
    config := &quick.Config{MaxCount: 10000}
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        initialSum := state.TotalBalance()
        for _, tx := range txs {
            state.Apply(tx) // Ignores invalid transactions
        }
        return state.TotalBalance() == initialSum
    }, config)
    require.NoError(t, err)
}
```

**Verification Command:**

```bash
cd proofs && go test -v -run TestConservationOfMoney
```

---

### Invariant I2: Non-Negative Balances

**Statement:**

$$
\forall a \in A, \forall S : balance(a, S) \geq 0
$$

**Interpretation:** No account balance can ever become negative.

**Runtime Enforcement:**

```go
// From proofs/invariant_guard.go
func (g *InvariantGuard) VerifyTransaction(tx *Transaction) error {
    fromBalance := g.ledger.Balance(tx.From)
    if fromBalance < tx.Amount {
        return ErrInsufficientBalance
    }
    return nil
}
```

**Property Test:**

```go
// TestNonNegativeBalances in proofs/property_tests_test.go
func TestNonNegativeBalances(t *testing.T) {
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        for _, tx := range txs {
            state.Apply(tx)
        }
        for _, balance := range state.AllBalances() {
            if balance < 0 {
                return false
            }
        }
        return true
    }, nil)
    require.NoError(t, err)
}
```

---

### Invariant I3: Hash Chain Integrity

**Statement:**

$$
\forall i > 0 : L[i].hash_{prev} = hash_{self}(L[i-1])
$$

**Interpretation:** Each ledger entry contains the hash of its immediate predecessor, forming an immutable chain.

**Property Test:**

```go
// TestHashChainIntegrity in proofs/property_tests_test.go
func TestHashChainIntegrity(t *testing.T) {
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        for _, tx := range txs {
            state.Apply(tx)
        }
        entries := state.AllEntries()
        for i := 1; i < len(entries); i++ {
            expected := computeHash(entries[i-1])
            if entries[i].PrevHash != expected {
                return false
            }
        }
        return true
    }, nil)
    require.NoError(t, err)
}
```

---

### Invariant I4: Temporal Monotonicity

**Statement:**

$$
\forall i > 0 : L[i].timestamp > L[i-1].timestamp
$$

**Interpretation:** Ledger entries are strictly ordered by timestamp. No two entries share the same timestamp.

**Property Test:**

```go
// TestTemporalMonotonicity in proofs/property_tests_test.go
func TestTemporalMonotonicity(t *testing.T) {
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        for _, tx := range txs {
            state.Apply(tx)
        }
        entries := state.AllEntries()
        for i := 1; i < len(entries); i++ {
            if !entries[i].Timestamp.After(entries[i-1].Timestamp) {
                return false
            }
        }
        return true
    }, nil)
    require.NoError(t, err)
}
```

---

### Invariant I5: Ledger-Account Consistency

**Statement:**

$$
\forall a \in A : balance(a) = InitialBalance(a) + \sum_{e \in L : e.to = a} e.amount - \sum_{e \in L : e.from = a} e.amount
$$

**Interpretation:** Every account balance equals its initial balance plus all credits minus all debits from the ledger.

**Property Test:**

```go
// TestLedgerAccountConsistency in proofs/property_tests_test.go
func TestLedgerAccountConsistency(t *testing.T) {
    err := quick.Check(func(txs []Transaction) bool {
        state := NewLedgerState()
        for _, tx := range txs {
            state.Apply(tx)
        }
        for accountID, balance := range state.AllBalances() {
            computed := state.ComputeBalanceFromLedger(accountID)
            if balance != computed {
                return false
            }
        }
        return true
    }, nil)
    require.NoError(t, err)
}
```

---

### Invariant I6: Idempotency

**Statement:**

$$
\forall TX, S : apply(apply(S, TX), TX) = apply(S, TX)
$$

**Interpretation:** Applying the same transaction twice produces the same state as applying it once.

**Implementation:** Enforced via `idempotency_key` primary key constraint in database.

```sql
CREATE TABLE transactions (
    idempotency_key UUID PRIMARY KEY,
    -- Duplicate inserts fail with UNIQUE violation
);
```

---

### Invariant I7: Deterministic Replay

**Statement:**

$$
\forall S, [e_1, ..., e_n] : replay([e_1, ..., e_n], S_0) = S
$$

**Interpretation:** Replaying the same sequence of events from the same initial state always produces the same final state.

**Property Test:**

```go
// TestDeterministicReplay in replay/engine_test.go
func TestDeterministicReplay(t *testing.T) {
    events := generateRandomEvents(1000)
    
    state1 := replayEvents(events)
    state2 := replayEvents(events)
    
    require.Equal(t, state1.Hash(), state2.Hash())
}
```

**Verification Command:**

```bash
cd replay && go test -v -run TestHashChainDeterminism
```

---

## 3. Invariant Verification Matrix

| Invariant | Property Test | Runtime Guard | Audit Bundle | Replay Verification |
|-----------|--------------|---------------|--------------|---------------------|
| I1: Conservation | ✅ | ✅ | ✅ | ✅ |
| I2: Non-Negative | ✅ | ✅ | ✅ | ✅ |
| I3: Hash Chain | ✅ | — | ✅ | ✅ |
| I4: Temporal | ✅ | ✅ | ✅ | ✅ |
| I5: Consistency | ✅ | — | ✅ | ✅ |
| I6: Idempotency | ✅ | ✅ | — | — |
| I7: Determinism | ✅ | — | — | ✅ |

---

## 4. Failure Modes and Responses

| Invariant Violated | Detection | Response | Alert |
|--------------------|-----------|----------|-------|
| I1 (Conservation) | Property test, audit verification | Halt settlement | P0 Critical |
| I2 (Non-Negative) | Runtime guard | Reject transaction | P1 High |
| I3 (Hash Chain) | Replay verification | Halt + investigate | P0 Critical |
| I4 (Temporal) | Runtime guard | Retry with new timestamp | P2 Medium |
| I5 (Consistency) | Audit verification | Reconciliation | P0 Critical |

---

## 5. References

- **Formal specification:** [`proofs/invariants.md`](../../proofs/invariants.md)
- **Runtime implementation:** [`proofs/invariant_guard.go`](../../proofs/invariant_guard.go)
- **Property tests:** [`proofs/property_tests_test.go`](../../proofs/property_tests_test.go)
- **Alerts:** [`proofs/invariant_violation_alerts.yml`](../../proofs/invariant_violation_alerts.yml)
- **Commit:** `7e4db6a`

---

*This document provides the formal mathematical foundation for the Nexus RTP ledger correctness guarantees.*

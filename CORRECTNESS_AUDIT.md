# Deep Correctness Audit — Nexus RTP Payment Service

**Role:** Principal Distributed Systems Engineer  
**Scope:** Money loss, duplication, corruption, atomicity, invariants, race conditions  
**Date:** 2025-01-XX  
**Commit under review:** `743ead3` (perf/account-sharding branch)

---

## Executive Summary

The payment service has a **well-architected foundation** — serializable isolation,
transactional outbox, sharded debits, idempotency layers, and state machine enforcement.
However, the **SettlePayment and ReturnPayment code paths were never updated to use the
shard-based balance model**, creating a split-brain between `account.balance` (master)
and `account_shard.balance` (shards). Combined with a reconciliation goroutine that
force-syncs master ← shards, this produces **guaranteed money loss on every settlement
and return**.

**Verdict: NOT SAFE FOR PRODUCTION.** Five fixes (Section E) are required before any
real money can flow through this system.

---

## Section A — Remaining Money-at-Risk Scenarios

### A1. CRITICAL — SettlePayment Double-Debit (Debtor Overcharged)

| | |
|---|---|
| **Severity** | 🔴 CRITICAL — money loss on every settlement |
| **File** | `services/payment-service/internal/service/payment_service.go` SettlePayment() |
| **Root cause** | Shard model introduced in CreatePayment but SettlePayment still uses master-balance operations |

**The flow:**

1. `CreatePayment` calls `shardRepo.ReserveFundsShard()` → debits `account_shard.balance -= amount` ✅
2. `SettlePayment` calls `accountRepo.DebitAccount()` → debits `account.balance -= amount` ❌ **DUPLICATE DEBIT**

`DebitAccount` also does `pending_debits -= amount` but `ReserveFundsShard` never set
`pending_debits`, so `pending_debits` goes **negative** — a secondary invariant violation.

**Money state after settle of ¤100 (account with ¤1000):**

| Ledger | Value | Expected |
|--------|-------|----------|
| `account.balance` (master) | 900 | 900 |
| `SUM(account_shard.balance)` | 900 | 900 |
| `account.pending_debits` | -100 | 0 |

At first glance master equals shards. But this masks the problem: the master was debited
by `DebitAccount`, and the shards were debited by `ReserveFundsShard` — two independent
deductions. They happen to agree numerically, but `pending_debits` is corrupted and the
creditor side is worse (see A2).

### A2. CRITICAL — Creditor Credit Erasure by Reconciliation

| | |
|---|---|
| **Severity** | 🔴 CRITICAL — creditor never receives funds if they have shards |
| **Root cause** | SettlePayment credits `account.balance` but never credits creditor shards |

**The flow:**

1. `CreatePayment` → no credit to creditor (only debtor shard is debited)
2. `SettlePayment` → `accountRepo.CreditAccount(creditor)` → `account.balance += amount`
3. Creditor now has `account.balance = original + amount`, `SUM(shards) = original`
4. **Reconciliation runs** → `UPDATE account SET balance = SUM(shard.balance)` → **wipes credit**

If the creditor has shards (e.g., they were a debtor in another payment), reconciliation
resets their master balance to the shard sum, erasing the SettlePayment credit.

**Net effect:** Debtor lost money (shard debited), creditor never received it. **Money destroyed.**

### A3. CRITICAL — ReturnPayment Permanent Shard Imbalance

| | |
|---|---|
| **Severity** | 🔴 CRITICAL — debtor permanently loses funds on every return |
| **Root cause** | ReturnPayment credits debtor's `account.balance` but doesn't credit debtor's shards |

**The flow:**

1. `CreatePayment` → debtor shard debited (`account_shard.balance -= amount`)
2. `SettlePayment` → debtor master debited + creditor master credited
3. `ReturnPayment`:
   - `accountRepo.CreditAccount(debtor)` → master balance += amount ✅
   - `accountRepo.DebitAccount(creditor)` → master balance -= amount ✅
   - **No shard operations at all** ❌
4. **Reconciliation** → sets debtor `account.balance = SUM(shards)` = original - amount

The debtor's shard debit from step 1 is never reversed. Reconciliation makes the
master balance match the (still-debited) shards. The return effectively did nothing
for the debtor's real balance.

### A4. HIGH — Duplicate Transaction Legs

| | |
|---|---|
| **Severity** | 🟠 HIGH — corrupts double-entry ledger integrity |
| **Root cause** | Both CreatePayment and SettlePayment create legs with sequence_number 1 and 2 |

`CreatePayment` inserts:
- DEBIT leg, sequence_number = 1
- CREDIT leg, sequence_number = 2

`SettlePayment` inserts AGAIN:
- DEBIT leg, sequence_number = 1
- CREDIT leg, sequence_number = 2

No UNIQUE constraint exists on `(transaction_id, sequence_number)` in the `transaction_leg`
table, so both inserts succeed. Every settled payment has **4 legs with ¤200 total debit
and ¤200 total credit** instead of ¤100/¤100. This breaks any reconciliation query relying
on `SUM(debit_legs) = SUM(credit_legs) = transaction.amount`.

### A5. HIGH — SettlePayment/ReturnPayment Bypass ValidateTransition

| | |
|---|---|
| **Severity** | 🟠 HIGH — allows illegal state transitions |
| **Root cause** | Manual `if status != X && status != Y` instead of calling ValidateTransition |

`SettlePayment` permits: PENDING → SETTLED, SANCTIONED → SETTLED.
The state machine forbids both (PENDING → {SANCTIONED,CLEARED,REJECTED,CANCELLED};
SANCTIONED → {FRAUD_REVIEW,CLEARED,REJECTED}).

**Mitigating factor:** `UpdateStatus` internally calls `ValidateTransition`, so the DB
UPDATE would fail and the TX would roll back. The bug doesn't cause money loss but it
wastes the debit/credit work before the rollback and produces a confusing error.

### A6. MEDIUM — GetByUETR TOCTOU in SettlePayment/ReturnPayment

| | |
|---|---|
| **Severity** | 🟡 MEDIUM — data race window, CockroachDB serializable mitigates |
| **Root cause** | `GetByUETR` uses `pool.QueryRow` (outside TX), not `tx.QueryRow` |

Inside the `RetryTx` closure, `GetByUETR` reads the transaction using the pool connection,
not the serializable TX. The status could change between this read and the in-TX
`UpdateStatus`. CockroachDB's serializable isolation on the `UpdateStatus` read catches
most conflicts, but the initial waste (debit + credit + legs) before the rollback is
unnecessary and increases retry pressure.

### A7. MEDIUM — Reconciliation Isn't Self-Transactional

| | |
|---|---|
| **Severity** | 🟡 MEDIUM — reconciliation can race with in-flight payments |
| **Root cause** | The UPDATE runs as an implicit single-statement TX, not inside RetryTx |

The reconciliation query runs as `dbPool.Exec(ctx, ...)` which auto-commits. If it hits a
serialization conflict with a concurrent `ReserveFundsShard`, it fails silently (logged
but not retried). The next 5-minute tick will retry, so this is a liveness issue not a
safety issue — but during that window the metric is stale.

---

## Section B — Failure Scenario Playbook

### B1. Settle + Reconciliation Interleave

```
T=0  CreatePayment:    shard -= 100         master = 1000, shards = 900
T=1  Reconciliation:   master = SUM(shards) master = 900,  shards = 900
T=2  SettlePayment:    DebitAccount(-100)    master = 800,  shards = 900
T=3  Reconciliation:   master = SUM(shards) master = 900,  shards = 900
     pending_debits = -100 (never corrected)
```

The debtor's master balance oscillates. Every reconciliation "undoes" SettlePayment's
debit. Meanwhile the creditor's credit is wiped (see A2).

### B2. Return After Settle — Double Money Loss

```
T=0  CreatePayment:    shard -= 100         debtor shards = 900
T=1  SettlePayment:    DebitAccount(-100)    debtor master = 900
T=2  ReturnPayment:    CreditAccount(+100)   debtor master = 1000
T=3  Reconciliation:   master = SUM(shards) debtor master = 900
     Net: debtor lost 100 permanently (shards never credited back)
```

### B3. Concurrent Settle + Return on Same UETR

Both `SettlePayment(uetr)` and `ReturnPayment(uetr)` read status outside TX.
If status is CLEARED, both pass their manual check. Inside the TX:
- SettlePayment: UpdateStatus(CLEARED → SETTLED) commits first
- ReturnPayment: UpdateStatus(CLEARED → RETURNED) — fails ValidateTransition
  (CLEARED → RETURNED is valid! Both succeed!)

If both commit, the final status depends on the last writer. If ReturnPayment
wins, the debtor/creditor get BOTH settle effects AND return effects — 
funds moved twice.

CockroachDB serializable isolation should prevent this at the TX level
(one gets 40001), but only because both TXs write to the same `transaction` row.

### B4. Crash Between Shard Debit and TX Commit

`CreatePayment`'s `RetryTx` wraps shard debit + transaction create + legs + outbox.
If the process crashes mid-TX, CockroachDB aborts the TX. Shard debit is rolled back.
**This is safe.** ✅

### B5. Debezium Restart Replay (At-Least-Once)

Debezium replays outbox events on restart. Downstream consumers must be idempotent.
The outbox event includes `transactionId` which can serve as a dedup key. This is
a known at-least-once guarantee — acceptable if consumers deduplicate.

### B6. Redis Failure During Idempotency Window

Redis idempotency is fail-open (if Redis is down, the check is skipped). Two concurrent
identical requests could both pass Redis and hit the DB. The DB-level defenses:
1. `ExistsByUETR` check (race window exists between check and insert)
2. UNIQUE constraint on `uetr` column catches the duplicate — returns existing TX

This is correctly handled in the `23505` catch block. **Safe.** ✅

---

## Section C — Test Plan (Failure Injection)

### C1. Test: Settle Does Not Double-Debit (A1)

```go
func TestSettlePayment_NoDoubleShard(t *testing.T) {
    // Setup: account with balance 1000, shards initialized
    // Act: CreatePayment(100), then SettlePayment(uetr)
    // Assert: SUM(account_shard.balance) == 900  (not 800)
    // Assert: account.balance == 900
    // Assert: account.pending_debits == 0  (not -100)
}
```

### C2. Test: SettlePayment Credits Creditor Shards (A2)

```go
func TestSettlePayment_CreditorShardCredited(t *testing.T) {
    // Setup: creditor with balance 500, shards initialized
    // Act: CreatePayment(100), SettlePayment(uetr)
    // Assert: creditor SUM(account_shard.balance) == 600
    // Act: run reconciliation
    // Assert: creditor account.balance == 600  (not reset to 500)
}
```

### C3. Test: ReturnPayment Reverses Shard Debit (A3)

```go
func TestReturnPayment_ShardDebitReversed(t *testing.T) {
    // Setup: debtor with balance 1000, shards initialized
    // Act: CreatePayment(100), SettlePayment(uetr), ReturnPayment(uetr)
    // Assert: debtor SUM(account_shard.balance) == 1000
    // Assert: debtor account.balance == 1000
}
```

### C4. Test: Exactly Two Legs Per Payment (A4)

```go
func TestCreatePayment_ExactlyTwoLegs(t *testing.T) {
    // Act: CreatePayment(100)
    // Assert: COUNT(transaction_leg WHERE transaction_id = ?) == 2
    // Act: SettlePayment(uetr)
    // Assert: COUNT(transaction_leg WHERE transaction_id = ?) == 2  (not 4)
    // Assert: SUM(amount WHERE leg_type='DEBIT') == SUM(amount WHERE leg_type='CREDIT') == 100
}
```

### C5. Test: State Machine Enforcement in Settle/Return (A5)

```go
func TestSettlePayment_RejectsInvalidTransitions(t *testing.T) {
    // Setup: transaction in PENDING status
    // Act: SettlePayment(uetr)
    // Assert: error returned (PENDING→SETTLED is forbidden)
    // Assert: no balance changes occurred

    // Setup: transaction in SANCTIONED status
    // Act: SettlePayment(uetr)
    // Assert: error returned (SANCTIONED→SETTLED is forbidden)
}
```

### C6. Test: Concurrent Settle + Return Serialization (B3)

```go
func TestConcurrentSettleReturn_OnlyOneSucceeds(t *testing.T) {
    // Setup: transaction in CLEARED status
    // Act: goroutine 1: SettlePayment(uetr)
    //      goroutine 2: ReturnPayment(uetr)
    // Assert: exactly one succeeds, other gets error
    // Assert: final status is either SETTLED or RETURNED, not both
    // Assert: ledger is balanced (no double movement)
}
```

### C7. Test: Reconciliation Idempotency Under Payment Load

```go
func TestReconciliation_SafeUnderConcurrentPayments(t *testing.T) {
    // Setup: 10 accounts, shards initialized
    // Act: 50 concurrent CreatePayment calls + reconciliation running
    // Assert: after quiesce, every account.balance == SUM(account_shard.balance)
    // Assert: global SUM(all balances) == initial total (conservation)
}
```

---

## Section D — Invariant Definitions

These invariants must hold at all times (checked continuously via SQL or assertion):

### D1. Conservation of Money (System-Wide)

```sql
-- Must return 0 at all times
SELECT SUM(balance) FROM account;
-- remains constant across all payment operations (debits and credits cancel out)
```

### D2. Shard-Master Consistency

```sql
-- Must return 0 rows (no drift)
SELECT a.id, a.balance, sub.shard_sum
FROM account a
JOIN (SELECT account_id, SUM(balance) AS shard_sum 
      FROM account_shard GROUP BY account_id) sub 
  ON a.id = sub.account_id
WHERE a.balance != sub.shard_sum;
```

### D3. Double-Entry Balance

```sql
-- For every transaction: SUM(DEBIT legs) = SUM(CREDIT legs) = transaction.amount
SELECT t.id, t.amount,
       SUM(CASE WHEN l.leg_type = 'DEBIT' THEN l.amount ELSE 0 END) AS total_debit,
       SUM(CASE WHEN l.leg_type = 'CREDIT' THEN l.amount ELSE 0 END) AS total_credit
FROM "transaction" t
JOIN transaction_leg l ON l.transaction_id = t.id
GROUP BY t.id, t.amount
HAVING SUM(CASE WHEN l.leg_type = 'DEBIT' THEN l.amount ELSE 0 END) != t.amount
    OR SUM(CASE WHEN l.leg_type = 'CREDIT' THEN l.amount ELSE 0 END) != t.amount;
-- Must return 0 rows
```

### D4. Leg Cardinality

```sql
-- Active payments: exactly 2 legs. Returned payments: exactly 4 legs.
SELECT t.id, t.status, COUNT(l.id) AS leg_count
FROM "transaction" t
JOIN transaction_leg l ON l.transaction_id = t.id
GROUP BY t.id, t.status
HAVING (t.status NOT IN ('RETURNED') AND COUNT(l.id) != 2)
    OR (t.status = 'RETURNED' AND COUNT(l.id) != 4);
-- Must return 0 rows
```

### D5. State Machine Terminal States

```sql
-- No payment in a terminal state should ever change
-- Terminal states: REJECTED, RETURNED, CANCELLED
-- Enforced by ValidateTransition: these states have no outgoing edges
-- Verify: audit log should show no UPDATE on terminal-state rows
```

### D6. Non-Negative Shard Balances

```sql
-- Enforced by CHECK constraint on account_shard, but verify:
SELECT * FROM account_shard WHERE balance < 0;
-- Must return 0 rows
```

### D7. pending_debits Non-Negative

```sql
SELECT id, pending_debits FROM account WHERE pending_debits < 0;
-- Must return 0 rows (currently VIOLATED by SettlePayment bug)
```

---

## Section E — Minimal Fixes (5 Changes)

### Fix 1: Remove Master-Balance Operations from SettlePayment

SettlePayment should NOT call `DebitAccount`/`CreditAccount`. The debit already happened
at shard level in CreatePayment. Settlement should only:
- Credit the creditor's **shards** (via `CreditShard`)
- Update status to SETTLED
- Remove the duplicate leg creation (legs were already created in CreatePayment)

```go
// SettlePayment — FIXED
func (s *PaymentService) SettlePayment(ctx context.Context, uetrStr string) error {
    uetr, _ := uuid.Parse(uetrStr)
    
    return s.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
        // Read INSIDE the TX to eliminate TOCTOU
        transaction, err := s.transactionRepo.GetByUETRTx(ctx, tx, uetr) // NEW: TX-aware read
        if err != nil { return err }
        
        // Use ValidateTransition (only CLEARED→SETTLED is valid)
        if err := db.ValidateTransition(transaction.Status, "SETTLED"); err != nil {
            return err
        }
        
        // Credit creditor shards (the only balance op needed)
        if err := s.shardRepo.CreditShard(ctx, tx, transaction.CreditorAccountID, transaction.Amount); err != nil {
            return err
        }
        
        // Update status (no duplicate legs — they were created in CreatePayment)
        if err := s.transactionRepo.UpdateStatus(ctx, tx, transaction.ID, "SETTLED", ""); err != nil {
            return err
        }
        
        // Outbox event (unchanged)
        // ...
        return nil
    })
}
```

### Fix 2: Add Shard Reversal to ReturnPayment

ReturnPayment must reverse both the debtor shard debit and the creditor shard credit:

```go
// Inside ReturnPayment RetryTx:

// Reverse debtor shard debit
if err := s.shardRepo.CreditShard(ctx, tx, transaction.DebtorAccountID, transaction.Amount); err != nil {
    return fmt.Errorf("failed to reverse debtor shard: %w", err)
}

// Reverse creditor shard credit  
if err := reverseCreditorShard(ctx, tx, transaction.CreditorAccountID, transaction.Amount); err != nil {
    return fmt.Errorf("failed to reverse creditor shard: %w", err)
}

// Use ValidateTransition instead of manual check
if err := db.ValidateTransition(transaction.Status, "RETURNED"); err != nil {
    return err
}
```

This requires a new `DebitShard` method (inverse of `CreditShard`) that debits shard 0:

```go
func (r *ShardRepository) DebitShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error {
    query := `UPDATE account_shard SET balance = balance - $2, updated_at = current_timestamp()
              WHERE account_id = $1 AND shard_id = 0 AND balance >= $2`
    result, err := tx.Exec(ctx, query, accountID, amount)
    if err != nil { return err }
    if result.RowsAffected() == 0 { return ErrInsufficientFunds }
    return nil
}
```

### Fix 3: Remove Duplicate Legs from SettlePayment

Delete the `CreateLeg` calls from SettlePayment entirely. The legs are already created
in CreatePayment. SettlePayment should only: credit creditor shards + update status.

If balance-after snapshots are needed on settlement, UPDATE the existing legs instead of
creating new ones:

```go
// Optional: update balance_after on existing legs
tx.Exec(ctx, `UPDATE transaction_leg SET balance_after = $2 
              WHERE transaction_id = $1 AND sequence_number = 1`, txID, debtorBalance)
```

### Fix 4: Add GetByUETRTx for In-Transaction Reads

Add a TX-aware variant to `TransactionRepository` and `TransactionStore` interface:

```go
func (r *TransactionRepository) GetByUETRTx(ctx context.Context, tx pgx.Tx, uetr uuid.UUID) (*Transaction, error) {
    // Same query as GetByUETR but using tx.QueryRow instead of r.pool.QueryRow
    ...
    err := tx.QueryRow(ctx, query, uetr).Scan(...)
    ...
}
```

Use this in both `SettlePayment` and `ReturnPayment` to eliminate the TOCTOU window.

### Fix 5: Use ValidateTransition in Settle/Return

Replace manual status checks with `db.ValidateTransition(currentStatus, targetStatus)`.
This ensures the state machine is the single source of truth for allowed transitions.

SettlePayment should only accept CLEARED → SETTLED.  
ReturnPayment should only accept SETTLED → RETURNED or CLEARED → RETURNED.

---

## Appendix: Risk Matrix Summary

| ID | Severity | Category | Description | Fix |
|----|----------|----------|-------------|-----|
| A1 | 🔴 CRITICAL | Money Loss | SettlePayment double-debits via master + shard | Fix 1 |
| A2 | 🔴 CRITICAL | Money Loss | Creditor credit erased by reconciliation | Fix 1 |
| A3 | 🔴 CRITICAL | Money Loss | ReturnPayment doesn't reverse shard debit | Fix 2 |
| A4 | 🟠 HIGH | Ledger Corruption | Duplicate legs (seq 1,2 created twice) | Fix 3 |
| A5 | 🟠 HIGH | Safety | Settle/Return bypass ValidateTransition | Fix 5 |
| A6 | 🟡 MEDIUM | Race Condition | GetByUETR outside TX (TOCTOU) | Fix 4 |
| A7 | 🟡 MEDIUM | Reliability | Reconciliation not retry-safe | Wrap in RetryTx |

**Fixes 1–3 are BLOCKING for production.** Fix 4–5 should ship in the same PR.
Fix A7 can be deferred to the next sprint.

---

## What's Working Well

- **CreatePayment atomicity**: Shard debit + TX create + legs + outbox all in one
  serializable RetryTx. Crash-safe. ✅
- **Idempotency**: 3-layer defense (Redis → ExistsByUETR → UNIQUE constraint + 23505 catch). ✅
- **State machine in UpdateStatus**: ValidateTransition correctly enforced at the DB layer. ✅
- **Outbox pattern**: Transactional insert, Debezium CDC, retry goroutine. ✅
- **Shard debit hot path**: Random shard → richest fallback → lazy init. Correct under
  CockroachDB serializable isolation. ✅
- **Connection pool hardening**: statement_timeout, serializable default, retry with
  exponential backoff. ✅

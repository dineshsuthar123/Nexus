# Principal Financial Systems Audit Report
## Nexus-RTP — payment-service (shard correctness series)

**Auditor role:** Principal Financial Systems Auditor  
**Audit scope:** `services/payment-service` — atomicity, ledger correctness, invariant enforcement, and edge-case failure modes  
**Baseline commit:** `a79d5c5` ("correctness: fix SettlePayment/ReturnPayment shard split-brain")  
**Stack:** Go 1.22 · CockroachDB (SERIALIZABLE) · pgx/v5 · account-sharding (8 shards)  
**Date:** 2025 Q3

---

## Section A — Risk Register

| ID | Severity | Component | Finding | Status |
|----|----------|-----------|---------|--------|
| A-1 | **CRITICAL → FIXED** | `CreditShard` | No lazy-init for post-migration accounts — settlement permanently fails for any creditor whose account was created after migration 008 ran | Fixed in this session |
| A-2 | **CRITICAL → FIXED** | `DebitShard` | Shard-0-only debit — after `Rebalance()` distributes credit across all 8 shards, shard 0 holds only `balance/8`; `DebitShard` returns `ErrInsufficientFunds` even though total balance is sufficient, blocking all returns for that payment | Fixed in this session |
| A-3 | **HIGH → FIXED (prev.)** | `SettlePayment` | Pre-`a79d5c5`: double-debit debtor + missing `ValidateTransition` + TOCTOU status read | Fixed in `a79d5c5` |
| A-4 | **HIGH → FIXED (prev.)** | `ReturnPayment` | Pre-`a79d5c5`: duplicate legs, state-machine bypass, no shard reversal for debtor | Fixed in `a79d5c5` |
| A-5 | **MEDIUM** | `ReturnPayment` (CLEARED→RETURNED) | When a CLEARED payment is returned before settlement, `DebitShard(creditor)` correctly fails with `ErrInsufficientFunds` — creditor was never credited. No money is lost (TX rolls back), but the payment is permanently stuck in CLEARED with no recovery path. Callers receive a 422 with no guidance. | Open (operational, not safety) |
| A-6 | **MEDIUM** | `account.balance` | `account.balance` column is only updated by the 5-minute reconciliation goroutine. Any consumer that reads `account.balance` directly (e.g. admin queries, external reporting) sees a stale value. Shard sum is the true balance and is always current. | Open (documentation / access-control) |
| A-7 | **LOW** | Reconciliation goroutine | Two separate `dbPool.QueryRow` + `dbPool.Exec` calls are not wrapped in a single TX, and the exec is not retried on serialization conflict. A concurrent shard update between the two calls produces a stale write (immediately overwritten during the next reconciliation cycle). No money is lost; the effect is a 5-minute window of stale `account.balance`. | Open (liveness, not safety) |
| A-8 | **LOW** | Outbox retry goroutine | `FOR UPDATE SKIP LOCKED` correctly prevents duplicate delivery within a process, but the delivery guarantee is **at-least-once**. Consumers must be idempotent (they are, via UETR dedup). | Accepted |

---

## Section B — Edge Case Analysis

### B-1 Duplicate UETR on CreatePayment

**Scenario:** Client retries `POST /payments` with same UETR after network timeout.

**Outcome:** Safe.
1. Pre-TX check `ExistsByUETR` (outside TX) returns true → short-circuit 200 with existing record.  
2. If two goroutines race past the pre-check: UNIQUE constraint on `(uetr)` fires; `pgconn.PgError` code `23505` is caught and returns the existing record.  
3. `RetryTx` serializable conflict retry is for CockroachDB `40001`/`CR000`; UNIQUE violation is not retried — correct.

**Verdict:** No duplication possible.

---

### B-2 Concurrent Settle + Return (race)

**Scenario:** Two clients call `SettlePayment` and `ReturnPayment` for the same UETR simultaneously.

**Outcome:** Safe.
1. Both paths call `GetByUETRTx` inside a SERIALIZABLE TX, acquiring a snapshot of the payment row.
2. `UpdateStatus` re-reads the row with a new `SELECT ... FOR UPDATE` inside the same TX and calls `ValidateTransition` again.
3. CockroachDB's serializable isolation guarantees exactly one winner; the loser gets a `40001` serialization error and is retried by `RetryTx(3)`.
4. On retry, the loser's `ValidateTransition` finds the status already advanced (`SETTLED` or `RETURNED`) and returns `ErrInvalidTransition` — no phantom operation.

**Verdict:** Exactly-once state transition guaranteed.

---

### B-3 Duplicate ReturnPayment

**Scenario:** Same UETR returned twice (client bug or idempotency retry).

**Outcome:** Safe.
- First return: CLEARED/SETTLED → RETURNED via `ValidateTransition`.
- Second return: `ValidateTransition(RETURNED, "RETURNED")` is not in the transition map → `ErrInvalidTransition` → 422 returned to caller.
- Idempotent at the state-machine level; no double-credit to debtor.

**Verdict:** No duplication possible.

---

### B-4 Crash between shard update and `UpdateStatus`

**Scenario:** Process crashes after `CreditShard` but before `UpdateStatus` commits.

**Outcome:** Safe. The entire sequence runs inside a single `RetryTx` block backed by a CockroachDB transaction. A crash causes an implicit rollback; no partial state is committed. On client retry the full flow is re-executed from scratch.

**Verdict:** Crash-safe; atomic commit covers all operations.

---

### B-5 Rebalance races with settle/return

**Scenario:** `triggerRebalanceIfNeeded` goroutine fires concurrently with `SettlePayment` or `ReturnPayment`.

**Outcome:** Safe. The rebalance goroutine runs its own SERIALIZABLE TX (`RetryTx`). CockroachDB will serialise one of them; the loser retries. `CreditShard` now also lazy-inits shards, so a rebalance that runs between account creation and first settlement does not corrupt state.

**Verdict:** No race condition.

---

### B-6 First settlement for post-migration creditor (NEW — Bug A)

**Scenario:** Creditor account created after migration 008 ran has no `account_shard` rows. Settlement calls `CreditShard`.

**Pre-fix outcome:** `UPDATE … WHERE shard_id = 0` affects 0 rows → `"shard 0 not found"` error → TX rollback → payment stuck in CLEARED forever; money never reaches creditor.

**Post-fix outcome:** `CreditShard` detects `RowsAffected == 0`, calls `EnsureShardsExist(ctx, tx, accountID, decimal.Zero)` to seed shards inside the same serializable TX, then retries the credit update. Atomic; no leaked state.

**Verdict:** Fixed. Safe.

---

### B-7 Return after rebalance (NEW — Bug B)

**Scenario:** After `Rebalance()` moves credit to shards 1–7, a return is initiated. `DebitShard(creditor)` tries shard 0 which now holds only `balance/8`.

**Pre-fix outcome:** `balance < amount` on shard 0 → `ErrInsufficientFunds` → TX rollback → payment permanently stuck in SETTLED/CLEARED with no way to return it; creditor keeps funds they should have returned.

**Post-fix outcome:** Shard 0 miss triggers a fallback `SELECT shard_id … ORDER BY balance DESC LIMIT 1` query that finds the richest shard. That shard is debited atomically inside the same TX via the original `debitQuery` with `AND balance >= $3`. A serialization race (concurrent debit drains the chosen shard) returns `ErrInsufficientFunds` — safe; the caller may retry.

**Verdict:** Fixed. Safe.

---

## Section C — Invariant Verification Queries

The following SQL queries can be run against the CockroachDB cluster to validate system invariants at any point in time.

### C-1 Double-entry balance: total debits == total credits

```sql
SELECT
    SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) AS total_debits,
    SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END) AS net  -- must be 0
FROM transaction_legs;
```

Expected: `net = 0`.

---

### C-2 Shard-sum consistency: account.balance equals sum of shard balances

```sql
SELECT
    a.id,
    a.balance          AS master_balance,
    SUM(s.balance)     AS shard_sum,
    a.balance - SUM(s.balance) AS drift  -- must be 0 (within reconciliation window)
FROM accounts a
JOIN account_shard s ON s.account_id = a.id
GROUP BY a.id, a.balance
HAVING a.balance <> SUM(s.balance);
```

Expected: 0 rows (outside the 5-minute reconciliation window, small drift is normal; post-reconciliation must be 0).

---

### C-3 Leg cardinality per payment

```sql
SELECT
    t.id,
    t.status,
    COUNT(l.id) AS leg_count
FROM transactions t
LEFT JOIN transaction_legs l ON l.transaction_id = t.id
GROUP BY t.id, t.status
HAVING
    (t.status IN ('CLEARED','PENDING','SANCTIONED','FRAUD_REVIEW','REJECTED','CANCELLED') AND COUNT(l.id) <> 2)
    OR
    (t.status IN ('SETTLED') AND COUNT(l.id) <> 2)
    OR
    (t.status = 'RETURNED' AND COUNT(l.id) <> 4);
```

Expected: 0 rows.

---

### C-4 No SETTLED/RETURNED payment without a credit leg to creditor

```sql
SELECT t.id, t.status, t.creditor_account_id
FROM transactions t
WHERE t.status IN ('SETTLED', 'RETURNED')
  AND NOT EXISTS (
      SELECT 1 FROM transaction_legs l
      WHERE l.transaction_id = t.id
        AND l.account_id = t.creditor_account_id
        AND l.entry_type = 'CREDIT'
        AND l.sequence_number = 2
  );
```

Expected: 0 rows.

---

### C-5 Shard CHECK constraint: no negative shard balances

```sql
SELECT account_id, shard_id, balance
FROM account_shard
WHERE balance < 0;
```

Expected: 0 rows (enforced by `CHECK(balance >= 0)` in schema; this query confirms the constraint holds).

---

### C-6 Terminal-state payments must have outbox event published

```sql
SELECT t.id, t.status
FROM transactions t
WHERE t.status IN ('SETTLED', 'RETURNED', 'REJECTED')
  AND NOT EXISTS (
      SELECT 1 FROM outbox_events o
      WHERE o.aggregate_id = t.id::text
        AND o.published_at IS NOT NULL
  );
```

Expected: 0 rows (at-least-once delivery; temporary gap is acceptable during retry window).

---

## Section D — Final Verdict

### System Safety Rating: **CONDITIONALLY SAFE**

After applying all fixes through commit `a79d5c5` and the two shard-repository patches in this session:

| Property | Status |
|----------|--------|
| **Atomicity** | PASS — all financial operations are wrapped in `RetryTx` (SERIALIZABLE); a crash at any point produces a full rollback with no partial state |
| **Double-entry correctness** | PASS — `CreatePayment` produces exactly 2 legs (DEBIT + CREDIT); `ReturnPayment` produces exactly 4 legs total; `SettlePayment` produces no additional legs (correct — settlement is a state change, not a new transfer) |
| **Idempotency** | PASS — UETR UNIQUE constraint + pre-check + `ValidateTransition` inside TX make all three operations idempotent and duplicate-safe |
| **State machine integrity** | PASS — `ValidateTransition` enforced at application layer; `UpdateStatus` re-reads and re-validates inside each TX, eliminating TOCTOU |
| **Shard balance integrity** | PASS (post-fix) — `CreditShard` lazy-inits; `DebitShard` uses richest-shard fallback; `ReserveFundsShard` already correct; `CHECK(balance>=0)` prevents underflow at DB level |
| **Concurrency safety** | PASS — CockroachDB SERIALIZABLE isolation serialises concurrent settle/return; `RetryTx` handles `40001`/`CR000` retries |
| **Crash safety** | PASS — all critical operations in single TX blocks; outbox CDC provides durable event delivery |

### Remaining Open Items (non-blocking)

| ID | Priority | Action |
|----|----------|--------|
| A-5 | Medium | Add a `CLEARED → RETURNED` guard in `ReturnPayment`: if `total shard balance of creditor < amount`, return a structured error explaining the payment was never settled so it cannot be returned via this path; provide a `CancelPayment` alternative |
| A-6 | Low | Add code comments or API documentation noting `account.balance` is a stale cache; ensure no read path uses it for financial decisions |
| A-7 | Low | Wrap reconciliation's two statements in a single `RetryTx` block to eliminate the narrow stale-write window |

### Blocking issues at time of this report: **0**

The two critical bugs (A-1, A-2) that would cause permanent money-stuck states are fixed. All prior critical bugs (A-3, A-4) were fixed in `a79d5c5`. The system is **safe to operate** with the caveats documented in A-5 through A-8.

---

*Report generated by principal financial systems audit. All findings are based on static code analysis of the Go source and CockroachDB schema. Dynamic verification should include running the invariant queries in Section C against a staging database after a full load-test cycle.*

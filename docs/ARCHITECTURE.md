# System Architecture: Nexus-RTP Payment Service

<!-- performance-results:start -->
### Measured local performance (2026-11-07)

| Payment attempts | p50 | p95 | p99 | Sustained accepted payments/s | Acceptance failures |
|---:|---:|---:|---:|---:|---:|
| 14,709 | 35.37 ms | 109.08 ms | 152.94 ms | 107.35 | 0.00% |

Direct API, 1–25 closed-loop users, real single-node in-memory CockroachDB and Redis.
Sanctions unavailable: payments were accepted for review. Settlement, Kafka delivery,
gateway/auth, production capacity and uptime were not measured.
Thresholds: **PASS**; persisted database invariants: **PASS**.

Frontend production lab, ten fresh-context navigations per route: median LCP `/` 750 ms, `/auth/login` 152 ms, `/performance` 68 ms. No CPU/network throttling.

See [methodology and raw evidence](performance/README.md). Other performance figures below are design targets or historical claims unless linked to a recorded run.
<!-- performance-results:end -->

**Version:** 1.0
**Stack:** Go workspace 1.25.6 · CockroachDB (SERIALIZABLE) · Kafka · Redis · OpenTelemetry

---

## A. Overview

Nexus-RTP is a real-time payment processing service implementing the ISO 20022 pacs.008 (credit transfer) and pacs.004 (return) message flows. It is designed for high-throughput, correctness-critical financial workloads where money must never be lost, duplicated, or left in an inconsistent state under any failure mode — including process crashes, network partitions, and concurrent client retries.

### Design priorities (in order)

1. **Correctness** — double-entry accounting, atomic operations, exactly-once state transitions
2. **Safety** — idempotency, crash recovery, serializable isolation
3. **Throughput** — shard-based contention elimination, retry with backoff
4. **Observability** — structured logging, distributed traces, Prometheus metrics

---

## B. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Client / ISO 20022 Sender                                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS  POST /api/v1/payments
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  API Layer  (Gin HTTP)                                          │
│  • Input validation + UETR format check                        │
│  • handleServiceError: maps domain errors → HTTP status codes  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  PaymentService                                                 │
│  Stage 1: Idempotency check (UETR lookup)          < 10 ms     │
│  Stage 2: Sanctions screening (Bloom/cache)        < 100 ms    │
│  Stage 3: Ledger reservation (RetryTx)             < 250 ms    │
└──────────┬─────────────────────────┬───────────────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────┐      ┌────────────────────────────┐
│  ShardRepository │      │  TransactionRepository     │
│  account_shard   │      │  transaction               │
│  (8 rows/acct)   │      │  transaction_leg           │
└──────────────────┘      │  outbox_events             │
                          └────────────┬───────────────┘
                                       │ Debezium CDC
                                       ▼
                          ┌────────────────────────────┐
                          │  Kafka  (pacs.008 / .004)  │
                          └────────────────────────────┘
```

### Background goroutines

| Goroutine | Interval | Purpose |
|-----------|----------|---------|
| Outbox retry | 30 s | Re-publish undelivered events (max 5 retries, `FOR UPDATE SKIP LOCKED`) |
| Balance reconciliation | 5 min | Sync `account.balance` cache to `SUM(account_shard.balance)` |
| Sanctions refresh | 6 h | Reload sanctions watchlists into in-memory cache |
| Shard rebalance | on-demand | Redistribute shard balances after skewed writes (async, non-blocking) |

---

## C. Core Components

### C.1 Shard-Based Balance Model

**Problem:** In a high-throughput payments system, every payment to or from a popular account writes to the same `account.balance` row. Under SERIALIZABLE isolation, concurrent transactions serialise on that single row, producing a hot-row bottleneck that caps throughput at `1 / lock_hold_time`.

**Solution:** Each account's balance is spread across 8 fixed `account_shard` rows (`shard_id` 0–7). Each payment touches exactly one shard row rather than the shared account row.

```
account (id, balance*)         ← stale cache, updated every 5 min
  └── account_shard (id, shard_id=0, balance)
  └── account_shard (id, shard_id=1, balance)
  ...
  └── account_shard (id, shard_id=7, balance)
```

`*` `account.balance` is a **derived, stale cache**. All financial operations use `account_shard`.

**Debit algorithm (ReserveFundsShard):**

1. Validate account metadata (status, currency, transaction limit) via read-only `account` lookup.
2. Pick a random shard (0–7). Attempt `UPDATE … WHERE balance >= amount` on that shard.
3. If the random shard has insufficient funds, find the richest shard with `balance >= amount` (fallback `SELECT … ORDER BY balance DESC`).
4. If no single shard can cover the amount, return `ErrInsufficientFunds`.
5. If the account has no shard rows (created after migration 008), lazy-initialise shards from `account.balance` and retry.

**Credit algorithm (CreditShard):** Credits always land on shard 0. Async rebalancing prevents shard 0 from accumulating an unbounded surplus. If shard rows don't exist, lazy-initialise with zero balance first.

**Rebalance:** When a shard drops below 10% of the per-shard average, an async goroutine (with `recover()`) runs `Rebalance()` in its own `RetryTx`. This `SELECT … FOR UPDATE` all 8 shards, computes the mean, and updates each shard to the mean value atomically. It does not block the hot debit path.

**DebitShard (returns):** Used only by `ReturnPayment` to reverse a prior `CreditShard`. Tries shard 0 first (fast path), then falls back to the richest shard if shard 0 was drained by rebalancing.

**Contention reduction:** Under K=8 shards and N concurrent debits uniformly distributed, the probability of two debits colliding on the same shard is `1/8` of the unsharded case. This is a contention hypothesis, not a measured before/after speedup. Current acceptance measurements and their workload are in [recorded performance](performance/README.md).

---

### C.2 Double-Entry Ledger

Every payment produces transaction leg records that maintain accounting integrity.

| Flow | Legs created | Sequence |
|------|-------------|----------|
| `CreatePayment` | 2 | 1: Debtor DEBIT, 2: Creditor CREDIT |
| `ReturnPayment` | +2 more | 3: Creditor DEBIT, 4: Debtor CREDIT |
| `SettlePayment` | 0 | State change only; legs already exist |

**Invariant:** Within any completed payment lifecycle, `SUM(DEBIT legs) == SUM(CREDIT legs)` and net effect on every account is zero over a full round-trip (create + return).

Legs are created inside the same `RetryTx` block as the shard update and `UpdateStatus`, ensuring the ledger is always in sync with the balance position.

---

### C.3 Idempotency

`CreatePayment` has three layers of idempotency protection:

1. **Pre-TX check:** `ExistsByUETR(ctx, uetr)` runs *outside* the transaction. If the UETR already exists, the existing record is returned immediately without acquiring any locks. This handles the common case of a client retry with negligible overhead.

2. **UNIQUE constraint:** The `transaction` table has `UNIQUE(uetr)`. If two concurrent goroutines both pass the pre-check, the second `INSERT` raises `SQLSTATE 23505`. This is caught and converted to a lookup of the existing record.

3. **`RetryTx` does not retry 23505:** CockroachDB serialization errors (`40001`, `TransactionRetryWithProtoRefreshError`) are retried with exponential backoff (10ms → 20ms → 40ms → 80ms → 160ms, max 5 attempts). UNIQUE violations are *not* retried — they are treated as application logic signals.

`SettlePayment` and `ReturnPayment` are idempotent via the state machine: a second call to settle an already-SETTLED payment returns `ErrInvalidTransition` without touching any financial state.

---

### C.4 State Machine

Payment lifecycle is governed by a strict transition map enforced at two levels:

```
                  ┌─────────────────────────┐
                  │         PENDING         │
                  └──┬──────┬──────┬────────┘
                     │      │      │
               SANCTIONED  │   REJECTED (terminal)
                     │    CLEARED
                     │      │ └──► CANCELLED (terminal)
               FRAUD_REVIEW │
                     │      ▼
                     └──► SETTLED ──► RETURNED (terminal)
                              │
                              └──────────────────────► RETURNED (terminal)
                                   (CLEARED → RETURNED,
                                    no settlement occurred)
```

**Terminal states:** `REJECTED`, `RETURNED`, `CANCELLED` — no outgoing transitions exist.

**Enforcement:** `ValidateTransition(from, to)` is called at two points:

1. **Application layer** (fast-fail): in `SettlePayment` / `ReturnPayment` *before* any shard operation, to return an error quickly and avoid acquiring DB locks needlessly.

2. **Inside `UpdateStatus`** (serializable guarantee): `UpdateStatus` re-reads the current status with a `SELECT` inside the *same serializable TX* and calls `ValidateTransition` again. This eliminates a TOCTOU race where two concurrent requests both pass the application-layer check before either commits.

Under CockroachDB SERIALIZABLE isolation, exactly one concurrent settle/return wins; the loser receives a `40001` serialization error and is retried by `RetryTx`. On retry it reads the already-advanced status and `ValidateTransition` returns `ErrInvalidTransition`, cleanly aborting the duplicate.

---

### C.5 Transactional Outbox

Kafka events are published via the transactional outbox pattern. An `outbox_events` row is inserted inside the *same `RetryTx`* as every financial operation. Debezium CDC reads the `outbox_events` table via logical replication and publishes to Kafka.

```
RetryTx {
    shard update
    UpdateStatus
    outboxRepo.Insert(...)   ← same atomic commit
}
```

This guarantees that an event is published if and only if the financial operation committed. There is no window where money moves but no event is emitted (or vice versa).

The outbox retry goroutine provides at-least-once delivery: it re-publishes events that were not picked up by Debezium (using `FOR UPDATE SKIP LOCKED` to prevent double-processing within a single instance). Kafka consumers must be idempotent (they are, via UETR deduplication).

---

### C.6 Balance Reconciliation

`account.balance` is a stale cache used only for reporting and display. It is updated every 5 minutes by a background goroutine that runs a single `RetryTx`:

```sql
-- Step 1: count drifted accounts (check)
SELECT count(*) FROM account a
WHERE EXISTS (SELECT 1 FROM account_shard WHERE account_id = a.id)
  AND a.balance != (SELECT COALESCE(SUM(balance), 0) FROM account_shard WHERE account_id = a.id)

-- Step 2: fix drift (same TX snapshot)
UPDATE account
SET balance = sub.shard_sum, updated_at = current_timestamp()
FROM (SELECT account_id, SUM(balance) AS shard_sum FROM account_shard GROUP BY account_id) sub
WHERE account.id = sub.account_id AND account.balance != sub.shard_sum
```

Both statements share a SERIALIZABLE TX snapshot, so the reconciled value always matches what was seen at check time. `RetryTx(ctx, 3)` retries on `40001` conflicts. Drift count is exported as a Prometheus gauge (`balance_drift_accounts`).

---

## D. Guarantees

### D.1 Atomicity

Every financial operation — shard update, leg creation, status update, outbox insert — executes inside a single `RetryTx` call backed by a CockroachDB transaction. A crash at any point produces an implicit rollback with zero partial state committed. There is no need for compensating transactions or saga rollback logic.

### D.2 No Money Loss or Duplication

| Scenario | Outcome |
|----------|---------|
| Client retries `CreatePayment` with same UETR | Pre-TX check or UNIQUE constraint; existing record returned; no second debit |
| Concurrent settle + return for same payment | SERIALIZABLE isolation serialises one; loser gets `40001`, retries, `ValidateTransition` rejects |
| Process crash mid-settlement | TX rolled back; payment remains CLEARED; safe to retry |
| `SettlePayment` called twice | Second call: `ValidateTransition(SETTLED, SETTLED)` → `ErrInvalidTransition` → 422 |
| `ReturnPayment` on CLEARED (never settled) | Debtor credited; creditor NOT debited (guard added); correct full reversal |
| Rebalance + concurrent debit | All run under SERIALIZABLE. `RowsAffected == 0` triggers richest-shard fallback instead of false `ErrInsufficientFunds` |

### D.3 Ledger Integrity

**Double-entry:** `SUM(DEBIT legs) == SUM(CREDIT legs)` for any closed payment lifecycle.
**Shard-sum consistency:** `SUM(account_shard.balance) == account.balance` within the 5-minute reconciliation window (and exactly after each reconciliation cycle).
**Non-negativity:** `CHECK (balance >= 0)` on `account_shard` is enforced at the database level. No application-layer bug can produce a negative shard balance.

### D.4 At-Least-Once Event Delivery

Every committed state change produces exactly one `outbox_events` row in the same TX. Debezium delivers it to Kafka at-least-once. The outbox retry goroutine recovers from CDC outages (up to 5 retries, 30-second spacing). Consumers deduplicate on UETR.

---

## E. Tradeoffs

### E.1 Shard Count = 8 (fixed)

**Why 8:** Provides ~8× contention reduction for the debit hot row at a cost of 8× more rows per account. 8 was chosen as a balance between write fan-out overhead and throughput gain. It matches the `ShardCount` constant in `shard_repository.go` and the seed query in migration 008.

**Tradeoff:** A single payment can only be covered by one shard at a time. Payments larger than the largest shard balance fail with `ErrInsufficientFunds`, even if the *total* account balance is sufficient. This is a deliberate design constraint: splitting a payment across shards would require a two-phase debit, adding latency and complexity incompatible with the atomic TX model.

**Mitigation:** `Rebalance()` periodically redistributes balances to equalise shard sizes. After rebalancing, any shard can cover `total_balance / 8` at minimum.

---

### E.2 CreditShard targets shard 0 only

**Why:** Credits always go to shard 0, keeping `CreditShard` a single-row O(1) operation. Write amplification (crediting all 8 shards) would create unnecessary lock contention for settlement.

**Tradeoff:** Shard 0 grows disproportionately large for accounts that receive many payments. The async rebalance mitigates this, but `DebitShard` (used only in `ReturnPayment`) must implement a richest-shard fallback for the case where shard 0 has been drained by a prior rebalance.

---

### E.3 account.balance is a stale cache

**Why:** Updating `account.balance` on every shard write would recreate the hot-row problem the sharding exists to solve.

**Tradeoff:** `account.balance` is eventually consistent (up to 5 minutes stale). It must never be read for payment authorisation. The `Account` struct carries prominent doc comments recording this constraint. All payment-path code goes through `ShardRepository` methods exclusively.

---

### E.4 SERIALIZABLE isolation vs. READ COMMITTED

**Why SERIALIZABLE:** Financial operations require that a transaction's view of the database is consistent across its entire lifetime. `READ COMMITTED` would allow non-repeatable reads between `GetByUETRTx` and `UpdateStatus`, re-opening TOCTOU races. CockroachDB's SERIALIZABLE isolation with `RetryTx` is the correct tradeoff: slightly higher retry rate in exchange for provably correct multi-step operations.

**Tradeoff:** Under high concurrency, serialization failures (`40001`) increase. The `RetryTx` backoff strategy (exponential, capped at 5 retries) bounds worst-case latency while preventing livelock.

---

### E.5 At-least-once vs. exactly-once Kafka delivery

**Why at-least-once:** Exactly-once Kafka semantics require an idempotent Kafka producer and coordinated consumer offset management. The transactional outbox + UETR-based consumer deduplication provides end-to-end exactly-once *effect* (idempotent consumers) without the added coupling of distributed transaction coordination between the database and Kafka broker.

---

### E.6 Lazy shard initialisation

Accounts created after migration 008 have no `account_shard` rows. Rather than requiring a separate account-creation hook (which would couple account management to the payment service), `CreditShard` and `ReserveFundsShard` initialise shards lazily on first use, inside the same `RetryTx`. This is safe under SERIALIZABLE isolation: if two concurrent TXs both attempt lazy init, one will serialise and succeed; the other will see the `ON CONFLICT DO NOTHING` on the `INSERT` and proceed.

---

## F. Conclusion

The Nexus-RTP payment service achieves finance-grade correctness through a small number of composable primitives:

- **One atomic unit of work:** every payment operation is a single `RetryTx`. There are no multi-step operations with partial commit risk.
- **Two layers of state-machine enforcement:** application fast-fail + serializable re-read inside `UpdateStatus`.
- **Three idempotency layers for `CreatePayment`:** pre-TX check, UNIQUE constraint, `RetryTx` discriminating `23505` from `40001`.
- **Sharding for throughput without sacrificing correctness:** random shard selection with deterministic fallback, all within the same serializable TX.
- **Stale cache pattern for `account.balance`:** separates reporting from the write-critical balance path, with a reconciliation job that is fully atomic and retriable.

The system has no saga compensation logic, no eventual-consistency windows on the financial path, and no optimistic-lock columns. Correctness guarantees come from the database's SERIALIZABLE isolation reified by the application's `RetryTx` discipline, not from application-level version counters or distributed locks.

**Known operational constraints:**
- A single payment cannot exceed the balance of the largest individual shard (~`total_balance / 8` after rebalance).
- `account.balance` in API responses is up to 5 minutes stale; downstream systems that need real-time balance must call `ShardRepository.TotalBalance`.
- Kafka event delivery is at-least-once; all consumers must implement UETR-based deduplication.

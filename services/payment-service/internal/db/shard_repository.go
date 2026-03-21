package db

import (
	"context"
	"fmt"
	"math/rand"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"
)

const (
	// ShardCount is the number of balance shards per account.
	// 8 shards reduce contention from N-on-1 to N/8-on-1.
	// Must match the number of shards seeded by migration 008.
	ShardCount = 8

	// RebalanceThreshold: if a shard drops below this fraction of the
	// per-shard average, a rebalance is suggested. 0.10 = 10%.
	RebalanceThreshold = 0.10
)

// ── Prometheus metrics for shard operations ─────────────────────────────────

var (
	shardDebitAttempts = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "account_shard_debit_attempts_total",
			Help: "Total shard debit attempts by outcome",
		},
		[]string{"outcome"}, // "hit", "fallback", "insufficient"
	)

	shardRebalanceTriggers = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "account_shard_rebalance_triggers_total",
			Help: "Number of times shard rebalance was triggered",
		},
	)
)

// ShardRepository provides sharded balance operations.
type ShardRepository struct {
	pool   *Pool
	logger *zap.Logger
}

// NewShardRepository creates a new shard repository.
func NewShardRepository(pool *Pool, logger *zap.Logger) *ShardRepository {
	return &ShardRepository{pool: pool, logger: logger}
}

// ReserveFromShard atomically debits a single shard if it has sufficient balance.
// The CHECK constraint on account_shard enforces balance >= 0, so we rely on
// the WHERE clause + rows_affected rather than a pre-read.
//
// Returns true if the shard had enough balance and was debited.
func (r *ShardRepository) ReserveFromShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, shardID int, amount decimal.Decimal) (bool, error) {
	query := `
		UPDATE account_shard
		SET balance = balance - $3,
		    updated_at = current_timestamp()
		WHERE account_id = $1
		  AND shard_id = $2
		  AND balance >= $3
	`
	result, err := tx.Exec(ctx, query, accountID, shardID, amount)
	if err != nil {
		return false, fmt.Errorf("shard reserve failed: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

// ReserveFundsShard is the main entry point for sharded fund reservation.
// Algorithm:
//  1. Pick a random shard, attempt single-row UPDATE (hot path).
//  2. If that shard is too low, find the richest shard that can cover it.
//  3. If no single shard can cover it, return ErrInsufficientFunds.
//
// Also validates account status, currency, and transaction limit via the
// parent account row (read-only, outside the write contention zone).
func (r *ShardRepository) ReserveFundsShard(
	ctx context.Context,
	tx pgx.Tx,
	accountID uuid.UUID,
	amount decimal.Decimal,
	currency string,
) error {
	// ── Step 0: Validate account metadata (read-only, no contention) ────────
	var status, cur string
	var txLimit decimal.Decimal
	err := tx.QueryRow(ctx,
		`SELECT status, currency, transaction_limit FROM account WHERE id = $1`,
		accountID,
	).Scan(&status, &cur, &txLimit)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrNotFound
		}
		return fmt.Errorf("shard: account lookup failed: %w", err)
	}
	if status != "ACTIVE" {
		return ErrAccountInactive
	}
	if cur != currency {
		return ErrCurrencyMismatch
	}
	if amount.GreaterThan(txLimit) {
		return ErrTransactionLimitExceeded
	}

	// ── Step 1: Random shard — single row UPDATE (hot path) ─────────────────
	shard := rand.Intn(ShardCount)
	ok, err := r.ReserveFromShard(ctx, tx, accountID, shard, amount)
	if err != nil {
		return err
	}
	if ok {
		shardDebitAttempts.WithLabelValues("hit").Inc()
		return nil
	}

	// ── Step 2: Fallback — find the richest shard that can cover it ─────────
	var fallbackShard int
	err = tx.QueryRow(ctx,
		`SELECT shard_id FROM account_shard
		 WHERE account_id = $1 AND balance >= $2
		 ORDER BY balance DESC
		 LIMIT 1`,
		accountID, amount,
	).Scan(&fallbackShard)
	if err != nil {
		if err == pgx.ErrNoRows {
			shardDebitAttempts.WithLabelValues("insufficient").Inc()
			return ErrInsufficientFunds
		}
		return fmt.Errorf("shard fallback query failed: %w", err)
	}

	ok, err = r.ReserveFromShard(ctx, tx, accountID, fallbackShard, amount)
	if err != nil {
		return err
	}
	if ok {
		shardDebitAttempts.WithLabelValues("fallback").Inc()
		return nil
	}

	// Raced with another transaction — treat as insufficient.
	shardDebitAttempts.WithLabelValues("insufficient").Inc()
	return ErrInsufficientFunds
}

// CreditShard adds funds to shard 0 (default credit sink).
// Credits always go to shard 0; rebalancing distributes them later.
func (r *ShardRepository) CreditShard(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, amount decimal.Decimal) error {
	query := `
		UPDATE account_shard
		SET balance = balance + $2,
		    updated_at = current_timestamp()
		WHERE account_id = $1 AND shard_id = 0
	`
	result, err := tx.Exec(ctx, query, accountID, amount)
	if err != nil {
		return fmt.Errorf("shard credit failed: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("shard credit: shard 0 not found for account %s", accountID)
	}
	return nil
}

// TotalBalance returns the sum of all shard balances for an account.
// Used for reconciliation and balance queries (not on the debit hot path).
func (r *ShardRepository) TotalBalance(ctx context.Context, accountID uuid.UUID) (decimal.Decimal, error) {
	var total decimal.Decimal
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(balance), 0) FROM account_shard WHERE account_id = $1`,
		accountID,
	).Scan(&total)
	if err != nil {
		return decimal.Zero, fmt.Errorf("shard total balance failed: %w", err)
	}
	return total, nil
}

// Rebalance redistributes shard balances evenly.
// Called asynchronously when a shard drops below RebalanceThreshold.
// Runs in its own serializable transaction — does NOT block the hot path.
func (r *ShardRepository) Rebalance(ctx context.Context, accountID uuid.UUID) error {
	return r.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
		// Read all shards within this transaction
		rows, err := tx.Query(ctx,
			`SELECT shard_id, balance FROM account_shard
			 WHERE account_id = $1
			 ORDER BY shard_id
			 FOR UPDATE`,
			accountID,
		)
		if err != nil {
			return fmt.Errorf("rebalance: read shards failed: %w", err)
		}
		defer rows.Close()

		balances := make([]decimal.Decimal, ShardCount)
		total := decimal.Zero
		for rows.Next() {
			var sid int
			var bal decimal.Decimal
			if err := rows.Scan(&sid, &bal); err != nil {
				return fmt.Errorf("rebalance: scan failed: %w", err)
			}
			if sid < ShardCount {
				balances[sid] = bal
				total = total.Add(bal)
			}
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("rebalance: rows error: %w", err)
		}

		if total.IsZero() {
			return nil // nothing to rebalance
		}

		// Compute even split: each shard gets floor(total/K), remainder to shard 0
		perShard := total.Div(decimal.NewFromInt(ShardCount)).Floor()
		remainder := total.Sub(perShard.Mul(decimal.NewFromInt(ShardCount)))

		for i := 0; i < ShardCount; i++ {
			target := perShard
			if i == 0 {
				target = target.Add(remainder)
			}
			if balances[i].Equal(target) {
				continue
			}
			_, err := tx.Exec(ctx,
				`UPDATE account_shard SET balance = $3, updated_at = current_timestamp()
				 WHERE account_id = $1 AND shard_id = $2`,
				accountID, i, target,
			)
			if err != nil {
				return fmt.Errorf("rebalance: update shard %d failed: %w", i, err)
			}
		}

		shardRebalanceTriggers.Inc()
		r.logger.Info("shard rebalance completed",
			zap.String("account_id", accountID.String()),
			zap.String("total", total.String()),
			zap.String("per_shard", perShard.String()),
		)
		return nil
	})
}

// NeedsRebalance checks if any shard is below the threshold.
// This is a cheap read — no locks, no transaction needed.
func (r *ShardRepository) NeedsRebalance(ctx context.Context, accountID uuid.UUID) (bool, error) {
	// A shard needs rebalance if its balance < 10% of (total / ShardCount)
	var minBal, total decimal.Decimal
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(MIN(balance), 0), COALESCE(SUM(balance), 0)
		 FROM account_shard WHERE account_id = $1`,
		accountID,
	).Scan(&minBal, &total)
	if err != nil {
		return false, err
	}
	if total.IsZero() {
		return false, nil
	}
	avg := total.Div(decimal.NewFromInt(ShardCount))
	threshold := avg.Mul(decimal.NewFromFloat(RebalanceThreshold))
	return minBal.LessThan(threshold), nil
}

// EnsureShardsExist creates shard rows for an account if they don't already exist.
// Used when onboarding new accounts or migrating existing ones.
func (r *ShardRepository) EnsureShardsExist(ctx context.Context, tx pgx.Tx, accountID uuid.UUID, initialBalance decimal.Decimal) error {
	perShard := initialBalance.Div(decimal.NewFromInt(ShardCount)).Floor()
	remainder := initialBalance.Sub(perShard.Mul(decimal.NewFromInt(ShardCount)))

	for i := 0; i < ShardCount; i++ {
		bal := perShard
		if i == 0 {
			bal = bal.Add(remainder)
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO account_shard (account_id, shard_id, balance)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (account_id, shard_id) DO NOTHING`,
			accountID, i, bal,
		)
		if err != nil {
			return fmt.Errorf("ensure shards: insert shard %d failed: %w", i, err)
		}
	}
	return nil
}

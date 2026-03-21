// Package db provides database access layer for the Payment Service
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgxpool.Pool with additional functionality
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a new database connection pool
func NewPool(ctx context.Context, databaseURL string) (*Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Connection pool settings optimized for CockroachDB
	config.MaxConns = 50
	config.MinConns = 10
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second

	// Connection timeout
	config.ConnConfig.ConnectTimeout = 10 * time.Second

	// SQL-level timeout: prevents runaway transactions from holding connections
	if config.ConnConfig.RuntimeParams == nil {
		config.ConnConfig.RuntimeParams = make(map[string]string)
	}
	config.ConnConfig.RuntimeParams["statement_timeout"] = "5000"

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &Pool{Pool: pool}, nil
}

// Ping verifies the database connection
func (p *Pool) Ping(ctx context.Context) error {
	return p.Pool.Ping(ctx)
}

// BeginTx starts a new transaction with serializable isolation
func (p *Pool) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return p.Pool.BeginTx(ctx, pgx.TxOptions{
		IsoLevel: pgx.Serializable, // Required for financial transactions
	})
}

// WithTx executes a function within a transaction
// Automatically commits on success, rolls back on error
func (p *Pool) WithTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := p.BeginTx(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			tx.Rollback(ctx)
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			return fmt.Errorf("tx error: %v, rollback error: %w", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// RetryTx executes a function within a transaction with automatic retry on conflicts
// CockroachDB uses optimistic concurrency control, so conflicts are expected
func (p *Pool) RetryTx(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error {
	var lastErr error
	for i := 0; i < maxRetries; i++ {
		err := p.WithTx(ctx, fn)
		if err == nil {
			return nil
		}

		// Check if it's a retryable error (CockroachDB conflict)
		if isRetryableError(err) {
			lastErr = err
			// Exponential backoff: 10ms, 20ms, 40ms, 80ms, 160ms
			backoff := time.Duration(10*(1<<i)) * time.Millisecond
			time.Sleep(backoff)
			continue
		}

		return err
	}

	return fmt.Errorf("transaction failed after %d retries: %w", maxRetries, lastErr)
}

// isRetryableError checks if the error is a CockroachDB retryable error
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	// CockroachDB uses SQLSTATE 40001 for serialization failures
	errStr := err.Error()
	return contains(errStr, "40001") || // Serialization failure
		contains(errStr, "retry transaction") ||
		contains(errStr, "TransactionRetryWithProtoRefreshError")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

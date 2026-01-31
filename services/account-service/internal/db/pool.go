// Package db provides database access and repositories
package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrNotFound is returned when a record is not found
	ErrNotFound = errors.New("record not found")
	// ErrDuplicateKey is returned when a unique constraint is violated
	ErrDuplicateKey = errors.New("duplicate key")
	// ErrInsufficientFunds is returned when an account has insufficient funds
	ErrInsufficientFunds = errors.New("insufficient funds")
	// ErrConcurrentModification is returned on serialization failure
	ErrConcurrentModification = errors.New("concurrent modification detected")
)

// PoolConfig holds connection pool configuration
type PoolConfig struct {
	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
}

// Pool wraps pgxpool.Pool with additional functionality
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a new connection pool
func NewPool(ctx context.Context, connString string, cfg *PoolConfig) (*Pool, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse connection string: %w", err)
	}

	config.MaxConns = cfg.MaxConns
	config.MinConns = cfg.MinConns
	config.MaxConnLifetime = cfg.MaxConnLifetime

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &Pool{Pool: pool}, nil
}

// Ping tests the database connection
func (p *Pool) Ping(ctx context.Context) error {
	return p.Pool.Ping(ctx)
}

// RetryTx executes a transaction with retry logic for CockroachDB
func (p *Pool) RetryTx(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error {
	for i := 0; i < maxRetries; i++ {
		tx, err := p.BeginTx(ctx, pgx.TxOptions{
			IsoLevel: pgx.Serializable,
		})
		if err != nil {
			return fmt.Errorf("failed to begin transaction: %w", err)
		}

		err = fn(tx)
		if err == nil {
			if err := tx.Commit(ctx); err != nil {
				// Check if it's a serialization error
				if isCRDBRetryError(err) && i < maxRetries-1 {
					continue
				}
				return fmt.Errorf("failed to commit transaction: %w", err)
			}
			return nil
		}

		// Rollback
		_ = tx.Rollback(ctx)

		// Check if it's a retryable error
		if isCRDBRetryError(err) && i < maxRetries-1 {
			// Exponential backoff
			time.Sleep(time.Duration(1<<uint(i)) * 10 * time.Millisecond)
			continue
		}

		return err
	}

	return ErrConcurrentModification
}

// isCRDBRetryError checks if an error is a CockroachDB retry error
func isCRDBRetryError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "40001" // serialization_failure
	}
	return false
}

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
	ErrNotFound     = errors.New("record not found")
	ErrDuplicateKey = errors.New("duplicate key")
	ErrConflict     = errors.New("concurrent modification detected")
)

// Pool wraps pgxpool.Pool with retry logic for CockroachDB.
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a new connection pool to CockroachDB.
func NewPool(ctx context.Context, databaseURL string) (*Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	config.MaxConns = 30
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second
	config.ConnConfig.ConnectTimeout = 10 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &Pool{Pool: pool}, nil
}

// Ping checks database connectivity.
func (p *Pool) Ping(ctx context.Context) error {
	return p.Pool.Ping(ctx)
}

// RetryTx executes a transactional function with CockroachDB retry logic.
func (p *Pool) RetryTx(ctx context.Context, maxRetries int, fn func(tx pgx.Tx) error) error {
	for i := 0; i < maxRetries; i++ {
		tx, err := p.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
		if err != nil {
			return fmt.Errorf("failed to begin transaction: %w", err)
		}

		err = fn(tx)
		if err == nil {
			if commitErr := tx.Commit(ctx); commitErr != nil {
				if isCRDBRetryError(commitErr) && i < maxRetries-1 {
					time.Sleep(time.Duration(1<<uint(i)) * 10 * time.Millisecond)
					continue
				}
				return fmt.Errorf("failed to commit transaction: %w", commitErr)
			}
			return nil
		}

		_ = tx.Rollback(ctx)

		if isCRDBRetryError(err) && i < maxRetries-1 {
			time.Sleep(time.Duration(1<<uint(i)) * 10 * time.Millisecond)
			continue
		}
		return err
	}
	return ErrConflict
}

func isCRDBRetryError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "40001"
	}
	return false
}

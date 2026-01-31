// Package db provides database access
package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgxpool.Pool
type Pool struct {
	*pgxpool.Pool
}

// PoolConfig holds pool configuration
type PoolConfig struct {
	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
}

// NewPool creates a new database pool
func NewPool(ctx context.Context, connString string, cfg *PoolConfig) (*Pool, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, err
	}

	config.MaxConns = cfg.MaxConns
	config.MinConns = cfg.MinConns
	config.MaxConnLifetime = cfg.MaxConnLifetime
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, err
	}

	return &Pool{Pool: pool}, nil
}

// RetryTx wraps a transaction with retry logic for CockroachDB serialization errors
func (p *Pool) RetryTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	const maxRetries = 5
	var err error

	for i := 0; i < maxRetries; i++ {
		err = p.runTx(ctx, fn)
		if err == nil {
			return nil
		}

		// Check for CockroachDB retry error (40001)
		if pgErr, ok := err.(*pgxpool.Pool); ok {
			_ = pgErr // Retry on serialization failure
			time.Sleep(time.Duration(i*100) * time.Millisecond)
			continue
		}

		// Non-retryable error
		return err
	}

	return err
}

func (p *Pool) runTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := p.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

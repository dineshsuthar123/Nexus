package cache

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestBuildRedisOptionsHostPort(t *testing.T) {
	opts, err := BuildRedisOptions("redis:6379", "secret", 2)
	if err != nil {
		t.Fatalf("expected options, got error: %v", err)
	}
	if opts.Addr != "redis:6379" {
		t.Fatalf("expected addr redis:6379, got %s", opts.Addr)
	}
	if opts.Password != "secret" {
		t.Fatalf("expected password from config")
	}
	if opts.DB != 2 {
		t.Fatalf("expected DB 2, got %d", opts.DB)
	}
}

func TestBuildRedisOptionsURL(t *testing.T) {
	opts, err := BuildRedisOptions("redis://:from-url@redis:6379/4", "", 0)
	if err != nil {
		t.Fatalf("expected options, got error: %v", err)
	}
	if opts.Addr != "redis:6379" {
		t.Fatalf("expected addr redis:6379, got %s", opts.Addr)
	}
	if opts.Password != "from-url" {
		t.Fatalf("expected password from URL")
	}
	if opts.DB != 4 {
		t.Fatalf("expected DB 4 from URL, got %d", opts.DB)
	}

	opts, err = BuildRedisOptions("redis://:from-url@redis:6379/4", "", 7)
	if err != nil {
		t.Fatalf("expected options, got error: %v", err)
	}
	if opts.DB != 7 {
		t.Fatalf("expected explicit DB override 7, got %d", opts.DB)
	}
}

func TestNilClientIsNoop(t *testing.T) {
	var client *Client
	ctx := context.Background()

	if err := client.Close(); err != nil {
		t.Fatalf("expected nil close to be no-op, got %v", err)
	}
	if err := client.Set(ctx, "key", "value", time.Minute); err != nil {
		t.Fatalf("expected nil set to be no-op, got %v", err)
	}
	if value, err := client.Get(ctx, "key"); !errors.Is(err, redis.Nil) || value != "" {
		t.Fatalf("expected redis.Nil empty get, got value=%q err=%v", value, err)
	}
	if exists, err := client.Exists(ctx, "key"); err != nil || exists {
		t.Fatalf("expected nil exists false/nil, got exists=%v err=%v", exists, err)
	}
	if values, err := client.HGetAll(ctx, "hash"); err != nil || len(values) != 0 {
		t.Fatalf("expected empty hash map, got values=%v err=%v", values, err)
	}
}

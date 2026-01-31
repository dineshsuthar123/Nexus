// Package cache provides Redis caching functionality
package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client wraps Redis client with caching operations
type Client struct {
	rdb *redis.Client
}

// NewRedisClient creates a new Redis client
func NewRedisClient(url, password string, db int) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     url,
		Password: password,
		DB:       db,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &Client{rdb: rdb}, nil
}

// Close closes the Redis connection
func (c *Client) Close() error {
	return c.rdb.Close()
}

// Get retrieves a value from cache
func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.rdb.Get(ctx, key).Result()
}

// Set sets a value in cache with expiration
func (c *Client) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	return c.rdb.Set(ctx, key, value, expiration).Err()
}

// SetJSON sets a JSON value in cache
func (c *Client) SetJSON(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	return c.rdb.Set(ctx, key, data, expiration).Err()
}

// GetJSON retrieves and unmarshals a JSON value from cache
func (c *Client) GetJSON(ctx context.Context, key string, dest interface{}) error {
	data, err := c.rdb.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(data), dest)
}

// Delete removes a key from cache
func (c *Client) Delete(ctx context.Context, keys ...string) error {
	return c.rdb.Del(ctx, keys...).Err()
}

// Exists checks if a key exists
func (c *Client) Exists(ctx context.Context, key string) (bool, error) {
	n, err := c.rdb.Exists(ctx, key).Result()
	return n > 0, err
}

// SetNX sets a value only if the key doesn't exist (for locks)
func (c *Client) SetNX(ctx context.Context, key string, value interface{}, expiration time.Duration) (bool, error) {
	return c.rdb.SetNX(ctx, key, value, expiration).Result()
}

// Incr increments a counter
func (c *Client) Incr(ctx context.Context, key string) (int64, error) {
	return c.rdb.Incr(ctx, key).Result()
}

// IncrBy increments a counter by a value
func (c *Client) IncrBy(ctx context.Context, key string, value int64) (int64, error) {
	return c.rdb.IncrBy(ctx, key, value).Result()
}

// Expire sets expiration on a key
func (c *Client) Expire(ctx context.Context, key string, expiration time.Duration) error {
	return c.rdb.Expire(ctx, key, expiration).Err()
}

// HSet sets hash fields
func (c *Client) HSet(ctx context.Context, key string, values ...interface{}) error {
	return c.rdb.HSet(ctx, key, values...).Err()
}

// HGet gets a hash field
func (c *Client) HGet(ctx context.Context, key, field string) (string, error) {
	return c.rdb.HGet(ctx, key, field).Result()
}

// HGetAll gets all hash fields
func (c *Client) HGetAll(ctx context.Context, key string) (map[string]string, error) {
	return c.rdb.HGetAll(ctx, key).Result()
}

// Cache keys
const (
	KeyAccountPrefix      = "account:"
	KeyBalancePrefix      = "balance:"
	KeyRateLimitPrefix    = "ratelimit:"
	KeyDailyUsagePrefix   = "daily_usage:"
	KeySessionPrefix      = "session:"
)

// AccountCacheKey generates a cache key for an account
func AccountCacheKey(accountID string) string {
	return KeyAccountPrefix + accountID
}

// BalanceCacheKey generates a cache key for account balance
func BalanceCacheKey(accountID string) string {
	return KeyBalancePrefix + accountID
}

// RateLimitKey generates a rate limit key
func RateLimitKey(identifier, action string) string {
	return fmt.Sprintf("%s%s:%s", KeyRateLimitPrefix, identifier, action)
}

// Cache TTLs
const (
	AccountCacheTTL = 5 * time.Minute
	BalanceCacheTTL = 30 * time.Second
	RateLimitTTL    = 1 * time.Minute
)

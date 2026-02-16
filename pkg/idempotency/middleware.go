// Package idempotency provides Redis-backed idempotency middleware for Gin HTTP handlers.
//
// It ensures that POST requests with the same Idempotency-Key header and identical
// request body return the same response, preventing duplicate side effects.
//
// Key format: idemp:{tenant_id}:{service}:{endpoint}:{idempotency_key}
//
// Features:
//   - SHA-256 request hashing for collision detection
//   - Distributed locking via Redis SETNX with configurable TTL
//   - Exponential backoff for concurrent in-flight requests
//   - Prometheus metrics for hits, misses, collisions, and lock times
//   - Safe header filtering (no auth headers stored)
package idempotency

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// ============================================================================
// Configuration
// ============================================================================

// Config holds idempotency middleware configuration.
type Config struct {
	// ServiceName identifies the service (e.g., "payment-service").
	ServiceName string

	// TTL is how long idempotent responses are cached. Default: 86400s (24h).
	TTL time.Duration

	// LockTimeout is the max duration a distributed lock is held. Default: 15s.
	LockTimeout time.Duration

	// MaxWait is the max time to wait for a concurrent in-flight request. Default: 10s.
	MaxWait time.Duration

	// Logger for structured logging.
	Logger *zap.Logger
}

// DefaultConfig returns a Config with sensible defaults.
func DefaultConfig(serviceName string, logger *zap.Logger) Config {
	return Config{
		ServiceName: serviceName,
		TTL:         24 * time.Hour,
		LockTimeout: 15 * time.Second,
		MaxWait:     10 * time.Second,
		Logger:      logger,
	}
}

// ============================================================================
// Stored response
// ============================================================================

// StoredResponse is the JSON-serialized value stored in Redis.
type StoredResponse struct {
	Status      int               `json:"status"`
	Headers     map[string]string `json:"headers"`
	BodyBase64  string            `json:"body_base64"`
	RequestHash string            `json:"request_hash"`
}

// safeHeaders is the allowlist of response headers we persist.
var safeHeaders = map[string]bool{
	"content-type":  true,
	"location":      true,
	"cache-control": true,
	"etag":          true,
	"last-modified": true,
	"x-request-id":  true,
}

// ============================================================================
// Prometheus metrics
// ============================================================================

var (
	hitsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "idempotency_hits_total",
		Help: "Total number of idempotent cache hits (duplicate requests returned from cache).",
	}, []string{"service", "endpoint"})

	missesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "idempotency_misses_total",
		Help: "Total number of idempotent cache misses (first-time requests).",
	}, []string{"service", "endpoint"})

	collisionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "idempotency_collisions_total",
		Help: "Total number of idempotency key collisions (same key, different body).",
	}, []string{"service", "endpoint"})

	lockTimeSec = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "idempotency_lock_time_seconds",
		Help:    "Time spent holding the idempotency distributed lock.",
		Buckets: prometheus.DefBuckets,
	}, []string{"service", "endpoint"})
)

// ============================================================================
// Response writer wrapper
// ============================================================================

// responseRecorder captures the handler's response so we can store it.
type responseRecorder struct {
	gin.ResponseWriter
	body       *bytes.Buffer
	statusCode int
}

func newResponseRecorder(w gin.ResponseWriter) *responseRecorder {
	return &responseRecorder{
		ResponseWriter: w,
		body:           &bytes.Buffer{},
		statusCode:     http.StatusOK,
	}
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}

func (r *responseRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseRecorder) WriteString(s string) (int, error) {
	r.body.WriteString(s)
	return r.ResponseWriter.WriteString(s)
}

// ============================================================================
// Middleware
// ============================================================================

// Middleware returns a Gin middleware that enforces idempotency on POST requests.
//
// If the Idempotency-Key header is absent, the request proceeds normally (non-idempotent)
// with an info-level log. If present:
//   - Computes SHA-256 of (method + path + body) as request_hash
//   - Checks Redis for a cached response under the idempotency key
//   - On cache hit with matching hash → replays stored response (metric: hit)
//   - On cache hit with different hash → returns 409 Conflict (metric: collision)
//   - On cache miss → acquires distributed lock, runs handler, stores response
func Middleware(rdb *redis.Client, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only enforce on POST
		if c.Request.Method != http.MethodPost {
			c.Next()
			return
		}

		idempotencyKey := c.GetHeader("Idempotency-Key")
		if idempotencyKey == "" {
			// Also check X-Idempotency-Key for backward compatibility
			idempotencyKey = c.GetHeader("X-Idempotency-Key")
		}

		if idempotencyKey == "" {
			cfg.Logger.Info("POST request without Idempotency-Key",
				zap.String("path", c.Request.URL.Path),
				zap.String("method", c.Request.Method),
			)
			c.Next()
			return
		}

		ctx := c.Request.Context()

		// Read and buffer the request body so we can hash it
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil {
			cfg.Logger.Error("Failed to read request body", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read request body"})
			c.Abort()
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		// Compute request hash
		requestHash := computeHash(c.Request.Method, c.Request.URL.Path, bodyBytes)

		// Determine tenant context
		tenantID, _ := c.Get("tenant_id")
		tenantStr, ok := tenantID.(string)
		if !ok || tenantStr == "" {
			tenantStr = "tenantless"
		}

		// Build Redis key
		endpoint := normalizeEndpoint(c.Request.URL.Path)
		redisKey := fmt.Sprintf("idemp:%s:%s:%s:%s", tenantStr, cfg.ServiceName, endpoint, idempotencyKey)
		lockKey := fmt.Sprintf("lock:%s", redisKey)

		logFields := []zap.Field{
			zap.String("idempotency_key", idempotencyKey),
			zap.String("request_hash", requestHash[:16]+"..."),
			zap.String("endpoint", endpoint),
			zap.String("tenant_id", maskTenantID(tenantStr)),
		}

		// Step 1: Check if response already exists
		val, err := rdb.Get(ctx, redisKey).Result()
		if err == nil {
			// Key exists — check hash
			var stored StoredResponse
			if jsonErr := json.Unmarshal([]byte(val), &stored); jsonErr == nil {
				if stored.RequestHash == requestHash {
					// Cache HIT — replay stored response
					hitsTotal.WithLabelValues(cfg.ServiceName, endpoint).Inc()
					cfg.Logger.Info("Idempotency cache hit — returning stored response", logFields...)
					replayStoredResponse(c, &stored)
					return
				}
				// Hash mismatch — collision
				collisionsTotal.WithLabelValues(cfg.ServiceName, endpoint).Inc()
				cfg.Logger.Warn("Idempotency key collision: different payload", logFields...)
				c.JSON(http.StatusConflict, gin.H{
					"error": "Idempotency key collision: different payload",
				})
				c.Abort()
				return
			}
			// Corrupted stored value — proceed as miss
			cfg.Logger.Warn("Corrupted idempotency cache entry, proceeding as miss", logFields...)
		}

		// Step 2: Acquire distributed lock
		lockToken := fmt.Sprintf("%s:%d", idempotencyKey, time.Now().UnixNano())
		lockAcquired, err := rdb.SetNX(ctx, lockKey, lockToken, cfg.LockTimeout).Result()
		if err != nil {
			cfg.Logger.Error("Redis error during lock acquisition", append(logFields, zap.Error(err))...)
			// Fail open — let the request proceed without idempotency
			c.Next()
			return
		}

		if !lockAcquired {
			// Another request is in-flight — wait with exponential backoff
			cfg.Logger.Info("Idempotency lock held by another request, waiting...", logFields...)
			stored := waitForResult(ctx, rdb, redisKey, cfg.MaxWait)
			if stored != nil && stored.RequestHash == requestHash {
				hitsTotal.WithLabelValues(cfg.ServiceName, endpoint).Inc()
				cfg.Logger.Info("Idempotency result available after wait", logFields...)
				replayStoredResponse(c, stored)
				return
			}
			if stored != nil {
				collisionsTotal.WithLabelValues(cfg.ServiceName, endpoint).Inc()
				c.JSON(http.StatusConflict, gin.H{
					"error": "Idempotency key collision: different payload",
				})
				c.Abort()
				return
			}
			// Timeout waiting — let request proceed (risk of duplicate, but better than blocking)
			cfg.Logger.Warn("Timed out waiting for in-flight idempotent request", logFields...)
			c.Next()
			return
		}

		// Lock acquired — record start time for metric
		lockStart := time.Now()

		// Ensure lock released on exit
		defer func() {
			lockTimeSec.WithLabelValues(cfg.ServiceName, endpoint).Observe(time.Since(lockStart).Seconds())
			// Only release if we still own the lock
			luaScript := redis.NewScript(`
				if redis.call("GET", KEYS[1]) == ARGV[1] then
					return redis.call("DEL", KEYS[1])
				else
					return 0
				end
			`)
			luaScript.Run(ctx, rdb, []string{lockKey}, lockToken)
		}()

		// Step 3: Execute the actual handler with a response recorder
		missesTotal.WithLabelValues(cfg.ServiceName, endpoint).Inc()
		recorder := newResponseRecorder(c.Writer)
		c.Writer = recorder
		c.Next()

		// Step 4: Store the response
		safeHdrs := extractSafeHeaders(recorder.Header())
		stored := StoredResponse{
			Status:      recorder.statusCode,
			Headers:     safeHdrs,
			BodyBase64:  base64.StdEncoding.EncodeToString(recorder.body.Bytes()),
			RequestHash: requestHash,
		}

		data, err := json.Marshal(&stored)
		if err != nil {
			cfg.Logger.Error("Failed to serialize idempotent response", append(logFields, zap.Error(err))...)
			return
		}

		if setErr := rdb.Set(ctx, redisKey, data, cfg.TTL).Err(); setErr != nil {
			cfg.Logger.Error("Failed to store idempotent response in Redis", append(logFields, zap.Error(setErr))...)
		} else {
			cfg.Logger.Info("Stored idempotent response", append(logFields, zap.String("result", "stored"))...)
		}
	}
}

// ============================================================================
// Helpers
// ============================================================================

// computeHash returns the hex-encoded SHA-256 of (method + path + canonicalized body).
func computeHash(method, path string, body []byte) string {
	h := sha256.New()
	h.Write([]byte(method))
	h.Write([]byte(path))
	// Canonicalize JSON body (re-marshal to remove whitespace differences)
	var canonicalized interface{}
	if json.Unmarshal(body, &canonicalized) == nil {
		if canonical, err := json.Marshal(canonicalized); err == nil {
			h.Write(canonical)
		} else {
			h.Write(body)
		}
	} else {
		h.Write(body)
	}
	return fmt.Sprintf("%x", h.Sum(nil))
}

// normalizeEndpoint strips trailing slashes and path params for consistent keying.
func normalizeEndpoint(path string) string {
	path = strings.TrimSuffix(path, "/")
	// Keep only the first 3 segments for grouping: /api/v1/payments
	parts := strings.Split(path, "/")
	if len(parts) > 4 {
		return strings.Join(parts[:4], "/")
	}
	return path
}

// maskTenantID masks the tenant ID for logging (show first 8 chars).
func maskTenantID(tid string) string {
	if tid == "tenantless" || len(tid) <= 8 {
		return tid
	}
	return tid[:8] + "..."
}

// extractSafeHeaders filters response headers to only persist safe ones.
func extractSafeHeaders(h http.Header) map[string]string {
	result := make(map[string]string)
	for key, vals := range h {
		if safeHeaders[strings.ToLower(key)] && len(vals) > 0 {
			result[key] = vals[0]
		}
	}
	return result
}

// replayStoredResponse writes the cached response back to the client.
func replayStoredResponse(c *gin.Context, stored *StoredResponse) {
	for k, v := range stored.Headers {
		c.Header(k, v)
	}
	c.Header("X-Idempotent-Replayed", "true")

	body, err := base64.StdEncoding.DecodeString(stored.BodyBase64)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to decode cached response"})
		c.Abort()
		return
	}

	c.Data(stored.Status, stored.Headers["Content-Type"], body)
	c.Abort()
}

// waitForResult polls Redis for the idempotent response with exponential backoff.
func waitForResult(ctx context.Context, rdb *redis.Client, key string, maxWait time.Duration) *StoredResponse {
	deadline := time.Now().Add(maxWait)
	backoff := 50 * time.Millisecond

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		val, err := rdb.Get(ctx, key).Result()
		if err == nil {
			var stored StoredResponse
			if json.Unmarshal([]byte(val), &stored) == nil {
				return &stored
			}
		}

		time.Sleep(backoff)
		backoff *= 2
		if backoff > 2*time.Second {
			backoff = 2 * time.Second
		}
	}
	return nil
}

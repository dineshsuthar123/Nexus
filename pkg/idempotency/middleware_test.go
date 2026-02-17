package idempotency

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// ============================================================================
// Test helpers
// ============================================================================

func testLogger() *zap.Logger {
	logger, _ := zap.NewDevelopment()
	return logger
}

func testRedisClient(t *testing.T) *redis.Client {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		DB:   15, // use a separate DB for tests
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis not available: %v", err)
	}
	// Flush the test DB
	rdb.FlushDB(ctx)
	t.Cleanup(func() {
		rdb.FlushDB(context.Background())
		rdb.Close()
	})
	return rdb
}

func setupRouter(rdb *redis.Client, cfg Config, handlerFunc gin.HandlerFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Middleware(rdb, cfg))
	r.POST("/api/v1/payments", handlerFunc)
	r.POST("/api/v1/accounts", handlerFunc)
	r.POST("/api/v1/reconciliation/run", handlerFunc)
	r.GET("/api/v1/payments/:id", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"id": c.Param("id")})
	})
	return r
}

// ============================================================================
// Tests
// ============================================================================

func TestIdempotency_SameKeyReturnsSameResponse(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())
	cfg.TTL = 10 * time.Second

	var callCount int32
	handler := func(c *gin.Context) {
		atomic.AddInt32(&callCount, 1)
		c.JSON(http.StatusCreated, gin.H{
			"uetr":   "test-uetr-123",
			"status": "ACCEPTED",
		})
	}

	router := setupRouter(rdb, cfg, handler)

	body := `{"amount":100,"sender":"A","recipient":"B"}`

	// First request
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", "key-001")
	router.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w1.Code, w1.Body.String())
	}

	// Second request — same key, same body
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", "key-001")
	router.ServeHTTP(w2, req2)

	if w2.Code != http.StatusCreated {
		t.Fatalf("expected 201 on replay, got %d: %s", w2.Code, w2.Body.String())
	}

	// Verify same body
	if w1.Body.String() != w2.Body.String() {
		t.Errorf("responses differ:\n  first:  %s\n  second: %s", w1.Body.String(), w2.Body.String())
	}

	// Verify handler called only once
	if atomic.LoadInt32(&callCount) != 1 {
		t.Errorf("expected handler called once, got %d", callCount)
	}

	// Verify replay header
	if w2.Header().Get("X-Idempotent-Replayed") != "true" {
		t.Error("expected X-Idempotent-Replayed header on second response")
	}
}

func TestIdempotency_DifferentBodySameKey_Returns409(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())
	cfg.TTL = 10 * time.Second

	handler := func(c *gin.Context) {
		c.JSON(http.StatusCreated, gin.H{"uetr": "test-uetr-456"})
	}

	router := setupRouter(rdb, cfg, handler)

	// First request
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(`{"amount":100}`))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", "key-conflict")
	router.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w1.Code)
	}

	// Second request — same key, DIFFERENT body
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(`{"amount":200}`))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", "key-conflict")
	router.ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict, got %d: %s", w2.Code, w2.Body.String())
	}

	var errResp map[string]interface{}
	json.Unmarshal(w2.Body.Bytes(), &errResp)
	if errResp["error"] == nil || errResp["error"].(string) == "" {
		t.Error("expected error message in 409 response")
	}
}

func TestIdempotency_ConcurrentRequests_OnlyOneHandlerExecution(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())
	cfg.TTL = 10 * time.Second
	cfg.MaxWait = 5 * time.Second

	var callCount int32
	handler := func(c *gin.Context) {
		// Simulate some processing time
		time.Sleep(200 * time.Millisecond)
		atomic.AddInt32(&callCount, 1)
		c.JSON(http.StatusCreated, gin.H{
			"uetr":   "concurrent-uetr",
			"status": "ACCEPTED",
		})
	}

	router := setupRouter(rdb, cfg, handler)
	body := `{"amount":500,"sender":"X","recipient":"Y"}`

	const numConcurrent = 5
	var wg sync.WaitGroup
	results := make([]*httptest.ResponseRecorder, numConcurrent)

	for i := 0; i < numConcurrent; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", "concurrent-key-001")
			router.ServeHTTP(w, req)
			results[idx] = w
		}(i)
	}
	wg.Wait()

	// Check that handler was called at most once
	finalCount := atomic.LoadInt32(&callCount)
	if finalCount != 1 {
		t.Errorf("expected handler called exactly once, got %d", finalCount)
	}

	// Check all responses are successful
	for i, w := range results {
		if w.Code != http.StatusCreated {
			t.Errorf("request %d: expected 201, got %d: %s", i, w.Code, w.Body.String())
		}
	}
}

func TestIdempotency_NoHeader_ProceedsNormally(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())

	var callCount int32
	handler := func(c *gin.Context) {
		atomic.AddInt32(&callCount, 1)
		c.JSON(http.StatusCreated, gin.H{"uetr": "no-idemp"})
	}

	router := setupRouter(rdb, cfg, handler)
	body := `{"amount":100}`

	// First request without key
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
	req1.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w1, req1)

	// Second request without key
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
	req2.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w2, req2)

	// Both should execute the handler
	if atomic.LoadInt32(&callCount) != 2 {
		t.Errorf("expected handler called twice (no idempotency), got %d", callCount)
	}
}

func TestIdempotency_GETRequest_Ignored(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())

	router := setupRouter(rdb, cfg, nil)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/payments/test-id", nil)
	req.Header.Set("Idempotency-Key", "should-be-ignored")
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestIdempotency_DifferentKeys_CreateDifferentResources(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())
	cfg.TTL = 10 * time.Second

	var callCount int32
	handler := func(c *gin.Context) {
		count := atomic.AddInt32(&callCount, 1)
		c.JSON(http.StatusCreated, gin.H{"uetr": "uetr-" + string(rune('A'-1+count))})
	}

	router := setupRouter(rdb, cfg, handler)
	body := `{"amount":100}`

	for i := 0; i < 3; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", "unique-key-"+string(rune('A'+i)))
		router.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Errorf("request %d: expected 201, got %d", i, w.Code)
		}
	}

	if atomic.LoadInt32(&callCount) != 3 {
		t.Errorf("expected 3 handler calls for 3 different keys, got %d", callCount)
	}
}

func TestIdempotency_XIdempotencyKeyHeader_BackwardCompat(t *testing.T) {
	rdb := testRedisClient(t)
	cfg := DefaultConfig("payment-service", testLogger())
	cfg.TTL = 10 * time.Second

	var callCount int32
	handler := func(c *gin.Context) {
		atomic.AddInt32(&callCount, 1)
		c.JSON(http.StatusCreated, gin.H{"uetr": "compat-uetr"})
	}

	router := setupRouter(rdb, cfg, handler)
	body := `{"amount":100}`

	// Use X-Idempotency-Key instead of Idempotency-Key
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("X-Idempotency-Key", "compat-key")
	router.ServeHTTP(w1, req1)

	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/v1/payments", bytes.NewBufferString(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-Idempotency-Key", "compat-key")
	router.ServeHTTP(w2, req2)

	if atomic.LoadInt32(&callCount) != 1 {
		t.Errorf("expected handler called once with X-Idempotency-Key, got %d", callCount)
	}
}

func TestComputeHash_Deterministic(t *testing.T) {
	body := []byte(`{"amount": 100, "sender": "A"}`)
	h1 := computeHash("POST", "/api/v1/payments", body)
	h2 := computeHash("POST", "/api/v1/payments", body)
	if h1 != h2 {
		t.Errorf("hash not deterministic: %s != %s", h1, h2)
	}

	// Different whitespace should produce same hash (JSON canonicalization)
	body2 := []byte(`{"sender":"A","amount":100}`)
	h3 := computeHash("POST", "/api/v1/payments", body2)
	if h1 != h3 {
		t.Errorf("hash not canonicalized: %s != %s", h1, h3)
	}
}

func TestComputeHash_DifferentBodies(t *testing.T) {
	h1 := computeHash("POST", "/api/v1/payments", []byte(`{"amount":100}`))
	h2 := computeHash("POST", "/api/v1/payments", []byte(`{"amount":200}`))
	if h1 == h2 {
		t.Error("different bodies should produce different hashes")
	}
}

func TestNormalizeEndpoint(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/api/v1/payments", "/api/v1/payments"},
		{"/api/v1/payments/", "/api/v1/payments"},
		{"/api/v1/payments/some-uetr/settle", "/api/v1/payments"},
		{"/api/v1/reconciliation/run", "/api/v1/reconciliation"},
		{"/api/v1/accounts", "/api/v1/accounts"},
	}
	for _, tt := range tests {
		got := normalizeEndpoint(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeEndpoint(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestMaskTenantID(t *testing.T) {
	if maskTenantID("tenantless") != "tenantless" {
		t.Error("tenantless should not be masked")
	}
	if got := maskTenantID("12345678-abcd-1234-5678-123456789abc"); got != "12345678..." {
		t.Errorf("expected masked, got %q", got)
	}
}

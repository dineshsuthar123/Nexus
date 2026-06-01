package sanctions

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestScreenOpensCircuitAfterRemoteFailures(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "watchman unavailable", http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewClient(server.URL, zap.NewNop())
	client.failureThreshold = 2
	client.circuitCooldown = time.Minute

	req := &ScreeningRequest{Name: "Alice Example", Country: "US"}
	if _, err := client.Screen(context.Background(), req); err == nil {
		t.Fatal("expected first remote failure")
	}
	if _, err := client.Screen(context.Background(), req); err == nil {
		t.Fatal("expected second remote failure")
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("expected two remote calls before circuit opened, got %d", got)
	}

	start := time.Now()
	_, err := client.Screen(context.Background(), req)
	if !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("expected circuit-open error, got %v", err)
	}
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("expected circuit-open path to return quickly, took %s", elapsed)
	}
	if got := hits.Load(); got != 2 {
		t.Fatalf("expected open circuit to skip remote call, got %d hits", got)
	}
}

func TestScreenSuccessResetsCircuitFailureCount(t *testing.T) {
	var hits atomic.Int32
	var failNext atomic.Int32
	failNext.Store(1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if failNext.Swap(0) == 1 {
			http.Error(w, "temporary outage", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"SDNs":[]}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, zap.NewNop())
	client.failureThreshold = 2
	client.circuitCooldown = time.Minute

	req := &ScreeningRequest{Name: "Bob Example", Country: "US"}
	if _, err := client.Screen(context.Background(), req); err == nil {
		t.Fatal("expected initial remote failure")
	}
	if _, err := client.Screen(context.Background(), req); err != nil {
		t.Fatalf("expected successful screening, got %v", err)
	}

	failNext.Store(1)
	if _, err := client.Screen(context.Background(), &ScreeningRequest{Name: "Carol Example", Country: "US"}); err == nil {
		t.Fatal("expected remote failure after reset")
	} else if errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("expected remote failure, got circuit-open error: %v", err)
	}

	client.failureMu.Lock()
	defer client.failureMu.Unlock()
	if client.failureCount != 1 {
		t.Fatalf("expected failure count to reset before latest failure, got %d", client.failureCount)
	}
	if !client.circuitOpenUntil.IsZero() {
		t.Fatalf("expected circuit to remain closed, open until %s", client.circuitOpenUntil)
	}
}

func TestScreenCacheBypassesOpenCircuit(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"SDNs":[]}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, zap.NewNop())
	req := &ScreeningRequest{Name: "Cached Customer", Country: "US"}

	first, err := client.Screen(context.Background(), req)
	if err != nil {
		t.Fatalf("expected initial success, got %v", err)
	}

	client.failureMu.Lock()
	client.circuitOpenUntil = time.Now().Add(time.Minute)
	client.failureMu.Unlock()

	second, err := client.Screen(context.Background(), req)
	if err != nil {
		t.Fatalf("expected cached result despite open circuit, got %v", err)
	}
	if second != first {
		t.Fatal("expected cached screening result")
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("expected cache hit to avoid remote call, got %d hits", got)
	}
}

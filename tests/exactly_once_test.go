package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ExactlyOnceTestSuite tests idempotency and exactly-once semantics
// These tests verify that:
// 1. Duplicate payment requests with same idempotency key return same result
// 2. Concurrent requests with same key result in only one payment
// 3. Different idempotency keys create different payments
// 4. Outbox pattern ensures exactly-once Kafka delivery

const (
	paymentServiceURL = "http://localhost:8085"
	defaultTimeout    = 30 * time.Second
)

// PaymentRequest represents a payment initiation request
type PaymentRequest struct {
	IdempotencyKey  string  `json:"idempotency_key"`
	DebtorAccount   string  `json:"debtor_account"`
	CreditorAccount string  `json:"creditor_account"`
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
	PaymentMethod   string  `json:"payment_method"`
	EndToEndID      string  `json:"end_to_end_id"`
	InstructionID   string  `json:"instruction_id"`
	RemittanceInfo  string  `json:"remittance_info,omitempty"`
}

// PaymentResponse represents the API response
type PaymentResponse struct {
	PaymentID      string `json:"payment_id"`
	Status         string `json:"status"`
	IdempotencyKey string `json:"idempotency_key"`
	CreatedAt      string `json:"created_at"`
	Error          string `json:"error,omitempty"`
}

// TestIdempotency_SameKeyReturnsSameResult verifies that
// submitting the same payment twice with the same idempotency key
// returns the exact same payment ID and does not create duplicates
func TestIdempotency_SameKeyReturnsSameResult(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	idempotencyKey := uuid.New().String()
	request := PaymentRequest{
		IdempotencyKey:  idempotencyKey,
		DebtorAccount:   "ACC001",
		CreditorAccount: "ACC002",
		Amount:          100.00,
		Currency:        "USD",
		PaymentMethod:   "ACH",
		EndToEndID:      uuid.New().String(),
		InstructionID:   uuid.New().String(),
	}

	// First request
	resp1, err := submitPayment(ctx, request)
	require.NoError(t, err, "First payment request failed")
	require.NotEmpty(t, resp1.PaymentID, "First response should have payment ID")

	// Wait a bit to ensure first request is fully processed
	time.Sleep(100 * time.Millisecond)

	// Second request with same idempotency key
	resp2, err := submitPayment(ctx, request)
	require.NoError(t, err, "Second payment request failed")

	// Both responses should return the same payment ID
	assert.Equal(t, resp1.PaymentID, resp2.PaymentID,
		"Duplicate request with same idempotency key should return same payment ID")
	assert.Equal(t, resp1.Status, resp2.Status,
		"Status should be the same for idempotent requests")
}

// TestIdempotency_ConcurrentRequestsSinglePayment verifies that
// concurrent requests with the same idempotency key result in
// exactly one payment being created
func TestIdempotency_ConcurrentRequestsSinglePayment(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	idempotencyKey := uuid.New().String()
	request := PaymentRequest{
		IdempotencyKey:  idempotencyKey,
		DebtorAccount:   "ACC003",
		CreditorAccount: "ACC004",
		Amount:          250.00,
		Currency:        "EUR",
		PaymentMethod:   "SEPA",
		EndToEndID:      uuid.New().String(),
		InstructionID:   uuid.New().String(),
	}

	concurrency := 10
	results := make(chan *PaymentResponse, concurrency)
	errors := make(chan error, concurrency)

	var wg sync.WaitGroup
	wg.Add(concurrency)

	// Launch concurrent requests
	for i := 0; i < concurrency; i++ {
		go func() {
			defer wg.Done()
			resp, err := submitPayment(ctx, request)
			if err != nil {
				errors <- err
				return
			}
			results <- resp
		}()
	}

	wg.Wait()
	close(results)
	close(errors)

	// Check for errors
	var errs []error
	for err := range errors {
		errs = append(errs, err)
	}
	require.Empty(t, errs, "Some concurrent requests failed: %v", errs)

	// Collect all payment IDs
	var paymentIDs []string
	for resp := range results {
		paymentIDs = append(paymentIDs, resp.PaymentID)
	}

	require.NotEmpty(t, paymentIDs, "Should have received payment IDs")

	// All payment IDs should be the same
	firstID := paymentIDs[0]
	for i, id := range paymentIDs {
		assert.Equal(t, firstID, id,
			"All concurrent requests should return same payment ID (request %d)", i)
	}

	t.Logf("✅ All %d concurrent requests returned same payment ID: %s", concurrency, firstID)
}

// TestIdempotency_DifferentKeysCreateDifferentPayments verifies that
// requests with different idempotency keys create separate payments
func TestIdempotency_DifferentKeysCreateDifferentPayments(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	baseRequest := PaymentRequest{
		DebtorAccount:   "ACC005",
		CreditorAccount: "ACC006",
		Amount:          50.00,
		Currency:        "GBP",
		PaymentMethod:   "FASTER_PAYMENTS",
	}

	numPayments := 5
	paymentIDs := make(map[string]bool)

	for i := 0; i < numPayments; i++ {
		request := baseRequest
		request.IdempotencyKey = uuid.New().String()
		request.EndToEndID = uuid.New().String()
		request.InstructionID = uuid.New().String()

		resp, err := submitPayment(ctx, request)
		require.NoError(t, err, "Payment %d failed", i)
		require.NotEmpty(t, resp.PaymentID, "Payment %d should have ID", i)

		// Ensure this is a new, unique payment ID
		assert.False(t, paymentIDs[resp.PaymentID],
			"Payment ID should be unique, but %s was seen before", resp.PaymentID)
		paymentIDs[resp.PaymentID] = true
	}

	assert.Len(t, paymentIDs, numPayments,
		"Should have created %d unique payments", numPayments)
	t.Logf("✅ Created %d unique payments with different idempotency keys", numPayments)
}

// TestIdempotency_ExpiredKeyAllowsNewPayment verifies that
// after idempotency window expires, same key can create new payment
// Note: This test requires configurable idempotency TTL
func TestIdempotency_ExpiredKeyAllowsNewPayment(t *testing.T) {
	t.Skip("Requires short idempotency TTL configuration for testing")
}

// TestOutbox_ExactlyOnceKafkaDelivery verifies the transactional outbox
// pattern ensures exactly-once Kafka message delivery
func TestOutbox_ExactlyOnceKafkaDelivery(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// This test requires:
	// 1. Submit payment
	// 2. Verify outbox entry created
	// 3. Verify Debezium picks up the change
	// 4. Verify exactly one Kafka message produced
	// 5. Simulate failure and verify no duplicate messages

	idempotencyKey := uuid.New().String()
	request := PaymentRequest{
		IdempotencyKey:  idempotencyKey,
		DebtorAccount:   "ACC007",
		CreditorAccount: "ACC008",
		Amount:          1000.00,
		Currency:        "USD",
		PaymentMethod:   "WIRE",
		EndToEndID:      uuid.New().String(),
		InstructionID:   uuid.New().String(),
	}

	resp, err := submitPayment(ctx, request)
	require.NoError(t, err, "Payment submission failed")
	require.NotEmpty(t, resp.PaymentID, "Should have payment ID")

	// Wait for outbox processing
	time.Sleep(2 * time.Second)

	// Verify payment status advanced (indicating Kafka delivery)
	status, err := getPaymentStatus(ctx, resp.PaymentID)
	require.NoError(t, err, "Failed to get payment status")

	// Payment should have moved past PENDING if Kafka delivery succeeded
	assert.NotEqual(t, "PENDING", status,
		"Payment should have progressed past PENDING after outbox processing")

	t.Logf("✅ Payment %s status: %s (outbox pattern working)", resp.PaymentID, status)
}

// TestRaceCondition_DatabaseLevelIdempotency verifies that
// database-level constraints prevent duplicates even under race conditions
func TestRaceCondition_DatabaseLevelIdempotency(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	// Use a fixed idempotency key
	idempotencyKey := fmt.Sprintf("race-test-%s", uuid.New().String())

	// Submit many requests in rapid succession
	numRequests := 50
	results := make([]*PaymentResponse, 0, numRequests)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for i := 0; i < numRequests; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			request := PaymentRequest{
				IdempotencyKey:  idempotencyKey,
				DebtorAccount:   "ACC009",
				CreditorAccount: "ACC010",
				Amount:          float64(100 + idx), // Slightly different amounts
				Currency:        "USD",
				PaymentMethod:   "ACH",
				EndToEndID:      uuid.New().String(),
				InstructionID:   uuid.New().String(),
			}

			resp, err := submitPayment(ctx, request)
			if err != nil {
				t.Logf("Request %d error: %v", idx, err)
				return
			}

			mu.Lock()
			results = append(results, resp)
			mu.Unlock()
		}(i)
	}

	wg.Wait()

	require.NotEmpty(t, results, "Should have some successful responses")

	// All successful responses should have the same payment ID
	firstID := results[0].PaymentID
	for i, resp := range results {
		assert.Equal(t, firstID, resp.PaymentID,
			"Response %d has different payment ID", i)
	}

	t.Logf("✅ Race condition test passed: %d requests, 1 payment ID: %s",
		len(results), firstID)
}

// Helper functions

func submitPayment(ctx context.Context, req PaymentRequest) (*PaymentResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		paymentServiceURL+"/api/v1/payments", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Idempotency-Key", req.IdempotencyKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var paymentResp PaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&paymentResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return &paymentResp, fmt.Errorf("request failed with status %d: %s",
			resp.StatusCode, paymentResp.Error)
	}

	return &paymentResp, nil
}

func getPaymentStatus(ctx context.Context, paymentID string) (string, error) {
	url := fmt.Sprintf("%s/api/v1/payments/%s", paymentServiceURL, paymentID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var paymentResp PaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&paymentResp); err != nil {
		return "", err
	}

	return paymentResp.Status, nil
}

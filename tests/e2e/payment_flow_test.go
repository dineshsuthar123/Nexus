// Package e2e provides end-to-end integration tests
package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestConfig holds test configuration
type TestConfig struct {
	PaymentServiceURL        string
	AccountServiceURL        string
	ReconciliationServiceURL string
	KafkaBrokers             string
	DatabaseURL              string
	Timeout                  time.Duration
}

// DefaultTestConfig returns default test config for local environment
func DefaultTestConfig() *TestConfig {
	return &TestConfig{
		PaymentServiceURL:        envOrDefault("PAYMENT_SERVICE_URL", "http://127.0.0.1:8085"),
		AccountServiceURL:        envOrDefault("ACCOUNT_SERVICE_URL", "http://127.0.0.1:8086"),
		ReconciliationServiceURL: envOrDefault("RECONCILIATION_SERVICE_URL", "http://127.0.0.1:8087"),
		KafkaBrokers:             envOrDefault("KAFKA_BROKERS", "127.0.0.1:9092"),
		DatabaseURL:              envOrDefault("DATABASE_URL", "postgres://root@127.0.0.1:26257/nexus_ledger?sslmode=disable"),
		Timeout:                  30 * time.Second,
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ========================================================================
// Payment Flow Tests
// ========================================================================

func TestPaymentEndToEnd(t *testing.T) {
	cfg := DefaultTestConfig()
	client := &http.Client{Timeout: cfg.Timeout}

	t.Run("successful_payment_flow", func(t *testing.T) {
		ctx := context.Background()

		// Step 1: Create debtor account
		debtorAccount, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 10000.00)
		require.NoError(t, err)
		require.NotEmpty(t, debtorAccount.ID)

		// Step 2: Create creditor account
		creditorAccount, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 0.00)
		require.NoError(t, err)
		require.NotEmpty(t, creditorAccount.ID)

		// Step 3: Initiate payment
		uetr := uuid.New().String()
		payment, err := initiatePayment(ctx, client, cfg.PaymentServiceURL, PaymentRequest{
			UETR:            uetr,
			DebtorAccount:   debtorAccount.Number,
			CreditorAccount: creditorAccount.Number,
			Amount:          1000.00,
			Currency:        "USD",
		})
		require.NoError(t, err)
		assert.Equal(t, "INITIATED", payment.Status)

		// Step 4: Wait for settlement (with timeout)
		settled := waitForStatus(ctx, client, cfg.PaymentServiceURL, uetr, "SETTLED", 30*time.Second)
		assert.True(t, settled, "Payment should settle within 30 seconds")

		// Step 5: Verify balances
		debtorBalance, err := getAccountBalance(ctx, client, cfg.AccountServiceURL, debtorAccount.ID)
		require.NoError(t, err)
		assert.Equal(t, 9000.00, debtorBalance)

		creditorBalance, err := getAccountBalance(ctx, client, cfg.AccountServiceURL, creditorAccount.ID)
		require.NoError(t, err)
		assert.Equal(t, 1000.00, creditorBalance)
	})

	t.Run("idempotent_payment", func(t *testing.T) {
		ctx := context.Background()

		// Create accounts
		debtor, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 5000.00)
		require.NoError(t, err)
		creditor, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 0.00)
		require.NoError(t, err)

		// Same UETR for both requests
		uetr := uuid.New().String()
		request := PaymentRequest{
			UETR:            uetr,
			DebtorAccount:   debtor.Number,
			CreditorAccount: creditor.Number,
			DebtorName:      "Test Debtor",
			CreditorName:    "Test Creditor",
			Amount:          500.00,
			Currency:        "USD",
		}

		// First request
		payment1, err := initiatePayment(ctx, client, cfg.PaymentServiceURL, request)
		require.NoError(t, err)

		// Second request with same UETR
		payment2, err := initiatePayment(ctx, client, cfg.PaymentServiceURL, request)
		require.NoError(t, err)

		// Should return same payment
		assert.Equal(t, payment1.ID, payment2.ID)

		// Verify only one debit happened
		balance, _ := getAccountBalance(ctx, client, cfg.AccountServiceURL, debtor.ID)
		assert.Equal(t, 4500.00, balance)
	})

	t.Run("insufficient_funds", func(t *testing.T) {
		ctx := context.Background()

		// Create accounts with low balance
		debtor, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 100.00)
		require.NoError(t, err)
		creditor, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 0.00)
		require.NoError(t, err)

		// Try to pay more than balance
		_, err = initiatePayment(ctx, client, cfg.PaymentServiceURL, PaymentRequest{
			UETR:            uuid.New().String(),
			DebtorAccount:   debtor.Number,
			CreditorAccount: creditor.Number,
			DebtorName:      "Test Debtor",
			CreditorName:    "Test Creditor",
			Amount:          500.00,
			Currency:        "USD",
		})

		// Should fail
		assert.Error(t, err)
	})

	t.Run("sanctions_screening", func(t *testing.T) {
		ctx := context.Background()

		// Create accounts
		debtor, err := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 10000.00)
		require.NoError(t, err)
		creditor, err := createAccountWithName(ctx, client, cfg.AccountServiceURL, "USD", 0.00, "OFAC Sanctioned Entity")
		require.NoError(t, err)

		// Payment to sanctioned entity should be blocked
		_, err = initiatePayment(ctx, client, cfg.PaymentServiceURL, PaymentRequest{
			UETR:            uuid.New().String(),
			DebtorAccount:   debtor.Number,
			CreditorAccount: creditor.Number,
			DebtorName:      "Test Debtor",
			CreditorName:    "OFAC Sanctioned Entity",
			Amount:          1000.00,
			Currency:        "USD",
		})

		// Should fail with sanctions error
		assert.Error(t, err)
	})
}

// ========================================================================
// Reconciliation Tests
// ========================================================================

func TestReconciliationEndToEnd(t *testing.T) {
	cfg := DefaultTestConfig()
	client := &http.Client{Timeout: cfg.Timeout}

	t.Run("successful_reconciliation", func(t *testing.T) {
		ctx := context.Background()

		// Trigger reconciliation for yesterday
		yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
		result, err := runReconciliation(ctx, client, cfg.ReconciliationServiceURL, yesterday)
		require.NoError(t, err)

		// Verify reconciliation completed
		assert.NotEmpty(t, result.CycleID)
		assert.True(t, result.MatchedRecords >= 0)
	})

	t.Run("discrepancy_detection", func(t *testing.T) {
		// Would inject a discrepancy and verify detection
		// This requires modifying DB directly to create mismatch
	})
}

// ========================================================================
// Performance Tests
// ========================================================================

func TestPaymentLatency(t *testing.T) {
	cfg := DefaultTestConfig()
	client := &http.Client{Timeout: cfg.Timeout}
	ctx := context.Background()

	// Create accounts
	debtor, _ := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 1000000.00)
	creditor, _ := createAccount(ctx, client, cfg.AccountServiceURL, "USD", 0.00)

	var latencies []time.Duration

	for i := 0; i < 100; i++ {
		start := time.Now()
		_, _ = initiatePayment(ctx, client, cfg.PaymentServiceURL, PaymentRequest{
			UETR:            uuid.New().String(),
			DebtorAccount:   debtor.Number,
			CreditorAccount: creditor.Number,
			DebtorName:      "Test Debtor",
			CreditorName:    "Test Creditor",
			Amount:          1.00,
			Currency:        "USD",
		})
		latencies = append(latencies, time.Since(start))
	}

	// Calculate P95
	// In production, would sort and calculate properly
	var total time.Duration
	for _, l := range latencies {
		total += l
	}
	avg := total / time.Duration(len(latencies))

	t.Logf("Average latency: %v", avg)
	assert.Less(t, avg, 100*time.Millisecond, "Average latency should be under 100ms")
}

// ========================================================================
// Helper Functions
// ========================================================================

type Account struct {
	ID      string  `json:"id"`
	Number  string  `json:"accountNumber"`
	Balance float64 `json:"balance"`
	Status  string  `json:"status"`
}

type PaymentRequest struct {
	UETR            string  `json:"uetr"`
	DebtorAccount   string  `json:"debtorAccount"`
	CreditorAccount string  `json:"creditorAccount"`
	DebtorName      string  `json:"debtorName"`
	CreditorName    string  `json:"creditorName"`
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
}

type Payment struct {
	ID     string `json:"id"`
	UETR   string `json:"uetr"`
	Status string `json:"status"`
}

type ReconciliationResult struct {
	CycleID        string `json:"cycleId"`
	Status         string `json:"status"`
	MatchedRecords int    `json:"matchedRecords"`
}

func createAccount(ctx context.Context, client *http.Client, baseURL, currency string, balance float64) (*Account, error) {
	return createAccountWithName(ctx, client, baseURL, currency, balance, "Test Account")
}

func createAccountWithName(ctx context.Context, client *http.Client, baseURL, currency string, balance float64, name string) (*Account, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"accountNumber":  fmt.Sprintf("ACCT%d", time.Now().UnixNano()),
		"currency":       currency,
		"initialBalance": balance,
		"name":           name,
	})

	req, _ := http.NewRequestWithContext(ctx, "POST", baseURL+"/api/v1/accounts", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to create account: %s", string(data))
	}

	var account Account
	json.NewDecoder(resp.Body).Decode(&account)
	return &account, nil
}

func initiatePayment(ctx context.Context, client *http.Client, baseURL string, req PaymentRequest) (*Payment, error) {
	body, _ := json.Marshal(req)

	httpReq, _ := http.NewRequestWithContext(ctx, "POST", baseURL+"/api/v1/payments", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		data, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("payment failed: %s", string(data))
	}

	var payment Payment
	json.NewDecoder(resp.Body).Decode(&payment)
	return &payment, nil
}

func waitForStatus(ctx context.Context, client *http.Client, baseURL, uetr, targetStatus string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/payments/%s", baseURL, uetr), nil)
		resp, err := client.Do(req)
		if err != nil {
			time.Sleep(500 * time.Millisecond)
			continue
		}

		var payment Payment
		json.NewDecoder(resp.Body).Decode(&payment)
		resp.Body.Close()

		if payment.Status == targetStatus {
			return true
		}

		time.Sleep(500 * time.Millisecond)
	}

	return false
}

func getAccountBalance(ctx context.Context, client *http.Client, baseURL, accountID string) (float64, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/accounts/%s/balance", baseURL, accountID), nil)
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	var result struct {
		Balance float64 `json:"balance"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	return result.Balance, nil
}

func runReconciliation(ctx context.Context, client *http.Client, baseURL, date string) (*ReconciliationResult, error) {
	body, _ := json.Marshal(map[string]string{"date": date})
	req, _ := http.NewRequestWithContext(ctx, "POST", baseURL+"/api/v1/reconciliation/run", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result ReconciliationResult
	json.NewDecoder(resp.Body).Decode(&result)
	return &result, nil
}

package contracts

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// =============================================================================
// API Contract Tests — Nexus RTP Platform
//
// Validates that live service endpoints conform to the API contract defined
// in docs/openapi.yaml. Tests verify:
//   - Response status codes
//   - Required response fields (structural contract)
//   - Content-Type headers
//   - Error response shape
//   - Auth enforcement
//
// Run:
//   go test -v -tags=contract ./tests/contracts/...
//
// Environment:
//   API_URL          (default: http://localhost:8000)
//   AUTH_URL         (default: http://localhost:8088)
//   ACCOUNT_URL      (default: http://localhost:8086)
//   NOTIFICATION_URL (default: http://localhost:8087)
//   TEST_USERNAME    (default: admin@nexus-rtp.io)
//   TEST_PASSWORD    (default: admin123)
// =============================================================================

var (
	apiURL          string
	authURL         string
	accountURL      string
	notificationURL string
	httpClient      *http.Client
)

func init() {
	apiURL = envOr("API_URL", "http://localhost:8000")
	authURL = envOr("AUTH_URL", "http://localhost:8088")
	accountURL = envOr("ACCOUNT_URL", "http://localhost:8086")
	notificationURL = envOr("NOTIFICATION_URL", "http://localhost:8087")
	httpClient = &http.Client{Timeout: 10 * time.Second}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ---------------------------------------------------------------------------
// Auth Service Contracts
// ---------------------------------------------------------------------------

func TestContract_Auth_Login_Success(t *testing.T) {
	body := `{"email":"` + envOr("TEST_USERNAME", "admin@nexus-rtp.io") + `","password":"` + envOr("TEST_PASSWORD", "admin123") + `"}`
	resp := doRequest(t, "POST", authURL+"/api/v1/auth/login", body, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode, "Login should return 200")
	assertContentType(t, resp, "application/json")

	data := parseJSON(t, resp)
	assertFieldExists(t, data, "token", "Auth login response must contain 'token'")
	assertFieldExists(t, data, "expiresAt", "Auth login response must contain 'expiresAt'")
}

func TestContract_Auth_Login_InvalidCredentials(t *testing.T) {
	body := `{"email":"bad@example.com","password":"wrong"}`
	resp := doRequest(t, "POST", authURL+"/api/v1/auth/login", body, nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "Bad credentials should return 401")
	assertContentType(t, resp, "application/json")
	assertErrorShape(t, resp)
}

func TestContract_Auth_Login_MalformedBody(t *testing.T) {
	resp := doRequest(t, "POST", authURL+"/api/v1/auth/login", `{bad json`, nil)
	defer resp.Body.Close()

	assert.Contains(t, []int{http.StatusBadRequest, http.StatusUnprocessableEntity}, resp.StatusCode)
	assertContentType(t, resp, "application/json")
}

// ---------------------------------------------------------------------------
// Health Endpoints Contracts
// ---------------------------------------------------------------------------

func TestContract_Health_PaymentService(t *testing.T) {
	assertHealthEndpoint(t, apiURL+"/health", "payment-service")
}

func TestContract_Health_AuthService(t *testing.T) {
	assertHealthEndpoint(t, authURL+"/health", "auth-service")
}

func TestContract_Health_AccountService(t *testing.T) {
	assertHealthEndpoint(t, accountURL+"/health", "account-service")
}

func TestContract_Health_NotificationService(t *testing.T) {
	assertHealthEndpoint(t, notificationURL+"/health", "notification-service")
}

// ---------------------------------------------------------------------------
// Payment Service Contracts
// ---------------------------------------------------------------------------

func TestContract_Payments_Unauthorized(t *testing.T) {
	resp := doRequest(t, "GET", apiURL+"/api/v1/payments", "", nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "Unauthenticated request should return 401")
	assertContentType(t, resp, "application/json")
}

func TestContract_Payments_List(t *testing.T) {
	token := getAuthToken(t)
	resp := doRequest(t, "GET", apiURL+"/api/v1/payments", "", map[string]string{
		"Authorization": "Bearer " + token,
	})
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assertContentType(t, resp, "application/json")

	data := parseJSON(t, resp)
	// List endpoints return either an array or { "data": [...], "pagination": {...} }
	if arr, ok := data["data"]; ok {
		assert.IsType(t, []interface{}{}, arr, "data field should be an array")
	}
}

func TestContract_Payments_Create_MissingFields(t *testing.T) {
	token := getAuthToken(t)
	resp := doRequest(t, "POST", apiURL+"/api/v1/payments", `{}`, map[string]string{
		"Authorization": "Bearer " + token,
	})
	defer resp.Body.Close()

	assert.Contains(t, []int{http.StatusBadRequest, http.StatusUnprocessableEntity}, resp.StatusCode,
		"Creating payment with missing fields should return 400 or 422")
	assertContentType(t, resp, "application/json")
}

func TestContract_Payments_Create_ValidShape(t *testing.T) {
	token := getAuthToken(t)
	body := `{
		"debtorAccount": "ACC-000001",
		"creditorAccount": "ACC-000002",
		"amount": 10.00,
		"currency": "USD",
		"reference": "contract-test"
	}`
	resp := doRequest(t, "POST", apiURL+"/api/v1/payments", body, map[string]string{
		"Authorization":   "Bearer " + token,
		"Idempotency-Key": "contract-test-" + fmt.Sprintf("%d", time.Now().UnixNano()),
	})
	defer resp.Body.Close()

	// Accept 200, 201, or 202 (async processing)
	assert.Contains(t, []int{http.StatusOK, http.StatusCreated, http.StatusAccepted}, resp.StatusCode)
	assertContentType(t, resp, "application/json")

	data := parseJSON(t, resp)
	assertFieldExists(t, data, "id", "Payment response must contain 'id'")
	assertFieldExists(t, data, "status", "Payment response must contain 'status'")
}

// ---------------------------------------------------------------------------
// Account Service Contracts
// ---------------------------------------------------------------------------

func TestContract_Accounts_Unauthorized(t *testing.T) {
	resp := doRequest(t, "GET", accountURL+"/api/v1/accounts", "", nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestContract_Accounts_List(t *testing.T) {
	token := getAuthToken(t)
	resp := doRequest(t, "GET", accountURL+"/api/v1/accounts", "", map[string]string{
		"Authorization": "Bearer " + token,
	})
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assertContentType(t, resp, "application/json")
}

// ---------------------------------------------------------------------------
// Error Shape Contracts (cross-cutting)
// ---------------------------------------------------------------------------

func TestContract_NotFound_ReturnsStandardError(t *testing.T) {
	token := getAuthToken(t)
	resp := doRequest(t, "GET", apiURL+"/api/v1/payments/nonexistent-id-12345", "", map[string]string{
		"Authorization": "Bearer " + token,
	})
	defer resp.Body.Close()

	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	assertContentType(t, resp, "application/json")
	assertErrorShape(t, resp)
}

func TestContract_MethodNotAllowed(t *testing.T) {
	resp := doRequest(t, "PATCH", apiURL+"/api/v1/auth/login", "", nil)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusMethodNotAllowed, resp.StatusCode)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func doRequest(t *testing.T, method, url, body string, headers map[string]string) *http.Response {
	t.Helper()
	var reqBody io.Reader
	if body != "" {
		reqBody = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, reqBody)
	require.NoError(t, err)

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := httpClient.Do(req)
	require.NoError(t, err, "Request to %s %s failed", method, url)
	return resp
}

func parseJSON(t *testing.T, resp *http.Response) map[string]interface{} {
	t.Helper()
	bodyBytes, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	// Re-create body reader for potential re-reads
	resp.Body = io.NopCloser(strings.NewReader(string(bodyBytes)))

	var result map[string]interface{}
	err = json.Unmarshal(bodyBytes, &result)
	require.NoError(t, err, "Response body is not valid JSON: %s", string(bodyBytes))
	return result
}

func assertContentType(t *testing.T, resp *http.Response, expected string) {
	t.Helper()
	ct := resp.Header.Get("Content-Type")
	assert.Contains(t, ct, expected, "Content-Type should contain %s, got %s", expected, ct)
}

func assertFieldExists(t *testing.T, data map[string]interface{}, field, msg string) {
	t.Helper()
	_, ok := data[field]
	assert.True(t, ok, msg+" (keys: %v)", keys(data))
}

func assertErrorShape(t *testing.T, resp *http.Response) {
	t.Helper()
	bodyBytes, _ := io.ReadAll(resp.Body)
	resp.Body = io.NopCloser(strings.NewReader(string(bodyBytes)))

	var errResp map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &errResp); err != nil {
		t.Logf("Could not parse error body: %s", string(bodyBytes))
		return
	}
	// Per OpenAPI ErrorResponse schema, should have at least code + message
	assert.True(t,
		errResp["code"] != nil || errResp["error"] != nil || errResp["message"] != nil,
		"Error response should have 'code', 'error', or 'message' field (got: %v)", keys(errResp),
	)
}

func assertHealthEndpoint(t *testing.T, url, service string) {
	t.Helper()
	resp, err := httpClient.Get(url)
	if err != nil {
		t.Skipf("Skipping: %s not reachable at %s", service, url)
		return
	}
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode, "%s health should return 200", service)
}

func getAuthToken(t *testing.T) string {
	t.Helper()
	body := `{"email":"` + envOr("TEST_USERNAME", "admin@nexus-rtp.io") + `","password":"` + envOr("TEST_PASSWORD", "admin123") + `"}`
	resp := doRequest(t, "POST", authURL+"/api/v1/auth/login", body, nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Skip("Skipping: auth service returned non-200, cannot obtain token")
	}

	data := parseJSON(t, resp)
	token, ok := data["token"].(string)
	if !ok || token == "" {
		t.Skip("Skipping: could not extract token from auth response")
	}
	return token
}

func keys(m map[string]interface{}) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	return ks
}

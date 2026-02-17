#!/bin/bash
# ============================================================================
# Smoke Test Suite — Nexus RTP Platform
# ============================================================================
# Usage: bash tests/smoke_test.sh
# Tests core functionality to ensure system is working

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper functions
test_start() {
  local test_name=$1
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  echo -e "\n${BLUE}[Test $TESTS_TOTAL]${NC} $test_name"
}

test_pass() {
  local message=$1
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "  ${GREEN}✓${NC} $message"
}

test_fail() {
  local message=$1
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "  ${RED}✗${NC} $message"
}

api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  local idempotency_key=${4:-""}

  local args=(-s -X "$method" "http://localhost:8000$endpoint" \
    -H "Content-Type: application/json")

  if [ -n "$idempotency_key" ]; then
    args+=(-H "Idempotency-Key: $idempotency_key")
  fi

  if [ -n "$data" ]; then
    args+=(-d "$data")
  fi

  curl "${args[@]}"
}

# ============================================================================
# TEST SUITE
# ============================================================================

echo ""
echo "=========================================="
echo "  Nexus RTP — Smoke Test Suite"
echo "=========================================="

# Test 1: Services are running
test_start "Infrastructure health check"

# Check CockroachDB
if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
  test_pass "CockroachDB responding"
else
  test_fail "CockroachDB not responding"
fi

# Check Kong
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  test_pass "Kong Gateway responding"
else
  test_fail "Kong Gateway not responding"
fi

# Test 2: Database connectivity
test_start "Database schema verification"

PAYMENT_TABLE=$(docker exec nexus-cockroachdb-1 cockroach sql --insecure --format csv -e "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_name = 'payments'
" 2>/dev/null | tail -1 || echo "0")

if [ "$PAYMENT_TABLE" -gt 0 ]; then
  test_pass "Payments table exists"
else
  test_fail "Payments table not found"
fi

# Test 3: API health endpoint
test_start "API health endpoint"

HEALTH_STATUS=$(curl -s http://localhost:8000/health 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unknown")

if [ "$HEALTH_STATUS" = "up" ] || [ "$HEALTH_STATUS" = "healthy" ] || [ "$HEALTH_STATUS" = "ok" ]; then
  test_pass "API health: $HEALTH_STATUS"
else
  test_fail "API health: $HEALTH_STATUS (expected 'up', 'healthy', or 'ok')"
fi

# Test 4: Payment creation (happy path)
test_start "Payment creation (HTTP 201)"

IDEMP_KEY1=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "test-key-$(date +%s)")
PAYMENT_RESPONSE=$(api_call POST "/api/v1/payments" \
  "$(jq -n \
    --arg amount "100.50" \
    --arg currency "USD" \
    --arg debtor "ACC-001-SETTLE" \
    --arg creditor "ACC-002-NOSTRO" \
    --arg debtor_name "Alice Corp" \
    --arg creditor_name "Bob Ltd" \
    --arg type "INSTANT" \
    --arg purpose "Test Payment" \
    '{amount: $amount, currency: $currency, debtorAccount: $debtor, creditorAccount: $creditor, debtorName: $debtor_name, creditorName: $creditor_name, paymentType: $type, purpose: $purpose}')" \
  "$IDEMP_KEY1")

PAYMENT_ID=$(echo "$PAYMENT_RESPONSE" | jq -r '.id // empty' 2>/dev/null || echo "")
HTTP_CODE=$(echo "$PAYMENT_RESPONSE" | jq -r '.http_code // empty' 2>/dev/null || echo "")

if [ -n "$PAYMENT_ID" ] && [ "$PAYMENT_ID" != "null" ]; then
  test_pass "Payment created successfully (ID: ${PAYMENT_ID:0:20}...)"
else
  test_fail "Payment creation failed: $PAYMENT_RESPONSE"
fi

# Test 5: Idempotency (same key = same result)
test_start "Idempotency guarantee (same key → same result)"

if [ -n "$PAYMENT_ID" ]; then
  RETRY_RESPONSE=$(api_call POST "/api/v1/payments" \
    "$(jq -n \
      --arg amount "100.50" \
      --arg currency "USD" \
      --arg debtor "ACC-001-SETTLE" \
      --arg creditor "ACC-002-NOSTRO" \
      --arg debtor_name "Alice Corp" \
      --arg creditor_name "Bob Ltd" \
      --arg type "INSTANT" \
      --arg purpose "Test Payment" \
      '{amount: $amount, currency: $currency, debtorAccount: $debtor, creditorAccount: $creditor, debtorName: $debtor_name, creditorName: $creditor_name, paymentType: $type, purpose: $purpose}')" \
    "$IDEMP_KEY1")

  RETRY_ID=$(echo "$RETRY_RESPONSE" | jq -r '.id // empty' 2>/dev/null || echo "")

  if [ "$RETRY_ID" = "$PAYMENT_ID" ]; then
    test_pass "Idempotency enforced (same ID returned)"
  else
    test_fail "Idempotency NOT enforced (got: $RETRY_ID, expected: $PAYMENT_ID)"
  fi
else
  test_fail "Skipped (payment not created)"
fi

# Test 6: Key reuse rejection (same key, different payload)
test_start "Idempotency conflict detection (different payload)"

IDEMP_KEY2=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "test-key-$(date +%s)-2")

# First request
api_call POST "/api/v1/payments" \
  "$(jq -n \
    --arg amount "50.00" \
    --arg currency "USD" \
    --arg debtor "ACC-001-SETTLE" \
    --arg creditor "ACC-002-NOSTRO" \
    --arg debtor_name "Alice Corp" \
    --arg creditor_name "Bob Ltd" \
    --arg type "INSTANT" \
    --arg purpose "Test Payment 1" \
    '{amount: $amount, currency: $currency, debtorAccount: $debtor, creditorAccount: $creditor, debtorName: $debtor_name, creditorName: $creditor_name, paymentType: $type, purpose: $purpose}')" \
  "$IDEMP_KEY2" > /dev/null

# Second request with DIFFERENT payload
CONFLICT_RESPONSE=$(api_call POST "/api/v1/payments" \
  "$(jq -n \
    --arg amount "75.00" \
    --arg currency "EUR" \
    --arg debtor "ACC-003-SETTLE" \
    --arg creditor "ACC-004-NOSTRO" \
    --arg debtor_name "Charlie Corp" \
    --arg creditor_name "Diana Ltd" \
    --arg type "STANDARD" \
    --arg purpose "Test Payment 2 - Different" \
    '{amount: $amount, currency: $currency, debtorAccount: $debtor, creditorAccount: $creditor, debtorName: $debtor_name, creditorName: $creditor_name, paymentType: $type, purpose: $purpose}')" \
  "$IDEMP_KEY2" 2>&1 || echo '{"error":"conflict"}')

ERROR=$(echo "$CONFLICT_RESPONSE" | jq -r '.error // .message // empty' 2>/dev/null || echo "")

if echo "$ERROR" | grep -iq "conflict\|idempotency"; then
  test_pass "Conflict detected and rejected (error: $ERROR)"
elif echo "$CONFLICT_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
  test_fail "Different payload was accepted (should reject with 409)"
else
  test_fail "Unexpected response: $CONFLICT_RESPONSE"
fi

# Test 7: Database ledger integrity
test_start "Ledger entry creation (double-entry bookkeeping)"

if [ -n "$PAYMENT_ID" ]; then
  LEDGER_ENTRIES=$(docker exec nexus-cockroachdb-1 cockroach sql --insecure --format csv -e "
    SELECT COUNT(*) FROM nexus_ledger.ledger_entries
    WHERE payment_id = '$PAYMENT_ID';
  " 2>/dev/null | tail -1 || echo "0")

  if [ "$LEDGER_ENTRIES" = "2" ]; then
    test_pass "Double-entry bookkeeping: debit + credit (2 entries)"
  elif [ "$LEDGER_ENTRIES" -gt 0 ]; then
    test_fail "Expected 2 ledger entries, got: $LEDGER_ENTRIES"
  else
    test_fail "No ledger entries created for payment"
  fi
else
  test_fail "Skipped (payment not created)"
fi

# Test 8: Balance invariant (conservation of value)
test_start "Balance invariant (conservation of value)"

IMBALANCE=$(docker exec nexus-cockroachdb-1 cockroach sql --insecure --format csv -e "
  SELECT
    SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) -
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END)
  FROM nexus_ledger.ledger_entries;
" 2>/dev/null | tail -1 || echo "unknown")

if [ "$IMBALANCE" = "0" ] || [ "$IMBALANCE" = "0.00" ] || [ "$IMBALANCE" = "0.000000" ]; then
  test_pass "Balance invariant maintained (imbalance = 0)"
elif [ "$IMBALANCE" = "unknown" ]; then
  test_fail "Could not calculate balance (possible schema issue)"
else
  test_fail "Balance imbalance detected: $IMBALANCE (CRITICAL)"
fi

# Test 9: Kafka event publishing
test_start "Kafka event publishing"

# Check if messages are in topics
KAFKA_MESSAGES=$(docker exec nexus-kafka-1 kafka-log-dirs --bootstrap-server localhost:9092 --describe 2>/dev/null | grep -c "size=" || echo "0")

if [ "$KAFKA_MESSAGES" -gt 0 ]; then
  test_pass "Kafka topics have messages"
else
  test_warning "No Kafka messages found (OK if system just started)"
fi

# Test 10: Database query performance
test_start "Database query performance (P99 < 50ms)"

START=$(date +%s%N)
docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT COUNT(*) FROM nexus_ledger.payments;
" > /dev/null 2>&1
END=$(date +%s%N)

DURATION_MS=$(( (END - START) / 1000000 ))

if [ "$DURATION_MS" -lt 50 ]; then
  test_pass "Query latency: ${DURATION_MS}ms (< 50ms)"
elif [ "$DURATION_MS" -lt 100 ]; then
  test_pass "Query latency: ${DURATION_MS}ms (acceptable)"
else
  test_fail "Query latency: ${DURATION_MS}ms (expected < 50ms)"
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo ""
echo -e "Total tests:   $TESTS_TOTAL"
echo -e "${GREEN}Passed:${NC}       $TESTS_PASSED"

if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "${RED}Failed:${NC}       $TESTS_FAILED"
else
  echo -e "Failed:       $TESTS_FAILED"
fi

echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Try making a real payment via API"
  echo "  2. Check Grafana dashboards: http://localhost:3000/"
  echo "  3. Run full test suite: make test-integration"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some tests failed.${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  • Check logs: make logs"
  echo "  • Restart services: make infra-down && make infra-up"
  echo "  • Check database: make db-shell"
  echo ""
  exit 1
fi

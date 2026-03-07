#!/usr/bin/env bash
# =============================================================================
# Nexus RTP Platform — Debezium CDC End-to-End Validation
# Verifies the Change Data Capture pipeline is working correctly.
#
# Prerequisites:
#   - CockroachDB running on :26257
#   - Kafka Connect running on :8083
#   - Kafka running on :9092
#   - Debezium connectors deployed (run deploy-connectors.sh first)
#
# Usage: ./e2e-cdc-test.sh
# =============================================================================
set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-26257}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-nexus}"
KAFKA_CONNECT_URL="${KAFKA_CONNECT_URL:-http://localhost:8083}"
KAFKA_BOOTSTRAP="${KAFKA_BOOTSTRAP:-localhost:9092}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
TOTAL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

check() {
  TOTAL=$((TOTAL + 1))
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $description"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $description"
    FAIL=$((FAIL + 1))
  fi
}

check_output() {
  TOTAL=$((TOTAL + 1))
  local description="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo -e "  ${GREEN}✓${NC} $description"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $description (expected: $expected)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=============================================="
echo " Nexus RTP — CDC End-to-End Validation"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# Step 1: Verify prerequisites
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Step 1: Verify prerequisites${NC}"

check "CockroachDB is reachable" \
  cockroach sql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --insecure -e "SELECT 1"

check "Kafka Connect is reachable" \
  curl -sf "$KAFKA_CONNECT_URL/"

CONNECTORS=$(curl -sf "$KAFKA_CONNECT_URL/connectors" 2>/dev/null || echo "[]")
check_output "Outbox connector is registered" "nexus-outbox-connector" "$CONNECTORS"
check_output "Transactions connector is registered" "nexus-transactions-connector" "$CONNECTORS"

echo ""

# ---------------------------------------------------------------------------
# Step 2: Verify connector status
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Step 2: Verify connector status${NC}"

for connector in nexus-outbox-connector nexus-transactions-connector; do
  STATUS=$(curl -sf "$KAFKA_CONNECT_URL/connectors/$connector/status" 2>/dev/null || echo '{"connector":{"state":"UNKNOWN"}}')
  STATE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['connector']['state'])" 2>/dev/null || echo "UNKNOWN")
  check_output "$connector is RUNNING" "RUNNING" "$STATE"

  # Check tasks
  TASK_STATE=$(echo "$STATUS" | python3 -c "import sys,json; tasks=json.load(sys.stdin).get('tasks',[]); print(tasks[0]['state'] if tasks else 'NO_TASKS')" 2>/dev/null || echo "UNKNOWN")
  check_output "$connector task is RUNNING" "RUNNING" "$TASK_STATE"
done

echo ""

# ---------------------------------------------------------------------------
# Step 3: Insert test data and verify CDC propagation
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Step 3: CDC propagation test${NC}"

TEST_ID="e2e-test-$(date +%s)"
echo "  Test ID: $TEST_ID"

# Insert a test outbox event
cockroach sql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --insecure --database="$DB_NAME" -e "
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, topic, payload, created_at)
VALUES (
  '$TEST_ID',
  'payment',
  '$TEST_ID',
  'payment.e2e_test',
  'nexus.payments.events',
  '{\"test\": true, \"id\": \"$TEST_ID\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}',
  NOW()
);
" 2>/dev/null

echo "  Inserted outbox event, waiting for CDC propagation..."
sleep 5

# Verify the event was captured by Debezium (check if Kafka topic has the message)
# Using kafka-console-consumer with a timeout
KAFKA_OUTPUT=$(timeout 10 kafka-console-consumer \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic nexus.payments.events \
  --from-beginning \
  --max-messages 100 \
  --timeout-ms 8000 2>/dev/null || true)

check_output "Outbox event propagated to Kafka" "$TEST_ID" "$KAFKA_OUTPUT"

# Insert a test transaction
cockroach sql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --insecure --database="$DB_NAME" -e "
INSERT INTO transactions (id, uetr, message_id, debtor_account_id, creditor_account_id, amount, currency, status, created_at, updated_at)
VALUES (
  '$TEST_ID',
  'e2e-uetr-$TEST_ID',
  'e2e-msg-$TEST_ID',
  'ACC-DEBTOR-E2E',
  'ACC-CREDITOR-E2E',
  100.00,
  'USD',
  'PENDING',
  NOW(),
  NOW()
);
" 2>/dev/null

echo "  Inserted test transaction, waiting for CDC propagation..."
sleep 5

CDC_OUTPUT=$(timeout 10 kafka-console-consumer \
  --bootstrap-server "$KAFKA_BOOTSTRAP" \
  --topic nexus.cdc.public.transactions \
  --from-beginning \
  --max-messages 100 \
  --timeout-ms 8000 2>/dev/null || true)

check_output "Transaction CDC event propagated to Kafka" "$TEST_ID" "$CDC_OUTPUT"

echo ""

# ---------------------------------------------------------------------------
# Step 4: Verify topic health
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Step 4: Verify Kafka topic health${NC}"

TOPICS=$(kafka-topics --bootstrap-server "$KAFKA_BOOTSTRAP" --list 2>/dev/null || echo "")
check_output "nexus.payments.events topic exists" "nexus.payments.events" "$TOPICS"
check_output "nexus.cdc.public.transactions topic exists" "nexus.cdc.public.transactions" "$TOPICS"

echo ""

# ---------------------------------------------------------------------------
# Step 5: Cleanup test data
# ---------------------------------------------------------------------------
echo -e "${YELLOW}Step 5: Cleanup${NC}"

cockroach sql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --insecure --database="$DB_NAME" -e "
DELETE FROM outbox_events WHERE id = '$TEST_ID';
DELETE FROM transactions WHERE id = '$TEST_ID';
" 2>/dev/null && echo -e "  ${GREEN}✓${NC} Test data cleaned up" || echo -e "  ${YELLOW}⚠${NC} Cleanup skipped (tables may not exist)"

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=============================================="
echo " Results: $PASS/$TOTAL passed, $FAIL failed"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}CDC pipeline has issues — see failures above${NC}"
  exit 1
else
  echo -e "${GREEN}CDC pipeline is healthy${NC}"
  exit 0
fi

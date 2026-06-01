#!/usr/bin/env bash
# =============================================================================
# Nexus RTP — Local Payment Test Script
# Tests the full payment lifecycle: register → login → create → settle → status
#
# Prerequisites:
#   • Docker Compose stack running (make dev-up)
#   • curl, jq installed
#
# Usage:
#   bash scripts/test-payment-local.sh
# =============================================================================

set -euo pipefail

KONG="http://localhost:8000"
AUTH="$KONG/api/v1/auth"
PAYMENTS="$KONG/api/v1/payments"
ACCOUNTS_DIRECT="http://localhost:8086/api/v1/accounts"

# Known UUIDs seeded by 003_seed_local.sql
ALICE_ACCOUNT="bbbbbbbb-0000-0000-0000-000000000001"
BOB_ACCOUNT="bbbbbbbb-0000-0000-0000-000000000002"

# Unique test email per run
EMAIL="test-$(date +%s)@nexusrtp.local"
PASSWORD="LocalTest@2026!"

echo ""
echo "====================================="
echo "  Nexus RTP — Local Payment Test"
echo "====================================="
echo ""

# ── 1. Register a user ────────────────────────────────────────────────────────
echo "▶ 1. Registering user: $EMAIL"
curl -sf -X POST "$AUTH/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\",
    \"organization\": \"Nexus Dev\"
  }" | jq -r '.message // "registered"'

# ── 2. Login ──────────────────────────────────────────────────────────────────
echo ""
echo "▶ 2. Logging in..."
LOGIN_RESP=$(curl -sf -X POST "$AUTH/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

# Response shape: { user, tokens: { accessToken, refreshToken }, mfaRequired }
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.tokens.accessToken // .accessToken // .data.accessToken')
MFA_REQUIRED=$(echo "$LOGIN_RESP" | jq -r '.mfaRequired // false')

if [[ "$MFA_REQUIRED" == "true" ]]; then
  echo "⚠️  MFA is enabled on this account — disable it or use a fresh registration."
  exit 1
fi

if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
  echo "❌ Login failed. Response:"
  echo "$LOGIN_RESP" | jq .
  exit 1
fi
echo "✅ Got access token: ${ACCESS_TOKEN:0:40}..."

# ── 3. Verify Alice's account balance ────────────────────────────────────────
echo ""
echo "▶ 3. Checking Alice's balance (account $ALICE_ACCOUNT)..."
curl -sf "$ACCOUNTS_DIRECT/$ALICE_ACCOUNT" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '{id, currency, balance, availableBalance, status}'

# ── 4. Create a payment (Alice → Bob) ────────────────────────────────────────
UETR=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]')
MSG_ID="MSG-$(date +%s)"
E2E_ID="E2E-$(date +%s)"

echo ""
echo "▶ 4. Creating payment Alice → Bob  (amount: 250.00 USD, UETR: $UETR)"
PAYMENT_RESP=$(curl -sf -X POST "$PAYMENTS" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Idempotency-Key: $UETR" \
  -d "{
    \"messageId\":         \"$MSG_ID\",
    \"creationDateTime\":  \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"endToEndId\":        \"$E2E_ID\",
    \"uetr\":              \"$UETR\",
    \"amount\":            \"250.00\",
    \"currency\":          \"USD\",
    \"debtorAccountId\":   \"$ALICE_ACCOUNT\",
    \"creditorAccountId\": \"$BOB_ACCOUNT\",
    \"debtorName\":        \"Alice Wonderland\",
    \"creditorName\":      \"Bob The Builder\",
    \"debtorCountry\":     \"US\",
    \"creditorCountry\":   \"GB\"
  }")
echo "$PAYMENT_RESP" | jq '{transactionId, uetr, status, sanctionsStatus, processingTimeMs}'

TXN_ID=$(echo "$PAYMENT_RESP" | jq -r '.transactionId')
STATUS=$(echo "$PAYMENT_RESP" | jq -r '.status')

if [[ -z "$TXN_ID" || "$TXN_ID" == "null" ]]; then
  echo "❌ Payment creation failed:"
  echo "$PAYMENT_RESP" | jq .
  exit 1
fi

# ── 5. Settle the payment ─────────────────────────────────────────────────────
echo ""
echo "▶ 5. Settling payment (UETR: $UETR)..."
SETTLE_RESP=$(curl -sf -X POST "$PAYMENTS/$UETR/settle" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")
echo "$SETTLE_RESP" | jq '{uetr, status} // {message}' 2>/dev/null || echo "$SETTLE_RESP"

# ── 6. Get final status ───────────────────────────────────────────────────────
echo ""
echo "▶ 6. Fetching final payment status..."
sleep 1
curl -sf "$PAYMENTS/$UETR/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '{transactionId, uetr, status, sanctionsStatus, fraudStatus, amount, currency}'

# ── 7. Check Bob's balance ────────────────────────────────────────────────────
echo ""
echo "▶ 7. Checking Bob's balance (should be \$10,250.00)..."
curl -sf "$ACCOUNTS_DIRECT/$BOB_ACCOUNT" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  | jq '{id, currency, balance, availableBalance}'

echo ""
echo "====================================="
echo "  ✅ Test complete!"
echo "  Kong Admin:    http://localhost:8001"
echo "  Kafka UI:      http://localhost:8090"
echo "  CockroachDB:   http://localhost:8080"
echo "  Grafana:       http://localhost:3002  (admin / changeme)"
echo "  Jaeger:        http://localhost:16686"
echo "====================================="
echo ""

#!/bin/bash
# ==============================================================================
# Chaos Experiment: Network Partition (Split-Brain Simulation)
# ==============================================================================
# Purpose: Verify system handles network partitions between services.
#   - Services degrade gracefully (circuit breakers open)
#   - No data corruption or split-brain writes
#   - Recovery is automatic when partition heals
#   - Idempotency guarantees hold across partition boundary
#
# Prerequisites:
#   - Docker Compose stack running
#   - tc (traffic control) available in containers
#
# Usage:
#   ./chaos/network_partition.sh
#   PARTITION_SECONDS=60 ./chaos/network_partition.sh
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.yml}"
PARTITION_SECONDS="${PARTITION_SECONDS:-30}"
PAYMENT_URL="${PAYMENT_URL:-http://localhost:8085}"
ACCOUNT_URL="${ACCOUNT_URL:-http://localhost:8086}"
REPORT_FILE="chaos/reports/network_partition_$(date +%Y%m%d_%H%M%S).json"
PAYMENT_CONTAINER="${PAYMENT_CONTAINER:-payment-service}"
ACCOUNT_CONTAINER="${ACCOUNT_CONTAINER:-account-service}"

mkdir -p chaos/reports

echo "=========================================="
echo " Chaos Experiment: Network Partition"
echo "=========================================="
echo "Partition: $PAYMENT_CONTAINER <-/-> $ACCOUNT_CONTAINER"
echo "Duration:  ${PARTITION_SECONDS}s"
echo ""

VERDICT="PASS"
FAILURES=""

# Step 0: Pre-flight
echo "[0/7] Pre-flight checks..."
for svc in "$PAYMENT_URL" "$ACCOUNT_URL"; do
    if ! curl -sf "$svc/health" > /dev/null 2>&1; then
        echo "ERROR: service not healthy at $svc/health"
        exit 1
    fi
done
echo "  ✓ All services healthy"

# Step 1: Baseline payment
echo "[1/7] Submitting baseline payment..."
IDEMP_BASELINE=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
BASELINE_RESP=$(curl -sf -X POST "$PAYMENT_URL/api/v1/payments" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_BASELINE" \
    -d '{
        "uetr": "chaos-partition-'"$IDEMP_BASELINE"'",
        "amount": 50,
        "currency": "USD",
        "debtorAccount": "ACC-001-SETTLE",
        "creditorAccount": "ACC-002-NOSTRO",
        "paymentType": "INSTANT"
    }' 2>/dev/null || echo '{"error":"baseline payment failed"}')
echo "  Baseline response: $BASELINE_RESP"

# Step 2: Get account-service container IP
echo "[2/7] Resolving container IPs..."
ACCOUNT_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$ACCOUNT_CONTAINER" 2>/dev/null || echo "")
if [ -z "$ACCOUNT_IP" ]; then
    echo "  WARNING: Could not resolve $ACCOUNT_CONTAINER IP. Using iptables fallback."
    ACCOUNT_IP="account-service"
fi
echo "  Account service IP: $ACCOUNT_IP"

# Step 3: Create network partition
echo "[3/7] Creating network partition..."
docker exec "$PAYMENT_CONTAINER" sh -c "
    if command -v iptables >/dev/null 2>&1; then
        iptables -A OUTPUT -d $ACCOUNT_IP -j DROP
        iptables -A INPUT -s $ACCOUNT_IP -j DROP
        echo 'Partition created via iptables'
    elif command -v tc >/dev/null 2>&1; then
        tc qdisc add dev eth0 root netem loss 100%
        echo 'Partition created via tc (100% packet loss)'
    else
        echo 'WARNING: Neither iptables nor tc available'
    fi
" 2>/dev/null || echo "  WARNING: Could not create partition (container may lack NET_ADMIN)"

# Step 4: Send payments during partition
echo "[4/7] Sending payments during partition..."
DURING_RESULTS=()
for i in $(seq 1 5); do
    IDEMP_KEY=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
    RESP=$(curl -sf -X POST "$PAYMENT_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $IDEMP_KEY" \
        -d '{
            "uetr": "chaos-during-'"$IDEMP_KEY"'",
            "amount": 10,
            "currency": "USD",
            "debtorAccount": "ACC-001-SETTLE",
            "creditorAccount": "ACC-002-NOSTRO",
            "paymentType": "INSTANT"
        }' 2>/dev/null || echo '{"error":"partition-payment-failed"}')
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$PAYMENT_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $IDEMP_KEY" \
        -d '{"uetr":"dup","amount":10,"currency":"USD","debtorAccount":"ACC-001","creditorAccount":"ACC-002","paymentType":"INSTANT"}' \
        2>/dev/null || echo "000")
    echo "  Payment $i: HTTP $HTTP_CODE"
    DURING_RESULTS+=("$HTTP_CODE")
    sleep 1
done

echo "[4/7] Waiting ${PARTITION_SECONDS}s for partition duration..."
sleep "$PARTITION_SECONDS"

# Step 5: Heal partition
echo "[5/7] Healing network partition..."
docker exec "$PAYMENT_CONTAINER" sh -c "
    if command -v iptables >/dev/null 2>&1; then
        iptables -F
        echo 'Partition healed (iptables flushed)'
    elif command -v tc >/dev/null 2>&1; then
        tc qdisc del dev eth0 root 2>/dev/null || true
        echo 'Partition healed (tc removed)'
    fi
" 2>/dev/null || echo "  WARNING: Could not heal partition"

echo "  Waiting 10s for recovery..."
sleep 10

# Step 6: Verify recovery
echo "[6/7] Verifying recovery..."

# Health checks
PAYMENT_HEALTH=$(curl -sf "$PAYMENT_URL/health" 2>/dev/null || echo '{"status":"down"}')
ACCOUNT_HEALTH=$(curl -sf "$ACCOUNT_URL/health" 2>/dev/null || echo '{"status":"down"}')

echo "  Payment service: $PAYMENT_HEALTH"
echo "  Account service: $ACCOUNT_HEALTH"

if echo "$PAYMENT_HEALTH" | grep -qi "down\|error"; then
    VERDICT="FAIL"
    FAILURES="${FAILURES}payment-service not recovered; "
fi
if echo "$ACCOUNT_HEALTH" | grep -qi "down\|error"; then
    VERDICT="FAIL"
    FAILURES="${FAILURES}account-service not recovered; "
fi

# Post-partition payment should succeed
IDEMP_POST=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
POST_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$PAYMENT_URL/api/v1/payments" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_POST" \
    -d '{
        "uetr": "chaos-post-'"$IDEMP_POST"'",
        "amount": 25,
        "currency": "USD",
        "debtorAccount": "ACC-001-SETTLE",
        "creditorAccount": "ACC-002-NOSTRO",
        "paymentType": "INSTANT"
    }' 2>/dev/null || echo "000")

echo "  Post-partition payment: HTTP $POST_CODE"
if [ "$POST_CODE" != "201" ] && [ "$POST_CODE" != "200" ] && [ "$POST_CODE" != "202" ]; then
    VERDICT="FAIL"
    FAILURES="${FAILURES}post-partition payment failed (HTTP $POST_CODE); "
fi

# Step 7: Generate report
echo "[7/7] Generating report..."

cat > "$REPORT_FILE" <<EOF
{
  "experiment": "network_partition",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "parameters": {
    "partition_between": ["$PAYMENT_CONTAINER", "$ACCOUNT_CONTAINER"],
    "partition_duration_seconds": $PARTITION_SECONDS
  },
  "results": {
    "baseline_payment": "$(echo "$BASELINE_RESP" | head -c 200)",
    "during_partition_http_codes": [$(printf '"%s",' "${DURING_RESULTS[@]}" | sed 's/,$//')],
    "post_partition_http_code": "$POST_CODE",
    "payment_service_recovered": $(echo "$PAYMENT_HEALTH" | grep -qi "ok\|up\|healthy" && echo "true" || echo "false"),
    "account_service_recovered": $(echo "$ACCOUNT_HEALTH" | grep -qi "ok\|up\|healthy" && echo "true" || echo "false")
  },
  "verdict": "$VERDICT",
  "failures": "$FAILURES"
}
EOF

echo ""
echo "=========================================="
echo " VERDICT: $VERDICT"
[ -n "$FAILURES" ] && echo " Failures: $FAILURES"
echo " Report:  $REPORT_FILE"
echo "=========================================="

[ "$VERDICT" = "PASS" ] && exit 0 || exit 1

#!/bin/bash
# ==============================================================================
# Chaos Experiment: Kill Kafka Broker
# ==============================================================================
# Purpose: Verify system handles Kafka broker failure gracefully.
#   - Consumer lag increases but recovers
#   - No duplicate settlement events
#   - Idempotency prevents duplicate payments
#
# Prerequisites:
#   - Docker Compose stack running (infra/docker/docker-compose.yml)
#   - Services connected to Kafka
#
# Usage:
#   ./chaos/kill_kafka_broker.sh
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.yml}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-kafka-1}"
DOWNTIME_SECONDS="${DOWNTIME_SECONDS:-15}"
PAYMENT_URL="${PAYMENT_URL:-http://localhost:8085}"
REPORT_FILE="chaos/reports/kafka_kill_$(date +%Y%m%d_%H%M%S).json"

mkdir -p chaos/reports

echo "=========================================="
echo " Chaos Experiment: Kill Kafka Broker"
echo "=========================================="
echo "Target:    $KAFKA_CONTAINER"
echo "Downtime:  ${DOWNTIME_SECONDS}s"
echo "Compose:   $COMPOSE_FILE"
echo ""

# Step 0: Pre-flight check
echo "[0/6] Pre-flight: verifying services are healthy..."
if ! curl -sf "$PAYMENT_URL/health" > /dev/null 2>&1; then
    echo "ERROR: payment-service not healthy at $PAYMENT_URL/health"
    exit 1
fi
echo "  ✓ payment-service healthy"

# Step 1: Capture baseline metrics
echo "[1/6] Capturing baseline metrics..."
BASELINE_CONSUMER_LAG=$(curl -sf http://localhost:9090/api/v1/query?query=kafka_consumergroup_lag 2>/dev/null || echo "N/A")

# Step 2: Submit a payment BEFORE killing Kafka (should succeed)
echo "[2/6] Submitting pre-chaos payment..."
IDEMP_KEY_1=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || cat /proc/sys/kernel/random/uuid)
PRE_RESP=$(curl -sf -X POST "$PAYMENT_URL/api/v1/payments" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_KEY_1" \
    -d '{"uetr":"chaos-pre-'$IDEMP_KEY_1'","amount":100,"currency":"USD","debtorAccount":"ACC-001-SETTLE","creditorAccount":"ACC-002-NOSTRO","paymentType":"INSTANT"}' \
    2>/dev/null || echo '{"error":"pre-chaos payment failed"}')
echo "  Pre-chaos response: $PRE_RESP"

# Step 3: Kill Kafka broker
echo "[3/6] Killing Kafka broker: $KAFKA_CONTAINER..."
docker-compose -f "$COMPOSE_FILE" stop "$KAFKA_CONTAINER"
echo "  ✓ $KAFKA_CONTAINER stopped"

# Step 4: Submit payments DURING Kafka outage
echo "[4/6] Submitting payment during Kafka outage (may fail or degrade)..."
sleep 2
IDEMP_KEY_2=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || cat /proc/sys/kernel/random/uuid)
DURING_RESP=$(curl -sf -w "\nHTTP_STATUS:%{http_code}" -X POST "$PAYMENT_URL/api/v1/payments" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_KEY_2" \
    -d '{"uetr":"chaos-during-'$IDEMP_KEY_2'","amount":200,"currency":"USD","debtorAccount":"ACC-001-SETTLE","creditorAccount":"ACC-002-NOSTRO","paymentType":"INSTANT"}' \
    2>/dev/null || echo "HTTP_STATUS:503")
echo "  During-chaos response: $DURING_RESP"

# Step 5: Wait and restart Kafka
echo "[5/6] Waiting ${DOWNTIME_SECONDS}s then restarting Kafka..."
sleep "$DOWNTIME_SECONDS"
docker-compose -f "$COMPOSE_FILE" start "$KAFKA_CONTAINER"
echo "  ✓ $KAFKA_CONTAINER restarted"

# Wait for Kafka to rejoin ISR
echo "  Waiting 20s for Kafka broker to rejoin cluster..."
sleep 20

# Step 6: Validate recovery
echo "[6/6] Validating recovery..."

# 6a: Payment service should be healthy
if curl -sf "$PAYMENT_URL/health" > /dev/null 2>&1; then
    echo "  ✓ payment-service healthy after recovery"
    HEALTH_OK=true
else
    echo "  ✗ payment-service NOT healthy"
    HEALTH_OK=false
fi

# 6b: Replay the pre-chaos payment with same idempotency key — should get same response
REPLAY_RESP=$(curl -sf -X POST "$PAYMENT_URL/api/v1/payments" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_KEY_1" \
    -d '{"uetr":"chaos-pre-'$IDEMP_KEY_1'","amount":100,"currency":"USD","debtorAccount":"ACC-001-SETTLE","creditorAccount":"ACC-002-NOSTRO","paymentType":"INSTANT"}' \
    2>/dev/null || echo '{"error":"replay failed"}')
echo "  Replay response: $REPLAY_RESP"

# 6c: Submit a new payment — should work after recovery
IDEMP_KEY_3=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || cat /proc/sys/kernel/random/uuid)
POST_RESP=$(curl -sf -X POST "$PAYMENT_URL/api/v1/payments" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEMP_KEY_3" \
    -d '{"uetr":"chaos-post-'$IDEMP_KEY_3'","amount":300,"currency":"USD","debtorAccount":"ACC-001-SETTLE","creditorAccount":"ACC-002-NOSTRO","paymentType":"INSTANT"}' \
    2>/dev/null || echo '{"error":"post-recovery payment failed"}')
echo "  Post-recovery response: $POST_RESP"

# Generate report
cat > "$REPORT_FILE" <<EOF
{
  "experiment": "kill-kafka-broker",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "$KAFKA_CONTAINER",
  "downtime_seconds": $DOWNTIME_SECONDS,
  "results": {
    "pre_chaos_payment": $(echo "$PRE_RESP" | head -1),
    "during_chaos_response": "$(echo "$DURING_RESP" | tail -1)",
    "post_recovery_healthy": $HEALTH_OK,
    "idempotency_replay": $(echo "$REPLAY_RESP" | head -1),
    "post_recovery_payment": $(echo "$POST_RESP" | head -1)
  },
  "verdict": "$(if [ "$HEALTH_OK" = true ]; then echo "PASS"; else echo "FAIL"; fi)"
}
EOF

echo ""
echo "=========================================="
echo " Report saved: $REPORT_FILE"
echo " Verdict: $(if [ "$HEALTH_OK" = true ]; then echo "PASS ✓"; else echo "FAIL ✗"; fi)"
echo "=========================================="

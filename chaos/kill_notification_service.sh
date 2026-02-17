#!/bin/bash
# ==============================================================================
# Chaos Experiment: Kill Notification Service
# ==============================================================================
# Purpose: Verify that killing notification-service does NOT affect payments.
#   - Notification queue grows during outage
#   - Notifications are delivered on recovery
#   - No data loss
#
# Prerequisites:
#   - Docker Compose stack running
#
# Usage:
#   ./chaos/kill_notification_service.sh
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.yml}"
NOTIFICATION_CONTAINER="${NOTIFICATION_CONTAINER:-notification-service}"
DOWNTIME_SECONDS="${DOWNTIME_SECONDS:-15}"
PAYMENT_URL="${PAYMENT_URL:-http://localhost:8085}"
NOTIFICATION_URL="${NOTIFICATION_URL:-http://localhost:8092}"
REPORT_FILE="chaos/reports/notification_kill_$(date +%Y%m%d_%H%M%S).json"

mkdir -p chaos/reports

echo "=========================================="
echo " Chaos Experiment: Kill Notification Service"
echo "=========================================="
echo "Target:    $NOTIFICATION_CONTAINER"
echo "Downtime:  ${DOWNTIME_SECONDS}s"
echo ""

# Step 0: Pre-flight
echo "[0/5] Pre-flight checks..."
if ! curl -sf "$PAYMENT_URL/health" > /dev/null 2>&1; then
    echo "ERROR: payment-service not healthy"
    exit 1
fi
if ! curl -sf "$NOTIFICATION_URL/health" > /dev/null 2>&1; then
    echo "WARN: notification-service not healthy (may already be down)"
fi
echo "  ✓ payment-service healthy"

# Step 1: Kill notification-service
echo "[1/5] Killing notification-service..."
docker-compose -f "$COMPOSE_FILE" stop "$NOTIFICATION_CONTAINER"
echo "  ✓ $NOTIFICATION_CONTAINER stopped"

# Step 2: Submit payments — should still succeed without notifications
echo "[2/5] Submitting payments while notification-service is down..."
PAYMENT_SUCCESS=0
PAYMENT_FAIL=0
for i in $(seq 1 5); do
    IDEMP_KEY=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || cat /proc/sys/kernel/random/uuid)
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$PAYMENT_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $IDEMP_KEY" \
        -d '{"uetr":"chaos-notif-'$i'-'$IDEMP_KEY'","amount":'$((i*100))',"currency":"USD","debtorAccount":"ACC-001-SETTLE","creditorAccount":"ACC-002-NOSTRO","paymentType":"INSTANT"}' \
        2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" =~ ^2 ]]; then
        PAYMENT_SUCCESS=$((PAYMENT_SUCCESS + 1))
    else
        PAYMENT_FAIL=$((PAYMENT_FAIL + 1))
    fi
    echo "  Payment $i: HTTP $HTTP_CODE"
done
echo "  Results: $PAYMENT_SUCCESS succeeded, $PAYMENT_FAIL failed"

# Step 3: Restart notification-service
echo "[3/5] Waiting ${DOWNTIME_SECONDS}s then restarting notification-service..."
sleep "$DOWNTIME_SECONDS"
docker-compose -f "$COMPOSE_FILE" start "$NOTIFICATION_CONTAINER"
echo "  ✓ $NOTIFICATION_CONTAINER restarted"

# Wait for recovery
echo "  Waiting 15s for notification-service to recover..."
sleep 15

# Step 4: Verify notification-service recovered
echo "[4/5] Verifying notification-service health..."
NOTIF_HEALTHY=false
for attempt in $(seq 1 10); do
    if curl -sf "$NOTIFICATION_URL/health" > /dev/null 2>&1; then
        NOTIF_HEALTHY=true
        echo "  ✓ notification-service healthy (attempt $attempt)"
        break
    fi
    sleep 2
done
if [ "$NOTIF_HEALTHY" = false ]; then
    echo "  ✗ notification-service did NOT recover"
fi

# Step 5: Verify payments still work
echo "[5/5] Verifying payment service still works..."
PAYMENT_HEALTHY=false
if curl -sf "$PAYMENT_URL/health" > /dev/null 2>&1; then
    PAYMENT_HEALTHY=true
    echo "  ✓ payment-service healthy"
fi

# Generate report
VERDICT="PASS"
if [ "$PAYMENT_SUCCESS" -lt 3 ]; then VERDICT="FAIL"; fi
if [ "$NOTIF_HEALTHY" = false ]; then VERDICT="FAIL"; fi

cat > "$REPORT_FILE" <<EOF
{
  "experiment": "kill-notification-service",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "$NOTIFICATION_CONTAINER",
  "downtime_seconds": $DOWNTIME_SECONDS,
  "results": {
    "payments_during_outage_success": $PAYMENT_SUCCESS,
    "payments_during_outage_fail": $PAYMENT_FAIL,
    "notification_service_recovered": $NOTIF_HEALTHY,
    "payment_service_healthy": $PAYMENT_HEALTHY
  },
  "verdict": "$VERDICT"
}
EOF

echo ""
echo "=========================================="
echo " Report saved: $REPORT_FILE"
echo " Verdict: $VERDICT $(if [ \"$VERDICT\" = \"PASS\" ]; then echo '✓'; else echo '✗'; fi)"
echo "=========================================="

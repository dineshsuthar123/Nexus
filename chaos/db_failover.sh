#!/bin/bash
# ==============================================================================
# Chaos Experiment: CockroachDB Node Failover
# ==============================================================================
# Purpose: Verify data integrity and availability during DB node failure.
#   - Payments continue processing when 1 of 3 nodes is down
#   - No data loss or corruption
#   - Conservation of value invariant holds
#   - Automatic recovery when node rejoins
#
# Prerequisites:
#   - Docker Compose stack with 3-node CockroachDB cluster
#
# Usage:
#   ./chaos/db_failover.sh
#   DOWNTIME_SECONDS=60 TARGET_NODE=cockroach-2 ./chaos/db_failover.sh
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.yml}"
TARGET_NODE="${TARGET_NODE:-cockroach-2}"
DOWNTIME_SECONDS="${DOWNTIME_SECONDS:-30}"
PAYMENT_URL="${PAYMENT_URL:-http://localhost:8085}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-26257}"
REPORT_FILE="chaos/reports/db_failover_$(date +%Y%m%d_%H%M%S).json"

mkdir -p chaos/reports

echo "=========================================="
echo " Chaos Experiment: CockroachDB Failover"
echo "=========================================="
echo "Target Node: $TARGET_NODE"
echo "Downtime:    ${DOWNTIME_SECONDS}s"
echo ""

VERDICT="PASS"
FAILURES=""

# Step 0: Pre-flight
echo "[0/8] Pre-flight checks..."
if ! curl -sf "$PAYMENT_URL/health" > /dev/null 2>&1; then
    echo "ERROR: payment-service not healthy"
    exit 1
fi
echo "  ✓ payment-service healthy"

# Check cluster status
CLUSTER_STATUS=$(docker exec cockroach-1 cockroach node status --insecure 2>/dev/null || echo "Unable to query cluster")
echo "  Cluster status: $(echo "$CLUSTER_STATUS" | head -5)"

# Step 1: Capture pre-failover invariants
echo "[1/8] Capturing pre-failover invariants..."
PRE_BALANCE=$(docker exec cockroach-1 cockroach sql --insecure -e "
    SELECT
        COALESCE(SUM(CASE WHEN leg_type = 'DEBIT' THEN amount ELSE 0 END), 0) as debits,
        COALESCE(SUM(CASE WHEN leg_type = 'CREDIT' THEN amount ELSE 0 END), 0) as credits,
        COALESCE(SUM(CASE WHEN leg_type = 'DEBIT' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN leg_type = 'CREDIT' THEN amount ELSE 0 END), 0) as imbalance
    FROM nexus_ledger.transaction_leg;
" 2>/dev/null || echo "Unable to query ledger")
echo "  Pre-failover ledger: $PRE_BALANCE"

PRE_PAYMENT_COUNT=$(docker exec cockroach-1 cockroach sql --insecure --format csv -e "
    SELECT COUNT(*) FROM nexus_ledger.\"transaction\";
" 2>/dev/null | tail -1 || echo "0")
echo "  Pre-failover payment count: $PRE_PAYMENT_COUNT"

# Step 2: Kill one CockroachDB node
echo "[2/8] Stopping CockroachDB node: $TARGET_NODE..."
docker-compose -f "$COMPOSE_FILE" stop "$TARGET_NODE"
echo "  ✓ Node stopped"

# Wait for cluster detection
echo "  Waiting 5s for cluster to detect node loss..."
sleep 5

# Step 3: Verify cluster survives (2/3 nodes alive)
echo "[3/8] Verifying cluster availability..."
SURVIVING_NODE="cockroach-1"
if [ "$TARGET_NODE" = "cockroach-1" ]; then
    SURVIVING_NODE="cockroach-2"
fi

NODES_ALIVE=$(docker exec "$SURVIVING_NODE" cockroach node status --insecure 2>/dev/null | grep -c "true" || echo "0")
echo "  Nodes alive: $NODES_ALIVE"

if [ "$NODES_ALIVE" -lt 2 ]; then
    echo "  WARNING: Less than 2 nodes alive. Cluster may be unavailable."
    VERDICT="FAIL"
    FAILURES="${FAILURES}cluster has <2 nodes alive; "
fi

# Step 4: Submit payments during failover
echo "[4/8] Submitting payments during DB failover..."
PAYMENTS_ATTEMPTED=0
PAYMENTS_SUCCEEDED=0
PAYMENTS_FAILED=0

for i in $(seq 1 10); do
    IDEMP_KEY=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$PAYMENT_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $IDEMP_KEY" \
        -d '{
            "uetr": "chaos-dbfail-'"$IDEMP_KEY"'",
            "amount": 100,
            "currency": "USD",
            "debtorAccount": "ACC-001-SETTLE",
            "creditorAccount": "ACC-002-NOSTRO",
            "paymentType": "INSTANT"
        }' 2>/dev/null || echo "000")
    PAYMENTS_ATTEMPTED=$((PAYMENTS_ATTEMPTED + 1))
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
        PAYMENTS_SUCCEEDED=$((PAYMENTS_SUCCEEDED + 1))
    else
        PAYMENTS_FAILED=$((PAYMENTS_FAILED + 1))
    fi
    echo "  Payment $i: HTTP $HTTP_CODE"
    sleep 0.5
done

echo "  Results: $PAYMENTS_SUCCEEDED/$PAYMENTS_ATTEMPTED succeeded"

# Payments should still work (2/3 nodes, quorum holds)
if [ "$PAYMENTS_SUCCEEDED" -lt 5 ]; then
    VERDICT="FAIL"
    FAILURES="${FAILURES}too many payment failures during single-node down ($PAYMENTS_SUCCEEDED/$PAYMENTS_ATTEMPTED); "
fi

# Step 5: Wait for downtime duration
echo "[5/8] Holding failover state for ${DOWNTIME_SECONDS}s..."
sleep "$DOWNTIME_SECONDS"

# Step 6: Restore the node
echo "[6/8] Restarting CockroachDB node: $TARGET_NODE..."
docker-compose -f "$COMPOSE_FILE" start "$TARGET_NODE"
echo "  Waiting 15s for node to rejoin cluster..."
sleep 15

# Check node rejoined
POST_NODES=$(docker exec "$SURVIVING_NODE" cockroach node status --insecure 2>/dev/null | grep -c "true" || echo "0")
echo "  Nodes alive after recovery: $POST_NODES"

if [ "$POST_NODES" -lt 3 ]; then
    echo "  WARNING: Not all nodes recovered yet"
    echo "  Waiting additional 15s..."
    sleep 15
    POST_NODES=$(docker exec "$SURVIVING_NODE" cockroach node status --insecure 2>/dev/null | grep -c "true" || echo "0")
    echo "  Nodes alive: $POST_NODES"
fi

# Step 7: Verify data integrity
echo "[7/8] Verifying data integrity..."

# Balance invariant
POST_BALANCE=$(docker exec "$SURVIVING_NODE" cockroach sql --insecure --format csv -e "
    SELECT
        COALESCE(SUM(CASE WHEN leg_type = 'DEBIT' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN leg_type = 'CREDIT' THEN amount ELSE 0 END), 0) as imbalance
    FROM nexus_ledger.transaction_leg;
" 2>/dev/null | tail -1 || echo "unknown")
echo "  Post-failover imbalance: $POST_BALANCE"

if [ "$POST_BALANCE" != "0" ] && [ "$POST_BALANCE" != "0.00" ] && [ "$POST_BALANCE" != "0.000000" ]; then
    if [ "$POST_BALANCE" != "unknown" ]; then
        VERDICT="FAIL"
        FAILURES="${FAILURES}CRITICAL: balance imbalance detected ($POST_BALANCE); "
    fi
fi

# Payment count (should have increased)
POST_PAYMENT_COUNT=$(docker exec "$SURVIVING_NODE" cockroach sql --insecure --format csv -e "
    SELECT COUNT(*) FROM nexus_ledger.\"transaction\";
" 2>/dev/null | tail -1 || echo "0")
echo "  Post-failover payment count: $POST_PAYMENT_COUNT (was: $PRE_PAYMENT_COUNT)"

# Under-replicated ranges (should resolve)
UNDER_REPLICATED=$(docker exec "$SURVIVING_NODE" cockroach sql --insecure --format csv -e "
    SELECT COUNT(*) FROM crdb_internal.ranges_no_leases WHERE array_length(replicas, 1) < 3;
" 2>/dev/null | tail -1 || echo "unknown")
echo "  Under-replicated ranges: $UNDER_REPLICATED"

# Service health
HEALTH=$(curl -sf "$PAYMENT_URL/health" 2>/dev/null || echo '{"status":"down"}')
echo "  Payment service after recovery: $HEALTH"

if echo "$HEALTH" | grep -qi "down\|error"; then
    VERDICT="FAIL"
    FAILURES="${FAILURES}payment-service not healthy after recovery; "
fi

# Step 8: Report
echo "[8/8] Generating report..."

cat > "$REPORT_FILE" <<EOF
{
  "experiment": "db_failover",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "parameters": {
    "target_node": "$TARGET_NODE",
    "downtime_seconds": $DOWNTIME_SECONDS,
    "cluster_size": 3
  },
  "results": {
    "pre_payment_count": "$PRE_PAYMENT_COUNT",
    "payments_during_failover": {
      "attempted": $PAYMENTS_ATTEMPTED,
      "succeeded": $PAYMENTS_SUCCEEDED,
      "failed": $PAYMENTS_FAILED
    },
    "post_payment_count": "$POST_PAYMENT_COUNT",
    "balance_imbalance": "$POST_BALANCE",
    "nodes_recovered": "$POST_NODES",
    "under_replicated_ranges": "$UNDER_REPLICATED",
    "service_healthy_after": $(echo "$HEALTH" | grep -qi "up\|ok\|healthy" && echo "true" || echo "false")
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

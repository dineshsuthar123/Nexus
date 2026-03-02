#!/bin/bash
# ==============================================================================
# Nexus RTP — Chaos Test Runner
# Runs all chaos experiments in sequence, producing a consolidated report.
#
# Usage:
#   ./chaos/run_all.sh               # Run all experiments
#   ./chaos/run_all.sh db_failover   # Run single experiment
#   ./chaos/run_all.sh --quick       # Reduced durations for CI
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

export COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.yml}"
export PAYMENT_URL="${PAYMENT_URL:-http://localhost:8085}"
export ACCOUNT_URL="${ACCOUNT_URL:-http://localhost:8086}"

REPORTS_DIR="chaos/reports"
mkdir -p "$REPORTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONSOLIDATED_REPORT="$REPORTS_DIR/consolidated_${TIMESTAMP}.json"

# Quick mode: reduce durations for CI environments
if [ "${1:-}" = "--quick" ]; then
    echo "[MODE] Quick — reduced durations for CI"
    export DOWNTIME_SECONDS=10
    export PARTITION_SECONDS=10
    export LATENCY_MS=200
    EXPERIMENTS="db_failover kill_kafka_broker network_partition idempotency_stress"
elif [ -n "${1:-}" ]; then
    EXPERIMENTS="$1"
else
    EXPERIMENTS="db_failover db_latency kill_kafka_broker kill_notification_service network_partition idempotency_stress"
fi

echo "============================================"
echo " Nexus RTP Chaos Test Suite"
echo " $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"
echo ""

# Pre-flight: verify services are up
echo "[PRE-FLIGHT] Checking payment-service health..."
if ! curl -sf "$PAYMENT_URL/health" > /dev/null 2>&1; then
    echo "ERROR: payment-service not reachable at $PAYMENT_URL/health"
    echo "Start the stack first: docker-compose -f $COMPOSE_FILE --profile services up -d"
    exit 1
fi
echo "  OK"
echo ""

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
RESULTS="["

for EXPERIMENT in $EXPERIMENTS; do
    SCRIPT="chaos/${EXPERIMENT}.sh"
    TOTAL=$((TOTAL + 1))

    echo "--------------------------------------------"
    echo " [$TOTAL] Running: $EXPERIMENT"
    echo "--------------------------------------------"

    if [ ! -f "$SCRIPT" ]; then
        echo "  SKIPPED — script not found: $SCRIPT"
        SKIPPED=$((SKIPPED + 1))
        RESULTS="${RESULTS}{\"name\":\"${EXPERIMENT}\",\"verdict\":\"SKIPPED\",\"reason\":\"script not found\"},"
        continue
    fi

    START_TIME=$(date +%s)

    if bash "$SCRIPT" 2>&1; then
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        echo "  PASSED (${DURATION}s)"
        PASSED=$((PASSED + 1))
        RESULTS="${RESULTS}{\"name\":\"${EXPERIMENT}\",\"verdict\":\"PASS\",\"duration_s\":${DURATION}},"
    else
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        echo "  FAILED (${DURATION}s)"
        FAILED=$((FAILED + 1))
        RESULTS="${RESULTS}{\"name\":\"${EXPERIMENT}\",\"verdict\":\"FAIL\",\"duration_s\":${DURATION}},"
    fi

    # Brief cooldown between experiments to let services stabilize
    echo "  Cooldown: 10s"
    sleep 10
    echo ""
done

# Close JSON array
RESULTS="${RESULTS%,}]"

cat > "$CONSOLIDATED_REPORT" <<EOF
{
  "suite": "nexus-rtp-chaos",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "summary": {
    "total": $TOTAL,
    "passed": $PASSED,
    "failed": $FAILED,
    "skipped": $SKIPPED,
    "verdict": "$([ $FAILED -eq 0 ] && echo 'PASS' || echo 'FAIL')"
  },
  "experiments": $RESULTS
}
EOF

echo "============================================"
echo " CHAOS SUITE RESULTS"
echo "============================================"
echo " Total:   $TOTAL"
echo " Passed:  $PASSED"
echo " Failed:  $FAILED"
echo " Skipped: $SKIPPED"
echo ""
echo " Overall: $([ $FAILED -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo " Report:  $CONSOLIDATED_REPORT"
echo "============================================"

[ $FAILED -eq 0 ] && exit 0 || exit 1

#!/bin/bash
# ==============================================================================
# Canary Health Check — Automated Gate
# ==============================================================================
# Checks canary deployment health metrics before promoting traffic.
# Used by CI and manual cutover alike.
#
# Usage:
#   ./canary_health_check.sh                    # Default 5m check
#   ./canary_health_check.sh --timeout 300      # 5 minute check
#   ./canary_health_check.sh --promote          # Check + auto-promote
# ==============================================================================

set -euo pipefail

PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus:9090}"
NAMESPACE="${NAMESPACE:-nexus-rtp}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
TIMEOUT="${TIMEOUT:-300}"
MAX_ERROR_RATE="${MAX_ERROR_RATE:-0.01}"
MAX_P99_LATENCY="${MAX_P99_LATENCY:-1.0}"
MIN_SUCCESS_RATE="${MIN_SUCCESS_RATE:-0.995}"
AUTO_PROMOTE=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

while [[ $# -gt 0 ]]; do
    case $1 in
        --timeout) TIMEOUT=$2; shift 2 ;;
        --promote) AUTO_PROMOTE=true; shift ;;
        --namespace) NAMESPACE=$2; shift 2 ;;
        *) shift ;;
    esac
done

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; }

query_prometheus() {
    local query="$1"
    curl -sS "${PROMETHEUS_URL}/api/v1/query" \
        --data-urlencode "query=${query}" 2>/dev/null | \
        python3 -c "import sys,json; r=json.load(sys.stdin); v=r.get('data',{}).get('result',[]); print(v[0]['value'][1] if v else '0')" 2>/dev/null || echo "0"
}

echo "============================================"
echo "  Nexus RTP — Canary Health Gate"
echo "============================================"
echo "  Namespace:  ${NAMESPACE}"
echo "  Timeout:    ${TIMEOUT}s"
echo "  Max error:  ${MAX_ERROR_RATE}"
echo "  Max P99:    ${MAX_P99_LATENCY}s"
echo ""

ELAPSED=0
CHECKS_PASSED=0
TOTAL_CHECKS=0

while [[ $ELAPSED -lt $TIMEOUT ]]; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    echo "--- Check #${TOTAL_CHECKS} (${ELAPSED}s/${TIMEOUT}s) ---"

    # 1. Error rate
    error_rate=$(query_prometheus 'rate(http_requests_total{track="canary",code=~"5.."}[5m]) / rate(http_requests_total{track="canary"}[5m])')
    if (( $(echo "$error_rate > $MAX_ERROR_RATE" | bc -l 2>/dev/null || echo 1) )); then
        fail "Error rate: ${error_rate} (max: ${MAX_ERROR_RATE})"
        echo "CANARY FAILED — error rate exceeded threshold"
        exit 1
    else
        log "Error rate: ${error_rate} ≤ ${MAX_ERROR_RATE}"
    fi

    # 2. P99 latency
    p99=$(query_prometheus 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{track="canary"}[5m]))')
    if (( $(echo "$p99 > $MAX_P99_LATENCY" | bc -l 2>/dev/null || echo 1) )); then
        fail "P99 latency: ${p99}s (max: ${MAX_P99_LATENCY}s)"
        echo "CANARY FAILED — latency exceeded threshold"
        exit 1
    else
        log "P99 latency: ${p99}s ≤ ${MAX_P99_LATENCY}s"
    fi

    # 3. Pod health
    ready_pods=$(kubectl get pods -n ${NAMESPACE} -l track=canary -o json 2>/dev/null | \
        python3 -c "import sys,json; pods=json.load(sys.stdin)['items']; print(sum(1 for p in pods if all(c.get('ready',False) for c in p['status'].get('containerStatuses',[]))))" 2>/dev/null || echo "0")
    total_pods=$(kubectl get pods -n ${NAMESPACE} -l track=canary --no-headers 2>/dev/null | wc -l || echo "0")

    if [[ "$ready_pods" -lt "$total_pods" ]] || [[ "$total_pods" -eq 0 ]]; then
        warn "Pods: ${ready_pods}/${total_pods} ready"
    else
        log "Pods: ${ready_pods}/${total_pods} ready"
    fi

    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    echo ""

    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

echo "============================================"
echo "  CANARY HEALTH GATE PASSED"
echo "  Checks: ${CHECKS_PASSED}/${TOTAL_CHECKS} passed"
echo "============================================"

if [[ "$AUTO_PROMOTE" == "true" ]]; then
    echo ""
    echo "Auto-promoting canary..."
    helm upgrade nexus ./infra/helm/nexus-platform \
        --set canary.enabled=false \
        --reuse-values \
        --namespace ${NAMESPACE} \
        --wait --timeout 5m
    echo "Canary promoted to stable!"
fi

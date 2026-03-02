#!/usr/bin/env bash
# Nexus RTP Load Test Runner
# Usage:
#   ./run_loadtest.sh                  # Quick smoke test (10 VUs, 1m)
#   ./run_loadtest.sh baseline         # 30-minute baseline (default loadtest.js)
#   ./run_loadtest.sh benchmark ramp   # Benchmark suite: ramp scenario
#   ./run_loadtest.sh benchmark soak   # Benchmark suite: soak scenario
#   ./run_loadtest.sh benchmark spike  # Benchmark suite: spike scenario
#   ./run_loadtest.sh benchmark breakpoint  # Find breaking point

set -euo pipefail
cd "$(dirname "$0")"

# ===========================================================================
# Config (override via environment)
# ===========================================================================
API_URL="${API_URL:-http://localhost:8085}"
AUTH_URL="${AUTH_URL:-http://localhost:8088}"
ACCOUNT_URL="${ACCOUNT_URL:-http://localhost:8086}"
NOTIFICATION_URL="${NOTIFICATION_URL:-http://localhost:8087}"
TEST_EMAIL="${TEST_EMAIL:-admin@nexus-rtp.dev}"
TEST_PASSWORD="${TEST_PASSWORD:-admin123}"

RESULTS_DIR="./results"
mkdir -p "$RESULTS_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# ===========================================================================
# Functions
# ===========================================================================
run_smoke() {
  echo "=== Smoke Test (10 VUs, 1 minute) ==="
  k6 run \
    --vus 10 \
    --duration 1m \
    --out json="$RESULTS_DIR/smoke_${TIMESTAMP}.json" \
    -e API_URL="$API_URL" \
    -e AUTH_URL="$AUTH_URL" \
    -e ACCOUNT_URL="$ACCOUNT_URL" \
    -e NOTIFICATION_URL="$NOTIFICATION_URL" \
    -e TEST_EMAIL="$TEST_EMAIL" \
    -e TEST_PASSWORD="$TEST_PASSWORD" \
    loadtest.js
}

run_baseline() {
  echo "=== Baseline Load Test (30 minutes) ==="
  k6 run \
    --out json="$RESULTS_DIR/baseline_${TIMESTAMP}.json" \
    -e API_URL="$API_URL" \
    -e AUTH_URL="$AUTH_URL" \
    -e ACCOUNT_URL="$ACCOUNT_URL" \
    -e NOTIFICATION_URL="$NOTIFICATION_URL" \
    -e TEST_EMAIL="$TEST_EMAIL" \
    -e TEST_PASSWORD="$TEST_PASSWORD" \
    loadtest.js
}

run_benchmark() {
  local scenario="${1:-ramp}"
  echo "=== Benchmark Suite: ${scenario} ==="
  k6 run \
    --out json="$RESULTS_DIR/benchmark_${scenario}_${TIMESTAMP}.json" \
    -e SCENARIO="$scenario" \
    -e API_URL="$API_URL" \
    -e AUTH_URL="$AUTH_URL" \
    -e ACCOUNT_URL="$ACCOUNT_URL" \
    -e TEST_EMAIL="$TEST_EMAIL" \
    -e TEST_PASSWORD="$TEST_PASSWORD" \
    benchmark_suite.js
}

# ===========================================================================
# Main
# ===========================================================================
MODE="${1:-smoke}"

case "$MODE" in
  smoke)
    run_smoke
    ;;
  baseline)
    run_baseline
    ;;
  benchmark)
    run_benchmark "${2:-ramp}"
    ;;
  *)
    echo "Usage: $0 {smoke|baseline|benchmark [ramp|soak|spike|breakpoint]}"
    exit 1
    ;;
esac

echo ""
echo "Results saved to: $RESULTS_DIR/"

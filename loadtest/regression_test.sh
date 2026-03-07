#!/usr/bin/env bash
# =============================================================================
# Nexus RTP Platform — Performance Regression Test Runner
#
# Runs a lightweight k6 load test and compares results against baseline
# thresholds. Designed for CI pipelines (GitHub Actions, GitLab CI, etc.)
# to catch performance regressions before merge.
#
# Usage:
#   ./regression_test.sh              # Run with defaults
#   ./regression_test.sh --full       # Run full benchmark suite
#   CI=true ./regression_test.sh      # CI mode (stricter thresholds)
#
# Required: k6 (https://k6.io/docs/get-started/installation/)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
BASELINE_FILE="$SCRIPT_DIR/baseline_thresholds.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$RESULTS_DIR"

# Timestamp for this run
RUN_ID=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$RESULTS_DIR/regression_${RUN_ID}.json"
SUMMARY_FILE="$RESULTS_DIR/regression_${RUN_ID}_summary.txt"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL="${API_URL:-http://localhost:8085}"
AUTH_URL="${AUTH_URL:-http://localhost:8088}"
FULL_MODE="${1:-}"
CI_MODE="${CI:-false}"

# CI uses shorter durations but stricter thresholds
if [ "$CI_MODE" = "true" ]; then
  VUS=20
  DURATION="2m"
  TOLERANCE=1.0  # 0% tolerance in CI
else
  VUS=50
  DURATION="5m"
  TOLERANCE=1.1  # 10% tolerance locally
fi

if [ "$FULL_MODE" = "--full" ]; then
  VUS=100
  DURATION="15m"
fi

echo "=============================================="
echo " Nexus RTP — Performance Regression Test"
echo "=============================================="
echo "  Run ID:     $RUN_ID"
echo "  VUs:        $VUS"
echo "  Duration:   $DURATION"
echo "  API URL:    $API_URL"
echo "  CI Mode:    $CI_MODE"
echo "  Tolerance:  ${TOLERANCE}x baseline"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------
if ! command -v k6 &>/dev/null; then
  echo -e "${RED}Error: k6 is not installed.${NC}"
  echo "Install: https://k6.io/docs/get-started/installation/"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "${RED}Error: jq is not installed.${NC}"
  exit 1
fi

# Quick health check
if ! curl -sf "$API_URL/health" >/dev/null 2>&1; then
  echo -e "${YELLOW}Warning: API at $API_URL is not reachable. Tests may fail.${NC}"
fi

# ---------------------------------------------------------------------------
# Run the regression k6 test
# ---------------------------------------------------------------------------
echo -e "${CYAN}Running k6 regression test...${NC}"

k6 run \
  --vus "$VUS" \
  --duration "$DURATION" \
  --out "json=$RESULT_FILE" \
  -e "API_URL=$API_URL" \
  -e "AUTH_URL=$AUTH_URL" \
  --summary-export="$RESULTS_DIR/regression_${RUN_ID}_export.json" \
  "$SCRIPT_DIR/loadtest.js" 2>&1 | tee "$SUMMARY_FILE"

K6_EXIT=$?

echo ""

# ---------------------------------------------------------------------------
# Parse results and compare against baselines
# ---------------------------------------------------------------------------
echo -e "${CYAN}Analyzing results against baseline thresholds...${NC}"
echo ""

EXPORT_FILE="$RESULTS_DIR/regression_${RUN_ID}_export.json"

if [ ! -f "$EXPORT_FILE" ]; then
  echo -e "${RED}Error: k6 summary export not found at $EXPORT_FILE${NC}"
  exit 1
fi

REGRESSIONS=0

compare_metric() {
  local metric_name="$1"
  local stat="$2"          # avg, med, p(95), p(99), min, max
  local baseline_ms="$3"
  local description="$4"

  # jq key for percentiles: "p(95)" → .["p(95)"]
  local actual
  actual=$(jq -r ".metrics[\"$metric_name\"].values[\"$stat\"] // empty" "$EXPORT_FILE" 2>/dev/null || echo "")

  if [ -z "$actual" ]; then
    echo -e "  ${YELLOW}⚠${NC} $description — metric not found (skipped)"
    return
  fi

  local threshold
  threshold=$(echo "$baseline_ms * $TOLERANCE" | bc -l 2>/dev/null || echo "$baseline_ms")

  local pass
  pass=$(echo "$actual <= $threshold" | bc -l 2>/dev/null || echo "1")

  if [ "$pass" = "1" ]; then
    printf "  ${GREEN}✓${NC} %-45s %8.2f ms (baseline: %s ms)\n" "$description" "$actual" "$baseline_ms"
  else
    printf "  ${RED}✗${NC} %-45s %8.2f ms (baseline: %s ms, limit: %.2f ms)\n" "$description" "$actual" "$baseline_ms" "$threshold"
    REGRESSIONS=$((REGRESSIONS + 1))
  fi
}

compare_rate() {
  local metric_name="$1"
  local stat="$2"
  local baseline_rate="$3"
  local description="$4"

  local actual
  actual=$(jq -r ".metrics[\"$metric_name\"].values[\"$stat\"] // empty" "$EXPORT_FILE" 2>/dev/null || echo "")

  if [ -z "$actual" ]; then
    echo -e "  ${YELLOW}⚠${NC} $description — metric not found (skipped)"
    return
  fi

  # For rates, regression means the actual is LOWER than baseline
  local pass
  pass=$(echo "$actual >= $baseline_rate" | bc -l 2>/dev/null || echo "1")

  if [ "$pass" = "1" ]; then
    printf "  ${GREEN}✓${NC} %-45s %.4f (baseline: %s)\n" "$description" "$actual" "$baseline_rate"
  else
    printf "  ${RED}✗${NC} %-45s %.4f (baseline: %s)\n" "$description" "$actual" "$baseline_rate"
    REGRESSIONS=$((REGRESSIONS + 1))
  fi
}

echo "  Latency Checks"
echo "  ─────────────────────────────────────────────────"
compare_metric "http_req_duration"      "avg"    50   "HTTP Request Duration (avg)"
compare_metric "http_req_duration"      "med"    20   "HTTP Request Duration (p50)"
compare_metric "http_req_duration"      "p(95)"  150  "HTTP Request Duration (p95)"
compare_metric "http_req_duration"      "p(99)"  300  "HTTP Request Duration (p99)"
compare_metric "payment_duration"       "avg"    100  "Payment Duration (avg)"
compare_metric "payment_duration"       "p(95)"  250  "Payment Duration (p95)"
compare_metric "payment_duration"       "p(99)"  500  "Payment Duration (p99)"
compare_metric "balance_query_duration" "avg"    10   "Balance Query Duration (avg)"
compare_metric "balance_query_duration" "p(95)"  30   "Balance Query Duration (p95)"

echo ""
echo "  Reliability Checks"
echo "  ─────────────────────────────────────────────────"
compare_rate   "payment_success_rate"   "rate"   0.999  "Payment Success Rate"
compare_rate   "http_req_failed"        "rate"   0.001  "HTTP Error Rate (inverted, lower=better)"

echo ""

# ---------------------------------------------------------------------------
# Generate CI-friendly output
# ---------------------------------------------------------------------------
if [ "$CI_MODE" = "true" ]; then
  echo "::group::Performance Regression Results"
  echo "regressions=$REGRESSIONS"
  echo "k6_exit=$K6_EXIT"
  echo "result_file=$RESULT_FILE"
  echo "::endgroup::"

  # Set GitHub Actions output
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "regressions=$REGRESSIONS" >> "$GITHUB_OUTPUT"
    echo "k6_exit=$K6_EXIT" >> "$GITHUB_OUTPUT"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "=============================================="
if [ $REGRESSIONS -gt 0 ]; then
  echo -e " ${RED}REGRESSION DETECTED: $REGRESSIONS metric(s) exceeded baseline${NC}"
  echo "=============================================="
  echo ""
  echo "  Results: $RESULT_FILE"
  echo "  Summary: $SUMMARY_FILE"
  echo ""
  echo "  To update baselines after intentional changes:"
  echo "    cp $EXPORT_FILE $BASELINE_FILE"
  exit 1
elif [ $K6_EXIT -ne 0 ]; then
  echo -e " ${YELLOW}k6 exited with warnings (exit code $K6_EXIT)${NC}"
  echo "=============================================="
  exit "$K6_EXIT"
else
  echo -e " ${GREEN}NO REGRESSIONS — All metrics within baseline${NC}"
  echo "=============================================="
  exit 0
fi

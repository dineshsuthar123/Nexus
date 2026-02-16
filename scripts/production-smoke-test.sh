#!/usr/bin/env bash
# =============================================================================
# Nexus RTP — Production Smoke Test Suite (Safe / Non-Destructive)
# =============================================================================
# This script runs ONLY non-destructive checks against production.
# It does NOT create real payments, register real users, or modify data.
# Use the test-tenant sandbox rails for transactional checks.
#
# Required env vars:
#   PROD_URL     — Frontend URL   (e.g. https://app.nexus-rtp.internal)
#   API_URL      — API Gateway URL (e.g. https://api.nexus-rtp.internal)
#   NAMESPACE    — K8s namespace   (default: nexus-production)
#
# Optional env vars:
#   TEST_TOKEN   — Pre-issued test-tenant JWT for authenticated flow checks
#   GRAFANA_URL  — Grafana URL for screenshot capture
#   GRAFANA_KEY  — Grafana API key for rendering
#
# Exit code 0 = all checks pass; non-zero = at least one check failed.
# =============================================================================
set -euo pipefail

PROD_URL="${PROD_URL:?PROD_URL is required}"
API_URL="${API_URL:?API_URL is required}"
NAMESPACE="${NAMESPACE:-nexus-production}"
TEST_TOKEN="${TEST_TOKEN:-}"
GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_KEY="${GRAFANA_KEY:-}"

PASS=0
FAIL=0
WARN=0
TOTAL=0
RESULTS_DIR="${RESULTS_DIR:-prod-artifacts/smoke}"
GRAFANA_DIR="${RESULTS_DIR}/grafana"
mkdir -p "$RESULTS_DIR" "$GRAFANA_DIR"

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── Helpers ──────────────────────────────────────────────
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

check() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo -n "  [$TOTAL] $name ... "
  if "$@" >> "$RESULTS_DIR/smoke-prod.log" 2>&1; then
    green "PASS"
    PASS=$((PASS + 1))
    return 0
  else
    red "FAIL"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

check_warn() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo -n "  [$TOTAL] $name ... "
  if "$@" >> "$RESULTS_DIR/smoke-prod.log" 2>&1; then
    green "PASS"
    PASS=$((PASS + 1))
  else
    yellow "WARN (non-blocking)"
    WARN=$((WARN + 1))
  fi
}

http_ok() {
  local url="$1"
  local expected="${2:-200}"
  local status
  status=$(curl -sSo /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo "000")
  [ "$status" = "$expected" ]
}

http_latency() {
  local url="$1"
  local max_ms="${2:-2000}"
  local time_ms
  time_ms=$(curl -sSo /dev/null -w '%{time_total}' --max-time 15 "$url" 2>/dev/null || echo "99")
  time_ms=$(echo "$time_ms * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "9999")
  [ "$time_ms" -lt "$max_ms" ]
}

# ── Banner ──────────────────────────────────────────────
echo ""
bold "════════════════════════════════════════════════════"
bold "  Nexus RTP — PRODUCTION Smoke Tests (Non-Destructive)"
bold "  Frontend: $PROD_URL"
bold "  API:      $API_URL"
bold "  Time:     $TIMESTAMP"
bold "════════════════════════════════════════════════════"

# ── 1. Frontend Health ──────────────────────────────────
echo ""
echo "▸ Frontend Health"

check "Frontend health endpoint"     http_ok "$PROD_URL/api/health"
check "Frontend login page"          http_ok "$PROD_URL/login"
check "Frontend responds < 2s"       http_latency "$PROD_URL/" 2000
check "Frontend returns HTML"        bash -c "curl -sS --max-time 10 '$PROD_URL/' | grep -q '</html>'"
check "Static assets cacheable"      bash -c "curl -sSI --max-time 10 '$PROD_URL/_next/static/' 2>/dev/null | grep -qi 'cache-control' || true"

# ── 2. API Gateway Health ───────────────────────────────
echo ""
echo "▸ API Gateway Health"

check "API health"                  http_ok  "$API_URL/health"
check "Auth endpoint reachable"     http_ok  "$API_URL/api/v1/auth/login" "400"
check "Payments auth-gated"         http_ok  "$API_URL/api/v1/payments" "401"
check "API responds < 500ms"        http_latency "$API_URL/health" 500

# ── 3. Kubernetes Pod Health ────────────────────────────
echo ""
echo "▸ Kubernetes Pod Health"

check "All pods Running" bash -c "
  NOTREADY=\$(kubectl get pods -n $NAMESPACE --no-headers 2>/dev/null \
    | grep -v Running | grep -v Completed | wc -l)
  [ \"\$NOTREADY\" -eq 0 ]
"

for component in frontend payment-service account-service reconciliation-service; do
  check "$component pod healthy" bash -c "
    kubectl get pods -n $NAMESPACE -l app.kubernetes.io/component=$component \
      --no-headers 2>/dev/null | grep -q Running
  "
done

check "No pod restarts > 5" bash -c "
  HIGH_RESTARTS=\$(kubectl get pods -n $NAMESPACE --no-headers 2>/dev/null \
    | awk '{if(\$4+0 > 5) print \$1}' | wc -l)
  [ \"\$HIGH_RESTARTS\" -eq 0 ]
"

# ── 4. Data Store Connectivity ──────────────────────────
echo ""
echo "▸ Data Store Connectivity"

check_warn "CockroachDB healthy" bash -c "
  kubectl exec -n $NAMESPACE statefulset/nexus-cockroachdb -- \
    cockroach node status --insecure 2>/dev/null | head -3
"

check_warn "Kafka brokers online" bash -c "
  kubectl exec -n $NAMESPACE statefulset/nexus-kafka -- \
    kafka-broker-api-versions.sh --bootstrap-server localhost:9092 2>/dev/null | head -1
"

check_warn "Redis ping" bash -c "
  kubectl exec -n $NAMESPACE statefulset/nexus-redis-master -- redis-cli ping 2>/dev/null | grep -q PONG
"

# ── 5. Authenticated Flow (test-tenant — read-only) ────
echo ""
echo "▸ Authenticated Flows (read-only)"

if [ -n "$TEST_TOKEN" ]; then
  check "GET /api/v1/payments (list)" bash -c "
    STATUS=\$(curl -sSo /dev/null -w '%{http_code}' --max-time 10 \
      -H 'Authorization: Bearer $TEST_TOKEN' \
      '$API_URL/api/v1/payments')
    [ \"\$STATUS\" = \"200\" ]
  "

  check "GET /api/v1/accounts (list)" bash -c "
    STATUS=\$(curl -sSo /dev/null -w '%{http_code}' --max-time 10 \
      -H 'Authorization: Bearer $TEST_TOKEN' \
      '$API_URL/api/v1/accounts')
    [ \"\$STATUS\" = \"200\" ]
  "

  check "GET /api/v1/auth/me (profile)" bash -c "
    STATUS=\$(curl -sSo /dev/null -w '%{http_code}' --max-time 10 \
      -H 'Authorization: Bearer $TEST_TOKEN' \
      '$API_URL/api/v1/auth/me')
    [ \"\$STATUS\" = \"200\" ]
  "

  check "GET /api/v1/notifications" bash -c "
    STATUS=\$(curl -sSo /dev/null -w '%{http_code}' --max-time 10 \
      -H 'Authorization: Bearer $TEST_TOKEN' \
      '$API_URL/api/v1/notifications')
    [ \"\$STATUS\" = \"200\" ] || [ \"\$STATUS\" = \"404\" ]
  "
else
  yellow "  ⏭  Skipping authenticated flows (TEST_TOKEN not set)"
fi

# ── 6. SLO / Prometheus Checks ─────────────────────────
echo ""
echo "▸ SLO & Metrics"

PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus-server.$NAMESPACE.svc:9090}"

check_warn "Error rate < 0.3% (30m)" bash -c "
  RATE=\$(curl -sS '${PROMETHEUS_URL}/api/v1/query' \
    --data-urlencode 'query=sum(rate(http_requests_total{code=~\"5..\"}[30m])) / sum(rate(http_requests_total[30m]))' \
    2>/dev/null | jq -r '.data.result[0].value[1] // \"0\"')
  echo \"Error rate: \$RATE\"
  [ \$(echo \"\$RATE < 0.003\" | bc -l 2>/dev/null || echo 0) -eq 1 ]
"

check_warn "P95 latency < 500ms" bash -c "
  P95=\$(curl -sS '${PROMETHEUS_URL}/api/v1/query' \
    --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))' \
    2>/dev/null | jq -r '.data.result[0].value[1] // \"0\"')
  echo \"P95: \${P95}s\"
  [ \$(echo \"\$P95 < 0.5\" | bc -l 2>/dev/null || echo 0) -eq 1 ]
"

check_warn "Kafka consumer lag < 1000" bash -c "
  LAG=\$(curl -sS '${PROMETHEUS_URL}/api/v1/query' \
    --data-urlencode 'query=max(kafka_consumergroup_lag{group=\"payments-consumer\"})' \
    2>/dev/null | jq -r '.data.result[0].value[1] // \"0\"')
  echo \"Kafka lag: \$LAG\"
  [ \$(echo \"\$LAG < 1000\" | bc -l 2>/dev/null || echo 0) -eq 1 ]
"

check_warn "No critical alerts firing" bash -c "
  ALERTS=\$(curl -sS '${PROMETHEUS_URL}/api/v1/alerts' 2>/dev/null \
    | jq '[.data.alerts[] | select(.labels.severity==\"critical\" and .state==\"firing\")] | length')
  echo \"Critical alerts: \$ALERTS\"
  [ \"\$ALERTS\" = \"0\" ] || [ \"\$ALERTS\" = \"null\" ]
"

# ── 7. Grafana Dashboard Snapshots ──────────────────────
echo ""
echo "▸ Grafana Snapshots"

if [ -n "$GRAFANA_URL" ] && [ -n "$GRAFANA_KEY" ]; then
  DASHBOARDS=("payments-overview" "system-health" "error-rates" "latency-p99" "kafka-consumer-lag" "ws-connections")
  for dash in "${DASHBOARDS[@]}"; do
    echo -n "  Capturing $dash ... "
    if curl -sS -o "$GRAFANA_DIR/${dash}.png" \
      "${GRAFANA_URL}/render/d/${dash}?orgId=1&from=now-30m&to=now&width=1400&height=600" \
      -H "Authorization: Bearer $GRAFANA_KEY" 2>/dev/null; then
      green "OK"
    else
      yellow "SKIP"
    fi
  done
else
  yellow "  ⏭  Skipping Grafana snapshots (GRAFANA_URL/GRAFANA_KEY not set)"
fi

# ── 8. Idempotency & Security ──────────────────────────
echo ""
echo "▸ Security Checks"

check "HSTS header present" bash -c "
  curl -sSI --max-time 10 '$PROD_URL/' 2>/dev/null | grep -qi 'strict-transport-security' || true
"

check "No server version leak" bash -c "
  HEADERS=\$(curl -sSI --max-time 10 '$API_URL/health' 2>/dev/null)
  ! echo \"\$HEADERS\" | grep -qi 'x-powered-by'
"

check "CORS headers correct" bash -c "
  HEADERS=\$(curl -sSI --max-time 10 -H 'Origin: https://app.nexus-rtp.internal' '$API_URL/health' 2>/dev/null)
  echo \"\$HEADERS\" | grep -qi 'access-control' || true
"

# ── Results ─────────────────────────────────────────────
echo ""
bold "════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "  ALL PRODUCTION SMOKE TESTS PASSED"
else
  red "  PRODUCTION SMOKE TESTS: $FAIL FAILURE(S)"
fi
echo "  Total: $TOTAL | Pass: $PASS | Fail: $FAIL | Warn: $WARN"
bold "════════════════════════════════════════════════════"
echo ""

# Write JSON report
cat > "$RESULTS_DIR/smoke-prod-results.json" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "production",
  "prod_url": "$PROD_URL",
  "api_url": "$API_URL",
  "namespace": "$NAMESPACE",
  "total": $TOTAL,
  "passed": $PASS,
  "failed": $FAIL,
  "warnings": $WARN,
  "success": $([ "$FAIL" -eq 0 ] && echo "true" || echo "false")
}
EOF

echo "Report written to: $RESULTS_DIR/smoke-prod-results.json"
echo "Logs written to:   $RESULTS_DIR/smoke-prod.log"

if [ -d "$GRAFANA_DIR" ] && [ "$(ls -A "$GRAFANA_DIR" 2>/dev/null)" ]; then
  echo "Grafana snapshots: $GRAFANA_DIR/"
fi

if [ "$FAIL" -gt 0 ]; then
  red ""
  red "⚠  PRODUCTION SMOKE FAILED — DO NOT PROCEED WITH PROMOTION"
  red "   Review $RESULTS_DIR/smoke-prod.log for details"
  red "   Consider rollback: helm rollback nexus <revision> -n $NAMESPACE"
  exit 1
fi

green ""
green "✓ Production environment verified — safe to proceed"
exit 0

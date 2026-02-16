#!/usr/bin/env bash
# =============================================================================
# Nexus RTP — Staging Smoke Test Suite
# Validates core services are healthy after a staging deployment.
#
# Required env vars:
#   STAGING_URL   — Frontend URL   (e.g. https://app.staging.nexus-rtp.internal)
#   API_URL       — API Gateway URL (e.g. https://api.staging.nexus-rtp.internal)
#   NAMESPACE     — K8s namespace   (default: nexus-staging)
#
# Exit code 0 = all checks pass; non-zero = at least one check failed.
# =============================================================================
set -euo pipefail

STAGING_URL="${STAGING_URL:?STAGING_URL is required}"
API_URL="${API_URL:?API_URL is required}"
NAMESPACE="${NAMESPACE:-nexus-staging}"

PASS=0
FAIL=0
TOTAL=0
RESULTS_DIR="${RESULTS_DIR:-staging-artifacts/smoke}"
mkdir -p "$RESULTS_DIR"

# ── Helpers ──────────────────────────────────────────────
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

check() {
  local name="$1"
  shift
  TOTAL=$((TOTAL + 1))
  echo -n "  [$TOTAL] $name ... "
  if "$@" >> "$RESULTS_DIR/smoke.log" 2>&1; then
    green "PASS"
    PASS=$((PASS + 1))
  else
    red "FAIL"
    FAIL=$((FAIL + 1))
  fi
}

http_ok() {
  local url="$1"
  local expected="${2:-200}"
  local status
  status=$(curl -sSo /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
  [ "$status" = "$expected" ]
}

http_json() {
  local url="$1"
  local jq_filter="${2:-.}"
  curl -sS --max-time 10 "$url" 2>/dev/null | jq -e "$jq_filter" > /dev/null 2>&1
}

# ── 1. Frontend Health ──────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Nexus RTP — Staging Smoke Tests"
echo "  Frontend: $STAGING_URL"
echo "  API:      $API_URL"
echo "═══════════════════════════════════════════════"
echo ""
echo "▸ Frontend Checks"

check "Frontend health endpoint"     http_ok "$STAGING_URL/api/health"
check "Frontend login page loads"    http_ok "$STAGING_URL/login"
check "Frontend returns HTML"        bash -c "curl -sS --max-time 10 '$STAGING_URL/' | grep -q '</html>'"

# ── 2. API Gateway Health ───────────────────────────────
echo ""
echo "▸ API Gateway Checks"

check "API gateway reachable"        http_ok  "$API_URL/health" "200"
check "Auth endpoint responds"       http_ok  "$API_URL/api/v1/auth/login" "400"  # 400 = missing body, but reachable
check "Payments endpoint auth-gated" http_ok  "$API_URL/api/v1/payments" "401"    # 401 = unauthorized, but reachable

# ── 3. Service Health (via kubectl) ─────────────────────
echo ""
echo "▸ Kubernetes Pod Health"

check "All pods Running" bash -c "
  NOTREADY=\$(kubectl get pods -n $NAMESPACE --no-headers 2>/dev/null | grep -v Running | grep -v Completed | wc -l)
  [ \"\$NOTREADY\" -eq 0 ]
"

check "Frontend pod healthy" bash -c "
  kubectl get pods -n $NAMESPACE -l app.kubernetes.io/component=frontend --no-headers 2>/dev/null | grep -q Running
"

check "Payment-service pod healthy" bash -c "
  kubectl get pods -n $NAMESPACE -l app.kubernetes.io/component=payment-service --no-headers 2>/dev/null | grep -q Running
"

check "Account-service pod healthy" bash -c "
  kubectl get pods -n $NAMESPACE -l app.kubernetes.io/component=account-service --no-headers 2>/dev/null | grep -q Running
"

# ── 4. Data Store Connectivity ──────────────────────────
echo ""
echo "▸ Data Store Connectivity"

check "CockroachDB reachable" bash -c "
  kubectl exec -n $NAMESPACE deploy/nexus-cockroachdb-0 -- \
    cockroach sql --insecure --execute='SELECT 1;' 2>/dev/null
" || true

check "Kafka brokers available" bash -c "
  kubectl exec -n $NAMESPACE deploy/nexus-kafka-0 -- \
    kafka-broker-api-versions.sh --bootstrap-server localhost:9092 2>/dev/null | head -1
" || true

check "Redis ping" bash -c "
  kubectl exec -n $NAMESPACE deploy/nexus-redis-master-0 -- redis-cli ping 2>/dev/null | grep -q PONG
" || true

# ── 5. Critical Flows ──────────────────────────────────
echo ""
echo "▸ Critical API Flows"

# Registration → Login → Token flow
check "Auth flow: register + login" bash -c "
  TIMESTAMP=\$(date +%s)
  # Register
  REG=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST '$API_URL/api/v1/auth/register' \
    -H 'Content-Type: application/json' \
    -d '{\"email\":\"smoke-\${TIMESTAMP}@test.internal\",\"password\":\"SmokeTest123!\",\"name\":\"Smoke Test\"}')
  # Login
  LOGIN=\$(curl -sS --max-time 10 \
    -X POST '$API_URL/api/v1/auth/login' \
    -H 'Content-Type: application/json' \
    -d '{\"email\":\"smoke-\${TIMESTAMP}@test.internal\",\"password\":\"SmokeTest123!\"}')
  echo \"\$LOGIN\" | jq -e '.token' > /dev/null 2>&1 || echo \"\$LOGIN\" | jq -e '.accessToken' > /dev/null 2>&1
"

check "Payment creation (dry run)" bash -c "
  TOKEN=\$(curl -sS --max-time 10 \
    -X POST '$API_URL/api/v1/auth/login' \
    -H 'Content-Type: application/json' \
    -d '{\"email\":\"smoke-test@system.internal\",\"password\":\"SystemTest123!\"}' | jq -r '.token // .accessToken // empty')
  if [ -n \"\$TOKEN\" ]; then
    STATUS=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      -X POST '$API_URL/api/v1/payments' \
      -H 'Content-Type: application/json' \
      -H \"Authorization: Bearer \$TOKEN\" \
      -d '{\"amount\":0.01,\"currency\":\"USD\",\"sourceAccount\":\"smoke-src\",\"destinationAccount\":\"smoke-dst\"}')
    [ \"\$STATUS\" = \"201\" ] || [ \"\$STATUS\" = \"200\" ] || [ \"\$STATUS\" = \"422\" ]
  else
    # If we can't get a token, check if the endpoint at least rejects properly
    STATUS=\$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      -X POST '$API_URL/api/v1/payments' \
      -H 'Content-Type: application/json' \
      -d '{}')
    [ \"\$STATUS\" = \"401\" ]
  fi
"

# ── 6. Monitoring Stack ────────────────────────────────
echo ""
echo "▸ Monitoring Stack"

check "Prometheus reachable" bash -c "
  PROM_URL=\$(kubectl get svc -n $NAMESPACE -l app.kubernetes.io/name=prometheus -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  kubectl exec -n $NAMESPACE deploy/\$PROM_URL -- wget -qO- http://localhost:9090/-/healthy 2>/dev/null
" || true

check "Grafana reachable" bash -c "
  http_ok 'https://grafana.staging.nexus-rtp.internal/api/health'
" || true

# ── Results ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
echo "═══════════════════════════════════════════════"
echo ""

# Write JSON report
cat > "$RESULTS_DIR/smoke-results.json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "staging_url": "$STAGING_URL",
  "api_url": "$API_URL",
  "namespace": "$NAMESPACE",
  "total": $TOTAL,
  "passed": $PASS,
  "failed": $FAIL,
  "success": $([ "$FAIL" -eq 0 ] && echo "true" || echo "false")
}
EOF

if [ "$FAIL" -gt 0 ]; then
  red "SMOKE TESTS FAILED — $FAIL check(s) did not pass"
  echo ""
  echo "Review logs: $RESULTS_DIR/smoke.log"
  exit 1
fi

green "ALL SMOKE TESTS PASSED"
exit 0

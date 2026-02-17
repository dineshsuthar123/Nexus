#!/usr/bin/env bash
# =============================================================================
# Nexus RTP — Staging Dry-Run Validation (Step A)
# =============================================================================
# Runs the full staging deploy pipeline locally, including:
#   1. Helm deploy with staging values + canary enabled
#   2. Smoke tests
#   3. Canary promotion simulation (5% → 25% → 100%)
#   4. Automated rollback verification
#   5. Artifact collection (Playwright, Grafana, smoke results)
#
# This script is the gatekeeper for proceeding to production.
#
# Required env vars:
#   STAGING_URL   — Frontend URL   (e.g. https://app.staging.nexus-rtp.internal)
#   API_URL       — API Gateway URL (e.g. https://api.staging.nexus-rtp.internal)
#   NAMESPACE     — K8s namespace   (default: nexus-staging)
#
# Optional:
#   HELM_CHART    — Path to Helm chart (default: infra/helm/nexus-platform)
#   VERSION       — Image tag (default: staging-<git-sha>)
#   SKIP_CANARY   — Set to "true" to skip canary promotion test
#
# Exit code 0 = staging dry run passed, safe to proceed to production.
# =============================================================================
set -euo pipefail

STAGING_URL="${STAGING_URL:?STAGING_URL is required}"
API_URL="${API_URL:?API_URL is required}"
NAMESPACE="${NAMESPACE:-nexus-staging}"
HELM_CHART="${HELM_CHART:-infra/helm/nexus-platform}"
VERSION="${VERSION:-staging-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
SKIP_CANARY="${SKIP_CANARY:-false}"

RESULTS_DIR="staging-dry-run-artifacts"
STEP=0
PASS=0
FAIL=0

mkdir -p "$RESULTS_DIR"

# ── Helpers ──────────────────────────────────────────────
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

step() {
  STEP=$((STEP + 1))
  echo ""
  bold "═══════════════════════════════════════════════"
  bold "  Step $STEP: $1"
  bold "═══════════════════════════════════════════════"
}

pass() { green "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { red   "  ✗ $1"; FAIL=$((FAIL + 1)); }

START_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo ""
bold "╔═══════════════════════════════════════════════════╗"
bold "║   Nexus RTP — Staging Dry-Run Validation          ║"
bold "║   Step A of Production Cutover Plan                ║"
bold "╠═══════════════════════════════════════════════════╣"
bold "║   Frontend: $STAGING_URL"
bold "║   API:      $API_URL"
bold "║   Version:  $VERSION"
bold "║   Time:     $START_TIME"
bold "╚═══════════════════════════════════════════════════╝"

# ── Step 1: Deploy to staging ────────────────────────────
step "Deploy to staging with staging values"

echo "  Deploying $VERSION to $NAMESPACE..."
if helm upgrade --install nexus "$HELM_CHART" \
  -f "$HELM_CHART/values.yaml" \
  -f "$HELM_CHART/values.staging.yaml" \
  --set frontend.image.tag="$VERSION" \
  --set paymentService.image.tag="$VERSION" \
  --set accountService.image.tag="$VERSION" \
  --set reconciliationService.image.tag="$VERSION" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --wait --timeout 10m 2>&1 | tee "$RESULTS_DIR/helm-deploy.log"; then
  pass "Helm deploy succeeded"
else
  fail "Helm deploy failed"
  red "STAGING DRY RUN ABORTED — deploy failed"
  exit 1
fi

# ── Step 2: Smoke tests ─────────────────────────────────
step "Run staging smoke tests"

if STAGING_URL="$STAGING_URL" \
   API_URL="$API_URL" \
   NAMESPACE="$NAMESPACE" \
   RESULTS_DIR="$RESULTS_DIR/smoke" \
   ./scripts/staging-smoke-test.sh 2>&1 | tee "$RESULTS_DIR/smoke-test.log"; then
  pass "Staging smoke tests passed"
else
  fail "Staging smoke tests failed"
fi

# ── Step 3: Canary promotion simulation ──────────────────
if [ "$SKIP_CANARY" != "true" ]; then
  step "Canary promotion simulation (5% → 25% → 100%)"

  # Deploy canary at 5%
  echo "  Deploying canary at 5%..."
  if helm upgrade --install nexus "$HELM_CHART" \
    -f "$HELM_CHART/values.yaml" \
    -f "$HELM_CHART/values.staging.yaml" \
    --set canary.enabled=true \
    --set canary.weight=5 \
    --set frontend.image.tag="$VERSION" \
    --set paymentService.image.tag="$VERSION" \
    --namespace "$NAMESPACE" \
    --wait --timeout 5m 2>&1 | tee -a "$RESULTS_DIR/canary.log"; then
    pass "Canary deploy at 5% succeeded"
  else
    fail "Canary deploy at 5% failed"
  fi

  # Verify canary pods
  echo "  Verifying canary pods..."
  kubectl get pods -n "$NAMESPACE" -l track=canary --no-headers 2>/dev/null | tee -a "$RESULTS_DIR/canary.log"
  CANARY_PODS=$(kubectl get pods -n "$NAMESPACE" -l track=canary --no-headers 2>/dev/null | grep Running | wc -l)
  if [ "$CANARY_PODS" -gt 0 ]; then
    pass "Canary pods running: $CANARY_PODS"
  else
    fail "No canary pods running"
  fi

  # Promote to 25%
  echo "  Promoting canary to 25%..."
  if helm upgrade nexus "$HELM_CHART" \
    -f "$HELM_CHART/values.yaml" \
    -f "$HELM_CHART/values.staging.yaml" \
    --set canary.enabled=true \
    --set canary.weight=25 \
    --namespace "$NAMESPACE" \
    --wait --timeout 5m 2>&1 | tee -a "$RESULTS_DIR/canary.log"; then
    pass "Canary promote to 25% succeeded"
  else
    fail "Canary promote to 25% failed"
  fi

  # Promote to 100% (disable canary)
  echo "  Promoting to 100% (full rollout)..."
  if helm upgrade nexus "$HELM_CHART" \
    -f "$HELM_CHART/values.yaml" \
    -f "$HELM_CHART/values.staging.yaml" \
    --set canary.enabled=false \
    --set frontend.image.tag="$VERSION" \
    --set paymentService.image.tag="$VERSION" \
    --namespace "$NAMESPACE" \
    --wait --timeout 5m 2>&1 | tee -a "$RESULTS_DIR/canary.log"; then
    pass "Full promotion to 100% succeeded"
  else
    fail "Full promotion to 100% failed"
  fi
else
  echo ""
  yellow "  ⏭  Canary promotion test skipped (SKIP_CANARY=true)"
fi

# ── Step 4: Rollback verification ────────────────────────
step "Rollback verification"

CURRENT_REV=$(helm history nexus -n "$NAMESPACE" --max 1 2>/dev/null | tail -1 | awk '{print $1}')
echo "  Current Helm revision: $CURRENT_REV"

if [ -n "$CURRENT_REV" ] && [ "$CURRENT_REV" -gt 1 ] 2>/dev/null; then
  PREV_REV=$((CURRENT_REV - 1))
  echo "  Rolling back to revision $PREV_REV..."
  if helm rollback nexus "$PREV_REV" -n "$NAMESPACE" --wait --timeout 5m 2>&1 | tee "$RESULTS_DIR/rollback.log"; then
    pass "Rollback to revision $PREV_REV succeeded"

    # Re-deploy current version after rollback test
    echo "  Re-deploying current version after rollback test..."
    helm upgrade --install nexus "$HELM_CHART" \
      -f "$HELM_CHART/values.yaml" \
      -f "$HELM_CHART/values.staging.yaml" \
      --set frontend.image.tag="$VERSION" \
      --set paymentService.image.tag="$VERSION" \
      --namespace "$NAMESPACE" \
      --wait --timeout 5m 2>&1 | tee -a "$RESULTS_DIR/rollback.log"
    pass "Re-deploy after rollback succeeded"
  else
    fail "Rollback failed"
  fi
else
  yellow "  ⏭  Skipping rollback test (no previous revision)"
fi

# ── Step 5: E2E Playwright (if available) ────────────────
step "E2E Playwright tests against staging"

if command -v pnpm &>/dev/null && [ -d "frontend" ]; then
  echo "  Running Playwright E2E..."
  cd frontend
  if PLAYWRIGHT_BASE_URL="$STAGING_URL" \
     API_BASE_URL="$API_URL" \
     CI=true \
     pnpm --filter @nexus/web test:e2e 2>&1 | tee "../$RESULTS_DIR/playwright.log"; then
    pass "Playwright E2E passed"
  else
    fail "Playwright E2E failed"
  fi
  cd ..

  # Copy Playwright report
  if [ -d "frontend/apps/web/playwright-report" ]; then
    cp -r frontend/apps/web/playwright-report "$RESULTS_DIR/" 2>/dev/null || true
    pass "Playwright HTML report collected"
  fi
else
  yellow "  ⏭  Skipping Playwright (pnpm or frontend/ not available)"
fi

# ── Results ──────────────────────────────────────────────
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TOTAL=$((PASS + FAIL))

echo ""
bold "╔═══════════════════════════════════════════════════╗"
if [ "$FAIL" -eq 0 ]; then
  bold "║   ✓ STAGING DRY-RUN PASSED                        ║"
  bold "║   Safe to proceed to production (Step B)           ║"
else
  bold "║   ✗ STAGING DRY-RUN FAILED                        ║"
  bold "║   DO NOT proceed to production                     ║"
fi
bold "╠═══════════════════════════════════════════════════╣"
bold "║   Total: $TOTAL | Pass: $PASS | Fail: $FAIL"
bold "║   Started: $START_TIME"
bold "║   Ended:   $END_TIME"
bold "╚═══════════════════════════════════════════════════╝"

# Write JSON summary
cat > "$RESULTS_DIR/dry-run-summary.json" <<EOF
{
  "type": "staging-dry-run",
  "version": "$VERSION",
  "start_time": "$START_TIME",
  "end_time": "$END_TIME",
  "namespace": "$NAMESPACE",
  "total_checks": $TOTAL,
  "passed": $PASS,
  "failed": $FAIL,
  "success": $([ "$FAIL" -eq 0 ] && echo "true" || echo "false"),
  "artifacts_dir": "$RESULTS_DIR",
  "smoke_results": "$RESULTS_DIR/smoke/smoke-results.json",
  "canary_log": "$RESULTS_DIR/canary.log",
  "rollback_log": "$RESULTS_DIR/rollback.log",
  "playwright_report": "$RESULTS_DIR/playwright-report/index.html"
}
EOF

echo ""
echo "Artifacts: $RESULTS_DIR/"
echo "Summary:   $RESULTS_DIR/dry-run-summary.json"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0

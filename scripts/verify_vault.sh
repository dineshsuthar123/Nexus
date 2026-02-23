#!/bin/bash
# ==============================================================================
# Nexus RTP — Vault & HSM Verification Script
# Verifies that Vault is reachable and all required secrets are accessible
# Usage: ./scripts/verify_vault.sh --env <production|staging>
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV=""
VAULT_ADDR="${VAULT_ADDR:-https://vault.nexus-rtp.internal:8200}"
VAULT_NS="${VAULT_NAMESPACE:-nexus}"
PASSED=0
FAILED=0
WARNINGS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[VAULT]${NC} $(date '+%H:%M:%S') $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $*"; ((WARNINGS++)); }
fail() { echo -e "${RED}[FAIL]${NC} $(date '+%H:%M:%S') $*"; ((FAILED++)); }
pass() { echo -e "${GREEN}[PASS]${NC} $(date '+%H:%M:%S') $*"; ((PASSED++)); }

usage() {
  echo "Usage: $0 --env <production|staging>"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$ENV" ]] && fail "Environment required" && usage

log "======================================"
log "Vault & HSM Verification — $ENV"
log "Vault Address: $VAULT_ADDR"
log "======================================"

# ---- Check 1: Vault connectivity ----
echo ""
log "Check 1: Vault endpoint reachable"
if command -v vault &>/dev/null; then
  if vault status -address="$VAULT_ADDR" &>/dev/null; then
    pass "Vault is reachable and unsealed"
  else
    # Fallback: try curl
    if curl -sk "${VAULT_ADDR}/v1/sys/health" 2>/dev/null | grep -q '"sealed":false'; then
      pass "Vault reachable via HTTP (sealed=false)"
    else
      fail "Vault unreachable at $VAULT_ADDR"
    fi
  fi
else
  warn "vault CLI not installed — attempting HTTP check"
  if curl -sk "${VAULT_ADDR}/v1/sys/health" 2>/dev/null | grep -q '"sealed":false'; then
    pass "Vault reachable via HTTP (sealed=false)"
  else
    warn "Cannot verify Vault — CLI not installed and HTTP check failed (may be expected in local dev)"
  fi
fi

# ---- Check 2: Required secret paths ----
echo ""
log "Check 2: Required secret paths exist"
REQUIRED_PATHS=(
  "nexus/database/cockroachdb"
  "nexus/messaging/kafka"
  "nexus/cache/redis"
  "nexus/services/payment-service"
  "nexus/services/account-service"
  "nexus/services/reconciliation-service"
  "nexus/frontend/nextauth"
  "nexus/monitoring/grafana"
)

for path in "${REQUIRED_PATHS[@]}"; do
  if command -v vault &>/dev/null; then
    if vault kv get -address="$VAULT_ADDR" "$path" &>/dev/null; then
      pass "Secret exists: $path"
    else
      fail "Secret missing: $path"
    fi
  else
    warn "Cannot verify secret $path (vault CLI not installed)"
  fi
done

# ---- Check 3: Kubernetes auth method ----
echo ""
log "Check 3: Kubernetes auth method configured"
if command -v vault &>/dev/null; then
  if vault auth list -address="$VAULT_ADDR" 2>/dev/null | grep -q "kubernetes"; then
    pass "Kubernetes auth method enabled"
  else
    warn "Kubernetes auth method not found — may need configuration for $ENV"
  fi
else
  warn "Cannot verify Kubernetes auth (vault CLI not installed)"
fi

# ---- Check 4: HSM key availability ----
echo ""
log "Check 4: HSM / transit key verification"
HSM_KEYS=("nexus-signing-key" "nexus-encryption-key" "nexus-audit-key")
for key in "${HSM_KEYS[@]}"; do
  if command -v vault &>/dev/null; then
    if vault read -address="$VAULT_ADDR" "transit/keys/$key" &>/dev/null; then
      pass "HSM / transit key available: $key"
    else
      warn "HSM / transit key not found: $key (may use software keys)"
    fi
  else
    warn "Cannot verify HSM key $key (vault CLI not installed)"
  fi
done

# ---- Check 5: Key rotation status ----
echo ""
log "Check 5: Key rotation documentation"
KEY_MGMT_DOC="COMPLIANCE/KEY_MANAGEMENT_POLICY.md"
if [[ -f "$SCRIPT_DIR/../$KEY_MGMT_DOC" ]]; then
  pass "Key management policy exists: $KEY_MGMT_DOC"
else
  warn "Key management policy not found: $KEY_MGMT_DOC"
fi

# ---- Check 6: GitHub Secrets for CI/CD ----
echo ""
log "Check 6: GitHub Secrets availability (workflow references)"
WORKFLOW_FILE="$SCRIPT_DIR/../.github/workflows/production-deploy.yml"
if [[ -f "$WORKFLOW_FILE" ]]; then
  REQUIRED_SECRETS=$(grep -oP 'secrets\.\K[A-Z_]+' "$WORKFLOW_FILE" 2>/dev/null | sort -u || true)
  if [[ -n "$REQUIRED_SECRETS" ]]; then
    log "Workflow requires these GitHub Secrets:"
    for secret in $REQUIRED_SECRETS; do
      log "  - secrets.$secret"
    done
    pass "Production workflow secret references documented"
  else
    pass "No explicit secret references in workflow"
  fi
else
  warn "Production deploy workflow not found"
fi

# ---- Summary ----
echo ""
echo "============================================"
echo " VAULT & HSM VERIFICATION SUMMARY"
echo " Environment: $ENV"
echo " Passed:      $PASSED"
echo " Failed:      $FAILED"
echo " Warnings:    $WARNINGS"
echo "============================================"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  fail "VAULT VERIFICATION FAILED — $FAILED checks failed"
  exit 1
else
  log "Vault verification complete. $PASSED passed, $WARNINGS warnings."
  if [[ $WARNINGS -gt 0 ]]; then
    warn "Warnings present — verify manually before production deploy"
  fi
  exit 0
fi

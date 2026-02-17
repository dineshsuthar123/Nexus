#!/bin/bash
# ==============================================================================
# Nexus RTP — Key Rotation Script
# ==============================================================================
# Rotates JWT signing keys stored in HashiCorp Vault.
# Supports RSA (RS256) and Ed25519 key types.
#
# Usage:
#   ./rotate_keys.sh                    # Interactive rotation
#   ./rotate_keys.sh --auto             # Non-interactive (CI/scheduled)
#   ./rotate_keys.sh --verify           # Verify current keys
#   ./rotate_keys.sh --rollback         # Restore previous key version
#
# Prerequisites:
#   - vault CLI installed and VAULT_ADDR set
#   - Authenticated to Vault (VAULT_TOKEN or vault login)
#   - openssl installed
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VAULT_KV_PATH="${VAULT_KV_PATH:-nexus/keys/jwt-signing}"
KEY_TYPE="${KEY_TYPE:-rsa}"        # rsa or ed25519
RSA_BITS="${RSA_BITS:-4096}"
GRACE_PERIOD="${GRACE_PERIOD:-300}" # seconds to keep old key valid

log() { echo -e "${GREEN}[INFO]${NC} $(date '+%H:%M:%S') $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $1"; }
err() { echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $1"; }
step() { echo -e "${BLUE}[STEP]${NC} $(date '+%H:%M:%S') $1"; }

check_prereqs() {
    for cmd in vault openssl; do
        if ! command -v "$cmd" &>/dev/null; then
            err "$cmd is required but not installed"
            exit 1
        fi
    done

    if [[ -z "${VAULT_ADDR:-}" ]]; then
        err "VAULT_ADDR must be set"
        exit 1
    fi

    # Verify Vault connectivity
    if ! vault status &>/dev/null; then
        err "Cannot connect to Vault at $VAULT_ADDR"
        exit 1
    fi
    log "Vault connection OK ($VAULT_ADDR)"
}

generate_rsa_keypair() {
    local tmpdir
    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" RETURN

    step "Generating RSA-${RSA_BITS} key pair..."
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:${RSA_BITS} \
        -out "${tmpdir}/private.pem" 2>/dev/null
    openssl pkey -in "${tmpdir}/private.pem" -pubout \
        -out "${tmpdir}/public.pem" 2>/dev/null

    PRIVATE_KEY=$(cat "${tmpdir}/private.pem")
    PUBLIC_KEY=$(cat "${tmpdir}/public.pem")

    # Verify key integrity
    echo "test-payload" | openssl dgst -sha256 -sign "${tmpdir}/private.pem" | \
        openssl dgst -sha256 -verify "${tmpdir}/public.pem" -signature /dev/stdin &>/dev/null || {
        err "Key pair verification failed!"
        exit 1
    }
    log "RSA-${RSA_BITS} key pair generated and verified"
}

generate_ed25519_keypair() {
    local tmpdir
    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" RETURN

    step "Generating Ed25519 key pair..."
    openssl genpkey -algorithm Ed25519 -out "${tmpdir}/private.pem" 2>/dev/null
    openssl pkey -in "${tmpdir}/private.pem" -pubout -out "${tmpdir}/public.pem" 2>/dev/null

    PRIVATE_KEY=$(cat "${tmpdir}/private.pem")
    PUBLIC_KEY=$(cat "${tmpdir}/public.pem")
    log "Ed25519 key pair generated"
}

get_current_version() {
    local meta
    meta=$(vault kv metadata get -format=json "${VAULT_KV_PATH}" 2>/dev/null || echo "{}")
    CURRENT_VERSION=$(echo "$meta" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('current_version',0))" 2>/dev/null || echo "0")
}

store_keys_in_vault() {
    step "Storing keys in Vault at ${VAULT_KV_PATH}..."
    vault kv put "${VAULT_KV_PATH}" \
        private_key="${PRIVATE_KEY}" \
        public_key="${PUBLIC_KEY}" \
        key_type="${KEY_TYPE}" \
        rotated_at="$(date -Iseconds)" \
        rotated_by="${USER:-automation}"
    log "Keys stored successfully"
}

verify_keys() {
    step "Verifying keys in Vault..."
    local stored_pub
    stored_pub=$(vault kv get -field=public_key "${VAULT_KV_PATH}" 2>/dev/null || echo "")
    if [[ -z "$stored_pub" ]]; then
        err "No keys found at ${VAULT_KV_PATH}"
        return 1
    fi

    local key_type
    key_type=$(vault kv get -field=key_type "${VAULT_KV_PATH}" 2>/dev/null || echo "unknown")
    local rotated_at
    rotated_at=$(vault kv get -field=rotated_at "${VAULT_KV_PATH}" 2>/dev/null || echo "unknown")

    log "Key verification:"
    echo "  Path:       ${VAULT_KV_PATH}"
    echo "  Type:       ${key_type}"
    echo "  Rotated at: ${rotated_at}"
    echo "  Public key: $(echo "$stored_pub" | head -1)...(truncated)"

    # Verify private key can sign and public key can verify
    local tmpdir
    tmpdir=$(mktemp -d)
    trap "rm -rf $tmpdir" RETURN

    vault kv get -field=private_key "${VAULT_KV_PATH}" > "${tmpdir}/priv.pem"
    vault kv get -field=public_key "${VAULT_KV_PATH}" > "${tmpdir}/pub.pem"

    echo "rotation-test" > "${tmpdir}/payload"
    if openssl dgst -sha256 -sign "${tmpdir}/priv.pem" -out "${tmpdir}/sig" "${tmpdir}/payload" 2>/dev/null && \
       openssl dgst -sha256 -verify "${tmpdir}/pub.pem" -signature "${tmpdir}/sig" "${tmpdir}/payload" &>/dev/null; then
        log "Key pair is valid and operational ✓"
    else
        err "Key pair verification FAILED"
        return 1
    fi
}

rollback_keys() {
    step "Rolling back to previous key version..."
    get_current_version
    if [[ "$CURRENT_VERSION" -le 1 ]]; then
        err "No previous version to roll back to"
        exit 1
    fi
    local prev=$((CURRENT_VERSION - 1))
    vault kv rollback -version=${prev} "${VAULT_KV_PATH}"
    log "Rolled back to version ${prev}"
    verify_keys
}

rotate() {
    log "Starting key rotation for ${VAULT_KV_PATH}"
    get_current_version
    log "Current key version: ${CURRENT_VERSION}"

    # Generate new keys
    case "$KEY_TYPE" in
        rsa)    generate_rsa_keypair ;;
        ed25519) generate_ed25519_keypair ;;
        *) err "Unsupported key type: $KEY_TYPE"; exit 1 ;;
    esac

    # Confirmation (skip if --auto)
    if [[ "${1:-}" != "--auto" ]]; then
        echo ""
        warn "This will rotate JWT signing keys."
        warn "Existing tokens signed with the old key will become INVALID"
        warn "unless dual-key validation is configured."
        read -p "Continue? (yes/no): " confirm
        if [[ "$confirm" != "yes" ]]; then
            log "Rotation cancelled"
            exit 0
        fi
    fi

    store_keys_in_vault
    verify_keys

    log "Key rotation complete!"
    log "New key version: $((CURRENT_VERSION + 1))"
    echo ""
    echo "Post-rotation steps:"
    echo "  1. Services will pick up new keys within ${GRACE_PERIOD}s (configurable)"
    echo "  2. Monitor vault_key_rotation_total metric in Grafana"
    echo "  3. Check auth-service logs for 'key refresh' events"
    echo "  4. Verify /healthz endpoints return 200 on all services"
    echo ""
    echo "Rollback command (if needed):"
    echo "  $0 --rollback"
}

# Main
check_prereqs
case "${1:-}" in
    --verify)   verify_keys ;;
    --rollback) rollback_keys ;;
    --auto)     rotate --auto ;;
    *)          rotate ;;
esac

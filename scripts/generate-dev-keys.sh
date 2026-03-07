#!/usr/bin/env bash
# ==============================================================================
# Generate Development JWT Key Pair
# ==============================================================================
# Creates RSA-2048 dev keys for local development.
# Keys are gitignored — each developer generates their own.
#
# Usage: ./scripts/generate-dev-keys.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

AUTH_KEYS_DIR="$ROOT_DIR/services/auth-service/keys"
WS_KEYS_DIR="$ROOT_DIR/services/ws-gateway/keys"

mkdir -p "$AUTH_KEYS_DIR" "$WS_KEYS_DIR"

# Check if keys already exist
if [[ -f "$AUTH_KEYS_DIR/dev_private.pem" && -f "$AUTH_KEYS_DIR/dev_public.pem" ]]; then
    echo "Dev keys already exist. Delete them first to regenerate."
    echo "  $AUTH_KEYS_DIR/dev_private.pem"
    echo "  $AUTH_KEYS_DIR/dev_public.pem"
    exit 0
fi

echo "=== Generating RSA-2048 dev key pair ==="

# Generate private key
openssl genrsa -out "$AUTH_KEYS_DIR/dev_private.pem" 2048 2>/dev/null
echo "  ✓ Private key: $AUTH_KEYS_DIR/dev_private.pem"

# Extract public key
openssl rsa -in "$AUTH_KEYS_DIR/dev_private.pem" \
    -pubout -out "$AUTH_KEYS_DIR/dev_public.pem" 2>/dev/null
echo "  ✓ Public key:  $AUTH_KEYS_DIR/dev_public.pem"

# Copy public key to ws-gateway (only needs public key for JWT verification)
cp "$AUTH_KEYS_DIR/dev_public.pem" "$WS_KEYS_DIR/dev_public.pem"
echo "  ✓ Copied public key to ws-gateway"

echo ""
echo "Done. Keys are gitignored and will NOT be committed."
echo "Each developer must run this script once after cloning."

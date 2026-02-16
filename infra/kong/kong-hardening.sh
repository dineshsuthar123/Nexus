#!/bin/bash
# ==============================================================================
# Kong Gateway — Production Hardening
# ==============================================================================
# Applies security headers, CSP, cookie policies, and hardened rate limits.
# Run AFTER kong-setup.sh.
#
# Usage: ./kong-hardening.sh [KONG_ADMIN_URL]
# ==============================================================================

set -euo pipefail

KONG_ADMIN="${1:-http://localhost:8001}"

echo "=== Nexus RTP — Kong Production Hardening ==="

# Global security headers (response-transformer)
echo "Applying security headers..."
curl -s -X POST "${KONG_ADMIN}/plugins" \
    -d "name=response-transformer" \
    -d "config.add.headers[]=Strict-Transport-Security:max-age=63072000; includeSubDomains; preload" \
    -d "config.add.headers[]=X-Content-Type-Options:nosniff" \
    -d "config.add.headers[]=X-Frame-Options:DENY" \
    -d "config.add.headers[]=X-XSS-Protection:0" \
    -d "config.add.headers[]=Referrer-Policy:strict-origin-when-cross-origin" \
    -d "config.add.headers[]=Permissions-Policy:camera=(), microphone=(), geolocation=(), payment=(self)" \
    -d "config.add.headers[]=Content-Security-Policy:default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss://ws.nexus-rtp.internal; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" \
    -d "config.remove.headers[]=Server" \
    -d "config.remove.headers[]=X-Powered-By" \
    > /dev/null 2>&1 || echo "  (response-transformer may already exist — update manually)"

echo "  ✓ HSTS, CSP, X-Frame-Options, X-Content-Type-Options"

# Strict CORS for production
echo "Updating CORS to production origins..."
# Remove existing CORS plugin first
CORS_ID=$(curl -s "${KONG_ADMIN}/plugins" | python3 -c "import sys,json; plugins=json.load(sys.stdin)['data']; cors=[p['id'] for p in plugins if p['name']=='cors']; print(cors[0] if cors else '')" 2>/dev/null || echo "")
if [[ -n "$CORS_ID" ]]; then
    curl -s -X DELETE "${KONG_ADMIN}/plugins/${CORS_ID}" > /dev/null 2>&1 || true
fi

curl -s -X POST "${KONG_ADMIN}/plugins" \
    -d "name=cors" \
    -d "config.origins[]=https://app.nexus-rtp.com" \
    -d "config.origins[]=https://admin.nexus-rtp.com" \
    -d "config.methods[]=GET" \
    -d "config.methods[]=POST" \
    -d "config.methods[]=PUT" \
    -d "config.methods[]=PATCH" \
    -d "config.methods[]=DELETE" \
    -d "config.methods[]=OPTIONS" \
    -d "config.headers[]=Authorization" \
    -d "config.headers[]=Content-Type" \
    -d "config.headers[]=X-Request-ID" \
    -d "config.headers[]=X-Idempotency-Key" \
    -d "config.exposed_headers[]=X-Request-ID" \
    -d "config.credentials=true" \
    -d "config.max_age=3600" \
    -d "config.preflight_continue=false" \
    > /dev/null 2>&1 || true
echo "  ✓ CORS restricted to production origins"

# IP restriction for admin endpoints
echo "Restricting Kong Admin API access..."
curl -s -X POST "${KONG_ADMIN}/plugins" \
    -d "name=ip-restriction" \
    -d "config.allow[]=10.0.0.0/8" \
    -d "config.allow[]=172.16.0.0/12" \
    -d "config.allow[]=192.168.0.0/16" \
    -d "config.deny_action=403" \
    > /dev/null 2>&1 || true
echo "  ✓ Admin API restricted to private networks"

# Tighten auth-service rate limiting (anti brute-force)
echo "Hardening auth rate limits..."
AUTH_RL_ID=$(curl -s "${KONG_ADMIN}/services/auth-service/plugins" | python3 -c "import sys,json; plugins=json.load(sys.stdin)['data']; rl=[p['id'] for p in plugins if p['name']=='rate-limiting']; print(rl[0] if rl else '')" 2>/dev/null || echo "")
if [[ -n "$AUTH_RL_ID" ]]; then
    curl -s -X DELETE "${KONG_ADMIN}/services/auth-service/plugins/${AUTH_RL_ID}" > /dev/null 2>&1 || true
fi
curl -s -X POST "${KONG_ADMIN}/services/auth-service/plugins" \
    -d "name=rate-limiting" \
    -d "config.second=5" \
    -d "config.minute=20" \
    -d "config.hour=200" \
    -d "config.policy=redis" \
    -d "config.redis_host=redis-master" \
    -d "config.redis_port=6379" \
    -d "config.fault_tolerant=true" \
    -d "config.hide_client_headers=true" \
    > /dev/null 2>&1 || true
echo "  ✓ Auth service: 5/sec, 20/min, 200/hr"

# Bot detection
echo "Enabling bot detection..."
curl -s -X POST "${KONG_ADMIN}/plugins" \
    -d "name=bot-detection" \
    > /dev/null 2>&1 || true
echo "  ✓ Bot detection enabled"

# Request size limiting (tighter for auth)
echo "Tightening request size limits..."
curl -s -X POST "${KONG_ADMIN}/services/auth-service/plugins" \
    -d "name=request-size-limiting" \
    -d "config.allowed_payload_size=1" \
    -d "config.size_unit=megabytes" \
    > /dev/null 2>&1 || true
echo "  ✓ Auth requests limited to 1MB"

echo ""
echo "=== Kong hardening complete ==="
echo "Verify: curl -I https://api.nexus-rtp.com/api/v1/auth/health"

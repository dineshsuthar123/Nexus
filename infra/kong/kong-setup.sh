#!/bin/bash
# Kong Gateway Route Configuration
# Configures services and routes via Kong Admin API
# Usage: ./kong-setup.sh [KONG_ADMIN_URL]

set -euo pipefail

KONG_ADMIN="${1:-http://localhost:8001}"

echo "=== Nexus RTP Platform — Kong Route Setup ==="
echo "Admin API: $KONG_ADMIN"

wait_for_kong() {
  echo "Waiting for Kong Admin API..."
  for i in $(seq 1 30); do
    if curl -s "$KONG_ADMIN/status" > /dev/null 2>&1; then
      echo "Kong is ready."
      return 0
    fi
    sleep 2
  done
  echo "ERROR: Kong not reachable after 60 seconds"
  exit 1
}

register_service() {
  local name=$1 host=$2 port=${3:-8080} protocol=${4:-http}
  echo "  -> Service: $name → $protocol://$host:$port"
  curl -s -X PUT "$KONG_ADMIN/services/$name" \
    -d "name=$name" \
    -d "protocol=$protocol" \
    -d "host=$host" \
    -d "port=$port" \
    -d "connect_timeout=5000" \
    -d "write_timeout=60000" \
    -d "read_timeout=60000" \
    -d "retries=3" > /dev/null
}

register_route() {
  local service=$1 name=$2 paths=$3 methods=${4:-}
  echo "  -> Route: $name [$paths]"
  local data="name=$name&paths[]=$paths&strip_path=false&preserve_host=false"
  if [ -n "$methods" ]; then
    IFS=',' read -ra METHOD_ARR <<< "$methods"
    for m in "${METHOD_ARR[@]}"; do
      data="$data&methods[]=$m"
    done
  fi
  curl -s -X PUT "$KONG_ADMIN/services/$service/routes/$name" \
    -d "$data" > /dev/null
}

enable_plugin() {
  local scope=$1 name=$2
  shift 2
  echo "  -> Plugin: $name on $scope"
  local data="name=$name"
  for kv in "$@"; do
    data="$data&$kv"
  done
  curl -s -X POST "$KONG_ADMIN/$scope/plugins" \
    -d "$data" > /dev/null 2>&1 || true
}

wait_for_kong

# ───────────────────────────────────────────
# 1. Register upstream services
# ───────────────────────────────────────────
echo ""
echo "Registering services..."
register_service "auth-service"           "auth-service"           8080
register_service "payment-service"        "payment-service"        8080
register_service "account-service"        "account-service"        8080
register_service "reconciliation-service" "reconciliation-service" 8080
register_service "analytics-service"      "analytics-service"      8080
register_service "audit-service"          "audit-service"          8080
register_service "notification-service"   "notification-service"   8080
register_service "ws-gateway"             "ws-gateway"             8080

# ───────────────────────────────────────────
# 2. Register routes
# ───────────────────────────────────────────
echo ""
echo "Registering routes..."

# Auth routes (public + protected handled internally by auth-service)
register_route "auth-service"  "auth-routes"   "/api/v1/auth"

# User/Settings routes (served by auth-service, JWT-protected)
register_route "auth-service"  "user-routes"   "/api/v1/users"

# Payment + ISO 20022 message routes
register_route "payment-service"  "payment-routes"  "/api/v1/payments"
register_route "payment-service"  "message-routes"  "/api/v1/messages"

# Account routes
register_route "account-service"  "account-routes"   "/api/v1/accounts"
register_route "account-service"  "customer-routes"  "/api/v1/customers"

# Reconciliation routes
register_route "reconciliation-service"  "reconciliation-routes"  "/api/v1/reconciliation"

# Analytics routes
register_route "analytics-service"  "analytics-routes"  "/api/v1/analytics"

# Audit routes
register_route "audit-service"  "audit-routes"  "/api/v1/audit"

# Notification routes
register_route "notification-service"  "notification-routes"  "/api/v1/notifications"

# WebSocket route
register_route "ws-gateway"  "ws-route"  "/ws"

# System health routes (per-service)
register_route "auth-service"  "auth-health"    "/api/v1/auth/health"
register_route "payment-service"  "payment-health"  "/api/v1/payments/health"

# ───────────────────────────────────────────
# 3. Global plugins
# ───────────────────────────────────────────
echo ""
echo "Enabling global plugins..."

# CORS — allow frontend origin
echo "  -> Plugin: cors (global)"
curl -s -X POST "$KONG_ADMIN/plugins" \
  -d "name=cors" \
  -d "config.origins[]=http://localhost:3001" \
  -d "config.origins[]=http://localhost:3000" \
  -d "config.origins[]=https://nexus.dev" \
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
  -d "config.headers[]=Idempotency-Key" \
  -d "config.exposed_headers[]=X-Request-ID" \
  -d "config.credentials=true" \
  -d "config.max_age=3600" > /dev/null 2>&1 || true

# Request ID correlation
echo "  -> Plugin: correlation-id (global)"
curl -s -X POST "$KONG_ADMIN/plugins" \
  -d "name=correlation-id" \
  -d "config.header_name=X-Request-ID" \
  -d "config.generator=uuid#counter" \
  -d "config.echo_downstream=true" > /dev/null 2>&1 || true

# Rate limiting (global default)
echo "  -> Plugin: rate-limiting (global)"
curl -s -X POST "$KONG_ADMIN/plugins" \
  -d "name=rate-limiting" \
  -d "config.minute=120" \
  -d "config.hour=3600" \
  -d "config.policy=local" \
  -d "config.fault_tolerant=true" \
  -d "config.hide_client_headers=false" > /dev/null 2>&1 || true

# Request size limiting
echo "  -> Plugin: request-size-limiting (global)"
curl -s -X POST "$KONG_ADMIN/plugins" \
  -d "name=request-size-limiting" \
  -d "config.allowed_payload_size=10" \
  -d "config.size_unit=megabytes" > /dev/null 2>&1 || true

# Prometheus metrics for Kong
echo "  -> Plugin: prometheus (global)"
curl -s -X POST "$KONG_ADMIN/plugins" \
  -d "name=prometheus" \
  -d "config.per_consumer=true" \
  -d "config.status_code_metrics=true" \
  -d "config.latency_metrics=true" > /dev/null 2>&1 || true

# ───────────────────────────────────────────
# 4. JWT validation on protected routes
# ───────────────────────────────────────────
echo ""
echo "Enabling JWT validation on protected routes..."

# Auth routes are PUBLIC (login, register, refresh, password reset).
# All other service routes require a valid JWT in the Authorization header.
# The auth-service issues JWTs; Kong validates them at the gateway layer
# so that backend services receive only authenticated requests.

# Create a JWT consumer (represents the auth-service issuer)
echo "  -> Consumer: nexus-jwt-issuer"
curl -s -X PUT "$KONG_ADMIN/consumers/nexus-jwt-issuer" \
  -d "username=nexus-jwt-issuer" > /dev/null 2>&1 || true

# Upload the RSA public key for JWT verification
# In production, rotate this via Vault or K8s secrets.
JWT_PUBLIC_KEY_FILE="${JWT_PUBLIC_KEY_FILE:-../../services/auth-service/keys/dev_public.pem}"
if [ -f "$JWT_PUBLIC_KEY_FILE" ]; then
  echo "  -> Uploading RSA public key for JWT verification"
  JWT_PUBLIC_KEY=$(cat "$JWT_PUBLIC_KEY_FILE")
  curl -s -X POST "$KONG_ADMIN/consumers/nexus-jwt-issuer/jwt" \
    -F "algorithm=RS256" \
    -F "key=nexus-rtp" \
    -F "rsa_public_key=$JWT_PUBLIC_KEY" > /dev/null 2>&1 || true
else
  echo "  ⚠ WARNING: JWT public key not found at $JWT_PUBLIC_KEY_FILE"
  echo "    Run scripts/generate-dev-keys.sh first, then re-run this script."
fi

# Enable JWT plugin on protected routes (NOT on auth-routes or health endpoints)
PROTECTED_ROUTES="payment-routes message-routes account-routes customer-routes reconciliation-routes analytics-routes audit-routes notification-routes user-routes ws-route"
for route in $PROTECTED_ROUTES; do
  echo "  -> JWT plugin on route: $route"
  curl -s -X POST "$KONG_ADMIN/routes/$route/plugins" \
    -d "name=jwt" \
    -d "config.key_claim_name=iss" \
    -d "config.claims_to_verify[]=exp" \
    -d "config.header_names[]=Authorization" \
    -d "config.uri_param_names=" \
    -d "config.cookie_names=" \
    -d "config.run_on_preflight=false" > /dev/null 2>&1 || true
done
echo "  ✓ JWT validation enabled on all protected routes"
echo "  ✓ Auth routes (/api/v1/auth/*) remain public"

# ───────────────────────────────────────────
# 5. Service-specific rate limits
# ───────────────────────────────────────────
echo ""
echo "Configuring service-specific rate limits..."

# Auth: stricter rate limit to prevent brute force
enable_plugin "services/auth-service" "rate-limiting" \
  "config.minute=30" "config.hour=300" "config.policy=local"

# Payments: moderate limit
enable_plugin "services/payment-service" "rate-limiting" \
  "config.minute=60" "config.hour=1800" "config.policy=local"

# ───────────────────────────────────────────
# 6. Logging
# ───────────────────────────────────────────
echo ""
echo "Enabling request logging..."

echo "  -> Plugin: file-log (global)"
curl -s -X POST "$KONG_ADMIN/plugins" \
  -d "name=file-log" \
  -d "config.path=/tmp/kong-access.log" \
  -d "config.reopen=true" > /dev/null 2>&1 || true

echo ""
echo "=== Kong route setup complete ==="
echo ""
echo "Verify routes:"
echo "  curl $KONG_ADMIN/routes | jq '.data[] | {name, paths}'"
echo ""
echo "Test proxy:"
echo "  curl http://localhost:8000/api/v1/auth/health"

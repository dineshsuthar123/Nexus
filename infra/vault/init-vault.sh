#!/bin/bash
# Vault initialization script for Nexus RTP Platform
# This script sets up secrets engines, policies, and initial secrets

set -e

echo "=== Initializing Vault for Nexus RTP Platform ==="

# Wait for Vault to be ready
until vault status > /dev/null 2>&1; do
    echo "Waiting for Vault to be ready..."
    sleep 2
done

echo "Vault is ready. Configuring..."

# Enable KV secrets engine v2
echo "Enabling KV secrets engine..."
vault secrets enable -path=nexus -version=2 kv 2>/dev/null || echo "KV engine already enabled"

# Create database credentials
echo "Creating database credentials..."
vault kv put nexus/database/cockroachdb \
    host="cockroachdb-1" \
    port="26257" \
    username="nexus_app" \
    password='${COCKROACH_PASSWORD:-nexus_secure_password}' \
    database="nexus" \
    sslmode="verify-full"

# Create Kafka credentials
echo "Creating Kafka credentials..."
vault kv put nexus/messaging/kafka \
    bootstrap_servers="kafka-1:9092,kafka-2:9092,kafka-3:9092" \
    security_protocol="SASL_SSL" \
    sasl_mechanism="SCRAM-SHA-512" \
    sasl_username="nexus-producer" \
    sasl_password='${KAFKA_PASSWORD:-kafka_secure_password}'

# Create Redis credentials
echo "Creating Redis credentials..."
vault kv put nexus/cache/redis \
    host="redis" \
    port="6379" \
    password='${REDIS_PASSWORD:-redis_secure_password}' \
    db="0"

# Create service-to-service auth tokens
echo "Creating service tokens..."
vault kv put nexus/services/payment-service \
    api_key='${PAYMENT_SERVICE_API_KEY:-ps_$(openssl rand -hex 16)}' \
    internal_token='${PAYMENT_INTERNAL_TOKEN:-$(openssl rand -hex 32)}'

vault kv put nexus/services/account-service \
    api_key='${ACCOUNT_SERVICE_API_KEY:-as_$(openssl rand -hex 16)}' \
    internal_token='${ACCOUNT_INTERNAL_TOKEN:-$(openssl rand -hex 32)}'

vault kv put nexus/services/reconciliation-service \
    api_key='${RECON_SERVICE_API_KEY:-rs_$(openssl rand -hex 16)}' \
    internal_token='${RECON_INTERNAL_TOKEN:-$(openssl rand -hex 32)}'

# Create OFAC/sanctions API credentials
echo "Creating sanctions API credentials..."
vault kv put nexus/compliance/ofac \
    watchman_url="http://watchman:8084" \
    api_key='${OFAC_API_KEY:-ofac_dev_key}'

# Create encryption keys for PAN/sensitive data
echo "Creating encryption keys..."
vault kv put nexus/encryption/pan \
    aes_key='${PAN_AES_KEY:-$(openssl rand -hex 32)}' \
    hmac_key='${PAN_HMAC_KEY:-$(openssl rand -hex 32)}'

# --- JWT Signing Keys (RSA-4096) ---
echo "Generating JWT signing keys..."
JWT_TMP=$(mktemp -d)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 \
    -out "${JWT_TMP}/private.pem" 2>/dev/null
openssl pkey -in "${JWT_TMP}/private.pem" -pubout \
    -out "${JWT_TMP}/public.pem" 2>/dev/null

vault kv put nexus/keys/jwt-signing \
    private_key=@"${JWT_TMP}/private.pem" \
    public_key=@"${JWT_TMP}/public.pem" \
    key_type="rsa" \
    rotated_at="$(date -Iseconds)" \
    rotated_by="init-vault"
rm -rf "${JWT_TMP}"
echo "JWT signing keys stored in Vault"

# --- MFA Encryption Key ---
echo "Generating MFA encryption key..."
MFA_KEY=$(openssl rand -hex 16)  # 32 hex chars = 16 bytes = 128-bit AES
vault kv put nexus/keys/mfa-encryption \
    encryption_key="${MFA_KEY}" \
    rotated_at="$(date -Iseconds)"
echo "MFA encryption key stored in Vault"

# Enable Transit secrets engine for encryption as a service
echo "Enabling Transit secrets engine..."
vault secrets enable transit 2>/dev/null || echo "Transit engine already enabled"

# Create encryption key for payment data
echo "Creating payment data encryption key..."
vault write -f transit/keys/payment-data \
    type="aes256-gcm96" \
    exportable=false \
    allow_plaintext_backup=false

vault write -f transit/keys/pii-data \
    type="aes256-gcm96" \
    exportable=false \
    allow_plaintext_backup=false

# Enable AppRole auth for services
echo "Enabling AppRole authentication..."
vault auth enable approle 2>/dev/null || echo "AppRole already enabled"

# Create policies
echo "Creating access policies..."

# Payment service policy
vault policy write payment-service - <<EOF
path "nexus/data/database/*" {
  capabilities = ["read"]
}
path "nexus/data/messaging/*" {
  capabilities = ["read"]
}
path "nexus/data/cache/*" {
  capabilities = ["read"]
}
path "nexus/data/services/payment-service" {
  capabilities = ["read"]
}
path "nexus/data/compliance/*" {
  capabilities = ["read"]
}
path "transit/encrypt/payment-data" {
  capabilities = ["update"]
}
path "transit/decrypt/payment-data" {
  capabilities = ["update"]
}
path "transit/encrypt/pii-data" {
  capabilities = ["update"]
}
path "transit/decrypt/pii-data" {
  capabilities = ["update"]
}
EOF

# Auth service policy — access JWT signing keys and MFA encryption key
vault policy write auth-service - <<EOF
path "nexus/data/database/*" {
  capabilities = ["read"]
}
path "nexus/data/cache/*" {
  capabilities = ["read"]
}
path "nexus/data/keys/jwt-signing" {
  capabilities = ["read"]
}
path "nexus/data/keys/mfa-encryption" {
  capabilities = ["read"]
}
path "nexus/data/services/auth-service" {
  capabilities = ["read"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
EOF

# Account service policy
vault policy write account-service - <<EOF
path "nexus/data/database/*" {
  capabilities = ["read"]
}
path "nexus/data/cache/*" {
  capabilities = ["read"]
}
path "nexus/data/services/account-service" {
  capabilities = ["read"]
}
path "transit/encrypt/pii-data" {
  capabilities = ["update"]
}
path "transit/decrypt/pii-data" {
  capabilities = ["update"]
}
EOF

# Reconciliation service policy
vault policy write reconciliation-service - <<EOF
path "nexus/data/database/*" {
  capabilities = ["read"]
}
path "nexus/data/messaging/*" {
  capabilities = ["read"]
}
path "nexus/data/services/reconciliation-service" {
  capabilities = ["read"]
}
EOF

# Create AppRoles for each service
echo "Creating AppRoles..."

vault write auth/approle/role/payment-service \
    token_policies="payment-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=0 \
    secret_id_num_uses=0

vault write auth/approle/role/account-service \
    token_policies="account-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=0 \
    secret_id_num_uses=0

vault write auth/approle/role/auth-service \
    token_policies="auth-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=0 \
    secret_id_num_uses=0

vault write auth/approle/role/reconciliation-service \
    token_policies="reconciliation-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=0 \
    secret_id_num_uses=0

# Output role IDs for configuration
echo ""
echo "=== AppRole Configuration ==="
echo "Payment Service Role ID:"
vault read -field=role_id auth/approle/role/payment-service/role-id

echo ""
echo "Account Service Role ID:"
vault read -field=role_id auth/approle/role/account-service/role-id

echo ""
echo "Reconciliation Service Role ID:"
vault read -field=role_id auth/approle/role/reconciliation-service/role-id

echo ""
echo "=== Vault Initialization Complete ==="
echo "Vault UI available at: http://localhost:8200"
echo "Dev Token: nexus-dev-token"
echo ""
echo "To generate Secret IDs for services, run:"
echo "  vault write -f auth/approle/role/payment-service/secret-id"

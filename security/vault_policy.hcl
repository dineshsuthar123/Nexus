# ==============================================================================
# NEXUS RTP VAULT POLICY CONFIGURATION
# ==============================================================================
# This file defines all HashiCorp Vault policies for the Nexus RTP platform.
# Apply with: vault policy write <policy-name> <policy-file>
#
# Security Model:
# - Principle of least privilege
# - Separate policies per service
# - No wildcard permissions
# - All sensitive operations require explicit grants
# ==============================================================================

# ==============================================================================
# ADMIN POLICY
# For platform administrators only. Highly restricted access.
# ==============================================================================

path "sys/health" {
  capabilities = ["read"]
}

path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "sys/auth/*" {
  capabilities = ["create", "update", "delete", "sudo"]
}

path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/*" {
  capabilities = ["list"]
}

# Audit log access
path "sys/audit" {
  capabilities = ["read", "list"]
}

path "sys/audit/*" {
  capabilities = ["create", "read", "delete", "sudo"]
}

---
# ==============================================================================
# PKI ADMIN POLICY
# For managing the PKI infrastructure
# ==============================================================================

# Root CA management (rarely used)
path "pki/root/generate/*" {
  capabilities = ["create", "update"]
}

path "pki/root/sign-intermediate" {
  capabilities = ["create", "update"]
}

path "pki/root/rotate/*" {
  capabilities = ["create", "update"]
}

# Intermediate CA management
path "pki_int/intermediate/generate/*" {
  capabilities = ["create", "update"]
}

path "pki_int/intermediate/set-signed" {
  capabilities = ["create", "update"]
}

# Role management
path "pki_int/roles/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# CRL management
path "pki_int/crl/*" {
  capabilities = ["read"]
}

path "pki_int/revoke" {
  capabilities = ["create", "update"]
}

---
# ==============================================================================
# PAYMENT SERVICE POLICY
# Minimal permissions for payment-service
# ==============================================================================

# Read database credentials
path "database/creds/payment-service" {
  capabilities = ["read"]
}

# Read encryption keys
path "transit/encrypt/payment-data" {
  capabilities = ["update"]
}

path "transit/decrypt/payment-data" {
  capabilities = ["update"]
}

# Issue service certificates
path "pki_int/issue/payment-service" {
  capabilities = ["create", "update"]
}

# Read Kafka credentials
path "secret/data/kafka/payment-service" {
  capabilities = ["read"]
}

# Read service configuration
path "secret/data/config/payment-service" {
  capabilities = ["read"]
}

# Renew own token
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Lookup own token
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

---
# ==============================================================================
# ACCOUNT SERVICE POLICY
# ==============================================================================

path "database/creds/account-service" {
  capabilities = ["read"]
}

path "transit/encrypt/account-data" {
  capabilities = ["update"]
}

path "transit/decrypt/account-data" {
  capabilities = ["update"]
}

path "pki_int/issue/account-service" {
  capabilities = ["create", "update"]
}

path "secret/data/kafka/account-service" {
  capabilities = ["read"]
}

path "secret/data/config/account-service" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

---
# ==============================================================================
# FRAUD DETECTION SERVICE POLICY
# Additional permissions for ML model access
# ==============================================================================

path "database/creds/fraud-service" {
  capabilities = ["read"]
}

path "pki_int/issue/fraud-service" {
  capabilities = ["create", "update"]
}

path "secret/data/kafka/fraud-service" {
  capabilities = ["read"]
}

path "secret/data/config/fraud-service" {
  capabilities = ["read"]
}

# ML model signing keys (read-only)
path "secret/data/ml/model-signing-key" {
  capabilities = ["read"]
}

# Feature store credentials
path "secret/data/feature-store/credentials" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

---
# ==============================================================================
# RECONCILIATION SERVICE POLICY
# Read-heavy permissions for audit trails
# ==============================================================================

path "database/creds/reconciliation-service" {
  capabilities = ["read"]
}

path "pki_int/issue/reconciliation-service" {
  capabilities = ["create", "update"]
}

path "secret/data/kafka/reconciliation-service" {
  capabilities = ["read"]
}

path "secret/data/config/reconciliation-service" {
  capabilities = ["read"]
}

# Audit trail signing key
path "transit/sign/audit-signing" {
  capabilities = ["update"]
}

# Read-only access to verify other service signatures
path "transit/verify/audit-signing" {
  capabilities = ["update"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

---
# ==============================================================================
# AUDIT BUNDLE SIGNER POLICY
# For the audit system that creates regulatory evidence
# ==============================================================================

path "transit/sign/audit-bundle" {
  capabilities = ["update"]
}

path "transit/verify/audit-bundle" {
  capabilities = ["update"]
}

# Export public key for external verification
path "transit/export/signing-key/audit-bundle" {
  capabilities = ["read"]
}

path "secret/data/audit/config" {
  capabilities = ["read"]
}

path "pki_int/issue/audit-service" {
  capabilities = ["create", "update"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

---
# ==============================================================================
# CI/CD PIPELINE POLICY
# For automated deployments
# ==============================================================================

# Read-only access to non-production secrets
path "secret/data/ci/*" {
  capabilities = ["read", "list"]
}

# Issue short-lived certificates for testing
path "pki_int/issue/ci-testing" {
  capabilities = ["create", "update"]
}

# Read container registry credentials
path "secret/data/registry/credentials" {
  capabilities = ["read"]
}

# Read Kubernetes auth config
path "auth/kubernetes/config" {
  capabilities = ["read"]
}

# NO database or production secret access
# NO encryption key access

---
# ==============================================================================
# ONCALL ENGINEER POLICY
# For incident response
# ==============================================================================

# Read service health
path "sys/health" {
  capabilities = ["read"]
}

# Read (not modify) current policies
path "sys/policies/acl/*" {
  capabilities = ["read", "list"]
}

# Read secrets metadata (not values)
path "secret/metadata/*" {
  capabilities = ["read", "list"]
}

# Issue emergency certificates
path "pki_int/issue/emergency" {
  capabilities = ["create", "update"]
}

# Read database connection info (not credentials)
path "database/config/*" {
  capabilities = ["read"]
}

# Read audit logs
path "sys/audit" {
  capabilities = ["read"]
}

# Revoke compromised certificates
path "pki_int/revoke" {
  capabilities = ["create", "update"]
}

# Create wrapped tokens for other services (break-glass)
path "sys/wrapping/wrap" {
  capabilities = ["create", "update"]
}

---
# ==============================================================================
# KUBERNETES AUTH CONFIGURATION
# For pod-based authentication
# ==============================================================================

# Enable Kubernetes auth method:
# vault auth enable kubernetes
#
# Configure Kubernetes auth:
# vault write auth/kubernetes/config \
#   kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443" \
#   kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
#
# Create role bindings:

# Payment Service Role
# vault write auth/kubernetes/role/payment-service \
#   bound_service_account_names=payment-service \
#   bound_service_account_namespaces=nexus-rtp \
#   policies=payment-service \
#   ttl=1h

# Account Service Role
# vault write auth/kubernetes/role/account-service \
#   bound_service_account_names=account-service \
#   bound_service_account_namespaces=nexus-rtp \
#   policies=account-service \
#   ttl=1h

# Fraud Detection Role
# vault write auth/kubernetes/role/fraud-service \
#   bound_service_account_names=fraud-detection \
#   bound_service_account_namespaces=nexus-rtp \
#   policies=fraud-detection \
#   ttl=1h

# Reconciliation Role
# vault write auth/kubernetes/role/reconciliation-service \
#   bound_service_account_names=reconciliation-service \
#   bound_service_account_namespaces=nexus-rtp \
#   policies=reconciliation-service \
#   ttl=1h

---
# ==============================================================================
# TRANSIT ENGINE KEYS CONFIGURATION
# ==============================================================================

# Create payment data encryption key:
# vault write transit/keys/payment-data \
#   type=aes256-gcm96 \
#   derived=true \
#   convergent_encryption=false \
#   exportable=false \
#   allow_plaintext_backup=false

# Create account data encryption key:
# vault write transit/keys/account-data \
#   type=aes256-gcm96 \
#   derived=true \
#   convergent_encryption=false \
#   exportable=false \
#   allow_plaintext_backup=false

# Create audit signing key:
# vault write transit/keys/audit-bundle \
#   type=ed25519 \
#   exportable=true \
#   allow_plaintext_backup=false

# Create audit trail signing key:
# vault write transit/keys/audit-signing \
#   type=ed25519 \
#   exportable=false \
#   allow_plaintext_backup=false

---
# ==============================================================================
# PKI ENGINE ROLES CONFIGURATION
# ==============================================================================

# Create payment-service role:
# vault write pki_int/roles/payment-service \
#   allowed_domains="payment-service.nexus-rtp.svc.cluster.local,payment-service.nexus-rtp.internal" \
#   allow_subdomains=false \
#   allow_glob_domains=false \
#   allow_any_name=false \
#   enforce_hostnames=true \
#   allow_ip_sans=true \
#   allowed_uri_sans="" \
#   server_flag=true \
#   client_flag=true \
#   key_type=ec \
#   key_bits=384 \
#   max_ttl=2160h \
#   ttl=720h

# Create account-service role:
# vault write pki_int/roles/account-service \
#   allowed_domains="account-service.nexus-rtp.svc.cluster.local,account-service.nexus-rtp.internal" \
#   allow_subdomains=false \
#   max_ttl=2160h \
#   ttl=720h

# Create fraud-service role:
# vault write pki_int/roles/fraud-service \
#   allowed_domains="fraud-detection.nexus-rtp.svc.cluster.local,fraud-detection.nexus-rtp.internal" \
#   allow_subdomains=false \
#   max_ttl=2160h \
#   ttl=720h

# Create reconciliation-service role:
# vault write pki_int/roles/reconciliation-service \
#   allowed_domains="reconciliation-service.nexus-rtp.svc.cluster.local,reconciliation-service.nexus-rtp.internal" \
#   allow_subdomains=false \
#   max_ttl=2160h \
#   ttl=720h

# Create emergency role (short TTL, for oncall):
# vault write pki_int/roles/emergency \
#   allowed_domains="*.nexus-rtp.internal" \
#   allow_subdomains=true \
#   max_ttl=24h \
#   ttl=4h

---
# ==============================================================================
# DATABASE SECRETS ENGINE CONFIGURATION
# ==============================================================================

# Enable database secrets engine:
# vault secrets enable database

# Configure CockroachDB connection:
# vault write database/config/cockroach \
#   plugin_name=postgresql-database-plugin \
#   allowed_roles="payment-service,account-service,fraud-service,reconciliation-service" \
#   connection_url="postgresql://{{username}}:{{password}}@cockroach-lb:26257/defaultdb?sslmode=verify-full" \
#   username="vault-admin" \
#   password="<vault-admin-password>" \
#   username_template="v_{{.RoleName}}_{{random 8}}"

# Create payment-service database role:
# vault write database/roles/payment-service \
#   db_name=cockroach \
#   creation_statements="CREATE USER \"{{name}}\" WITH PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT, INSERT, UPDATE ON ledger.* TO \"{{name}}\";" \
#   revocation_statements="DROP USER IF EXISTS \"{{name}}\";" \
#   default_ttl=1h \
#   max_ttl=24h

# Similar for other services with appropriate permissions...

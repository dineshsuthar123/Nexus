# Key Rotation Guide — Nexus RTP Platform

## Overview

All cryptographic keys used by Nexus RTP services are managed through **HashiCorp Vault KV v2**.
No private keys are stored in the repository or container images.

| Key | Location in Vault | Algorithm | Rotation Cadence |
|-----|-------------------|-----------|------------------|
| JWT Signing | `nexus/keys/jwt-signing` | RSA-4096 (RS256) | 90 days |
| MFA Encryption | `nexus/keys/mfa-encryption` | AES-128-GCM | 180 days |
| Payment Data Transit | `transit/keys/payment-data` | AES-256-GCM96 | Auto (Vault Transit) |
| PII Data Transit | `transit/keys/pii-data` | AES-256-GCM96 | Auto (Vault Transit) |
| Audit Bundle Signing | `transit/keys/audit-bundle` | Ed25519 | 365 days |
| mTLS Service Certs | `pki_int/issue/<service>` | ECDSA P-384 | 90 days (auto) |

## Prerequisites

```bash
# Vault CLI installed
vault version

# Vault address configured
export VAULT_ADDR=https://vault.nexus-rtp.internal:8200

# Authenticated (AppRole for automation, OIDC for humans)
vault login -method=oidc role=oncall
```

## JWT Signing Key Rotation

### Automated (Recommended)

```bash
# Scheduled via cron or CI pipeline
./scripts/rotate_keys.sh --auto
```

### Manual (Interactive)

```bash
# 1. Verify current key state
./scripts/rotate_keys.sh --verify

# 2. Rotate
./scripts/rotate_keys.sh

# 3. Monitor services picking up new keys
#    Watch Grafana: vault_key_rotation_total metric
#    Services refresh keys every 5 minutes (VAULT_KEY_REFRESH_SEC=300)

# 4. Verify auth-service health
curl -sS https://auth.nexus-rtp.internal/healthz | jq .
```

### Rollback

```bash
# Restore previous key version in Vault
./scripts/rotate_keys.sh --rollback

# Force immediate service refresh (optional — services will auto-refresh)
kubectl rollout restart deployment/auth-service -n nexus-rtp
```

### Post-Rotation Behavior

| Scenario | Behavior |
|----------|----------|
| Existing access tokens | **Invalid** after rotation (15m max TTL, natural expiry recommended) |
| Existing refresh tokens | Valid (opaque UUIDs stored in DB, not JWT-dependent) |
| Active sessions | Users re-authenticate on next access token refresh |
| MFA TOTP codes | Unaffected (TOTP secrets re-encrypted on next MFA setup) |

## MFA Encryption Key Rotation

```bash
# Update MFA encryption key
vault kv put nexus/keys/mfa-encryption \
    encryption_key="$(openssl rand -hex 16)" \
    rotated_at="$(date -Iseconds)"

# Note: Existing MFA secrets need re-encryption migration
# Run migration job:
kubectl apply -f infra/k8s/jobs/mfa-reencrypt-job.yaml
```

## Transit Key Rotation (Payment/PII Data)

Vault Transit keys support **key versioning** — new data is encrypted with the
latest version, old ciphertext can still be decrypted.

```bash
# Rotate transit key (zero-downtime)
vault write -f transit/keys/payment-data/rotate

# Rewrap existing ciphertext to latest version (batch job)
vault write transit/rewrap/payment-data \
    ciphertext="vault:v1:..."

# Set minimum decryption version (after rewrap completes)
vault write transit/keys/payment-data/config \
    min_decryption_version=2
```

## mTLS Certificate Rotation

Automated by `security/cert_rotation.go`:
- Checks hourly, rotates when < 30 days remain
- Prometheus metric: `cert_expiry_days{service="..."}`
- Alert: `NexusCertExpiringWithin7Days`

Manual emergency rotation:
```bash
# Via Vault PKI
vault write pki_int/issue/payment-service \
    common_name="payment-service.nexus-rtp.internal" \
    ttl="720h"
```

## Vault Access Topology

```
┌──────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                  │
│                                                      │
│  ┌─────────────┐   AppRole    ┌──────────────────┐  │
│  │ auth-service ├────────────►│                  │  │
│  └─────────────┘              │                  │  │
│  ┌─────────────┐   AppRole    │    Vault         │  │
│  │ payment-svc  ├────────────►│   (HA cluster)   │  │
│  └─────────────┘              │                  │  │
│  ┌─────────────┐   AppRole    │  KV v2 + Transit │  │
│  │ account-svc  ├────────────►│  + PKI           │  │
│  └─────────────┘              └──────────────────┘  │
│                                                      │
│  Secret injection methods:                           │
│  • K8s ServiceAccount → Vault Kubernetes Auth        │
│  • CI/CD → AppRole with wrapped SecretID             │
│  • Oncall → OIDC / short-lived token                 │
└──────────────────────────────────────────────────────┘
```

## Ops Procedures: Populating Vault for New Environments

### 1. Bootstrap Vault

```bash
# Initialize (first time only)
vault operator init -key-shares=5 -key-threshold=3

# Unseal
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

### 2. Run Init Script

```bash
cd infra/vault
./init-vault.sh
```

### 3. Configure Kubernetes Auth (Production)

```bash
vault auth enable kubernetes

vault write auth/kubernetes/config \
    kubernetes_host="https://${KUBERNETES_PORT_443_TCP_ADDR}:443" \
    kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# Bind service accounts to policies
for svc in auth-service payment-service account-service reconciliation-service; do
    vault write auth/kubernetes/role/${svc} \
        bound_service_account_names=${svc} \
        bound_service_account_namespaces=nexus-rtp \
        policies=${svc} \
        ttl=1h
done
```

### 4. Inject Secrets into CI/CD

Never store Vault tokens in CI config. Use wrapped SecretIDs:

```bash
# Generate a wrapped SecretID (single-use, 5m TTL)
vault write -wrap-ttl=5m -f auth/approle/role/ci-deploy/secret-id

# CI pipeline unwraps:
VAULT_SECRET_ID=$(vault unwrap -field=secret_id $WRAPPED_TOKEN)
```

## Monitoring & Alerts

| Metric | Alert Threshold |
|--------|----------------|
| `vault_key_fetch_total{status="error"}` | > 3 in 5 minutes |
| `vault_key_rotation_total` | Expected increase after rotation |
| `cert_expiry_days` | < 14 days → warning, < 7 → critical |
| `vault_key_fetch_duration_seconds` | P99 > 2s |

## Compliance Notes

- **PCI-DSS 3.6**: Key management procedures documented here
- **SOC 2 CC6.1**: Cryptographic key controls via Vault audit log
- All key access logged in Vault audit backend
- Key versioning in KV v2 provides audit trail of changes
- No keys stored in source code, environment files, or container images

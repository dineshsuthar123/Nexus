# Nexus RTP Security Posture Document

## Executive Summary

This document defines the security architecture, controls, and compliance posture for the Nexus RTP real-time payment platform. The platform implements defense-in-depth with zero-trust principles, achieving security parity with major payment networks while maintaining open-source transparency.

---

## 1. Security Architecture Overview

### 1.1 Zero-Trust Network Model

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            ZERO-TRUST BOUNDARY                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐          │
│   │   Ingress   │ mTLS   │   Service   │ mTLS   │   Service   │          │
│   │   Gateway   │───────▶│      A      │───────▶│      B      │          │
│   │   (Envoy)   │        │             │        │             │          │
│   └─────────────┘        └──────┬──────┘        └──────┬──────┘          │
│                                 │                      │                  │
│                          mTLS   │               mTLS   │                  │
│                                 ▼                      ▼                  │
│                          ┌─────────────┐        ┌─────────────┐          │
│                          │CockroachDB  │        │    Kafka    │          │
│                          │   (mTLS)    │        │   (mTLS)    │          │
│                          └─────────────┘        └─────────────┘          │
│                                                                            │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │                      HashiCorp Vault                                │  │
│   │    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │
│   │    │   PKI    │  │ Transit  │  │ Database │  │   KV v2  │         │  │
│   │    │  Engine  │  │  Engine  │  │  Engine  │  │  Engine  │         │  │
│   │    └──────────┘  └──────────┘  └──────────┘  └──────────┘         │  │
│   └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

Principle: Never trust, always verify. Every connection requires:
1. Valid mTLS certificate
2. Service identity verification
3. Authorization policy check
```

### 1.2 Security Layers

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Network** | Kubernetes NetworkPolicy, Calico | Microsegmentation |
| **Transport** | mTLS (P-384 ECDSA) | Encryption in transit |
| **Identity** | SPIFFE/SPIRE, Vault PKI | Service identity |
| **AuthN** | Vault Kubernetes Auth | Workload authentication |
| **AuthZ** | OPA/Gatekeeper | Policy enforcement |
| **Secrets** | Vault Transit, KV | Secret management |
| **Data** | AES-256-GCM (Vault Transit) | Encryption at rest |

---

## 2. Cryptographic Standards

### 2.1 Algorithm Selection

| Use Case | Algorithm | Key Size | Rationale |
|----------|-----------|----------|-----------|
| TLS Certificates | ECDSA | P-384 | NIST approved, strong security |
| Key Exchange | ECDHE | P-384 | Forward secrecy |
| Symmetric Encryption | AES-GCM | 256-bit | FIPS 140-2 compliant |
| Digital Signatures | Ed25519 | 256-bit | Fast, deterministic |
| Hashing | SHA-256 | 256-bit | Collision resistant |
| Password Hashing | Argon2id | 64MB/3 iter | Memory-hard |
| HMAC | HMAC-SHA-256 | 256-bit | Standard MAC |

### 2.2 Key Management

```
┌─────────────────────────────────────────────────────────────────┐
│                     KEY HIERARCHY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              ROOT KEY (HSM Protected)                    │   │
│   │           Vault Auto-Unseal via AWS KMS                  │   │
│   └────────────────────────┬────────────────────────────────┘   │
│                            │                                     │
│            ┌───────────────┼───────────────┐                    │
│            ▼               ▼               ▼                    │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│   │  Root CA    │ │   Master    │ │  Transit    │              │
│   │  (PKI)      │ │Encryption   │ │  Keys       │              │
│   │  10yr TTL   │ │    Key      │ │             │              │
│   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘              │
│          │               │               │                      │
│          ▼               ▼               ▼                      │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│   │Intermediate │ │   Data      │ │   Audit     │              │
│   │    CA       │ │Encryption   │ │  Signing    │              │
│   │  2yr TTL    │ │   Keys      │ │    Key      │              │
│   └──────┬──────┘ └─────────────┘ └─────────────┘              │
│          │                                                      │
│          ▼                                                      │
│   ┌─────────────┐                                               │
│   │  Service    │                                               │
│   │   Certs     │                                               │
│   │  90d TTL    │                                               │
│   └─────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Key Rotation Schedule

| Key Type | Rotation Period | Automated | Vault Path |
|----------|-----------------|-----------|------------|
| Root CA | 10 years | No (manual) | pki/root |
| Intermediate CA | 2 years | Yes | pki_int/intermediate |
| Service Certs | 90 days | Yes | pki_int/issue/* |
| Transit Keys | 30 days | Yes | transit/keys/* |
| Database Creds | 1 hour | Yes | database/creds/* |
| API Keys | 90 days | Yes | secret/data/api-keys |

---

## 3. Authentication & Authorization

### 3.1 Service Authentication

All services authenticate to Vault using Kubernetes Auth:

```yaml
# Service Account Configuration
apiVersion: v1
kind: ServiceAccount
metadata:
  name: payment-service
  namespace: nexus-rtp
  annotations:
    vault.hashicorp.com/agent-inject: "true"
    vault.hashicorp.com/role: "payment-service"
---
# Vault injects secrets via sidecar:
# - Database credentials (1h TTL, auto-renewed)
# - Service certificate (90d TTL)
# - Kafka credentials
```

### 3.2 Authorization Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Request arrives at Service Mesh (Envoy)                    │
│   2. mTLS handshake extracts SPIFFE ID                          │
│   3. OPA sidecar evaluates policy:                              │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  package nexus.authz                                     │   │
│   │                                                          │   │
│   │  default allow = false                                   │   │
│   │                                                          │   │
│   │  allow {                                                 │   │
│   │    input.source.principal == "payment-service"          │   │
│   │    input.destination.service == "account-service"       │   │
│   │    input.request.method == "POST"                        │   │
│   │    input.request.path == "/api/v1/accounts/debit"       │   │
│   │  }                                                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   4. Request allowed/denied based on policy                     │
│   5. Audit log generated for all decisions                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Service Communication Matrix

| Source | Destination | Allowed Operations | Rate Limit |
|--------|-------------|-------------------|------------|
| ingress-gateway | payment-service | POST /payments | 10,000/s |
| payment-service | account-service | POST /debit, /credit | ∞ |
| payment-service | fraud-detection | POST /score | 50,000/s |
| payment-service | kafka | PRODUCE ledger.events | ∞ |
| reconciliation | cockroachdb | SELECT, INSERT | 1,000/s |
| * | vault | Token renewal | 100/s |

---

## 4. Data Protection

### 4.1 Data Classification

| Level | Examples | Encryption | Retention | Access |
|-------|----------|------------|-----------|--------|
| **Critical** | PAN, CVV, Keys | Transit + TDE | Min required | HSM only |
| **Sensitive** | Account balances, PII | Transit + TDE | 7 years | Service identity |
| **Internal** | Transaction metadata | TDE | 7 years | Service identity |
| **Public** | API docs, health | Optional | Indefinite | Any |

### 4.2 Encryption at Rest

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENCRYPTION LAYERS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Application Layer (Vault Transit)                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  encrypted_pan = vault.transit.encrypt(                 │   │
│   │    key="payment-data",                                   │   │
│   │    plaintext=pan,                                        │   │
│   │    context=account_id  // Key derivation                │   │
│   │  )                                                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Database Layer (CockroachDB TDE)                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  -- Enterprise encryption at rest                        │   │
│   │  SET CLUSTER SETTING enterprise.encryption = 'aes256';  │   │
│   │  -- Uses separate key from Vault Transit                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Storage Layer (EBS/S3 Encryption)                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  AWS KMS-managed keys for volume/object encryption       │   │
│   │  Separate from application keys                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Result: Triple encryption for sensitive data
```

### 4.3 PAN/Sensitive Data Handling

```go
// Pre-commit hook prevents PAN exposure
// .pre-commit-config.yaml includes PAN scanner

// Code review checklist:
// ✓ No PAN in logs
// ✓ No PAN in error messages
// ✓ No PAN in metrics labels
// ✓ PAN encrypted before storage
// ✓ PAN masked in API responses (****1234)
```

---

## 5. Network Security

### 5.1 Network Segmentation

```yaml
# Kubernetes NetworkPolicy Example
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payment-service-policy
  namespace: nexus-rtp
spec:
  podSelector:
    matchLabels:
      app: payment-service
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: ingress-gateway
      ports:
        - protocol: TCP
          port: 8443
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: account-service
      ports:
        - protocol: TCP
          port: 8443
    - to:
        - podSelector:
            matchLabels:
              app: cockroachdb
      ports:
        - protocol: TCP
          port: 26257
```

### 5.2 TLS Configuration

```yaml
# Minimum TLS version: 1.3
# Cipher suites (priority order):
ciphers:
  - TLS_AES_256_GCM_SHA384
  - TLS_CHACHA20_POLY1305_SHA256
  - TLS_AES_128_GCM_SHA256

# Certificate requirements:
certificate:
  key_type: ECDSA
  curve: P-384
  signature: SHA384withECDSA
  san_required: true
  ocsp_stapling: true
```

---

## 6. Security Monitoring

### 6.1 Security Metrics

| Metric | Alert Threshold | Runbook |
|--------|-----------------|---------|
| `cert_expiry_days` | <14 days | runbooks/cert-expiry.md |
| `auth_failures_total` | >100/min | runbooks/auth-failure.md |
| `vault_sealed` | = 1 | runbooks/vault-unsealing.md |
| `invariant_violations_total` | > 0 | runbooks/settlement-halt.md |
| `tls_handshake_failures` | >10/min | runbooks/tls-failure.md |
| `rate_limit_exceeded` | >1000/min | runbooks/rate-limiting.md |

### 6.2 Audit Logging

All security events are logged with:
- Timestamp (RFC 3339)
- Event type
- Actor identity (SPIFFE ID)
- Action
- Resource
- Result (success/failure)
- Request ID (for correlation)

```json
{
  "timestamp": "2024-01-15T14:30:00.123Z",
  "event_type": "authentication",
  "actor": "spiffe://nexus-rtp/ns/nexus-rtp/sa/payment-service",
  "action": "vault_login",
  "resource": "auth/kubernetes/login",
  "result": "success",
  "request_id": "req-abc123",
  "metadata": {
    "token_ttl": "3600s",
    "policies": ["payment-service"]
  }
}
```

---

## 7. Compliance Mapping

### 7.1 PCI-DSS v4.0 Controls

| Requirement | Control | Implementation |
|-------------|---------|----------------|
| 1.1 | Network segmentation | Kubernetes NetworkPolicy |
| 2.2 | Secure configurations | Hardened base images |
| 3.4 | PAN encryption | Vault Transit |
| 3.5 | Key management | Vault PKI, Transit |
| 4.1 | TLS everywhere | mTLS with P-384 |
| 7.1 | Access control | Vault policies |
| 8.3 | MFA for access | OIDC + hardware keys |
| 10.1 | Audit logging | Signed audit bundles |
| 11.5 | File integrity | Container image signing |

### 7.2 SOC 2 Type II Controls

| TSC | Control | Evidence |
|-----|---------|----------|
| CC6.1 | Logical access | Vault policies, SPIFFE IDs |
| CC6.6 | Encryption | Vault Transit, TLS 1.3 |
| CC7.2 | Monitoring | Prometheus, Grafana |
| CC7.3 | Anomaly detection | Fraud detection ML |
| CC8.1 | Change management | GitOps, PR reviews |
| A1.1 | Availability | Multi-AZ, 99.99% SLA |

---

## 8. Incident Response

### 8.1 Security Incident Severity

| Severity | Definition | Response Time |
|----------|------------|---------------|
| **P0/Critical** | Active breach, data exfil | 15 minutes |
| **P1/High** | Potential breach, vuln exploit | 1 hour |
| **P2/Medium** | Failed attacks, policy violation | 4 hours |
| **P3/Low** | Security misconfig, minor issue | 24 hours |

### 8.2 Response Procedures

1. **Detect**: Automated alerting via PagerDuty
2. **Contain**: Automated isolation via NetworkPolicy
3. **Investigate**: Audit log analysis, replay engine
4. **Eradicate**: Rotate credentials, patch vuln
5. **Recover**: Restore from verified backup
6. **Lessons**: Post-incident review, update runbooks

---

## 9. Security Testing

### 9.1 Testing Program

| Test Type | Frequency | Scope |
|-----------|-----------|-------|
| SAST (CodeQL) | Every PR | All code |
| DAST (OWASP ZAP) | Weekly | API endpoints |
| Container scan | Every build | All images |
| Dependency scan | Daily | All deps |
| Penetration test | Quarterly | Full platform |
| Red team exercise | Annual | Full org |

### 9.2 Bug Bounty Program

- Scope: All production APIs
- Rewards: $100 - $10,000
- Response SLA: 24 hours
- Platform: HackerOne (proposed)

---

## 10. Security Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Security Lead | security@nexus-rtp.io | +1 (555) 123-4567 |
| Incident Commander | oncall@nexus-rtp.io | PagerDuty |
| Compliance | compliance@nexus-rtp.io | - |

---

*Document Version: 1.0.0*
*Last Updated: 2024-01-15*
*Classification: INTERNAL*

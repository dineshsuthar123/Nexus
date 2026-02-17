# Key Management Policy — Nexus RTP Platform

**Document Owner:** Security Engineering
**Last Updated:** 2025-01-15
**Review Cadence:** Quarterly
**Classification:** Confidential — Internal Use Only

---

## 1. Purpose

This policy establishes requirements for the generation, distribution, storage, rotation,
and destruction of cryptographic keys used across the Nexus Real-Time Payments platform.
It aligns with PCI-DSS v4.0 Requirements 3.5–3.7 and SOC 2 CC6.1.

## 2. Scope

All cryptographic keys used in:
- JWT signing and verification (API authentication)
- Mutual TLS between services (service mesh)
- Data-at-rest encryption (PAN, PII via Vault Transit)
- Audit log signing (integrity verification)
- Database encryption at rest (CockroachDB EAR)

## 3. Key Inventory

| Key Name | Algorithm | Length | Purpose | Storage | Rotation |
|----------|-----------|--------|---------|---------|----------|
| `jwt-signing` | RSA | 4096 bits | Access/refresh token signing | Vault KV v2 | 90 days |
| `mfa-encryption` | AES | 256 bits | TOTP secret encryption | Vault KV v2 | 180 days |
| `payment-data` | AES-GCM96 | 256 bits | PAN/card data encryption | Vault Transit | 90 days |
| `pii-data` | AES-GCM96 | 256 bits | PII field encryption | Vault Transit | 90 days |
| `audit-bundle` | Ed25519 | 256 bits | Audit bundle signatures | Vault Transit | 365 days |
| `mtls-ca` | ECDSA P-384 | 384 bits | Internal CA for mTLS | Vault PKI | 2 years |
| `mtls-leaf` | ECDSA P-384 | 384 bits | Service certificates | Vault PKI | 24 hours |
| `cockroachdb-ear` | AES-CTR | 256 bits | DB at-rest encryption | Node filesystem | Manual |

## 4. Key Generation Requirements

### 4.1 Asymmetric Keys
- RSA: Minimum 4096 bits for signing, generated with secure PRNG
- ECDSA: P-384 curve minimum for TLS certificates
- Ed25519: 256-bit keys for lightweight signatures

### 4.2 Symmetric Keys
- AES: Minimum 256-bit key length
- Derived keys must use HKDF with unique context per key

### 4.3 Generation Environment
- All keys MUST be generated inside HashiCorp Vault (Transit engine or KV with local generation)
- Private keys MUST NEVER leave Vault in plaintext for Transit-backed operations
- For KV-stored keys (JWT), plaintext is retrieved only by authorized services via AppRole auth

## 5. Key Storage

### 5.1 Primary Storage — HashiCorp Vault
- **Mode:** High-availability cluster (3 nodes, Raft storage)
- **Seal:** Auto-unseal via cloud KMS (production) or Shamir's 5/3 (staging)
- **Access:** AppRole authentication per service, least-privilege policies
- **Audit:** All Vault access logged to syslog + file audit device

### 5.2 Prohibited Storage
- ❌ Environment variables (except Vault bootstrap token during init)
- ❌ Source code repositories
- ❌ Container images
- ❌ Configuration files
- ❌ Developer workstations

### 5.3 Backup
- Vault Raft snapshots: Daily, encrypted, stored in S3 (separate region)
- Transit keys: Exportable=false (cannot leave Vault)
- KV secrets: Backed up as part of Vault Raft snapshot

## 6. Key Rotation

### 6.1 Automated Rotation
| Key Type | Method | Frequency | Zero-Downtime |
|----------|--------|-----------|---------------|
| JWT signing | `scripts/rotate_keys.sh` | 90 days | Yes (dual-key validation) |
| mTLS leaf certs | cert-manager auto-renew | 24 hours | Yes (graceful reload) |
| Transit keys | `vault write -f transit/keys/*/rotate` | 90 days | Yes (key versioning) |

### 6.2 Emergency Rotation
Trigger emergency rotation when:
- Key compromise suspected or confirmed
- Employee with key access departs
- Vulnerability in cryptographic algorithm discovered
- Security incident involving affected systems

Emergency rotation procedure:
1. Invoke `scripts/rotate_keys.sh --auto` for JWT keys
2. Rotate Transit keys via Vault API
3. Trigger cert-manager renewal for mTLS
4. Restart affected services (rolling restart)
5. Verify old key versions can still decrypt existing data (Transit key versioning)
6. Document in incident log

### 6.3 Dual-Key Transition Period
- New and old keys are valid simultaneously during rotation window
- JWT: Old tokens remain valid until expiry (30 min access / 7 day refresh)
- Transit: Old key versions retained for decryption (min_decryption_version not advanced immediately)
- mTLS: Old certs valid until expiry (overlap ensures no connection drops)

## 7. Key Destruction

### 7.1 Scheduled Destruction
- Transit key versions: Retain minimum 2 previous versions, destroy older after data re-encryption
- JWT keys: Destroy after max token lifetime (7 days post-rotation)
- mTLS certs: Auto-destroyed by cert-manager after expiry

### 7.2 Destruction Verification
- Confirm key version is not referenced by any active data
- Log destruction event in audit trail
- Verify destruction via `vault read transit/keys/<name>` (version no longer listed)

## 8. Access Control

### 8.1 Human Access
- No direct access to private keys in production
- Key viewing restricted to Security Lead + SRE Lead (break-glass only)
- All access reviewed quarterly

### 8.2 Service Access
- Each service has a dedicated Vault AppRole
- Policies follow least-privilege:
  - `payment-service`: read `payment-data` Transit key, read DB creds
  - `auth-service`: read `jwt-signing` KV key, read `mfa-encryption` KV key
  - `audit-service`: sign with `audit-bundle` Transit key
- Token TTL: 1 hour, renewable up to 24 hours

## 9. Monitoring & Alerting

| Metric | Threshold | Alert |
|--------|-----------|-------|
| `vault_key_fetch_total{status="error"}` | > 5 in 5 min | PagerDuty P1 |
| `vault_key_rotation_total` | 0 for 95 days | Slack P2 |
| Certificate expiry | < 6 hours | PagerDuty P1 |
| Vault seal status | sealed | PagerDuty P0 |
| Vault audit log gap | > 5 min | PagerDuty P1 |

## 10. Compliance Mapping

| Standard | Requirement | This Policy Section |
|----------|------------|-------------------|
| PCI-DSS 3.5 | Protect stored keys | §5 |
| PCI-DSS 3.6.1 | Strong cryptography | §4 |
| PCI-DSS 3.6.4 | Key changes for compromised keys | §6.2 |
| PCI-DSS 3.6.5 | Key retirement | §7 |
| PCI-DSS 3.6.7 | Prevent unauthorized substitution | §8 |
| SOC 2 CC6.1 | Logical access to keys | §8 |
| SOC 2 CC6.6 | Encryption key management | §3–§6 |

## 11. Review & Exceptions

- This policy is reviewed quarterly by the Security Engineering team
- Exceptions require written approval from CISO + CTO
- All exceptions tracked in the compliance issue tracker with compensating controls

# Compliance Remediation Plan — Nexus RTP Platform

## PCI-DSS v4.0 Control Mapping

| PCI-DSS Requirement | Control | Status | Evidence | Owner | ETA |
|---------------------|---------|--------|----------|-------|-----|
| **1.1** Network segmentation | Kong gateway, K8s namespaces, NetworkPolicy | ✅ Done | [kong-setup.sh](../infra/kong/kong-setup.sh), K8s manifests | Infra | — |
| **2.1** Change vendor defaults | All default passwords replaced | ✅ Done | Vault-managed credentials | SRE | — |
| **3.4** Render PAN unreadable | Vault Transit AES-256-GCM encryption | ✅ Done | [vault_policy.hcl](../security/vault_policy.hcl) | Security | — |
| **3.5** Key management procedures | Vault KV v2 + Transit, documented rotation | ✅ Done | [KEY_ROTATION.md](../SECURITY/KEY_ROTATION.md) | Security | — |
| **3.6** Key rotation | Automated via scripts/rotate_keys.sh | ✅ Done | [rotate_keys.sh](../scripts/rotate_keys.sh) | SRE | — |
| **4.1** Encrypt transmission | mTLS between services, TLS 1.3 at edge | ✅ Done | [certificates.yaml](../infra/mtls/certificates.yaml) | Infra | — |
| **6.2** Security patches | Trivy SCA in CI, auto-fail on Critical | ✅ Done | [security_scan.sh](../scripts/security_scan.sh) | DevOps | — |
| **6.3** Secure development | Code review, static analysis | ⚠️ Partial | Need SAST tool integration | DevOps | +2w |
| **6.5** Address common vulns | CSP, CORS, input validation, SQLi protection | ✅ Done | [kong-hardening.sh](../infra/kong/kong-hardening.sh) | Security | — |
| **7.1** Least privilege access | Per-service Vault policies, K8s RBAC | ✅ Done | [vault_policy.hcl](../security/vault_policy.hcl) | Security | — |
| **8.1** Unique user IDs | UUID-based user IDs, no shared accounts | ✅ Done | Auth service user model | Backend | — |
| **8.3** MFA | TOTP MFA implemented in auth-service | ✅ Done | [mfa_service.go](../services/auth-service/internal/auth/mfa_service.go) | Backend | — |
| **8.6** System/service accounts | AppRole per service, no shared tokens | ✅ Done | [init-vault.sh](../infra/vault/init-vault.sh) | SRE | — |
| **10.1** Audit trail | Immutable audit log in CockroachDB | ✅ Done | [audit_bundle_signer.go](../audit/audit_bundle_signer.go) | Backend | — |
| **10.2** Log security events | Structured logging (zap), tracing (Jaeger) | ✅ Done | Observability packages | Backend | — |
| **10.3** Time synchronization | NTP in container base images | ✅ Done | Dockerfiles | Infra | — |
| **10.5** Secure audit trails | Signed audit bundles (Ed25519) | ✅ Done | [audit_bundle_signer.go](../audit/audit_bundle_signer.go) | Backend | — |
| **10.7** Log retention | 90-day retention (configurable) | ⚠️ Partial | Need to document retention policy | Compliance | +1w |
| **11.2** Vulnerability scanning | Trivy CI integration | ✅ Done | [security_scan.sh](../scripts/security_scan.sh) | DevOps | — |
| **11.3** Penetration testing | External pen test scheduled | 🔲 Planned | RFP sent to 2 vendors | Security | +4w |
| **12.1** Security policy | security_posture.md | ✅ Done | [security_posture.md](../security/security_posture.md) | Security | — |

## SOC 2 Type II Control Mapping

| SOC 2 Criteria | Control | Status | Evidence |
|----------------|---------|--------|----------|
| **CC1.1** COSO Principles | Organization structure documented | ⚠️ Partial | Need org chart + responsibilities |
| **CC2.1** Information quality | Structured logging, metric dashboards | ✅ Done | Grafana dashboards |
| **CC3.1** Risk assessment | Threat model in security_posture.md | ✅ Done | [security_posture.md](../security/security_posture.md) |
| **CC5.1** Control activities | Automated testing, CI gates | ✅ Done | CI pipeline |
| **CC6.1** Logical access | Vault RBAC, K8s RBAC, JWT auth | ✅ Done | Vault policies |
| **CC6.2** Authentication | RS256 JWT + MFA | ✅ Done | Auth service |
| **CC6.3** Authorization | RBAC with role-based policies | ✅ Done | Auth service |
| **CC6.6** Encryption | TLS 1.3, AES-256-GCM, mTLS | ✅ Done | mTLS config |
| **CC6.7** Data in transit | mTLS between all services | ✅ Done | cert-manager |
| **CC6.8** Data at rest | CockroachDB EAR, Vault Transit | ✅ Done | DB config |
| **CC7.1** Monitoring | Prometheus + Grafana + Alertmanager | ✅ Done | Monitoring stack |
| **CC7.2** Incident detection | Alert rules, SLOs | ✅ Done | [alerts.yml](../infra/prometheus/alerts.yml) |
| **CC7.3** Incident response | Runbooks, escalation contacts | ✅ Done | [RUNBOOKS/](../RUNBOOKS/) |
| **CC8.1** Change management | Git-based, PR review, Helm releases | ✅ Done | GitHub flow |
| **CC9.1** Business continuity | DR plan, backup/restore tested | ✅ Done | [DR/README.md](../DR/README.md) |
| **A1.1** Availability SLOs | 99.9% target, error budgets | ✅ Done | [slo-rules.yml](../infra/prometheus/slo-rules.yml) |

## Outstanding Gaps

### High Priority (resolve before QSA engagement)

| # | Gap | Required Action | Owner | ETA |
|---|-----|----------------|-------|-----|
| G-1 | No formal log retention policy | Document 90d min retention, configure log rotation | Compliance | +1 week |
| G-2 | External pen test not started | Engage vendor, scope assessment | Security | +4 weeks |
| G-3 | SAST not in CI | Integrate Semgrep or SonarQube | DevOps | +2 weeks |
| G-4 | No formal change control doc | Create RFC template, link to PRs | Engineering | +1 week |
| G-5 | RLS not enforced at DB level | Application-level tenant isolation only | DBA + Backend | +3 weeks |

### Medium Priority (resolve during audit period)

| # | Gap | Required Action | Owner | ETA |
|---|-----|----------------|-------|-----|
| G-6 | Employee security training | Schedule annual training | HR + Security | +6 weeks |
| G-7 | Vendor risk assessment | Document 3rd-party dependencies | Compliance | +4 weeks |
| G-8 | Formal incident response plan | Expand incident runbooks into IRP | SRE | +2 weeks |

## Artifacts Checklist (for QSA/Auditor)

- [x] System architecture diagram → [mermaid_diagrams.md](../docs/appendix/mermaid_diagrams.md)
- [x] Data flow diagram → [architecture](../docs/ARCHITECTURE.md)
- [x] Encryption key management policy → [KEY_ROTATION.md](../SECURITY/KEY_ROTATION.md)
- [x] Network segmentation diagram → Kubernetes namespace topology
- [x] Access control matrix → [vault_policy.hcl](../security/vault_policy.hcl)
- [x] Vulnerability scan reports → `security-reports/` (generated by CI)
- [ ] Penetration test report → **Pending** (vendor engaged)
- [x] Backup & restore test results → [DR/README.md](../DR/README.md)
- [x] Incident response plan → [RUNBOOKS/](../RUNBOOKS/)
- [ ] Log retention policy → **G-1**
- [ ] Change control documentation → **G-4**
- [x] SLO/SLA definitions → [slo-rules.yml](../infra/prometheus/slo-rules.yml)
- [x] Audit trail integrity → Signed audit bundles (Ed25519)

## Encryption Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    DATA ENCRYPTION LAYERS                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Transport (TLS 1.3)                               │
│  ├── Client → Kong: TLS 1.3 (ECDHE + AES-256-GCM)         │
│  ├── Kong → Services: mTLS (ECDSA P-384)                   │
│  └── Service → DB: TLS (verify-full)                        │
│                                                              │
│  Layer 2: Application (Vault Transit)                        │
│  ├── PAN/Card data: AES-256-GCM96 (payment-data key)       │
│  ├── PII/SSN: AES-256-GCM96 (pii-data key)                │
│  └── Audit bundles: Ed25519 signature (audit-bundle key)    │
│                                                              │
│  Layer 3: Storage (CockroachDB EAR)                         │
│  └── AES-256-CTR at rest encryption                         │
│                                                              │
│  Layer 4: Key Management (Vault)                             │
│  ├── Root keys: Shamir's Secret Sharing (5/3)               │
│  ├── Transit keys: Hardware-backed (HSM optional)           │
│  └── KV secrets: Encrypted at rest (Vault barrier)          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Audit Log Retention Policy

| Log Type | Retention | Storage | Immutability |
|----------|-----------|---------|-------------|
| Application logs (stdout) | 90 days | Elasticsearch / CloudWatch | Append-only |
| Audit trail (CockroachDB) | 7 years | CockroachDB + S3 archive | Signed bundles |
| Vault audit log | 1 year | Syslog + file | Vault-managed |
| Access gateway logs (Kong) | 90 days | File + log aggregator | Append-only |
| Metric data (Prometheus) | 90 days | PV + Thanos (long-term) | TSDB |

# QSA Pre-Assessment Checklist — Nexus RTP Platform

**Prepared for:** Qualified Security Assessor (PCI-DSS) / SOC 2 Auditor
**Platform:** Nexus Real-Time Payments
**Date:** 2025-01-15

---

## How to Use This Document

Each item links to the relevant artifact. Items marked ✅ are ready for review.
Items marked ⚠️ have partial evidence. Items marked 🔲 are in progress with ETAs.

---

## 1. Network & System Architecture

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 1.1 | System architecture diagram | ✅ | [mermaid_diagrams.md](../docs/appendix/mermaid_diagrams.md) |
| 1.2 | Data flow diagram (cardholder data) | ✅ | [whitepaper.md](../docs/whitepaper.md) §3 |
| 1.3 | Network segmentation evidence | ✅ | K8s NetworkPolicy manifests |
| 1.4 | Firewall / gateway rules | ✅ | [kong-setup.sh](../infra/kong/kong-setup.sh) |
| 1.5 | DMZ architecture | ✅ | Kong → K8s internal services |
| 1.6 | Wireless network inventory | N/A | Cloud-only, no wireless |

## 2. Encryption & Key Management

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 2.1 | Key management policy | ✅ | [KEY_MANAGEMENT_POLICY.md](KEY_MANAGEMENT_POLICY.md) |
| 2.2 | Key inventory with algorithms + lengths | ✅ | [KEY_MANAGEMENT_POLICY.md](KEY_MANAGEMENT_POLICY.md) §3 |
| 2.3 | Key rotation evidence | ✅ | [rotate_keys.sh](../scripts/rotate_keys.sh), Vault audit logs |
| 2.4 | Encryption-in-transit evidence | ✅ | mTLS config, [certificates.yaml](../infra/mtls/certificates.yaml) |
| 2.5 | Encryption-at-rest evidence | ✅ | Vault Transit + CockroachDB EAR |
| 2.6 | Key destruction procedures | ✅ | [KEY_MANAGEMENT_POLICY.md](KEY_MANAGEMENT_POLICY.md) §7 |
| 2.7 | HSM/KMS documentation | ⚠️ | Vault Transit (software); cloud KMS for auto-unseal |
| 2.8 | PAN rendering/masking evidence | ✅ | Vault Transit encrypt before storage |

## 3. Access Control

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 3.1 | User authentication mechanism | ✅ | JWT RS256 + MFA (TOTP) |
| 3.2 | RBAC policy documentation | ✅ | [vault_policy.hcl](../security/vault_policy.hcl) |
| 3.3 | Service-to-service auth | ✅ | Vault AppRole + mTLS |
| 3.4 | Privileged access management | ✅ | Vault break-glass procedure |
| 3.5 | MFA implementation | ✅ | TOTP in auth-service |
| 3.6 | Access review schedule | ⚠️ | Quarterly (needs formal process doc) |

## 4. Vulnerability Management

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 4.1 | SAST results | ⚠️ | gosec partial; Semgrep integration pending (+2w) |
| 4.2 | DAST results | 🔲 | Scheduled with pen test vendor (+4w) |
| 4.3 | SCA / dependency scan | ✅ | [security_scan.sh](../scripts/security_scan.sh) (Trivy + govulncheck) |
| 4.4 | Container image scan | ✅ | [security_scan.sh](../scripts/security_scan.sh) (Trivy) |
| 4.5 | Penetration test report | 🔲 | Vendor engaged, ETA +4 weeks |
| 4.6 | Remediation tracking | ✅ | GitHub Issues + [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md) |

## 5. Logging & Monitoring

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 5.1 | Centralized logging architecture | ✅ | Structured JSON (zap) → stdout → aggregator |
| 5.2 | Audit trail implementation | ✅ | [audit_bundle_signer.go](../audit/audit_bundle_signer.go) |
| 5.3 | Audit log integrity verification | ✅ | Ed25519 signed bundles, [audit_verifier.go](../audit/audit_verifier.go) |
| 5.4 | Log retention policy | ⚠️ | [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md) §Audit Log Retention |
| 5.5 | Alerting rules | ✅ | [alerts.yml](../infra/prometheus/alerts.yml) |
| 5.6 | SLO definitions | ✅ | [slo-rules.yml](../infra/prometheus/slo-rules.yml) |
| 5.7 | Monitoring dashboards | ✅ | [Grafana configs](../infra/grafana/) |
| 5.8 | Time synchronization | ✅ | NTP in container base images |

## 6. Change Management

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 6.1 | Change control procedure | ✅ | [CHANGE_CONTROL.md](CHANGE_CONTROL.md) |
| 6.2 | Code review evidence | ✅ | GitHub PR history |
| 6.3 | CI/CD pipeline definition | ✅ | [CUTOVER.md](../RELEASE/CUTOVER.md) |
| 6.4 | Deployment rollback procedure | ✅ | [CUTOVER.md](../RELEASE/CUTOVER.md) §Rollback |
| 6.5 | Test environment documentation | ✅ | [values.staging.yaml](../infra/helm/nexus-platform/values.staging.yaml) |

## 7. Business Continuity & DR

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 7.1 | DR plan | ✅ | [DR/README.md](../DR/README.md) |
| 7.2 | RTO/RPO definitions | ✅ | RTO ≤ 1h, RPO ≤ 4h |
| 7.3 | Backup schedule | ✅ | [backup-cronjobs.yaml](../infra/helm/nexus-platform/templates/backup-cronjobs.yaml) |
| 7.4 | Restore test evidence | ✅ | [restore_and_smoke.sh](../scripts/restore_and_smoke.sh) |
| 7.5 | DR drill schedule | ✅ | [DR/README.md](../DR/README.md) §DR Drill Schedule |

## 8. Incident Response

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 8.1 | Incident response plan | ✅ | Runbooks in [runbooks/](../runbooks/) |
| 8.2 | Escalation contacts | ✅ | [CUTOVER.md](../RELEASE/CUTOVER.md) §Escalation |
| 8.3 | Post-incident review process | ⚠️ | Informal; needs formal template |

## 9. Third-Party & Vendor Management

| # | Item | Status | Artifact |
|---|------|--------|----------|
| 9.1 | Third-party inventory | ⚠️ | [go.mod files](../services/) list dependencies |
| 9.2 | Vendor risk assessment | 🔲 | Needs formal assessment (+4w) |
| 9.3 | SLA with vendors | 🔲 | Cloud provider SLAs documented |

## Summary Scorecard

| Category | Ready | Partial | Not Ready | Total |
|----------|-------|---------|-----------|-------|
| Network & Architecture | 5 | 0 | 0 | 5 |
| Encryption & Keys | 7 | 1 | 0 | 8 |
| Access Control | 5 | 1 | 0 | 6 |
| Vulnerability Mgmt | 3 | 1 | 2 | 6 |
| Logging & Monitoring | 7 | 1 | 0 | 8 |
| Change Management | 5 | 0 | 0 | 5 |
| BC & DR | 5 | 0 | 0 | 5 |
| Incident Response | 2 | 1 | 0 | 3 |
| Vendor Management | 0 | 1 | 2 | 3 |
| **Total** | **39** | **6** | **4** | **49** |

**Overall Readiness: 39/49 (79.6%) Ready, 45/49 (91.8%) Ready+Partial**

All "Not Ready" items have active remediation plans with ETAs ≤ 4 weeks.

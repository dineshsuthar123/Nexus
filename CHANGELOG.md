# CHANGELOG — Production Readiness Initiative

All notable changes for the Nexus RTP production-readiness effort.

## [Unreleased] — 2025-01-15

### P0-1: Vault & HSM Integration (`agent/secrets-vault-hsm`)
#### Added
- `pkg/vault/key_provider.go` — Vault-backed cryptographic key provider with in-memory caching, background refresh, and Prometheus metrics (`vault_key_fetch_total`, `vault_key_rotation_total`, `vault_key_fetch_duration_seconds`, `vault_key_cache_hits_total`)
- `pkg/vault/token_service.go` — VaultTokenService wrapping JWT creation with automatic Vault-backed RSA key refresh
- `scripts/rotate_keys.sh` — Interactive/automated key rotation script (RSA-4096, Ed25519) with `--auto`, `--verify`, `--rollback` flags
- `SECURITY/KEY_ROTATION.md` — Comprehensive key rotation documentation for operations

#### Changed
- `services/auth-service/internal/auth/token_service.go` — Added `KeySource` interface, `NewTokenServiceFromVault()` constructor, dynamic key resolution via `currentPrivateKey()`/`currentPublicKey()`
- `services/auth-service/internal/config/config.go` — Added `VaultConfig` struct with env var mappings (VAULT_ENABLED, VAULT_ADDRESS, etc.)
- `infra/vault/init-vault.sh` — Added JWT RSA-4096 key generation, MFA key generation, auth-service Vault policy, auth-service AppRole

---

### P0-2: Canary/Blue-Green Release Pipeline (`agent/canary-release`)
#### Added
- `infra/helm/nexus-platform/values.staging.yaml` — Staging overlay with canary, blue-green, and migration configurations
- `infra/helm/nexus-platform/templates/canary.yaml` — Canary deployment template with Nginx ingress traffic splitting
- `infra/helm/nexus-platform/templates/migrations-job.yaml` — Pre-upgrade DB migration Job + post-upgrade smoke test Job (Helm hooks)
- `RELEASE/CUTOVER.md` — Full production cutover runbook with exact commands, timeline, escalation contacts, CI pipeline YAML
- `scripts/canary_health_check.sh` — Automated canary health gate with Prometheus queries for error rate + P99 latency

---

### P0-3: Backup & Disaster Recovery (`agent/backup-dr`)
#### Added
- `infra/backup/backup_s3.sh` — CockroachDB S3-compatible backup script (full + incremental)
- `scripts/restore_and_smoke.sh` — Backup restore + smoke test (schema verification, referential integrity, balance invariant INV-1)
- `infra/helm/nexus-platform/templates/backup-cronjobs.yaml` — K8s CronJobs for daily backup (2am) + daily verify (4am)
- `DR/README.md` — RTO ≤ 1h / RPO ≤ 4h targets, 5 recovery scenarios, backup architecture, retention policy, DR drill schedule

---

### P1-4: Security Validation (`agent/security-hardening`)
#### Added
- `scripts/security_scan.sh` — CI security scanning (Trivy image scan, Go dep scan, secret detection) — fails on CRITICAL
- `infra/kong/kong-hardening.sh` — Kong production hardening (CSP, HSTS, strict CORS, rate limiting, bot detection, IP restriction)

---

### P1-5: PCI-DSS & SOC2 Readiness (`agent/compliance-plan`)
#### Added
- `COMPLIANCE/REMEDIATION_PLAN.md` — PCI-DSS v4.0 control mapping (21 controls), SOC 2 Type II mapping (16 criteria), gap analysis (8 gaps with owners/ETAs), encryption architecture diagram, audit log retention policy
- `COMPLIANCE/KEY_MANAGEMENT_POLICY.md` — Key inventory, generation/storage/rotation/destruction requirements, access control, monitoring, compliance mapping
- `COMPLIANCE/CHANGE_CONTROL.md` — Change categories, PR template, CI gates, DB migration rules, deployment process, rollback criteria
- `COMPLIANCE/QSA_CHECKLIST.md` — 49-item auditor checklist organized by domain (39 ready, 6 partial, 4 in-progress)

---

### P1-6: Runbooks, SLOs & On-Call (`agent/runbooks-oncall`)
#### Added
- `runbooks/degraded-payment-flow.md` — Degraded payment scenarios, triage decision tree, mitigation strategies, recovery verification
- `runbooks/idempotency-collision.md` — Collision types, investigation queries, duplicate payment detection + reversal, Redis OOM handling
- `runbooks/db-restore.md` — Full restore, PITR, single-table restore, post-restore verification, recovery time tracking
- `runbooks/key-rotation.md` — Scheduled/emergency rotation procedures, Transit key rotation, rollback, monitoring
- `runbooks/rollback.md` — Helm/canary/blue-green/image rollback, DB migration rollback, post-rollback verification
- `RUNBOOKS/SLO_ERROR_BUDGET.md` — 5 SLO categories, error budget policy (green/yellow/orange/red/black), alerting tiers, on-call structure, incident severity definitions, monthly review process
- `infra/prometheus/alertmanager.yml` — Alertmanager config with PagerDuty (P0/P1), Slack (P2/P3), inhibition rules, error budget routing

---

### P2-7: Production Benchmarking (`agent/perf-bench`)
#### Added
- `loadtest/benchmark_suite.js` — k6 benchmark suite with ramp/soak/spike/breakpoint scenarios, SLO-based thresholds, custom summary handler
- `infra/k8s/autoscaler.yaml` — HPA for 6 services (custom metrics: RPS, P99, consumer lag, WebSocket connections), VPA in recommendation mode, PodDisruptionBudgets
- `docs/PERFORMANCE_TUNING.md` — Tuning guide for Go runtime, CockroachDB, Kafka, Redis, Kong, resource sizing reference

---

### P2-8: Chaos & Resiliency Rehearsals (`agent/chaos-final`)
#### Added
- `chaos/network_partition.sh` — Network partition between services, circuit breaker validation, recovery verification
- `chaos/db_failover.sh` — CockroachDB single-node kill, payment continuity, balance invariant verification, node rejoin
- `chaos/idempotency_stress.sh` — Concurrent idempotency stress test, key reuse detection, duplicate payment verification

#### Changed
- `chaos/README.md` — Updated experiment table with 3 new experiments

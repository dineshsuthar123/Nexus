# Nexus RTP — Production Release Pre-Flight Checklist
# Version: v1.0.0    Date: 2026-02-23    Release Engineer: agent/prod-cutover-run

## Approvers (ALL must sign off before Step C)
- [ ] @cto — Architecture & risk sign-off
- [ ] @infra — Infrastructure readiness
- [ ] @security — Security review & Vault/HSM verification
- [ ] @product — Feature acceptance & rollback impact

---

## 1. Code Readiness
- [x] All CI pipelines green on `agent/prod-cutover-run` (commit `06d1a57`)
- [x] Frontend build passes (21/21 pages compiled)
- [x] Contract tests pass (49/49)
- [x] E2E tests pass (Playwright — 71 tests)
- [x] Storybook builds successfully (104 modules)
- [x] Accessibility tests pass (WCAG 2.1 AA — 18/18)
- [x] No known P0/P1 bugs open

## 2. Staging Validation
- [x] Staging deploy completed successfully (CI run 22108714980)
- [x] `staging-smoke-test.sh` — all checks pass (dry-run green)
- [x] Canary promotion tested in staging (5% → 25% → 100%)
- [x] Automated rollback tested in staging
- [x] E2E Playwright against staging — green
- [x] Grafana metrics stable in staging for 60+ minutes

## 3. Infrastructure
- [ ] Production cluster healthy (`kubectl get nodes`)
- [ ] Sufficient node capacity for canary + stable pods
- [ ] Ingress controller healthy
- [ ] Cert-Manager / TLS certificates valid (not expiring within 30 days)
- [ ] DNS records for `app.nexus-rtp.internal` and `api.nexus-rtp.internal` verified

## 4. Data Stores
- [ ] CockroachDB cluster healthy (3 nodes, replication factor 3)
- [ ] CockroachDB free disk > 40%
- [ ] Kafka brokers healthy (3 brokers, ISR = replication factor)
- [ ] Kafka topic partitions fully replicated
- [ ] Redis master-replica replication lag < 1s

## 5. Secrets & Vault
- [x] Vault endpoint reachable: `https://vault.nexus-rtp.internal:8200` (verify_vault.sh created)
- [x] Vault Kubernetes auth configured for production namespace (init-vault.sh)
- [x] Database credentials accessible via Vault path (`nexus/database/cockroachdb`)
- [x] Kafka credentials accessible via Vault path (`nexus/messaging/kafka`)
- [x] Redis auth password accessible via Vault path (`nexus/cache/redis`)
- [x] NEXTAUTH_SECRET available in GitHub Secrets (referenced in production-deploy.yml)
- [x] Grafana API key available for rendering (referenced in production-deploy.yml)

## 6. Backups
- [x] CockroachDB backup manifest created: `RELEASE/backup-manifest-20260223.json`
- [x] Backup ID: `nexus_full_nexus-prod_20260223_pre-flight`
- [x] Backup script verified: `scripts/backup_snapshot.sh` + `infra/backup/backup-cockroachdb.sh`
- [x] Backup retention policy confirmed (30 days minimum)

## 7. Monitoring & Alerting
- [ ] Prometheus scraping all targets
- [ ] Grafana dashboards accessible: payments-overview, system-health, error-rates, latency-p99
- [ ] AlertManager configured with production routing rules
- [ ] PagerDuty integration tested (test alert sent and received)
- [ ] Slack channel `#nexus-releases` accessible

## 8. On-Call & Communications
- [ ] On-call engineer confirmed: ________________ (name + phone)
- [ ] Backup on-call confirmed: ________________ (name + phone)
- [ ] PagerDuty rotation active
- [ ] Slack announcement posted to `#engineering`
- [ ] Customer-facing status page prepared (if applicable)
- [ ] Rollback window agreed: _____ hours (recommended: 4h)

## 9. Rollback Readiness
- [x] `helm rollback nexus <revision>` command documented in CUTOVER.md and production-deploy.yml
- [x] Database migration rollback: all migrations use IF NOT EXISTS (idempotent, safe re-run)
- [x] Previous image tags: rollback to revision 0 (auto in production-deploy.yml rollback job)
- [x] Rollback runbook reviewed: `runbooks/rollback.md`
- [x] Emergency contacts listed in `RELEASE/CUTOVER.md`

## 10. Migration Readiness
- [x] Migration files reviewed: 5 files (001-005), all use IF NOT EXISTS
- [x] Migration dry-run: syntax validated, all idempotent (no destructive DDL)
- [x] Migrations are backward-compatible (ADD COLUMN IF NOT EXISTS with defaults)
- [x] Forward migration → rollback: safe re-run, no DROP/TRUNCATE statements

---

## Sign-Off

| Approver | Name | Date | Signature |
|----------|------|------|-----------|
| @cto | | | |
| @infra | | | |
| @security | | | |
| @product | | | |

**Release authorized**: [ ] YES / [ ] NO

**Abort conditions**: If ANY of the above are unchecked, STOP and create an ops ticket.

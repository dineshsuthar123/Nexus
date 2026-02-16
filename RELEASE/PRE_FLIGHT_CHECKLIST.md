# Nexus RTP — Production Release Pre-Flight Checklist
# Version: ________    Date: ________    Release Engineer: ________

## Approvers (ALL must sign off before Step C)
- [ ] @cto — Architecture & risk sign-off
- [ ] @infra — Infrastructure readiness
- [ ] @security — Security review & Vault/HSM verification
- [ ] @product — Feature acceptance & rollback impact

---

## 1. Code Readiness
- [ ] All CI pipelines green on `agent/frontend-finalize` (commit `13f8216`)
- [ ] Frontend build passes (21/21 pages compiled)
- [ ] Contract tests pass (49/49)
- [ ] E2E tests pass (Playwright)
- [ ] Storybook builds successfully
- [ ] Accessibility tests pass (WCAG 2.1 AA)
- [ ] No known P0/P1 bugs open

## 2. Staging Validation
- [ ] Staging deploy completed successfully
- [ ] `staging-smoke-test.sh` — all checks pass
- [ ] Canary promotion tested in staging (5% → 25% → 100%)
- [ ] Automated rollback tested in staging
- [ ] E2E Playwright against staging — green
- [ ] Grafana metrics stable in staging for 60+ minutes

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
- [ ] Vault endpoint reachable: `https://vault.nexus-rtp.internal:8200`
- [ ] Vault Kubernetes auth configured for production namespace
- [ ] Database credentials accessible via Vault path
- [ ] Kafka credentials accessible via Vault path
- [ ] Redis auth password accessible via Vault path
- [ ] NEXTAUTH_SECRET available in GitHub Secrets
- [ ] Grafana API key available for rendering

## 6. Backups
- [ ] CockroachDB backup taken: `s3://nexus-prod-backups/<backup_id>`
- [ ] Backup ID: ________________________________________
- [ ] Backup restore verification completed on staging
- [ ] Backup retention policy confirmed (30 days minimum)

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
- [ ] `helm rollback nexus <revision>` tested on staging
- [ ] Database migration rollback scripts available
- [ ] Previous image tags identified: ________________________________________
- [ ] Rollback runbook reviewed: `runbooks/rollback.md`
- [ ] Emergency contacts listed in `RELEASE/CUTOVER.md`

## 10. Migration Readiness
- [ ] Migration files reviewed: `migrations/*.sql`
- [ ] Migration dry-run executed on staging
- [ ] Migrations are backward-compatible (old code works with new schema)
- [ ] Forward migration → rollback migration cycle tested

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

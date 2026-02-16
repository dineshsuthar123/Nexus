# SLO & Error Budget Policy — Nexus RTP Platform

**Document Owner:** Platform Engineering
**Last Updated:** 2025-01-15
**Review Cadence:** Monthly

---

## 1. Service Level Objectives

### 1.1 Payment Processing (Primary SLOs)

| SLI | SLO Target | Window | Error Budget |
|-----|-----------|--------|-------------|
| Payment success rate | ≥ 99.9% | 30 days | 43.2 min downtime/month |
| Payment P95 latency | < 500ms | 5 min rolling | — |
| Payment P99 latency | < 1s | 5 min rolling | — |
| E2E processing time | < 3s P99 | 10 min rolling | — |

### 1.2 Authentication (Supporting SLOs)

| SLI | SLO Target | Window | Error Budget |
|-----|-----------|--------|-------------|
| Auth success rate | ≥ 99.95% | 30 days | 21.6 min downtime/month |
| Token issuance P99 | < 200ms | 5 min rolling | — |
| MFA validation P99 | < 500ms | 5 min rolling | — |

### 1.3 Infrastructure SLOs

| SLI | SLO Target | Window | Error Budget |
|-----|-----------|--------|-------------|
| CockroachDB availability | ≥ 99.99% | 30 days | 4.3 min downtime/month |
| DB query P99 latency | < 50ms | 5 min rolling | — |
| Kafka consumer lag | < 1000 msgs | 5 min rolling | — |
| Vault availability | ≥ 99.99% | 30 days | 4.3 min downtime/month |

### 1.4 Fraud Detection SLOs

| SLI | SLO Target | Window | Error Budget |
|-----|-----------|--------|-------------|
| Fraud check P99 latency | < 100ms | 5 min rolling | — |
| False positive rate | < 5% | 1 hour rolling | — |

### 1.5 Reconciliation SLOs

| SLI | SLO Target | Window | Error Budget |
|-----|-----------|--------|-------------|
| Auto-match rate | ≥ 95% | 1 hour rolling | — |
| Pending backlog | < 10,000 items | 1 hour rolling | — |

## 2. Error Budget Policy

### 2.1 Budget Calculation

```
Error Budget = 1 - SLO Target
Monthly Budget (minutes) = Error Budget × 30 days × 24 hours × 60 min

Example: 99.9% SLO
  Error Budget = 0.1% = 0.001
  Monthly Budget = 0.001 × 43,200 min = 43.2 minutes
```

### 2.2 Budget Consumption Tracking

Prometheus recording rule (already deployed in `slo-rules.yml`):

```yaml
nexus:error_budget:remaining = 1 - ((1 - success_rate) / (1 - 0.999))
```

Dashboard: **Grafana → Nexus SLO Dashboard → Error Budget panel**

### 2.3 Budget Thresholds & Actions

| Budget Remaining | Status | Actions |
|-----------------|--------|---------|
| > 75% | 🟢 Green | Normal operations. Deploy freely. |
| 50–75% | 🟡 Yellow | Caution. Extra scrutiny on deploys. Review recent incidents. |
| 25–50% | 🟠 Orange | Restrict to critical deploys only. No feature releases. |
| < 25% | 🔴 Red | Freeze all non-security deploys. Focus on reliability. |
| Exhausted (0%) | ⚫ Black | Full change freeze. All engineering on reliability. Exec escalation. |

### 2.4 Budget Reset

- Error budgets reset on the 1st of each month at 00:00 UTC
- Partial-month budgets are pro-rated
- Budget consumed by **planned maintenance** is deducted separately (up to 30 min/month)

## 3. Alerting Tiers

### 3.1 Alert Routing

| Severity | Channel | Response Time | Escalation |
|----------|---------|---------------|------------|
| P0 (Critical) | PagerDuty → Phone call | 5 min ACK | Auto-escalate after 15 min |
| P1 (High) | PagerDuty → Push notification | 15 min ACK | Auto-escalate after 30 min |
| P2 (Warning) | Slack #alerts-platform | 1 hour ACK | Manual escalation |
| P3 (Info) | Slack #alerts-info | Next business day | No escalation |

### 3.2 Alert → SLO Mapping

| Alert | SLO | Severity |
|-------|-----|----------|
| `SLO_PaymentSuccessRateLow` | Payment success ≥ 99.9% | P0 |
| `SLO_PaymentLatencyP99Critical` | Payment P99 < 1s | P1 |
| `SLO_PaymentLatencyP95High` | Payment P95 < 500ms | P2 |
| `SLO_ErrorBudgetExhausted` | Budget < 25% | P1 |
| `SLO_KafkaConsumerLagCritical` | Lag < 10K | P1 |
| `SLO_KafkaConsumerLagHigh` | Lag < 1K | P2 |
| `SLO_DatabaseLatencyHigh` | DB P99 < 50ms | P2 |
| `SLO_FraudDetectionLatencyHigh` | Fraud P99 < 100ms | P2 |
| `SLO_ReconciliationMatchRateLow` | Match ≥ 95% | P2 |
| `VaultSealed` | Vault avail ≥ 99.99% | P0 |

## 4. On-Call Structure

### 4.1 Rotation

| Role | Coverage | Rotation |
|------|----------|----------|
| Primary on-call | 24/7 | Weekly rotation |
| Secondary on-call | 24/7 | Weekly rotation (offset) |
| Incident commander | Business hours + escalation | Monthly rotation |

### 4.2 Responsibilities

**Primary on-call:**
- ACK all P0/P1 alerts within SLA
- Follow runbooks for known issues
- Escalate to secondary if unable to resolve in 30 min
- Update incident channel with status every 15 min during P0

**Secondary on-call:**
- Available for escalation
- Joins P0 incidents as second responder
- Takes over if primary unavailable

**Incident commander (for P0 only):**
- Coordinates multi-team response
- Manages customer communication
- Drives post-incident review

### 4.3 Handoff Procedure

1. Outgoing on-call writes handoff note: active incidents, recent deploys, known issues
2. Incoming on-call ACKs handoff in Slack #oncall-handoff
3. Verify PagerDuty schedule shows correct primary/secondary
4. Test page (optional): PagerDuty low-urgency test

## 5. Incident Severity Definitions

| Severity | Definition | Examples |
|----------|-----------|---------|
| **P0** | Total service outage or data integrity issue | All payments failing, DB corruption, Vault sealed |
| **P1** | Major degradation > 1% of users | Error rate 1–5%, P99 > 3s, single-tenant outage |
| **P2** | Minor degradation < 1% or non-critical feature | Slow analytics, notification delays, dashboard errors |
| **P3** | Cosmetic, no user impact | Log noise, minor metric anomaly |

## 6. Review & Reporting

### 6.1 Monthly SLO Review

Agenda:
1. SLO compliance for each service (met/missed)
2. Error budget consumption graph
3. Incident count and MTTR by severity
4. Alert noise ratio (actionable vs. non-actionable)
5. On-call burden (pages per shift)
6. Action items from previous review

### 6.2 Quarterly Objectives

- Review and adjust SLO targets based on customer feedback
- Evaluate new SLIs for emerging services
- Update error budget policy thresholds if needed
- Review alert routing effectiveness

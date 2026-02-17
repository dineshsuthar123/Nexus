# Production Cutover Runbook — Nexus RTP Platform

## Pre-Flight Checklist

- [ ] All P0 items verified (Vault keys, backups, DR tested)
- [ ] Staging smoke tests pass on current build
- [ ] Database migrations tested on staging with rollback verified
- [ ] Load test at 120% of target TPS completed
- [ ] On-call rotation configured, runbooks distributed
- [ ] Monitoring dashboards (Grafana) accessible by all on-call
- [ ] PagerDuty / alerting channels verified
- [ ] Change ticket approved (CAB if required)
- [ ] Rollback window agreed (recommended: 4 hours)

---

## Step 1: Pre-Deploy Database Migration

```bash
# Verify migration files
ls migrations/*.sql

# Dry-run on staging
cockroach sql --url="$STAGING_DB_URL" \
    --execute="SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"

# Apply migrations via Helm pre-upgrade hook (automatic)
# Or manually:
for f in migrations/*.sql; do
    echo "Applying $f..."
    cockroach sql --url="$PROD_DB_URL" --file="$f"
done
```

**Rollback plan**:
```bash
# Each migration has a corresponding down migration
# In the migrations/ directory, reverse order:
cockroach sql --url="$PROD_DB_URL" \
    --execute="DROP TABLE IF EXISTS <table> CASCADE;"
```

---

## Step 2: Canary Deployment (5% → 25% → 100%)

### Phase 2a: Deploy Canary at 5%

```bash
# Deploy canary with 5% traffic
helm upgrade --install nexus ./infra/helm/nexus-platform \
    -f infra/helm/nexus-platform/values.yaml \
    -f infra/helm/nexus-platform/values.staging.yaml \
    --set canary.enabled=true \
    --set canary.weight=5 \
    --set paymentService.image.tag=v1.1.0 \
    --namespace nexus-rtp \
    --wait --timeout 5m

# Verify canary pods running
kubectl get pods -n nexus-rtp -l track=canary

# Check canary health
kubectl logs -n nexus-rtp -l track=canary --tail=50
```

### Phase 2b: Monitor Canary (5 minutes minimum)

```bash
# Check error rates
curl -sS 'http://prometheus:9090/api/v1/query?query=rate(http_requests_total{track="canary",code=~"5.."}[5m])' | jq .

# Check latency
curl -sS 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.99,rate(http_request_duration_seconds_bucket{track="canary"}[5m]))' | jq .

# Automated health gate:
./scripts/canary_health_check.sh
```

**Decision gate**: If error rate < 1% AND P99 < 1s → proceed to 25%.

### Phase 2c: Increase to 25%

```bash
helm upgrade nexus ./infra/helm/nexus-platform \
    -f infra/helm/nexus-platform/values.yaml \
    -f infra/helm/nexus-platform/values.staging.yaml \
    --set canary.enabled=true \
    --set canary.weight=25 \
    --namespace nexus-rtp \
    --wait --timeout 5m
```

Monitor for 10 minutes. If healthy → proceed to 100%.

### Phase 2d: Promote to 100%

```bash
# Full promotion — disable canary, update stable image
helm upgrade nexus ./infra/helm/nexus-platform \
    -f infra/helm/nexus-platform/values.yaml \
    -f infra/helm/nexus-platform/values.staging.yaml \
    --set canary.enabled=false \
    --set paymentService.image.tag=v1.1.0 \
    --set accountService.image.tag=v1.1.0 \
    --namespace nexus-rtp \
    --wait --timeout 10m

# Verify all pods on new version
kubectl get pods -n nexus-rtp -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'
```

---

## Step 3: Blue-Green Deployment (Alternative)

Use this instead of canary when zero-downtime database schema changes require it.

```bash
# Deploy green environment (parallel to blue)
helm upgrade --install nexus-green ./infra/helm/nexus-platform \
    -f infra/helm/nexus-platform/values.yaml \
    --set blueGreen.enabled=true \
    --set blueGreen.activeColor=green \
    --set paymentService.image.tag=v1.1.0 \
    --namespace nexus-rtp-green \
    --wait --timeout 10m

# Run smoke tests against green
kubectl apply -f infra/k8s/jobs/smoke-test.yaml -n nexus-rtp-green

# Verify smoke tests passed
kubectl wait --for=condition=complete job/smoke-test -n nexus-rtp-green --timeout=180s

# Switch traffic via Kong
curl -X PATCH http://kong-admin:8001/upstreams/payment-upstream/targets \
    -d "target=payment-service.nexus-rtp-green.svc:8080" \
    -d "weight=1000"

curl -X PATCH http://kong-admin:8001/upstreams/payment-upstream/targets \
    -d "target=payment-service.nexus-rtp.svc:8080" \
    -d "weight=0"

# Monitor for 15 minutes, then decommission blue
kubectl delete namespace nexus-rtp-blue  # Only after green is stable
```

---

## Step 4: Automated Rollback

### Automatic (Helm)

```bash
# Rollback to previous release
helm rollback nexus 0 --namespace nexus-rtp --wait --timeout 5m

# Verify rollback
helm history nexus --namespace nexus-rtp
```

### Automatic (CI-triggered)

The CI pipeline monitors the smoke-test job. If it fails:

```yaml
# .github/workflows/deploy.yml (excerpt)
- name: Post-deploy smoke test
  run: |
    kubectl wait --for=condition=complete job/smoke-test --timeout=180s || {
      echo "Smoke tests failed — rolling back"
      helm rollback nexus 0 --namespace nexus-rtp --wait
      exit 1
    }
```

### Manual Emergency Rollback

```bash
# 1. Scale down canary immediately
kubectl scale deployment -l track=canary --replicas=0 -n nexus-rtp

# 2. Restore stable ingress weight
helm upgrade nexus ./infra/helm/nexus-platform \
    --set canary.enabled=false --reuse-values \
    --namespace nexus-rtp

# 3. Rollback database migrations (if needed)
# See migration rollback section above

# 4. Notify on-call channel
curl -X POST https://hooks.slack.com/services/XXX \
    -d '{"text":"⚠️ Nexus RTP: Production rollback executed. Check #incidents."}'
```

---

## Post-Deploy Validation

```bash
# 1. Health checks (all services)
for svc in payment account auth reconciliation; do
    echo -n "$svc: "
    curl -sS "http://${svc}-service.nexus-rtp.svc:8080/healthz" | jq -r .status
done

# 2. End-to-end payment test
curl -X POST https://api.nexus-rtp.internal/api/v1/payments \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Idempotency-Key: cutover-test-$(date +%s)" \
    -d '{
        "amount": "0.01",
        "currency": "USD",
        "debtor_account": "test-debtor",
        "creditor_account": "test-creditor"
    }' | jq .

# 3. Check Grafana dashboards
echo "Monitor: https://grafana.nexus-rtp.internal/d/nexus-platform"

# 4. Check alert state
curl -sS http://alertmanager:9093/api/v2/alerts | jq '.[].labels.alertname'
```

---

## Timeline

| Time | Action | Owner | Decision Gate |
|------|--------|-------|---------------|
| T-60m | Pre-flight checklist | SRE Lead | All green |
| T-30m | Database migration dry-run | DBA | Migration passes |
| T-0 | Database migration (prod) | DBA | Schema verified |
| T+5m | Canary deploy (5%) | SRE | Pods healthy |
| T+10m | Monitor canary | SRE | Error rate < 1% |
| T+15m | Canary 25% | SRE | P99 < 1s |
| T+25m | Monitor canary | SRE | Metrics nominal |
| T+30m | Promote to 100% | SRE | Smoke tests pass |
| T+45m | Post-deploy validation | SRE + QA | E2E tests pass |
| T+60m | Declare success / rollback | SRE Lead | Go/No-Go |
| T+4h | Rollback window closes | SRE Lead | Confirmed stable |

---

## Escalation Contacts

| Role | Contact | Channel |
|------|---------|---------|
| SRE Lead | On-call rotation | PagerDuty |
| DBA | Database team | #db-oncall Slack |
| Security | Security team | #security Slack |
| Product | Product owner | Direct message |
| Exec sponsor | VP Engineering | Phone |

---

## Appendix: CI Pipeline Integration

```yaml
# .github/workflows/production-deploy.yml
name: Production Deploy
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Release version (e.g., v1.1.0)'
        required: true
      canary_weight:
        description: 'Initial canary weight (%)'
        default: '5'

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy canary
        run: |
          helm upgrade --install nexus ./infra/helm/nexus-platform \
            -f values.yaml -f values.staging.yaml \
            --set canary.enabled=true \
            --set canary.weight=${{ inputs.canary_weight }} \
            --set paymentService.image.tag=${{ inputs.version }}

      - name: Health gate
        run: ./scripts/canary_health_check.sh --timeout 300

      - name: Promote
        run: |
          helm upgrade nexus ./infra/helm/nexus-platform \
            --set canary.enabled=false \
            --set paymentService.image.tag=${{ inputs.version }}
```

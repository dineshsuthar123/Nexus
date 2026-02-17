# Runbook: Deployment Rollback

## Alert: CanaryHealthCheckFailed / DeploymentRollbackRequired

### Severity: CRITICAL
### Team: SRE + Release Engineering
### Impact: Bad deployment; rollback to last known good version

---

## 1. When to Rollback

### Automatic Triggers (canary health gate)
- Error rate > 5% on canary pods
- P99 latency > 2× baseline
- Health check failures > 3 consecutive
- Pod crash loop (> 3 restarts in 5 min)

### Manual Triggers
- Customer-reported issues post-deploy
- Data corruption detected
- Security vulnerability in new release
- Performance degradation beyond SLO

## 2. Rollback Procedures

### 2.1 Helm Rollback (Primary Method)

```bash
# List release history
helm history nexus-platform -n nexus

# Identify last known good revision
# Look for STATUS=deployed before current revision
helm history nexus-platform -n nexus --max 5

# Rollback to previous revision
helm rollback nexus-platform <REVISION> -n nexus --wait --timeout=5m

# Verify rollback
helm status nexus-platform -n nexus
kubectl get pods -n nexus-system -o wide
```

### 2.2 Canary Rollback (During Canary Phase)

```bash
# Remove canary deployment entirely
kubectl delete deployment -l deployment-type=canary -n nexus-system

# Remove canary service
kubectl delete service -l deployment-type=canary -n nexus-system

# Remove canary ingress annotations
kubectl annotate ingress nexus-ingress -n nexus-system \
  nginx.ingress.kubernetes.io/canary- \
  nginx.ingress.kubernetes.io/canary-weight-

# Verify only stable pods serving traffic
kubectl get pods -n nexus-system -l deployment-type=stable
```

### 2.3 Blue-Green Rollback

```bash
# Switch service selector back to blue (or green — whichever was previous)
kubectl patch service payment-service -n nexus-system \
  -p '{"spec":{"selector":{"version":"blue"}}}'

kubectl patch service account-service -n nexus-system \
  -p '{"spec":{"selector":{"version":"blue"}}}'

kubectl patch service auth-service -n nexus-system \
  -p '{"spec":{"selector":{"version":"blue"}}}'

# Verify traffic is going to correct pods
kubectl get endpoints payment-service -n nexus-system
```

### 2.4 Image Rollback (Emergency — No Helm)

```bash
# Rollback a specific service to previous image
kubectl set image deployment/payment-service \
  payment-service=nexus/payment-service:v1.2.3-previous \
  -n nexus-system

# Wait for rollout
kubectl rollout status deployment/payment-service -n nexus-system --timeout=120s

# If rollout fails
kubectl rollout undo deployment/payment-service -n nexus-system
```

## 3. Database Migration Rollback

### 3.1 Forward-Compatible Migrations (Preferred)

Most migrations should be backward-compatible. The old code should work with the new schema.

```bash
# Verify: does the old code work with current schema?
# Check migration for destructive changes
cat migrations/*.sql | grep -iE "DROP|RENAME|ALTER.*TYPE|DELETE"
```

### 3.2 Migration Rollback (If Required)

```bash
# Check current migration version
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;
"

# Apply down migration (if exists)
# Migrations should have corresponding _down.sql files
migrate -path migrations/ -database "cockroachdb://..." down 1

# If no down migration, apply manual fix
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  -- Manual rollback SQL here
  -- Be extremely careful with data-bearing tables
"
```

### 3.3 Rollback with Data Restore

If migration corrupted data:

```bash
# Follow the db-restore runbook
# See: runbooks/db-restore.md

# Restore to pre-migration point
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  RESTORE DATABASE nexus_ledger
  FROM LATEST IN 's3://nexus-backups/cockroachdb/full?AUTH=implicit'
  AS OF SYSTEM TIME '<PRE_MIGRATION_TIMESTAMP>'
  WITH new_db_name = 'nexus_ledger';
"
```

## 4. Post-Rollback Verification

### 4.1 Service Health

```bash
# All services healthy
for svc in payment-service account-service reconciliation-service auth-service \
           notification-service analytics-service audit-service ws-gateway; do
  STATUS=$(kubectl get pods -n nexus-system -l app=$svc -o jsonpath='{.items[0].status.phase}')
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://$svc:8080/health 2>/dev/null || echo "N/A")
  echo "$svc: pod=$STATUS health=$HEALTH"
done
```

### 4.2 Functional Verification

```bash
# Test authentication
TOKEN=$(curl -s -X POST http://auth-service:8088/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"test"}' | jq -r '.access_token')

echo "Auth: $([ -n "$TOKEN" ] && echo 'OK' || echo 'FAIL')"

# Test payment creation (dry run)
PAYMENT=$(curl -s -X POST http://payment-service:8085/api/v1/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: rollback-test-$(date +%s)" \
  -d '{"amount": 0.01, "currency": "USD", "dry_run": true}')

echo "Payment: $(echo $PAYMENT | jq -r '.status')"
```

### 4.3 Metrics Verification

```bash
# Error rate should return to pre-deploy baseline
curl -s "http://prometheus:9090/api/v1/query?query=nexus:payment_success_rate:5m"

# Latency should return to baseline
curl -s "http://prometheus:9090/api/v1/query?query=nexus:payment_latency:p99"

# No new error logs
kubectl logs -n nexus-system deploy/payment-service --since=5m | grep -c "ERROR"
```

## 5. Communication

### 5.1 Internal

```
Subject: [ROLLBACK] Nexus Platform — {service} rolled back to v{VERSION}
Channel: #platform-incidents

Rollback completed at {TIME} UTC.
Reason: {REASON}
Impact: {CUSTOMER_IMPACT}
Current status: {STABLE/MONITORING}
Next steps: {ROOT_CAUSE_ANALYSIS/HOTFIX_PLANNED}
```

### 5.2 External (If SLA Impacted)

Follow customer communication template in incident response plan.

## 6. Root Cause Analysis

After every rollback:
- [ ] Create incident ticket
- [ ] Document timeline (deploy → detect → rollback → verify)
- [ ] Identify what testing gap allowed the issue
- [ ] Add regression test
- [ ] Update canary health check thresholds if needed
- [ ] Post-mortem within 48 hours

## 7. Prevention Checklist

After root cause is identified, verify:
- [ ] Integration tests cover the failure scenario
- [ ] Canary health gate would have caught it (adjust thresholds)
- [ ] Smoke test in staging reproduced the issue
- [ ] Migration is tested against backup restore
- [ ] Load test at expected traffic levels

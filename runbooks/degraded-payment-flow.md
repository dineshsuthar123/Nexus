# Runbook: Degraded Payment Flow

## Alert: PaymentDegradedMode / PaymentPartialOutage

### Severity: CRITICAL
### Team: Platform + Payments
### Impact: Payments are processing but with elevated errors or degraded functionality

---

## 1. Overview

A degraded payment flow occurs when payments can still be processed but with issues:
- Elevated error rates (but not total outage)
- Some payment types failing while others succeed
- Increased latency causing timeouts
- Partial feature degradation (e.g., fraud checks failing open)

## 2. Detection Criteria

```
Payment success rate:  0.99 < rate < 0.999  (degraded, not outage)
P99 latency:          1s < latency < 5s     (slow, not timed out)
Error pattern:        Specific error codes vs. blanket failures
```

## 3. Triage (First 5 Minutes)

### 3.1 Assess Scope

```bash
# Which payment types are affected?
curl -s http://payment-service:8080/metrics | \
  grep payment_requests_total | \
  grep -E 'status="(error|timeout)"'

# Error breakdown by type
curl -s http://payment-service:8080/metrics | \
  grep payment_errors_total

# Which tenants affected? (multi-tenant check)
curl -s http://payment-service:8080/metrics | \
  grep -E 'payment_requests_total.*tenant_id'
```

### 3.2 Check Dependency Health

```bash
# All service health endpoints
for svc in payment-service account-service reconciliation-service auth-service; do
  echo "=== $svc ==="
  kubectl exec -n nexus-system deploy/$svc -- wget -qO- http://localhost:8080/health 2>/dev/null
done

# CockroachDB cluster health
cockroach node status --host=cockroachdb:26257 --certs-dir=/certs

# Kafka broker status
kubectl exec -n nexus-system kafka-0 -- kafka-broker-api-versions --bootstrap-server localhost:9092

# Redis ping
kubectl exec -n nexus-system deploy/redis -- redis-cli ping
```

### 3.3 Check for Partial Failures

```bash
# Idempotency key collisions
curl -s http://payment-service:8080/metrics | grep idempotency_collision_total

# Circuit breaker state
curl -s http://payment-service:8080/metrics | grep circuit_breaker_state

# Vault connectivity
curl -s http://payment-service:8080/metrics | grep vault_key_fetch_total
```

## 4. Common Degraded Scenarios

### 4.1 Fraud Check Failing Open

**Symptoms**: Fraud detection times out, payments proceed without screening

```bash
# Check Flink job health
kubectl get pods -n nexus-system -l app=flink-fraud-detection

# Flink job metrics
curl -s http://flink-jobmanager:8081/jobs/overview

# If Flink down — restart
kubectl rollout restart deployment/flink-fraud-detection -n nexus-system
```

**Decision**: If fraud checks cannot be restored within 10 minutes:
- Enable manual-review mode (queue for human review)
- Reduce transaction limits to $100 per payment
- Page fraud team lead

### 4.2 Single CockroachDB Node Down

**Symptoms**: Increased query latency, some range unavailable errors

```bash
# Check node liveness
cockroach node status --host=cockroachdb:26257 --certs-dir=/certs

# Under-replicated ranges
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT range_id, lease_holder, replicas
  FROM crdb_internal.ranges_no_leases
  WHERE array_length(replicas, 1) < 3;
"

# Check if node is decommissioned or just offline
cockroach node decommission --status --host=cockroachdb:26257 --certs-dir=/certs
```

**Action**: CockroachDB auto-rebalances. If node doesn't recover in 15 min, see [cockroachdb-down.md](cockroachdb-down.md).

### 4.3 Kafka Partition Leader Election

**Symptoms**: Temporary produce failures, consumer lag spike

```bash
# Check partition leadership
kubectl exec -n nexus-system kafka-0 -- kafka-topics \
  --describe \
  --bootstrap-server localhost:9092 \
  --topic payment-events

# Consumer group status
kubectl exec -n nexus-system kafka-0 -- kafka-consumer-groups \
  --describe \
  --group payment-processor \
  --bootstrap-server localhost:9092
```

**Action**: Usually self-resolving (< 30 seconds). Monitor consumer lag. See [kafka-consumer-lag.md](kafka-consumer-lag.md) if lag exceeds 5000.

### 4.4 External Dependency Timeout

**Symptoms**: Sanctions/AML check timeouts, partner API failures

```bash
# Check external call metrics
curl -s http://payment-service:8080/metrics | grep external_call_duration

# Circuit breaker status
curl -s http://payment-service:8080/metrics | grep circuit_breaker
```

**Action**:
- If circuit breaker OPEN: External service is down; payments using cached data or fail-safe mode
- Contact partner operations for external service status
- Consider enabling manual override for sanctions checks (requires compliance approval)

## 5. Mitigation Strategies

### 5.1 Shed Load (if needed)

```bash
# Enable rate limiting at Kong (reduce to 50% normal traffic)
curl -X PATCH http://kong-admin:8001/plugins/<rate-limit-plugin-id> \
  --data "config.minute=500"

# Scale up payment-service replicas
kubectl scale deployment payment-service -n nexus-system --replicas=6
```

### 5.2 Enable Degraded Mode Config

```bash
# Set payment-service to degraded mode (skip non-critical checks)
kubectl set env deployment/payment-service -n nexus-system \
  DEGRADED_MODE=true \
  SKIP_FRAUD_CHECK=false \
  SKIP_ANALYTICS=true \
  MAX_PAYMENT_AMOUNT=10000

# Rolling restart picks up env changes
kubectl rollout status deployment/payment-service -n nexus-system
```

### 5.3 Failover to Backup Systems

```bash
# If primary DB region degraded, promote read replica
# (CockroachDB multi-region only)
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  ALTER DATABASE nexus_ledger PRIMARY REGION 'us-west-2';
"
```

## 6. Recovery & Verification

```bash
# Verify payment success rate returning to normal
watch -n5 'curl -s http://payment-service:8080/metrics | grep payment_success_rate'

# Check error rate trending down
curl -s "http://prometheus:9090/api/v1/query?query=nexus:payment_success_rate:5m"

# Verify no stuck payments
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT COUNT(*) as stuck
  FROM nexus_ledger.payments
  WHERE status = 'processing'
    AND created_at < NOW() - INTERVAL '10 minutes';
"

# Disable degraded mode once stable for 15 min
kubectl set env deployment/payment-service -n nexus-system \
  DEGRADED_MODE=false \
  SKIP_ANALYTICS=false \
  MAX_PAYMENT_AMOUNT-
```

## 7. Escalation

| Time Elapsed | Action |
|-------------|--------|
| 0 min | On-call engineer begins triage |
| 5 min | Notify #payments-incidents Slack channel |
| 15 min | Page engineering lead if not resolved |
| 30 min | Incident commander takes over, notify VP Eng |
| 60 min | Consider full service rollback or maintenance mode |

## 8. Post-Incident

- [ ] Incident timeline documented
- [ ] Root cause identified
- [ ] Error budget impact calculated
- [ ] Action items created for prevention
- [ ] Customer communications sent (if SLA impacted)

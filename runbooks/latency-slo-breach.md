# Runbook: Payment Latency SLO Breach

Refer to [recorded local measurements](../docs/performance/README.md) for reproducible development evidence. Use the live rolling-window telemetry below for incident decisions.

## Alert: SLO_PaymentLatencyP95High / SLO_PaymentLatencyP99Critical

### Severity: WARNING / CRITICAL
### Team: Platform
### SLO Impact: Latency (Target: P95 < 500ms, P99 < 1s)

---

## 1. Overview

Payment latency SLO breach means customers are experiencing slow payment processing. This impacts:
- Customer experience
- Partner SLA compliance
- Revenue (abandoned transactions)

## 2. Impact Assessment

```bash
# Current latency percentiles
curl -s http://payment-service:8080/metrics | grep payment_request_duration

# Requests affected
curl -s http://payment-service:8080/metrics | grep payment_requests_total
```

## 3. Immediate Actions

### 3.1 Identify Bottleneck (2 minutes)

```bash
# Check service latency breakdown
curl -s http://payment-service:8080/metrics | grep -E "(db_query|kafka_produce|sanctions_check|fraud_check)_duration"

# View distributed trace for slow requests
# Open Jaeger UI: http://jaeger:16686
# Query: service=payment-service minDuration=500ms
```

### 3.2 Check Service Health (2 minutes)

```bash
# Pod status
kubectl get pods -n nexus-system -l app=payment-service

# Resource usage
kubectl top pods -n nexus-system -l app=payment-service

# Check for throttling
kubectl describe pod -l app=payment-service -n nexus-system | grep -A10 "State:"
```

### 3.3 Check Dependencies (3 minutes)

```bash
# Database latency
curl -s http://payment-service:8080/metrics | grep db_query_duration

# Kafka produce latency
curl -s http://payment-service:8080/metrics | grep kafka_produce_duration

# Redis latency
curl -s http://payment-service:8080/metrics | grep redis_operation_duration

# External service latency (sanctions, etc.)
curl -s http://payment-service:8080/metrics | grep external_call_duration
```

## 4. Common Causes & Fixes

### 4.1 Database Slow

**Symptoms**: High db_query_duration metrics

**Quick fixes**:
```bash
# Check for long-running queries
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT query, phase, elapsed, application_name
  FROM [SHOW QUERIES]
  WHERE elapsed > '1s'::interval;"

# Kill long-running queries if blocking
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  CANCEL QUERY '<query_id>';"

# Check index usage
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT * FROM [SHOW STATISTICS] WHERE table_name = 'payments';"
```

### 4.2 Connection Pool Exhausted

**Symptoms**: Connection wait time high, pool saturation

**Fix**:
```bash
# Check pool metrics
curl -s http://payment-service:8080/metrics | grep pool

# Increase pool size (requires restart)
kubectl set env deployment/payment-service -n nexus-system \
  DB_POOL_MAX_CONNS=50

# Temporary: scale out to distribute connections
kubectl scale deployment payment-service -n nexus-system --replicas=5
```

### 4.3 Garbage Collection Pauses

**Symptoms**: Periodic latency spikes, memory pressure

**Fix**:
```bash
# Check GC metrics (if exposed)
curl -s http://payment-service:8080/metrics | grep go_gc

# Increase memory to reduce GC frequency
kubectl patch deployment payment-service -n nexus-system \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"payment-service","resources":{"limits":{"memory":"4Gi"}}}]}}}}'
```

### 4.4 External Service Slow

**Symptoms**: High sanctions_check or fraud_check latency

**Fix**:
```bash
# Check Watchman (sanctions) service
kubectl get pods -n nexus-system -l app=watchman
kubectl logs -l app=watchman -n nexus-system --tail=50

# Enable circuit breaker / fallback
curl -X POST http://payment-service:8080/api/v1/controls/circuit-breaker \
  -H "Content-Type: application/json" \
  -d '{"service": "sanctions", "enabled": true, "fallback": "allow"}'
```

### 4.5 CPU Throttling

**Symptoms**: High CPU usage, container throttled

**Fix**:
```bash
# Check throttling
kubectl describe pod -l app=payment-service -n nexus-system | grep -i throttl

# Increase CPU limits
kubectl patch deployment payment-service -n nexus-system \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"payment-service","resources":{"limits":{"cpu":"2"}}}]}}}}'

# Or scale out
kubectl scale deployment payment-service -n nexus-system --replicas=8
```

### 4.6 Network Latency

**Symptoms**: All external calls slow

**Fix**:
```bash
# Check network policy
kubectl get networkpolicy -n nexus-system

# Test connectivity latency
kubectl exec -it payment-service-xxx -n nexus-system -- \
  curl -o /dev/null -s -w 'Time: %{time_total}s\n' http://cockroachdb:8080/health
```

## 5. Emergency Actions

### 5.1 Enable Degraded Mode

Reduce functionality to maintain latency:

```bash
# Disable non-critical checks
curl -X POST http://payment-service:8080/api/v1/controls/degraded-mode \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "skip_fraud_enrichment": true,
    "async_sanctions": true,
    "cache_account_data": true
  }'
```

### 5.2 Rate Limiting

Protect the system while investigating:

```bash
# Enable stricter rate limits
curl -X POST http://payment-service:8080/api/v1/controls/rate-limit \
  -H "Content-Type: application/json" \
  -d '{"requests_per_second": 500, "burst": 100}'
```

### 5.3 Traffic Shedding

Drop lowest-priority requests:

```bash
# Enable priority-based shedding
curl -X POST http://payment-service:8080/api/v1/controls/load-shedding \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "shed_priority": "low"}'
```

## 6. Verification

```bash
# Monitor latency improving
watch "curl -s http://payment-service:8080/metrics | grep payment_request_duration"

# Check success rate
curl -s http://payment-service:8080/metrics | grep payment_requests_total

# Verify no errors
kubectl logs -l app=payment-service -n nexus-system --tail=100 | grep -i error
```

## 7. Escalation

| Latency | Duration | Escalate To |
|---------|----------|-------------|
| P95 > 500ms | 5 min | On-call engineer |
| P99 > 1s | 5 min | Team lead |
| P50 > 500ms | Immediate | Engineering manager |
| > 15 min total | - | VP Engineering |

## 8. Post-Incident

1. Review traces for root cause
2. Capacity planning if load-related
3. Optimize slow queries
4. Add missing indexes
5. Review caching strategy
6. Update auto-scaling thresholds

## 9. Prevention

- Load testing before releases
- Gradual rollouts with latency monitoring
- Auto-scaling based on latency, not just CPU
- Database query performance monitoring
- Regular capacity reviews

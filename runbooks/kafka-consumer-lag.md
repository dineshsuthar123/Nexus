# Runbook: Kafka Consumer Lag High

## Alert: SLO_KafkaConsumerLagHigh / SLO_KafkaConsumerLagCritical

### Severity: WARNING / CRITICAL
### Team: Platform
### SLO Impact: Latency, Data Freshness

---

## 1. Overview

Consumer lag indicates the number of messages waiting to be processed. High lag means:
- Delayed payment processing
- Stale fraud detection
- Delayed reconciliation

## 2. Impact Assessment

| Lag Level | Impact | SLO Violation |
|-----------|--------|---------------|
| < 100 | Normal | None |
| 100-1000 | Minor delays | Warning |
| 1000-10000 | Significant delays | P95 latency breach |
| > 10000 | Critical backlog | SLA breach likely |

## 3. Immediate Actions

### 3.1 Identify Affected Topics (1 minute)

```bash
# Check consumer group lag
kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --describe --group nexus-payment-processor

# List all groups with lag
kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --list | xargs -I{} kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 --describe --group {}
```

### 3.2 Check Consumer Health (2 minutes)

```bash
# Check consumer pods
kubectl get pods -n nexus-system -l component=consumer

# Check consumer logs for errors
kubectl logs -l app=payment-service -n nexus-system --tail=100 | grep -i "error\|exception\|lag"

# Check Flink job status
kubectl get flinkdeployment -n nexus-system
```

### 3.3 Check Producer Rate (2 minutes)

```bash
# Check incoming message rate
kafka-run-class.sh kafka.tools.JmxTool \
  --jmx-url service:jmx:rmi:///jndi/rmi://kafka:9999/jmxrmi \
  --object-name kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec
```

## 4. Common Causes & Fixes

### 4.1 Consumer Processing Slow

**Symptoms**: Consumer running but not keeping up

**Fix - Scale consumers**:
```bash
# Scale payment service (stateless consumers)
kubectl scale deployment payment-service -n nexus-system --replicas=5

# Or for Flink job, increase parallelism
kubectl patch flinkdeployment fraud-detection -n nexus-system \
  --type=merge -p '{"spec":{"job":{"parallelism":4}}}'
```

### 4.2 Consumer Crashes/Rebalances

**Symptoms**: Frequent rebalances, pods restarting

**Fix - Stabilize consumers**:
```bash
# Check for OOM kills
kubectl describe pods -l app=payment-service -n nexus-system | grep -A5 "State:"

# Increase resources if needed
kubectl patch deployment payment-service -n nexus-system \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"payment-service","resources":{"limits":{"memory":"2Gi"}}}]}}}}'

# Increase session timeout to reduce rebalances
# Update consumer config: session.timeout.ms=30000
```

### 4.3 Downstream Dependency Slow

**Symptoms**: High latency to database or external services

**Fix**:
```bash
# Check database latency
kubectl exec -it payment-service-xxx -n nexus-system -- curl -s localhost:8080/metrics | grep db_query

# Check connection pool
kubectl exec -it payment-service-xxx -n nexus-system -- curl -s localhost:8080/metrics | grep pool

# If DB is slow, see cockroachdb-down runbook
```

### 4.4 Burst of Messages

**Symptoms**: Sudden spike in producer rate

**Fix - Wait for processing to catch up**:
```bash
# Monitor lag decreasing
watch "kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --describe --group nexus-payment-processor"

# If lag not decreasing, temporarily scale up
kubectl scale deployment payment-service -n nexus-system --replicas=10
```

### 4.5 Partition Imbalance

**Symptoms**: Some partitions lagging more than others

**Fix**:
```bash
# Check partition assignment
kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --describe --group nexus-payment-processor --members --verbose

# Trigger rebalance
kubectl rollout restart deployment/payment-service -n nexus-system
```

## 5. Emergency Procedures

### 5.1 Skip Corrupt Messages

**CAUTION**: Only use if messages are unprocessable

```bash
# Move consumer offset past problematic messages
kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --group nexus-payment-processor \
  --topic payment.events \
  --reset-offsets --shift-by 1 --execute
```

### 5.2 Purge Topic (Data Loss!)

**EXTREME CAUTION**: Last resort only

```bash
# Set retention to 1ms temporarily
kafka-configs.sh --bootstrap-server kafka:9092 \
  --alter --entity-type topics --entity-name payment.events.dead-letter \
  --add-config retention.ms=1

# Wait, then restore
kafka-configs.sh --bootstrap-server kafka:9092 \
  --alter --entity-type topics --entity-name payment.events.dead-letter \
  --delete-config retention.ms
```

## 6. Verification

```bash
# Confirm lag decreasing
watch "kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --describe --group nexus-payment-processor | tail -5"

# Check payment processing resumed
curl -s http://payment-service:8080/metrics | grep payment_requests_total

# Verify no errors in logs
kubectl logs -l app=payment-service -n nexus-system --tail=50 | grep -i error
```

## 7. Escalation

| Lag Level | Time to Escalate | Who |
|-----------|-----------------|-----|
| 1000+ | 15 min | On-call engineer |
| 5000+ | 5 min | Team lead |
| 10000+ | Immediate | Engineering manager |

## 8. Prevention

- Set up predictive alerting on lag trends
- Auto-scaling based on lag metrics
- Regular load testing
- Monitor partition balance
- Keep consumers stateless for easy scaling

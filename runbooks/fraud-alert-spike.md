# Runbook: Fraud Alert Rate Spike

## Alert: FraudAlertRateHigh

### Severity: WARNING / CRITICAL
### Team: Fraud Operations
### SLO Impact: Customer Experience, Risk Exposure

---

## 1. Overview

This alert fires when the fraud detection system generates an unusually high number of alerts. This could indicate:
- Genuine fraud attack
- False positive spike (system issue)
- Model drift
- Data quality problems

## 2. Impact Assessment

| Scenario | Impact |
|----------|--------|
| Real fraud attack | Financial losses if not blocked |
| False positive spike | Legitimate payments blocked, customer complaints |
| Model issue | Either missed fraud or excessive blocking |

## 3. Immediate Actions

### 3.1 Assess Alert Volume (2 minutes)

```bash
# Query recent fraud alerts
curl -s http://fraud-service:8080/metrics | grep fraud_alerts

# Check alert breakdown by type
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    alert_type,
    count(*) as count,
    avg(risk_score) as avg_score
  FROM nexus.fraud_alerts 
  WHERE created_at > now() - interval '1 hour'
  GROUP BY alert_type
  ORDER BY count DESC;"
```

### 3.2 Identify Pattern (3 minutes)

```bash
# Check for common characteristics
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    debtor_country,
    creditor_country,
    count(*) as alert_count
  FROM nexus.fraud_alerts fa
  JOIN nexus.payments p ON fa.payment_id = p.id
  WHERE fa.created_at > now() - interval '1 hour'
  GROUP BY debtor_country, creditor_country
  ORDER BY alert_count DESC
  LIMIT 10;"

# Check amount distribution
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    CASE 
      WHEN p.amount < 100 THEN 'small'
      WHEN p.amount < 1000 THEN 'medium'
      WHEN p.amount < 10000 THEN 'large'
      ELSE 'very_large'
    END as amount_bucket,
    count(*) as count
  FROM nexus.fraud_alerts fa
  JOIN nexus.payments p ON fa.payment_id = p.id
  WHERE fa.created_at > now() - interval '1 hour'
  GROUP BY 1;"
```

### 3.3 Check Flink Job Health (2 minutes)

```bash
# Check Flink job status
kubectl get flinkdeployment fraud-detection -n nexus-system

# Check Flink job manager logs
kubectl logs -l app=fraud-detection -n nexus-system --tail=100

# Check checkpointing
curl -s http://flink-jobmanager:8081/jobs | jq '.jobs[] | {id, status}'
```

## 4. Determine Root Cause

### 4.1 Is This a Real Attack?

**Indicators of real fraud**:
- Alerts concentrated from specific regions/IPs
- Unusual hours (middle of night)
- Rapid velocity from same accounts
- Amounts just under monitoring thresholds

**Action if real attack**:
```bash
# Enable enhanced blocking
curl -X POST http://fraud-service:8080/api/v1/controls/enhanced-mode \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "duration": "1h"}'

# Block specific country if pattern clear
curl -X POST http://fraud-service:8080/api/v1/blocklist \
  -H "Content-Type: application/json" \
  -d '{"type": "country", "value": "XX", "reason": "fraud_spike", "expires": "2h"}'
```

### 4.2 Is This a False Positive Spike?

**Indicators of false positives**:
- Legitimate customers complaining
- No actual fraud confirmed on review
- Recent model or rule change
- Data feed issues

**Action for false positives**:
```bash
# Check recent rule changes
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT * FROM nexus.fraud_rules 
  WHERE updated_at > now() - interval '24 hours';"

# Temporarily relax thresholds (CAREFUL!)
curl -X PATCH http://fraud-service:8080/api/v1/thresholds \
  -H "Content-Type: application/json" \
  -d '{"velocity_threshold": 15, "amount_threshold": 50000}'
```

### 4.3 Is This Model Drift?

**Indicators**:
- Gradual increase over days/weeks
- No obvious pattern in alerts
- Normal-looking transactions flagged

**Action**:
```bash
# Generate model performance report
curl http://fraud-service:8080/api/v1/model/performance?days=30 > model_report.json

# Compare with baseline
python scripts/analyze_model_drift.py model_report.json
```

## 5. Containment Actions

### 5.1 Enable Manual Review Queue

```bash
# Route all alerts to manual review instead of auto-block
curl -X POST http://fraud-service:8080/api/v1/controls/manual-review-mode \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "threshold_score": 0.8}'
```

### 5.2 Increase Review Capacity

- Alert fraud operations team for additional reviewers
- Enable overtime for existing team
- Consider temporary outsource support for queue

### 5.3 Rollback Recent Changes

```bash
# Rollback Flink job to previous version
kubectl patch flinkdeployment fraud-detection -n nexus-system \
  --type=merge -p '{"spec":{"image":"nexus/fraud-detection:v1.2.3-previous"}}'

# Rollback rules
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  UPDATE nexus.fraud_rules 
  SET config = previous_config, updated_at = now()
  WHERE updated_at > now() - interval '24 hours';"
```

## 6. Verification

```bash
# Monitor alert rate decreasing
watch "curl -s http://fraud-service:8080/metrics | grep fraud_alerts"

# Check false positive rate
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    date_trunc('hour', created_at) as hour,
    count(*) as total_alerts,
    sum(CASE WHEN outcome = 'false_positive' THEN 1 ELSE 0 END) as false_positives,
    sum(CASE WHEN outcome = 'confirmed_fraud' THEN 1 ELSE 0 END) as confirmed
  FROM nexus.fraud_alerts
  WHERE created_at > now() - interval '6 hours'
  GROUP BY 1
  ORDER BY 1;"

# Verify customer impact
# Check support ticket volume
```

## 7. Escalation

| Situation | Time | Escalate To |
|-----------|------|-------------|
| Alert rate 2x normal | 15 min | Fraud team lead |
| Alert rate 5x normal | 5 min | Fraud operations manager |
| Confirmed attack | Immediate | CISO, Legal |
| Customer complaints | 30 min | Customer success |

## 8. Post-Incident

1. **Root cause analysis** within 24 hours
2. **Model retraining** if drift detected
3. **Rule tuning** based on false positive analysis
4. **Monitoring improvements** to detect earlier
5. **Documentation update** with new patterns observed

## 9. Prevention

- Regular model performance reviews (weekly)
- A/B testing for rule changes
- Gradual rollout of threshold changes
- Anomaly detection on alert rates
- Regular false positive sampling and review

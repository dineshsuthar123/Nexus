# Runbook: Reconciliation Match Rate Low

## Alert: SLO_ReconciliationMatchRateLow

### Severity: WARNING
### Team: Operations
### SLO Impact: Reconciliation (Target: 95% auto-match rate)

---

## 1. Overview

Low reconciliation match rate means payments are not being automatically matched with settlement records. This causes:
- Manual intervention required
- Delayed settlement confirmation
- Potential discrepancies in financial records

## 2. Impact Assessment

```bash
# Check current match statistics
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    date_trunc('hour', created_at) as hour,
    count(*) as total,
    sum(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) as matched,
    sum(CASE WHEN status = 'unmatched' THEN 1 ELSE 0 END) as unmatched,
    sum(CASE WHEN status = 'exception' THEN 1 ELSE 0 END) as exceptions
  FROM nexus.reconciliation_items
  WHERE created_at > now() - interval '24 hours'
  GROUP BY 1
  ORDER BY 1 DESC;"

# Check backlog
curl -s http://reconciliation-service:8082/metrics | grep reconciliation_pending
```

## 3. Immediate Actions

### 3.1 Identify Unmatched Items (2 minutes)

```bash
# Get sample of unmatched items
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    id, payment_id, settlement_id, amount, currency, 
    mismatch_reason, created_at
  FROM nexus.reconciliation_items
  WHERE status = 'unmatched'
  AND created_at > now() - interval '4 hours'
  LIMIT 20;"

# Common mismatch reasons
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    mismatch_reason,
    count(*) as count
  FROM nexus.reconciliation_items
  WHERE status = 'unmatched'
  AND created_at > now() - interval '24 hours'
  GROUP BY mismatch_reason
  ORDER BY count DESC;"
```

### 3.2 Check Data Sources (3 minutes)

```bash
# Check payment data freshness
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT max(created_at) as latest_payment FROM nexus.payments;"

# Check settlement data freshness
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT max(received_at) as latest_settlement FROM nexus.settlement_records;"

# Check for data gaps
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    date_trunc('hour', created_at) as hour,
    count(*) as payment_count
  FROM nexus.payments
  WHERE created_at > now() - interval '24 hours'
  GROUP BY 1
  ORDER BY 1;"
```

### 3.3 Check Service Health (2 minutes)

```bash
# Service status
kubectl get pods -n nexus-system -l app=reconciliation-service

# Check for errors
kubectl logs -l app=reconciliation-service -n nexus-system --tail=100 | grep -i "error\|exception"

# Check processing rate
curl -s http://reconciliation-service:8082/metrics | grep reconciliation_processed
```

## 4. Common Causes & Fixes

### 4.1 Amount Mismatch

**Symptoms**: Items flagged with "amount_mismatch"

**Investigation**:
```bash
# Check for FX rate issues
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    ri.payment_id,
    p.amount as payment_amount,
    p.currency as payment_currency,
    sr.amount as settlement_amount,
    sr.currency as settlement_currency,
    abs(p.amount - sr.amount) as difference
  FROM nexus.reconciliation_items ri
  JOIN nexus.payments p ON ri.payment_id = p.id
  JOIN nexus.settlement_records sr ON ri.settlement_id = sr.id
  WHERE ri.status = 'unmatched'
  AND ri.mismatch_reason = 'amount_mismatch'
  LIMIT 10;"
```

**Fix**:
```bash
# Adjust tolerance threshold
curl -X PATCH http://reconciliation-service:8082/api/v1/config \
  -H "Content-Type: application/json" \
  -d '{"amount_tolerance_percent": 0.01}'

# Or fix FX rate source
# Check FX rate feed is working
```

### 4.2 Missing Settlement Records

**Symptoms**: Items flagged with "no_settlement_found"

**Investigation**:
```bash
# Check settlement feed status
kubectl logs -l app=settlement-ingester -n nexus-system --tail=50

# Check for file processing issues
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT * FROM nexus.settlement_files 
  WHERE status != 'processed'
  AND created_at > now() - interval '24 hours';"
```

**Fix**:
```bash
# Reprocess failed files
curl -X POST http://reconciliation-service:8082/api/v1/reprocess-files \
  -H "Content-Type: application/json" \
  -d '{"status": "failed", "since": "24h"}'

# Or manually trigger settlement fetch
curl -X POST http://reconciliation-service:8082/api/v1/fetch-settlements
```

### 4.3 Timing Issues

**Symptoms**: Recent payments not matching (settlement arrives later)

**Investigation**:
```bash
# Check typical settlement delay
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT 
    avg(EXTRACT(EPOCH FROM (sr.received_at - p.created_at))) as avg_delay_seconds
  FROM nexus.payments p
  JOIN nexus.settlement_records sr ON p.end_to_end_id = sr.reference
  WHERE p.created_at > now() - interval '7 days';"
```

**Fix**:
```bash
# Increase matching window
curl -X PATCH http://reconciliation-service:8082/api/v1/config \
  -H "Content-Type: application/json" \
  -d '{"matching_window_hours": 48}'
```

### 4.4 Reference Format Changed

**Symptoms**: Can't match by end-to-end ID or reference

**Investigation**:
```bash
# Sample payment references
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT end_to_end_id, instruction_id FROM nexus.payments 
  WHERE created_at > now() - interval '1 hour' LIMIT 5;"

# Sample settlement references
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  SELECT reference, instruction_reference FROM nexus.settlement_records 
  WHERE received_at > now() - interval '1 hour' LIMIT 5;"
```

**Fix**:
```bash
# Update matching rules
curl -X PATCH http://reconciliation-service:8082/api/v1/matching-rules \
  -H "Content-Type: application/json" \
  -d '{
    "primary_match": "instruction_id",
    "secondary_match": "amount_date_account",
    "normalize_references": true
  }'
```

### 4.5 Duplicate Processing

**Symptoms**: Same payment matched multiple times

**Fix**:
```bash
# Clean up duplicates
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  DELETE FROM nexus.reconciliation_items
  WHERE id NOT IN (
    SELECT min(id) FROM nexus.reconciliation_items
    GROUP BY payment_id, settlement_id
  )
  AND created_at > now() - interval '24 hours';"

# Prevent future duplicates (idempotency check)
```

## 5. Manual Resolution

### 5.1 Bulk Manual Match

```bash
# Export unmatched for review
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs \
  --format=csv -e "
  SELECT * FROM nexus.reconciliation_items
  WHERE status = 'unmatched'
  AND created_at > now() - interval '24 hours';" > unmatched.csv

# After manual review, import matches
curl -X POST http://reconciliation-service:8082/api/v1/manual-match \
  -H "Content-Type: application/json" \
  -d @manual_matches.json
```

### 5.2 Force Rematch

```bash
# Trigger full rematch for a time period
curl -X POST http://reconciliation-service:8082/api/v1/rematch \
  -H "Content-Type: application/json" \
  -d '{"from": "2024-01-15T00:00:00Z", "to": "2024-01-16T00:00:00Z"}'
```

## 6. Verification

```bash
# Monitor match rate improving
watch "cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e \"
  SELECT 
    round(100.0 * sum(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) / count(*), 2) as match_rate
  FROM nexus.reconciliation_items
  WHERE created_at > now() - interval '1 hour';\""

# Check backlog decreasing
watch "curl -s http://reconciliation-service:8082/metrics | grep reconciliation_pending"
```

## 7. Escalation

| Match Rate | Duration | Escalate To |
|------------|----------|-------------|
| < 95% | 1 hour | Operations lead |
| < 90% | 30 min | Operations manager |
| < 80% | 15 min | Finance + Ops |

## 8. Prevention

- Monitor settlement feed health proactively
- Alert on settlement file processing failures
- Regular reconciliation rule tuning
- Track match rate trends over time
- Automated anomaly detection on unmatched reasons

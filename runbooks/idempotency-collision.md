# Runbook: Idempotency Key Collisions

## Alert: IdempotencyCollisionRateHigh

### Severity: WARNING / CRITICAL
### Team: Platform
### Impact: Duplicate payment risk or legitimate retries being rejected

---

## 1. Overview

Idempotency collisions occur when the same idempotency key is used for multiple
distinct requests. This can indicate:
- **Legitimate retries** (client resending same request — expected behavior)
- **Client bug** (reusing keys across different payments — data integrity risk)
- **Replay attack** (malicious key reuse — security concern)
- **Clock skew / race condition** (concurrent requests with same key)

## 2. Detection

```promql
# Alert rule
rate(idempotency_collision_total[5m]) > 10
```

```bash
# Check current collision rate
curl -s http://payment-service:8080/metrics | grep idempotency

# Expected output:
# idempotency_collision_total{type="exact_match"} N    ← legitimate retries
# idempotency_collision_total{type="key_reuse"} N      ← same key, different payload
# idempotency_collision_total{type="expired"} N        ← key reused after TTL
```

## 3. Triage Decision Tree

```
Is collision type "exact_match"?
├── YES → Legitimate retry. Verify same response returned.
│         → Rate > 100/min? → Client may have retry loop bug. Contact tenant.
│
└── NO → Is collision type "key_reuse"?
    ├── YES → Different payload with same key. This is dangerous.
    │         → Check if single tenant or multiple.
    │         → Single tenant → Contact tenant, they have a key generation bug.
    │         → Multiple tenants → Something wrong in our key scope isolation.
    │
    └── Is collision type "expired"?
        ├── YES → Key reused after TTL (24h default). Usually OK.
        │         → Verify idempotency store TTL is correct (24h).
        └── NO → Unknown type. Investigate service logs.
```

## 4. Investigation

### 4.1 Identify Source

```bash
# Recent collision log entries
kubectl logs -n nexus-system deploy/payment-service --since=15m | \
  grep -i "idempotency" | tail -20

# Check idempotency store in Redis
kubectl exec -n nexus-system deploy/redis -- redis-cli \
  --scan --pattern "idempotency:*" | head -20

# Count keys in idempotency store
kubectl exec -n nexus-system deploy/redis -- redis-cli \
  DBSIZE

# Check a specific key
kubectl exec -n nexus-system deploy/redis -- redis-cli \
  GET "idempotency:<KEY>"
```

### 4.2 Check for Duplicate Payments

```sql
-- Find payments with same idempotency key
SELECT idempotency_key, COUNT(*) as cnt,
       array_agg(id) as payment_ids,
       array_agg(status) as statuses,
       array_agg(amount) as amounts
FROM nexus_ledger.payments
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY idempotency_key
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;
```

```sql
-- Verify no actual duplicate charges
SELECT p1.id, p1.amount, p1.status, p1.idempotency_key,
       p2.id as dup_id, p2.amount as dup_amount, p2.status as dup_status
FROM nexus_ledger.payments p1
JOIN nexus_ledger.payments p2
  ON p1.idempotency_key = p2.idempotency_key
  AND p1.id != p2.id
  AND p1.status = 'completed'
  AND p2.status = 'completed'
WHERE p1.created_at > NOW() - INTERVAL '1 hour';
```

### 4.3 Check Idempotency Service Health

```bash
# Redis connectivity from payment-service
kubectl exec -n nexus-system deploy/payment-service -- \
  wget -qO- http://localhost:8080/health | jq '.dependencies.redis'

# Redis memory usage (idempotency keys are stored here)
kubectl exec -n nexus-system deploy/redis -- redis-cli INFO memory | \
  grep -E "used_memory_human|maxmemory_human"

# TTL on idempotency keys (should be 86400 = 24h)
kubectl exec -n nexus-system deploy/redis -- redis-cli \
  TTL "idempotency:$(kubectl exec -n nexus-system deploy/redis -- redis-cli \
  --scan --pattern 'idempotency:*' --count 1 | head -1)"
```

## 5. Remediation

### 5.1 Legitimate Retry Storm

```bash
# If a client is stuck in retry loop, temporarily block their API key
curl -X POST http://kong-admin:8001/consumers/<consumer>/plugins \
  --data "name=rate-limiting" \
  --data "config.second=1" \
  --data "config.minute=10"

# Notify tenant ops team
```

### 5.2 Key Reuse Bug (Client-Side)

```bash
# Document the affected idempotency keys
kubectl logs -n nexus-system deploy/payment-service --since=1h | \
  grep "key_reuse" | jq -r '.idempotency_key' | sort -u > /tmp/affected_keys.txt

# Return 409 Conflict for these (default behavior — verify it's working)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Idempotency-Key: <KNOWN_DUPLICATE_KEY>" \
  -H "Authorization: Bearer <TOKEN>" \
  -X POST http://payment-service:8085/api/v1/payments \
  -d '{"amount": 100}'
# Expected: 409
```

### 5.3 Redis Down / Eviction

If Redis is evicting idempotency keys:

```bash
# Check eviction policy
kubectl exec -n nexus-system deploy/redis -- redis-cli CONFIG GET maxmemory-policy
# Should be: noeviction or volatile-ttl

# If keys being evicted, increase Redis memory
kubectl patch deployment redis -n nexus-system --type=json \
  -p='[{"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/memory", "value": "2Gi"}]'
```

### 5.4 Duplicate Payment Found (CRITICAL)

If actual duplicate payments discovered:

```bash
# 1. IMMEDIATELY stop new payments to affected tenant
curl -X POST http://kong-admin:8001/consumers/<consumer>/plugins \
  --data "name=request-termination" \
  --data "config.status_code=503" \
  --data "config.message=Service temporarily unavailable"

# 2. Page payments team lead
# 3. Begin manual reconciliation

# 4. Mark duplicate as reversed
cockroach sql --host=cockroachdb:26257 --certs-dir=/certs -e "
  UPDATE nexus_ledger.payments
  SET status = 'reversed',
      updated_at = NOW(),
      metadata = metadata || '{\"reversal_reason\": \"duplicate_idempotency_collision\"}'
  WHERE id = '<DUPLICATE_PAYMENT_ID>';
"
```

## 6. Prevention

- Ensure clients generate UUIDv4 idempotency keys
- Redis `maxmemory-policy` = `noeviction`
- Monitor `idempotency_collision_total` counter
- Set appropriate TTL (24h default, configurable per tenant)

## 7. Escalation

| Condition | Action |
|-----------|--------|
| > 10 collisions/min (exact_match) | Monitor, likely retry storm |
| > 1 collision/min (key_reuse) | Contact tenant, may be client bug |
| Any duplicate completed payment | P0 — page payments lead immediately |
| Redis OOM / eviction | P1 — page SRE |

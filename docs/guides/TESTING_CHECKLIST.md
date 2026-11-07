# Complete Testing & Startup Guide — Nexus RTP Platform

<!-- performance-results:start -->
### Measured local performance (2026-11-07)

| Payment attempts | p50 | p95 | p99 | Sustained accepted payments/s | Acceptance failures |
|---:|---:|---:|---:|---:|---:|
| 14,709 | 35.37 ms | 109.08 ms | 152.94 ms | 107.35 | 0.00% |

Direct API, 1–25 closed-loop users, real single-node in-memory CockroachDB and Redis.
Sanctions unavailable: payments were accepted for review. Settlement, Kafka delivery,
gateway/auth, production capacity and uptime were not measured.
Thresholds: **PASS**; persisted database invariants: **PASS**.

Frontend production lab, ten fresh-context navigations per route: median LCP `/` 750 ms, `/auth/login` 152 ms, `/performance` 68 ms. No CPU/network throttling.

See [methodology and raw evidence](../performance/README.md). Other performance figures below are design targets or historical claims unless linked to a recorded run.
<!-- performance-results:end -->

## Part 1: Starting the Application

### 1.1 Prerequisites
Ensure you have:
- Docker & Docker Compose installed (`docker --version` && `docker compose --version`)
- Go 1.25.6+ (`go version`)
- Make installed (`make --version`)
- Git configured
- ~8GB RAM available (for 3 CockroachDB nodes + Kafka + services)

### 1.2 Quick Start (5 minutes)

```bash
# Run from the root of your cloned repository.

# 1. Start overall infrastructure (DB, Kafka, Redis, Kong, monitoring)
make infra-up

# This will display:
# Kong Gateway:    http://localhost:8000
# CockroachDB UI:  http://localhost:8080
# Kafka UI:        http://localhost:8090
# Grafana:         http://localhost:3000
# Prometheus:      http://localhost:9090

# 2. Verify infrastructure is ready (wait 10–15 seconds)
make infra-ps

# Expected: All services running ✓

# 3. Initialize database & run migrations
make db-migrate

# 4. Start all business services
make services-up

# Done! Services running at port 8000 (Kong Gateway)
```

### 1.3 Service Endpoints

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| **Kong Gateway** | 8000 | http://localhost:8000 | API entry point (routes to services) |
| **CockroachDB Console** | 8080 | http://localhost:8080 | Database admin UI |
| **Kafka UI** | 8090 | http://localhost:8090 | Kafka topics & consumer lag |
| **Flink Dashboard** | 8082 | http://localhost:8082 | Fraud detection job status |
| **Grafana** | 3000 | http://localhost:3000 | Metrics & dashboards (admin/nexus123) |
| **Prometheus** | 9090 | http://localhost:9090 | Raw Prometheus query UI |

### 1.4 Health Check All Services

```bash
# Check Kong Gateway
curl -s http://localhost:8000/health | jq .

# Check payment-service
curl -s http://localhost:8000/api/v1/health | jq .

# Check auth-service
curl -s http://localhost:8000/api/auth/health | jq .

# Check CockroachDB
curl -s http://localhost:8080/health | jq .
```

---

## Part 2: Running Tests

### 2.1 Unit Tests (Fast, ~2 min)

```bash
# Run all unit tests for Go services
make test

# Run tests for specific service
cd services/payment-service && go test -v ./...

# Run with race detector (catch data races)
cd services/payment-service && go test -race ./...
```

### 2.2 Integration Tests (Medium, ~5 min)

```bash
# Run full integration tests (requires infra-up)
make test-integration

# These test:
# ✓ API endpoint flows
# ✓ Database persistence
# ✓ Kafka event publishing
# ✓ Cross-service communication
```

### 2.3 Performance Benchmarks (Optional, ~10 min)

```bash
# Measure throughput, latency, memory/allocs
make test-benchmark

# Results show:
# BenchmarkPaymentCreation: 10000 ops, 1.2 ms/op, 500 B/op
```

### 2.4 Test Coverage Report

```bash
# Generate coverage for all services
make test-coverage

# View detailed report
for service in payment-service account-service reconciliation-service; do
  echo "=== $service ==="
  go tool cover -html=services/$service/coverage.out
done
```

---

## Part 3: UI Testing (What to Check)

### 3.1 CockroachDB Database Health
**URL:** http://localhost:8080/

**Checklist:**
- [ ] **Cluster section**: Shows 3 nodes (cockroachdb-1, 2, 3)
- [ ] **All nodes**: Status = UP (green)
- [ ] **Databases**: Two databases present:
  - `nexus_auth` (contains users, sessions, api_keys tables)
  - `nexus_ledger` (contains payments, ledger_entries, accounts tables)
- [ ] **Tables count**: Expected ~12 total tables
  - Look at each DB and count table rows
- [ ] **Replicas**: Each table shows "Replicas: 3" (all 3 nodes)
- [ ] **Node locality**: Check sidebar shows mixed regions (us-east-1, eu-central-1, ap-southeast-1)

**Important Queries to Run** (via CockroachDB console):
```sql
-- Check database structure
SELECT table_name, column_count, index_count
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_catalog, table_name;

-- Verify no orphaned records
SELECT COUNT(*) as orphaned_ledgers
FROM nexus_ledger.ledger_entries le
LEFT JOIN nexus_ledger.payments p ON le.payment_id = p.id
WHERE p.id IS NULL;

-- Balance invariant (must be 0.00)
SELECT
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as debits,
  SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as credits,
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) -
  SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as imbalance
FROM nexus_ledger.ledger_entries;
```

### 3.2 Kafka Topics & Consumer Lag
**URL:** http://localhost:8090/

**Checklist:**
- [ ] **Topics**: At least 9 topics visible:
  - `nexus.events.raw`
  - `nexus.payments.enriched`
  - `nexus.fraud.alerts`
  - `nexus.reconciliation.pending`
  - `nexus.notifications`
  - And others
- [ ] **Consumer groups**: Check for:
  - `payment-processor` (should be consuming payment events)
  - `fraud-detector` (should be consuming for fraud detection)
  - `notification-sender` (should be sending alerts)
- [ ] **Consumer lag**: All consumer groups should have lag < 1000 messages
  - Red/yellow = potential issues
  - Green = healthy consumption
- [ ] **Message throughput**: At least 1 message/sec if system is active

### 3.3 Payment API Testing (via Kong Gateway)

#### 3.3.1 Test 1: Create a Payment (Happy Path)

```bash
# Generate a unique idempotency key
IDEMP_KEY=$(python3 -c "import uuid; print(uuid.uuid4())")

# Create payment
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -d '{
    "amount": 1000.00,
    "currency": "USD",
    "debtorAccount": "ACC-001-SETTLE",
    "creditorAccount": "ACC-002-NOSTRO",
    "debtorName": "Alice Corp",
    "creditorName": "Bob Ltd",
    "paymentType": "INSTANT",
    "purpose": "Goods & Services"
  }' | jq .

# Expected response (HTTP 201):
# {
#   "id": "payment_1234567890abcdef",
#   "uetr": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
#   "status": "processing",
#   "amount": 1000.00,
#   "currency": "USD",
#   "createdAt": "2025-01-15T10:30:00Z",
#   "updatedAt": "2025-01-15T10:30:00Z"
# }

# ✓ Response has: id, status=processing, createdAt timestamp
# ✓ HTTP 201 Created
```

#### 3.3.2 Test 2: Verify Idempotency (Same Key = Same Result)

```bash
# Retry with SAME idempotency key
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -d '{
    "amount": 1000.00,
    "currency": "USD",
    "debtorAccount": "ACC-001-SETTLE",
    "creditorAccount": "ACC-002-NOSTRO",
    "debtorName": "Alice Corp",
    "creditorName": "Bob Ltd",
    "paymentType": "INSTANT",
    "purpose": "Goods & Services"
  }' | jq .

# Expected: Same payment ID returned (NO duplicate)
# ✓ Same HTTP 200 (or 2xx) response
# ✓ Same payment ID
```

#### 3.3.3 Test 3: Reject Different Payload with Same Key

```bash
# Try to reuse key with DIFFERENT payload
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -d '{
    "amount": 999.99,  # Different amount!
    "currency": "EUR",
    "debtorAccount": "ACC-003",
    "creditorAccount": "ACC-004",
    "debtorName": "Charlie Inc",
    "creditorName": "Diana Ltd",
    "paymentType": "STANDARD",
    "purpose": "Different payment"
  }' | jq .

# Expected: HTTP 409 Conflict
# {
#   "error": "idempotency_key_conflict",
#   "message": "Resource with this idempotency key already exists but payload differs"
# }

# ✓ HTTP 409 (NOT 400, NOT 200)
# ✓ Error message indicates conflict
```

#### 3.3.4 Test 4: Get Payment Status

```bash
PAYMENT_ID="payment_from_test_1"  # Use actual ID from Test 1

curl -X GET http://localhost:8000/api/v1/payments/$PAYMENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" | jq .

# Expected response:
# {
#   "id": "payment_1234567890abcdef",
#   "uetr": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
#   "status": "completed",  # May still be "processing"
#   "amount": 1000.00,
#   "currency": "USD",
#   "ledgerEntries": [
#     { "accountId": "ACC-001-SETTLE", "debit": 1000.00 },
#     { "accountId": "ACC-002-NOSTRO", "credit": 1000.00 }
#   ]
# }

# ✓ Payment found (HTTP 200)
# ✓ Status in [processing, completed, failed]
# ✓ Ledger entries created (double-entry bookkeeping)
```

#### 3.3.5 Test 5: Authentication Flow

```bash
# 1. Login to get token
LOGIN_RESPONSE=$(curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nexus.local",
    "password": "secure-password"
  }' | jq .)

echo "Login response: $LOGIN_RESPONSE"

# Extract tokens
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.access_token')
REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.refresh_token')

echo "Access token: $ACCESS_TOKEN"
echo "Refresh token: $REFRESH_TOKEN"

# ✓ Tokens received (not empty)
# ✓ access_token is a valid JWT (3 parts separated by dots)
# ✓ refresh_token exists

# 2. Use token to make authenticated request
curl -X GET http://localhost:8000/api/v1/payments \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# ✓ Returns list of payments (HTTP 200)
# ✓ No 401 Unauthorized

# 3. Test with invalid token
curl -X GET http://localhost:8000/api/v1/payments \
  -H "Authorization: Bearer invalid-token" | jq .

# ✓ HTTP 401 Unauthorized
# ✓ Error message: "invalid tokens" or "unauthorized"
```

### 3.4 Grafana Dashboards Verification
**URL:** http://localhost:3000/ (Login: admin/nexus123)

**Checklist:**
- [ ] **Home**: Shows Nexus dashboards list
- [ ] **Navigate to "Nexus — SLO Dashboard"**:
  - [ ] Payment P95 latency < 500ms (graph shows < 0.5s)
  - [ ] Payment P99 latency < 1s (graph shows < 1s)
  - [ ] Payment success rate > 99.9% (shows as green percentage)
  - [ ] Error budget remaining > 0 (hasn't been consumed)
- [ ] **Navigate to "CockroachDB Cluster"**:
  - [ ] All 3 nodes UP (green)
  - [ ] QPS (queries per second) ≥ 100
  - [ ] P99 query latency < 50ms
  - [ ] No dead connections
- [ ] **Navigate to "Deployment"**:
  - [ ] All pods running (payment-service, account-service, etc.)
  - [ ] No errors in logs (check Loki if available)
  - [ ] Memory usage < 70% per pod
  - [ ] CPU usage < 65% per pod

### 3.5 Prometheus Queries (Direct Value Check)
**URL:** http://localhost:9090/

Run these queries (click "Execute" button):

```promql
# Payment success rate (should be 1.0 = 100%)
nexus:payment_success_rate:5m

# Current RPS (requests per second)
sum(rate(payment_requests_total[5m]))

# Error count
sum(rate(payment_requests_total{status="error"}[5m]))

# P99 latency in seconds
histogram_quantile(0.99, sum(rate(payment_request_duration_seconds_bucket[5m])) by (le))
```

---

## Part 4: Testing Workflow (30 min Full QA)

### 4.1 Startup Sequence

```bash
# 1. Start infrastructure (3 min)
make infra-up

# Verify all containers running
docker ps | grep nexus

# 2. Run database migrations (1 min)
make db-migrate

# Verify schema created
make db-shell
> SHOW TABLES;
> SELECT COUNT(*) FROM payments;

# 3. Start services (2 min)
make services-up

# Verify pods/containers started
docker ps | grep -E "payment|account|auth|reconciliation"

# 4. Verify health (1 min)
curl -s http://localhost:8000/health | jq .

# 5. Check logs for errors (1 min)
make logs | head -100
```

### 4.2 Quick Sanity Tests (10 min)

```bash
# Test 1: Database connectivity
curl -s http://localhost:8080/health | jq .

# Test 2: Payment creation (5 min)
bash tests/smoke_payment_test.sh  # If exists, or run manual

# Test 3: Idempotency (2 min)
for i in {1..3}; do
  curl -X POST http://localhost:8000/api/v1/payments \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: test-key-123" \
    -d '{"amount":100,"currency":"USD","debtorAccount":"ACC-1","creditorAccount":"ACC-2"}' \
    | jq '.id'
  echo "Attempt $i done"
done

# Test 4: Check Kafka consumption
curl -s http://localhost:8090/ | grep -i "consumer_lag" # From Kafka UI

# Test 5: Verify Grafana data
curl -s 'http://localhost:3000/api/datasources' | jq '.[] | .name'
```

### 4.3 Integration Test Suite (10 min)

```bash
# Run all integration tests
make test-integration

# This tests:
# ✓ API endpoints respond correctly
# ✓ Database persistence works
# ✓ Transactions are atomic
# ✓ Idempotency guarantees hold
# ✓ Ledger entries are properly created
# ✓ Events are published to Kafka
```

### 4.4 Data Integrity Validation (5 min)

```bash
# Connect to database
make db-shell

# Run these SQL checks:

-- Check 1: All payments have ledger entries
SELECT
  p.id,
  COUNT(le.id) as entry_count
FROM payments p
LEFT JOIN ledger_entries le ON le.payment_id = p.id
WHERE entry_count = 0;
-- Should return 0 rows (all have entries)

-- Check 2: Balance invariant (conservation of value)
SELECT
  SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END) as balance
FROM ledger_entries;
-- Should be 0.00 (perfectly balanced)

-- Check 3: No duplicate payment IDs
SELECT id, COUNT(*) as cnt
FROM payments
GROUP BY id
HAVING cnt > 1;
-- Should return 0 rows

-- Check 4: Account balance calculation
SELECT
  account_id,
  SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END) as balance
FROM ledger_entries
GROUP BY account_id
ORDER BY account_id;
-- Should show realistic balances
```

---

## Part 5: Common Issues & Troubleshooting

### Issue: Services won't start after `infra-up`

```bash
# 1. Check Docker resources
docker stats

# 2. Increase Docker memory if needed
# In Docker Desktop: Settings → Resources → Memory: 8GB+

# 3. Check logs for specific errors
docker logs nexus-payment-service

# 4. Reset everything
make infra-down
docker system prune -a  # Clean docker
make infra-up          # Restart
```

### Issue: Payments fail with 500 error

```bash
# 1. Check payment service logs
docker logs nexus-payment-service | grep -i error | tail -20

# 2. Verify database connection
docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "SELECT 1;"

# 3. Check Kafka broker health
docker exec nexus-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092

# 4. Restart payment service
docker restart nexus-payment-service
```

### Issue: Idempotency key rejected incorrectly (HTTP 409 on first request)

```bash
# Check Redis cache (where idempotency keys are stored)
docker exec nexus-redis redis-cli KEYS "idempotency:*"

# If too many old keys, flush Redis (WARNING: clears all cache)
docker exec nexus-redis redis-cli FLUSHALL

# Restart payment service
docker restart nexus-payment-service
```

### Issue: Database migrations failed

```bash
# 1. Check migration status
docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "SELECT * FROM schema_migrations;"

# 2. Reset database (CAREFUL: deletes all data)
make db-reset

# 3. Re-run migrations
make db-migrate
```

---

## Part 6: Validation Checklist (Before "Go Live")

Print this out and check off each item:

### Infrastructure
- [ ] All 3 CockroachDB nodes are UP (green in UI)
- [ ] Kafka cluster has 3 brokers all ONLINE
- [ ] Redis ping responds
- [ ] Kong gateway responds to /health

### Data
- [ ] Database has 2 schemas (nexus_auth, nexus_ledger)
- [ ] All 12 tables created (check via CockroachDB UI)
- [ ] No orphaned ledger entries
- [ ] Balance invariant = 0.00 (conservation of value)
- [ ] Replication factor = 3 for all tables

### APIs
- [ ] Payment creation works (HTTP 201)
- [ ] Idempotency enforced (same key → same result)
- [ ] Authentication token received (JWT format)
- [ ] Authorized requests work (HTTP 200)
- [ ] Unauthorized requests rejected (HTTP 401)

### Events
- [ ] Kafka has messages (> 0 messages in topics)
- [ ] Consumer groups consuming (lag < 1000)
- [ ] No stuck messages (lag not growing unbounded)

### Monitoring
- [ ] Grafana dashboards loaded
- [ ] Prometheus scraping metrics (> 1000 active series)
- [ ] SLO alerts configured in Alertmanager
- [ ] Error budget visible and > 0

### Performance
- [ ] P95 latency < 500ms
- [ ] P99 latency < 1s
- [ ] Success rate > 99.9%
- [ ] No memory leaks (memory stable over time)

---

## Quick Reference Commands

```bash
# Start everything
make dev             # infra-up + db-migrate

# Stop everything
make infra-down

# View logs
make logs            # All logs
make infra-logs      # Just infrastructure

# Service status
make infra-ps        # Container status
docker stats         # Resource usage

# Database
make db-shell        # Open SQL shell
make db-reset        # DESTRUCTIVE: reset DB

# Testing
make test            # Unit tests
make test-integration # Integration tests
make test-coverage   # Coverage report
make test-benchmark  # Performance tests

# Development
make run-payment     # Run payment service locally (for debugging)
make run-account     # Run account service locally
make watch           # Auto-rebuild on file changes (requires entr)

# Clean up
make clean           # Remove build artifacts
docker system prune -a     # Delete all unused Docker images/volumes
```

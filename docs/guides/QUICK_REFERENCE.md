#!/bin/bash
# ============================================================================
# Quick Reference Card — Nexus RTP Testing & Debugging
# ============================================================================
# One-line commands for common operations
# Usage: Copy and paste commands directly into your terminal

# ============================================================================
# STARTUP & MANAGEMENT
# ============================================================================

# Start everything automatically (recommended)
bash start.sh

# Start infrastructure only
make infra-up

# Start services only
make services-up

# Start databases with migrations
make db-migrate

# Stop all services
make infra-down

# Reset everything (clean volumes - fixes Zookeeper issues)
docker compose -f infra/docker/docker-compose.yml down -v && bash start.sh

# View logs in real-time
make logs

# View logs for specific service
docker compose logs -f payment-service

# View logs for all services matching pattern
docker compose logs -f | grep "payment\|account"

# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

# Access CockroachDB shell
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure

# List all databases
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "SHOW DATABASES;"

# View all tables in nexus_ledger database
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "SHOW TABLES FROM nexus_ledger;"

# Count payments
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "SELECT COUNT(*) FROM nexus_ledger.payments;"

# Check balance invariant (must equal 0)
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT
    SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) -
    SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) AS balance_check
  FROM nexus_ledger.ledger_entries;"

# Find duplicate payment IDs (should be empty)
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT payment_id, COUNT(*) FROM nexus_ledger.payments
  GROUP BY payment_id HAVING COUNT(*) > 1;"

# Find orphaned ledger entries (should be empty)
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT l.id FROM nexus_ledger.ledger_entries l
  LEFT JOIN nexus_ledger.payments p ON l.payment_id = p.id
  WHERE p.id IS NULL;"

# View database node status
docker exec -it nexus-cockroachdb-1 cockroach node ls --insecure

# View replication statistics
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT
    range_id,
    replica_count,
    lease_holder
  FROM crdb_internal.ranges;"

# ============================================================================
# API TESTING (PAYMENT SERVICE)
# ============================================================================

# Health check
curl -i http://localhost:8000/health

# Create a test payment (same-day)
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "amount": "150.00",
    "currency": "USD",
    "debtorAccount": "ACC-001-SETTLE",
    "creditorAccount": "ACC-002-NOSTRO",
    "debtorName": "Alice Corp",
    "creditorName": "Bob Ltd",
    "paymentType": "INSTANT",
    "purpose": "Test Payment"
  }' | jq .

# Create a payment (standard, T+1)
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "amount": "250.00",
    "currency": "EUR",
    "debtorAccount": "ACC-003-SETTLE",
    "creditorAccount": "ACC-004-NOSTRO",
    "debtorName": "Charlie Inc",
    "creditorName": "Diana Ltd",
    "paymentType": "STANDARD",
    "purpose": "Standard Payment"
  }' | jq .

# Test idempotency (retry with same key, should get same payment)
export IDEMP_KEY="my-unique-key-123"
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMP_KEY" \
  -d '{"amount": "100.00", "currency": "USD", "debtorAccount": "ACC-001", "creditorAccount": "ACC-002", "debtorName": "A", "creditorName": "B", "paymentType": "INSTANT", "purpose": "Test"}' | jq .id

# Get payment status (replace PAYMENT_ID with actual ID)
curl http://localhost:8000/api/v1/payments/{PAYMENT_ID} | jq .

# List recent payments (last 10)
curl "http://localhost:8000/api/v1/payments?limit=10" | jq .

# Verify payment idempotency (create with same key again)
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-123" \
  -d '{"amount": "100.00", "currency": "USD", "debtorAccount": "ACC-001", "creditorAccount": "ACC-002", "debtorName": "A", "creditorName": "B", "paymentType": "INSTANT", "purpose": "Test"}' | jq .id

# Test idempotency violation (same key, different payload — should get 409)
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-123" \
  -d '{"amount": "999.99", "currency": "GBP", "debtorAccount": "ACC-999", "creditorAccount": "ACC-888", "debtorName": "X", "creditorName": "Y", "paymentType": "STANDARD", "purpose": "Different"}' | jq .

# ============================================================================
# KAFKA & EVENT STREAMING
# ============================================================================

# Access Kafka shell
docker exec -it nexus-kafka-1 bash

# List all topics
docker exec nexus-kafka-1 kafka-topics --list --bootstrap-server localhost:9092

# Get topic details
docker exec nexus-kafka-1 kafka-topics --describe --topic payment-events --bootstrap-server localhost:9092

# View messages in a topic (last 10)
docker exec nexus-kafka-1 kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic payment-events \
  --from-beginning \
  --max-messages 10

# Check Kafka UI
open http://localhost:8090

# ============================================================================
# MONITORING & OBSERVABILITY
# ============================================================================

# View Grafana dashboards
open http://localhost:3000  # admin/nexus123

# View Prometheus metrics
open http://localhost:9090

# Query payment success rate in Prometheus
curl 'http://localhost:9090/api/v1/query?query=rate(payment_requests_total%5B5m%5D)' | jq .

# View CockroachDB console
open http://localhost:8080

# View live node status
docker exec -it nexus-cockroachdb-1 cockroach node ls --insecure

# ============================================================================
# SERVICE HEALTH & DEBUGGING
# ============================================================================

# Check which services are running
docker compose ps

# Check specific service status
docker compose ps payment-service

# View service metrics (if exposed)
curl http://localhost:9090/metrics

# Check if port is listening
lsof -i :8000   # Kong
lsof -i :8080   # CockroachDB UI
lsof -i :3000   # Grafana
lsof -i :9090   # Prometheus

# Network test connectivity between services
docker exec nexus-payment-service curl -i http://account-service:8080/health

# View network topology
docker network inspect docker_default

# ============================================================================
# TESTING & VALIDATION
# ============================================================================

# Run smoke tests
bash tests/smoke_test.sh

# Run unit tests
make test

# Run integration tests
make test-integration

# Run specific test
go test -v ./services/payment-service -run TestCreatePayment

# Run tests with coverage
make test-coverage

# View coverage report
make test-coverage-html
open coverage/index.html

# Run benchmarks
go test -bench=. -benchmem ./services/payment-service

# Run chaos experiments
bash chaos/network_partition.sh
bash chaos/db_failover.sh
bash chaos/idempotency_stress.sh

# ============================================================================
# DOCKER & CONTAINER MANAGEMENT
# ============================================================================

# Show all running containers
docker ps

# Show all containers (including stopped)
docker ps -a

# View resource usage
docker stats

# Remove stopped containers
docker container prune

# Remove unused images
docker image prune

# Full cleanup (WARNING: removes all volumes!)
docker system prune -a --volumes

# ============================================================================
# PERFORMANCE TESTING
# ============================================================================

# Load test with 100 RPS for 60 seconds
ab -n 1000 -c 100 http://localhost:8000/health

# Load test with different concurrency levels
wrk -t12 -c400 -d60s http://localhost:8000/health

# PostgreSQL-like load test on Nexus
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: stress-$(date +%s%N)" \
  -d '{"amount": "100.00", "currency": "USD", "debtorAccount": "ACC-001", "creditorAccount": "ACC-002", "debtorName": "A", "creditorName": "B", "paymentType": "INSTANT", "purpose": "Load Test"}'

# ============================================================================
# TROUBLESHOOTING
# ============================================================================

# Restart all services
make infra-down && make infra-up

# Restart specific service
docker compose restart payment-service

# Force restart (remove container + restart)
docker compose rm -f payment-service && docker compose up -d payment-service

# View Docker logs for service
docker logs nexus-payment-service

# Check Docker daemon health
docker ps

# Verify network connectivity
docker network inspect $(docker network ls | grep "nexus\|default" | awk '{print $1}')

# Reset database (WARNING: deletes all data)
make db-reset

# View current make targets
make help

# ============================================================================
# DEPLOYMENT & RELEASE
# ============================================================================

# Build Docker images
docker compose build

# Push images to registry
docker compose push

# Create database backup
bash infra/backup/backup_s3.sh

# Test restore procedure
bash scripts/restore_and_smoke.sh

# Run canary deployment checker
bash scripts/canary_health_check.sh

# ============================================================================
# NOTES
# ============================================================================

# - All API endpoints are routed through Kong gateway (port 8000)
# - Default Grafana username: admin, password: admin
# - Default CockroachDB: no authentication (--insecure mode)
# - Database name: nexus_ledger
# - Core tables: payments, ledger_entries, accounts, transactions
#
# Read docs/guides/TESTING_CHECKLIST.md for comprehensive test procedures
# Read ENHANCEMENT_SUMMARY.md for feature overview
# Read docs/ARCHITECTURE.md for architecture details

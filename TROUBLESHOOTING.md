#!/bin/bash
# ============================================================================
# Troubleshooting Guide — Common Issues & Solutions
# ============================================================================
# Quick reference for solving common problems

# ============================================================================
# ISSUE #0: Kafka broker fails with Zookeeper NodeExistsException (COMMON)
# ============================================================================

# Problem: "KeeperException$NodeExistsException: KeeperErrorCode = NodeExists"
# This happens when Kafka tries to register broker in Zookeeper, but old registration exists

# Error message in logs:
#   ERROR Exiting Kafka due to fatal exception during startup
#   org.apache.zookeeper.KeeperException$NodeExistsException

# Solution 1: Clean volumes (easiest)
docker compose -f infra/docker/docker-compose.yml down -v
bash start.sh

# Solution 2: Manual Zookeeper cleanup (if volumes persist)
docker exec nexus-zookeeper zkCli.sh deleteall /brokers
docker compose -f infra/docker/docker-compose.yml restart

# Solution 3: Nuclear reset (DELETE ALL DATA)
docker system prune -a --volumes
docker compose -f infra/docker/docker-compose.yml build --no-cache
bash start.sh

# Prevention:
# - start.sh now automatically detects and cleans stale state
# - Run: bash start.sh (it checks for and fixes this automatically)

# Problem: "docker: daemon not responding" or containers exit immediately

# Solution 1: Ensure Docker Desktop is running
#   macOS: Open Docker.app
#   Windows: Open Docker Desktop
#   Linux: systemctl start docker

# Solution 2: Check Docker resources
docker stats --no-stream

# If Docker is using too much CPU/memory:
#   - Stop all containers: docker compose down
#   - Rebuild: docker compose build --no-cache
#   - Start fresh: docker compose up

# Solution 3: Clean up dangling images/volumes
docker system prune -a --volumes

# ============================================================================
# ISSUE #2: Port conflicts (services won't bind)
# ============================================================================

# Problem: "Address already in use" error

# Identify what's using port 8000 (Kong)
lsof -i :8000
# macOS/Linux: Kill the process with: kill -9 PID

# On Windows, find process and kill:
netstat -ano | findstr :8000
# taskkill /F /PID <PID>

# Solution: Use different ports in docker-compose.yml
#   Change: "8000:8000" to "8001:8000"
#   Then access Kong at http://localhost:8001

# ============================================================================
# ISSUE #3: CockroachDB not responding
# ============================================================================

# Problem: "CockroachDB health check failed" or "connection refused"

# Check if container is running
docker ps | grep cockroach

# If not running, check logs
docker logs nexus-cockroachdb-1

# Common causes:
#   1. Insufficient disk space: docker system df
#   2. CPU throttling: docker stats
#   3. Memory pressure: watch docker stats

# Solution: Restart CockroachDB
docker compose down
docker volume rm fintechp_cockroachdb_data  # (loses data!)
docker compose up -d cockroachdb-1 cockroachdb-2 cockroachdb-3

# Wait for cluster to initialize (~30 seconds)
sleep 30
docker exec -it nexus-cockroachdb-1 cockroach node ls --insecure

# ============================================================================
# ISSUE #4: Database migrations fail
# ============================================================================

# Problem: "migration failed" or "table already exists"

# Check which migrations have run
docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT name, success FROM system.migration_info ORDER BY name DESC;"

# Roll back to specific migration
#   1. Identify failing migration in migrations/
#   2. Check if it's idempotent (safe to re-run)
#   3. Manually drop affected tables:
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  DROP TABLE nexus_ledger.payments CASCADE;"

# Re-run migrations
docker compose exec -w /migrations cockroachdb-1 bash -c "
  for f in *.sql; do
    echo \"Running \$f...\"
    cockroach sql --insecure < \$f
  done"

# ============================================================================
# ISSUE #5: Services not connected (network issues)
# ============================================================================

# Problem: "payment-service can't reach account-service" or timeouts

# Check if services can see each other
docker exec payment-service ping account-service

# If fails, check Docker network
docker network inspect $(docker network ls | awk '/default|nexus/ {print $1; exit}')

# Verify service names in docker-compose.yml match network requests

# Solution: Restart network
docker compose down
docker network rm fintechp_default  # optional: remove network
docker compose up -d

# Test connectivity
docker exec payment-service curl -i http://account-service:8080/health

# ============================================================================
# ISSUE #6: Payment creation returns 500 error
# ============================================================================

# Problem: API returns {"error": "internal server error"}

# Check payment-service logs
docker logs -f nexus-payment-service --tail=50

# Look for:
#   - Database connection errors
#   - Validation errors
#   - Timeout errors

# Common causes:
#   1. Missing Idempotency-Key header: curl must include -H "Idempotency-Key: xxx"
#   2. Invalid account IDs: Check accounts table first
#   3. Database full: Check disk space with docker system df

# Validate account exists before creating payment
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT id, balance FROM nexus_ledger.accounts
  WHERE id IN ('ACC-001-SETTLE', 'ACC-002-NOSTRO');"

# ============================================================================
# ISSUE #7: Idempotency not working (duplicate payments created)
# ============================================================================

# Problem: Same idempotency key creates multiple payments

# Check idempotency key format
#   Valid: Must be UUID or stable string (no timestamps)
#   Example: "payment-20240115-001" or "ffffffff-ffff-ffff-ffff-ffffffffffff"

# Check if idempotency table exists
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT * FROM nexus_ledger.idempotency_keys LIMIT 5;"

# If table is missing or corrupted:
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  DROP TABLE IF EXISTS nexus_ledger.idempotency_keys CASCADE;
  CREATE TABLE nexus_ledger.idempotency_keys (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    request_hash VARCHAR(64) NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );"

# ============================================================================
# ISSUE #8: Kafka events not flowing
# ============================================================================

# Problem: "No messages in Kafka" or dead letter queue growing

# Check if Kafka is running
docker exec nexus-kafka-1 kafka-topics --list --bootstrap-server localhost:9092

# Check for errors in payment service
docker logs nexus-payment-service | grep -i kafka

# Manual message publish test
docker exec nexus-kafka-1 kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic payment-events

# (Type a test message, hit Ctrl+D to send)

# Check consumer lag
docker exec nexus-kafka-1 kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --list

docker exec nexus-kafka-1 kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group payment-consumer \
  --describe

# ============================================================================
# ISSUE #9: High latency or slow responses
# ============================================================================

# Problem: Requests taking >1 second to respond

# Check database query performance
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT duration, query FROM system.statement_bundle
  ORDER BY duration DESC LIMIT 10;"

# Add index if queries are full table scans
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "
  CREATE INDEX IF NOT EXISTS idx_payments_debtor
  ON nexus_ledger.payments(debtor_account);"

# Check Kong latency
curl -w "Time: %{time_total}s\n" http://localhost:8000/health

# Monitor in real-time
watch 'docker stats --no-stream | grep "payment\|cockroach"'

# ============================================================================
# ISSUE #10: Out of disk space
# ============================================================================

# Problem: "no space left on device" error

# Check disk usage
docker system df

# Remove unused volumes
docker volume prune

# Remove stopped containers
docker container prune

# Remove dangling images
docker image prune

# If still critical, remove specific old volume
docker volume rm $(docker volume ls -q | head -1)

# ============================================================================
# ISSUE #11: Tests failing with "connection refused"
# ============================================================================

# Problem: Integration tests fail because services not ready

# Make sure all services are healthy
docker compose ps
# Expected: All services "Up" and healthy

# Wait longer before running tests
sleep 30  # Give services time to initialize
make test-integration

# Or run with retry logic
for i in {1..3}; do
  echo "Test attempt $i..."
  make test-integration && break
  sleep 10
done

# ============================================================================
# ISSUE #12: Grafana can't connect to Prometheus
# ============================================================================

# Problem: Grafana shows "Data source error" for Prometheus

# Check if Prometheus is running
curl http://localhost:9090/-/healthy

# Check Grafana datasource configuration
#   1. Go to http://localhost:3000/datasources
#   2. Edit Prometheus datasource
#   3. Change URL to: http://prometheus:9090 (internal Docker DNS)
#       NOT http://localhost:9090 (that's from Grafana's container perspective)

# Verify Docker DNS resolution
docker exec grafana getent hosts prometheus

# ============================================================================
# NUCLEAR OPTIONS (Last Resort)
# ============================================================================

# Complete system reset (DELETES ALL DATA)
make infra-down
docker system prune -a --volumes
docker compose build --no-cache
make infra-up
make db-migrate
make services-up

# This will take ~5 minutes. Services will be completely fresh.

# ============================================================================
# QUICK DIAGNOSTICS SCRIPT
# ============================================================================

# Save this as `diagnose.sh` to run quick health check

#!/bin/bash
echo "=== Quick Diagnostics ==="
echo ""
echo "1. Docker status:"
docker ps -q | wc -l && echo "   ✓ Containers running"

echo ""
echo "2. Kong gateway:"
curl -s http://localhost:8000/health >/dev/null && echo "   ✓ Kong responding"

echo ""
echo "3. CockroachDB:"
docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "SELECT 1" >/dev/null 2>&1 && echo "   ✓ Database responding"

echo ""
echo "4. Payment service:"
curl -s http://localhost:8000/api/v1/payments?limit=1 >/dev/null && echo "   ✓ Payment service responding"

echo ""
echo "5. Kafka:"
docker exec nexus-kafka-1 kafka-topics --list --bootstrap-server localhost:9092 >/dev/null 2>&1 && echo "   ✓ Kafka responding"

echo ""
echo "6. Disk space:"
df -h / | tail -1 | awk '{print "   Available: " $4}'

echo ""
echo "=== End Diagnostics ==="

# ============================================================================
# GETTING HELP
# ============================================================================

# If you're stuck:
#   1. Check logs: docker logs CONTAINER_NAME --tail=100
#   2. Check TESTING_CHECKLIST.md Part 5 (Troubleshooting section)
#   3. Run: bash diagnose.sh to identify which component is failing
#   4. Search error message in: docs/, ENHANCEMENT_SUMMARY.md
#   5. Nuclear option: make infra-down && make infra-up && sleep 60

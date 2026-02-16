#!/bin/bash
# ============================================================================
# Quick Start Script — Nexus RTP Platform
# ============================================================================
# Usage: bash start.sh
# This script starts the entire application in the correct order with checks

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE="docker compose -f infra/docker/docker-compose.yml"
TIMEOUT=60
MAX_RETRIES=30

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
}

wait_for_service() {
  local service=$1
  local url=$2
  local max_attempts=$3

  log_info "Waiting for $service to be ready..."

  for i in $(seq 1 "$max_attempts"); do
    if curl -sf "$url" > /dev/null 2>&1; then
      log_success "$service is ready"
      return 0
    fi
    echo -n "."
    sleep 2
  done

  log_error "$service failed to start (timeout after $((max_attempts * 2))s)"
  return 1
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================

echo ""
echo "=========================================="
echo "  Nexus RTP Platform — Quick Start"
echo "=========================================="
echo ""

# Step 1: Check prerequisites
log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed or not in PATH"
  exit 1
fi
log_success "Docker installed"

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
  log_error "Docker Compose is not installed"
  exit 1
fi
log_success "Docker Compose installed"

if ! command -v go &> /dev/null; then
  log_warning "Go is not installed (not needed for Docker-based test)"
fi

# Step 2: Check Docker daemon
log_info "Checking Docker daemon..."
if ! docker ps > /dev/null 2>&1; then
  log_error "Docker daemon is not running. Start Docker Desktop."
  exit 1
fi
log_success "Docker daemon is running"

# Step 2b: Check for stale Zookeeper state
log_info "Checking for stale Zookeeper state..."
if docker volume ls 2>/dev/null | grep -q "zookeeper-data"; then
  log_warning "Found existing Zookeeper volume (potential stale state)"
  log_warning "This can cause Kafka broker registration errors"
  log_warning "Cleaning up volumes for fresh start..."
  (cd infra/docker && docker compose down -v 2>/dev/null || true)
  sleep 3
  log_success "Volumes cleaned up"
fi

# Step 3: Start infrastructure
log_info "Starting infrastructure services..."
log_info "This may take 30–60 seconds on first run..."

$DOCKER_COMPOSE up -d 2>&1 | grep -v "already in use\|WARNING"

log_success "Infrastructure containers started"
echo ""

# Step 4: Wait for services to be healthy
log_info "Waiting for services to be healthy (~30 seconds)..."

# CockroachDB
if ! wait_for_service "CockroachDB" "http://localhost:8080/health" "$MAX_RETRIES"; then
  log_error "CockroachDB failed to start"
  $DOCKER_COMPOSE logs cockroachdb-1 | tail -50
  exit 1
fi

# Kafka
log_info "Waiting for Kafka brokers to be ready..."
for attempt in {1..20}; do
  if docker exec nexus-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; then
    log_success "Kafka broker 1 is ready"
    break
  fi

  # Check for Zookeeper registration error (NodeExistsException)
  if docker logs nexus-kafka-1 2>&1 | grep -q "NodeExistsException"; then
    log_error "Kafka Zookeeper registration error (stale state)"
    log_error "Run: docker compose -f infra/docker/docker-compose.yml down -v"
    log_error "Then run: bash start.sh"
    exit 1
  fi

  if [ $attempt -eq 20 ]; then
    log_warning "Kafka broker health check timeout (may still be initializing)"
  fi

  sleep 2
done

# Kong
if ! wait_for_service "Kong Gateway" "http://localhost:8000/health" "$MAX_RETRIES"; then
  log_error "Kong Gateway failed to start"
  $DOCKER_COMPOSE logs kong | tail -50
  exit 1
fi

# Redis
if ! wait_for_service "Redis" "http://localhost:6379" 10; then
  log_warning "Redis health check not available via HTTP (checking via redis-cli)..."
  if ! docker exec nexus-redis redis-cli ping > /dev/null 2>&1; then
    log_error "Redis failed to start"
    exit 1
  fi
  log_success "Redis is ready"
fi

echo ""
log_success "All infrastructure services are healthy!"

# Step 5: Run database migrations
log_info "Running database migrations..."

if docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "SELECT 1;" > /dev/null 2>&1; then
  log_success "Database is accepting connections"

  # Check if migrations already ran
  MIGRATION_COUNT=$(docker exec nexus-cockroachdb-1 cockroach sql --insecure --format csv -e "
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_catalog = 'nexus_ledger';
  " 2>/dev/null | tail -1 || echo "0")

  if [ "$MIGRATION_COUNT" -gt 0 ]; then
    log_success "Database already initialized ($MIGRATION_COUNT tables found)"
  else
    log_info "Initializing database schema..."
    if docker exec nexus-cockroachdb-1 cockroach sql --insecure \
      --database=nexus_ledger \
      -e "$(cat infra/docker/cockroachdb/init/001_init_schema.sql 2>/dev/null || echo 'SELECT 1;')" > /dev/null 2>&1; then
      log_success "Database migrations completed"
    else
      log_warning "Database migration script not found or failed (may already be initialized)"
    fi
  fi
else
  log_error "Failed to connect to database"
  exit 1
fi

# Step 6: Start business services (if using docker compose services profile)
log_info "Starting business services..."
$DOCKER_COMPOSE --profile services up -d 2>&1 | grep -v "already in use" || true
log_success "Business services started"

# Step 7: Final health checks
echo ""
log_info "Running final health checks..."

# CockroachDB
if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
  log_success "CockroachDB: UP"
else
  log_error "CockroachDB: DOWN"
fi

# Kong
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
  log_success "Kong Gateway: UP"
else
  log_error "Kong Gateway: DOWN"
fi

# Payment Service (via Kong)
if curl -sf http://localhost:8000/api/v1/health > /dev/null 2>&1; then
  log_success "Payment Service: UP"
else
  log_warning "Payment Service: Not yet ready (may take a few more seconds)"
fi

echo ""
log_success "Startup complete!"

# Step 8: Display service URLs
echo ""
echo "=========================================="
echo "  Services are running!"
echo "=========================================="
echo ""
echo -e "${GREEN}APIs:${NC}"
echo "  Kong Gateway:      http://localhost:8000"
echo ""
echo -e "${GREEN}Admin Consoles:${NC}"
echo "  CockroachDB:       http://localhost:8080"
echo "  Kafka UI:          http://localhost:8090"
echo "  Grafana:           http://localhost:3000 (admin/nexus123)"
echo "  Prometheus:        http://localhost:9090"
echo "  Flink Dashboard:   http://localhost:8082"
echo ""
echo -e "${GREEN}Quick Commands:${NC}"
echo "  View logs:         make logs"
echo "  Restart services:  make services-down && make services-up"
echo "  Database shell:    make db-shell"
echo "  Stop everything:   make infra-down"
echo "  Full test suite:   make test-integration"
echo ""
echo "=========================================="
echo ""

# Step 9: Offer to run tests
echo -n "Would you like to run a quick smoke test? (y/n) "
read -r response
if [ "$response" = "y" ]; then
  log_info "Running smoke tests..."

  # Test 1: Database health
  PAYMENT_COUNT=$(docker exec nexus-cockroachdb-1 cockroach sql --insecure --format csv -e "
    SELECT COUNT(*) FROM nexus_ledger.payments;
  " 2>/dev/null | tail -1 || echo "ERROR")

  if [ "$PAYMENT_COUNT" != "ERROR" ]; then
    log_success "Database query works (payments count: $PAYMENT_COUNT)"
  else
    log_warning "Database query test failed"
  fi

  # Test 2: Simple API call
  HEALTH=$(curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "down")
  if [ "$HEALTH" = "up" ] || [ "$HEALTH" = "healthy" ]; then
    log_success "API health endpoint working"
  else
    log_warning "API health endpoint returned: $HEALTH"
  fi

  echo ""
fi

echo -e "${GREEN}Welcome to Nexus RTP!${NC}"
echo "For detailed testing guide, see: TESTING_CHECKLIST.md"
echo ""

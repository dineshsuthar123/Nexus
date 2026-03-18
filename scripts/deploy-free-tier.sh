#!/usr/bin/env bash
# =============================================================================
# Nexus RTP — Free-Tier VPS Deployment Script
#
# Deploys the entire Nexus platform to a single VPS using Docker Compose.
# Designed for free-tier machines (Oracle Cloud, Hetzner, etc.)
#
# Prerequisites:
#   - Docker & Docker Compose v2+ installed
#   - 4+ GB RAM, 2+ vCPU recommended
#   - Ports 8085-8093, 3002 open (or behind a reverse proxy)
#
# Usage:
#   chmod +x scripts/deploy-free-tier.sh
#   ./scripts/deploy-free-tier.sh [build|pull|up|down|status|logs|migrate]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/infra/docker/docker-compose.prod.yml"
ENV_FILE="${NEXUS_ENV_FILE:-$PROJECT_ROOT/.env.production}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[NEXUS]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

check_prerequisites() {
    if ! command -v docker &> /dev/null; then
        err "Docker is not installed. Install with: curl -fsSL https://get.docker.com | sh"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        err "Docker Compose v2 is required. Update Docker or install compose plugin."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        err "Docker daemon is not running. Start with: sudo systemctl start docker"
        exit 1
    fi

    if [ ! -f "$ENV_FILE" ]; then
        warn "Production env file not found at $ENV_FILE"
        log "Creating from template..."
        cp "$PROJECT_ROOT/.env.production.example" "$ENV_FILE"
        warn "IMPORTANT: Edit $ENV_FILE and set real passwords before deploying!"
        exit 1
    fi

    # Validate no placeholder passwords remain
    if grep -q "CHANGE_ME" "$ENV_FILE"; then
        err "Production env file still contains CHANGE_ME placeholders!"
        err "Edit $ENV_FILE and replace all CHANGE_ME values with real passwords."
        exit 1
    fi
}

cmd_build() {
    log "Building all Docker images locally..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile services build --parallel
    log "Build complete."
}

cmd_pull() {
    log "Pulling pre-built images from registry..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile services pull --ignore-buildable
    log "Pull complete."
}

cmd_infra_up() {
    log "Starting infrastructure services (DB, Kafka, Redis, monitoring)..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    log "Waiting for infrastructure to become healthy..."

    # Wait for CockroachDB
    log "Waiting for CockroachDB..."
    timeout 120 bash -c 'until docker exec nexus-cockroachdb cockroach sql --insecure -e "SELECT 1" > /dev/null 2>&1; do sleep 2; done' || {
        err "CockroachDB failed to start"
        exit 1
    }
    log "CockroachDB is ready."

    # Wait for Kafka
    log "Waiting for Kafka..."
    timeout 90 bash -c 'until docker exec nexus-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; do sleep 2; done' || {
        err "Kafka failed to start"
        exit 1
    }
    log "Kafka is ready."

    # Wait for Redis
    log "Waiting for Redis..."
    local redis_pw
    redis_pw=$(grep REDIS_PASSWORD "$ENV_FILE" | cut -d= -f2)
    timeout 30 bash -c "until docker exec nexus-redis redis-cli -a '$redis_pw' ping > /dev/null 2>&1; do sleep 1; done" || {
        err "Redis failed to start"
        exit 1
    }
    log "Redis is ready."

    log "All infrastructure services are healthy."
}

cmd_migrate() {
    log "Running database migrations..."
    for f in "$PROJECT_ROOT"/migrations/*.sql; do
        fname="$(basename "$f")"
        log "  Applying $fname..."
        docker exec -i nexus-cockroachdb cockroach sql --insecure < "$f" || {
            warn "Migration $fname had issues (may already be applied)"
        }
    done
    log "Migrations complete."
}

cmd_services_up() {
    log "Starting application services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile services up -d

    log "Waiting for services to become healthy..."
    local services=("payment-service:8085" "account-service:8086" "reconciliation-service:8087" "auth-service:8088" "notification-service:8092" "ws-gateway:8089" "analytics-service:8093" "audit-service:8091")

    for svc_port in "${services[@]}"; do
        local svc="${svc_port%%:*}"
        local port="${svc_port##*:}"
        printf "  Checking %-25s ... " "$svc"
        if timeout 60 bash -c "until curl -sf http://localhost:$port/health > /dev/null 2>&1; do sleep 2; done" 2>/dev/null; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${YELLOW}TIMEOUT${NC}"
            warn "$svc may still be starting"
        fi
    done

    log "All services started."
}

cmd_up() {
    check_prerequisites
    cmd_infra_up
    sleep 5
    cmd_migrate
    cmd_services_up
    echo ""
    log "=== Nexus RTP Platform is running ==="
    cmd_status
}

cmd_down() {
    log "Stopping all services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile services down
    log "Stopped."
}

cmd_status() {
    echo ""
    echo -e "${BLUE}=== Service Status ===${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile services ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""

    echo -e "${BLUE}=== Resource Usage ===${NC}"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" \
        $(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile services ps -q 2>/dev/null) 2>/dev/null || true
    echo ""

    echo -e "${BLUE}=== Endpoints ===${NC}"
    echo "  Payment API:   http://localhost:8085/api/v1/payments"
    echo "  Account API:   http://localhost:8086/api/v1/accounts"
    echo "  Auth API:      http://localhost:8088/api/v1/auth"
    echo "  WebSocket:     ws://localhost:8089/ws"
    echo "  Grafana:       http://localhost:3002"
    echo "  Prometheus:    http://localhost:9090"
    echo "  CockroachDB:   http://localhost:8080"
}

cmd_logs() {
    local service="${1:-}"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
            --profile services logs -f "$service"
    else
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
            --profile services logs -f --tail=100
    fi
}

cmd_smoke() {
    log "Running quick smoke test..."

    # Test health endpoints
    local services=("payment-service:8085" "account-service:8086" "auth-service:8088")
    local pass=0
    local fail=0

    for svc_port in "${services[@]}"; do
        local svc="${svc_port%%:*}"
        local port="${svc_port##*:}"
        printf "  Health %-25s " "$svc"
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            echo -e "${GREEN}PASS${NC}"
            ((pass++))
        else
            echo -e "${RED}FAIL${NC}"
            ((fail++))
        fi
    done

    # Test DB connectivity
    printf "  CockroachDB tables               "
    local tables
    tables=$(docker exec nexus-cockroachdb cockroach sql --insecure --database=nexus_ledger -e "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" --format=csv 2>/dev/null | tail -1)
    if [ "$tables" -gt 5 ] 2>/dev/null; then
        echo -e "${GREEN}PASS${NC} ($tables tables)"
        ((pass++))
    else
        echo -e "${RED}FAIL${NC}"
        ((fail++))
    fi

    echo ""
    log "Result: $pass passed, $fail failed"
    [ "$fail" -eq 0 ] || exit 1
}

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
case "${1:-help}" in
    build)   check_prerequisites; cmd_build ;;
    pull)    check_prerequisites; cmd_pull ;;
    up)      cmd_up ;;
    down)    cmd_down ;;
    status)  cmd_status ;;
    logs)    cmd_logs "${2:-}" ;;
    migrate) check_prerequisites; cmd_migrate ;;
    smoke)   cmd_smoke ;;
    *)
        echo "Nexus RTP — Free-Tier Deployment"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  build    Build Docker images locally"
        echo "  pull     Pull pre-built images from ghcr.io"
        echo "  up       Start everything (infra + migrate + services)"
        echo "  down     Stop all services"
        echo "  status   Show service status and endpoints"
        echo "  logs     Tail logs (optionally specify service name)"
        echo "  migrate  Run database migrations"
        echo "  smoke    Run quick smoke test"
        ;;
esac

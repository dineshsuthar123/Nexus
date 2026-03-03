# Nexus - Global Real-Time Payment Network
# Makefile for development and deployment

.PHONY: help infra-up infra-down services-up services-down db-migrate test lint build clean all

# Colors
BLUE := \033[34m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m

# Variables
DOCKER_COMPOSE := docker compose -f infra/docker/docker-compose.yml
KIND_CLUSTER := nexus-cluster
GO_SERVICES := payment-service account-service reconciliation-service auth-service notification-service ws-gateway analytics-service audit-service

# Default target
all: build

help: ## Show this help
	@echo "$(BLUE)Nexus - Global Real-Time Payment Network$(NC)"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

# ============================================================================
# Build
# ============================================================================

build: ## Build all services
	@echo "$(GREEN)Building Nexus platform...$(NC)"
	@mkdir -p bin
	@for service in $(GO_SERVICES); do \
		if [ -d "services/$$service" ]; then \
			echo "  Building $$service..."; \
			(cd services/$$service && go build -o ../../bin/$$service ./cmd/server 2>/dev/null || go build -o ../../bin/$$service . 2>/dev/null || echo "    Skipped (no main package)"); \
		fi; \
	done
	@echo "$(GREEN)Build complete!$(NC)"

# ============================================================================
# Infrastructure Management
# ============================================================================

infra-up: ## Start all infrastructure (CockroachDB, Kafka, Redis, Kong)
	@echo "$(GREEN)Starting infrastructure...$(NC)"
	$(DOCKER_COMPOSE) up -d
	@echo "$(GREEN)Waiting for services to be healthy...$(NC)"
	@sleep 10
	@echo "$(GREEN)Infrastructure is ready!$(NC)"
	@echo ""
	@echo "$(BLUE)Services:$(NC)"
	@echo "  Kong Gateway:    http://localhost:8000"
	@echo "  CockroachDB UI:  http://localhost:8080"
	@echo "  Kafka UI:        http://localhost:8090"
	@echo "  Flink Dashboard: http://localhost:8082"
	@echo "  Grafana:         http://localhost:3000"
	@echo "  Prometheus:      http://localhost:9090"

infra-down: ## Stop all infrastructure
	@echo "$(YELLOW)Stopping infrastructure...$(NC)"
	$(DOCKER_COMPOSE) down -v
	@echo "$(GREEN)Infrastructure stopped.$(NC)"

infra-logs: ## View infrastructure logs
	$(DOCKER_COMPOSE) logs -f

infra-ps: ## Show infrastructure status
	$(DOCKER_COMPOSE) ps

# ============================================================================
# Database Management
# ============================================================================

db-migrate: ## Run database migrations
	@echo "$(GREEN)Running database migrations...$(NC)"
	@docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "source '/docker-entrypoint-initdb.d/001_init_schema.sql'"
	@echo "$(GREEN)Migrations complete.$(NC)"

db-shell: ## Open CockroachDB SQL shell
	@docker exec -it nexus-cockroachdb-1 cockroach sql --insecure --database=nexus_ledger

db-reset: ## Reset database (DESTRUCTIVE)
	@echo "$(RED)WARNING: This will delete all data!$(NC)"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	@docker exec -it nexus-cockroachdb-1 cockroach sql --insecure -e "DROP DATABASE IF EXISTS nexus_ledger CASCADE;"
	@make db-migrate

# ============================================================================
# Service Management
# ============================================================================

services-build: ## Build all Go services
	@echo "$(GREEN)Building services...$(NC)"
	@for service in $(GO_SERVICES); do \
		echo "Building $$service..."; \
		cd services/$$service && go build -o ../../bin/$$service ./cmd/... && cd ../..; \
	done
	@echo "$(GREEN)All services built.$(NC)"

services-up: ## Start all services (requires infra-up first)
	@echo "$(GREEN)Starting services...$(NC)"
	$(DOCKER_COMPOSE) --profile services up -d
	@echo "$(GREEN)Services started.$(NC)"

services-down: ## Stop all services
	@echo "$(YELLOW)Stopping services...$(NC)"
	$(DOCKER_COMPOSE) --profile services down
	@echo "$(GREEN)Services stopped.$(NC)"

# ============================================================================
# Flink Jobs
# ============================================================================

flink-build: ## Build Flink jobs
	@echo "$(GREEN)Building Flink jobs...$(NC)"
	cd flink-jobs && ./gradlew build
	@echo "$(GREEN)Flink jobs built.$(NC)"

flink-submit-fraud: ## Submit fraud detection job to Flink
	@echo "$(GREEN)Submitting fraud detection job...$(NC)"
	docker exec nexus-flink-jobmanager flink run -d /opt/flink/jobs/fraud-detection.jar
	@echo "$(GREEN)Job submitted.$(NC)"

# ============================================================================
# Testing
# ============================================================================

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	@for service in $(GO_SERVICES); do \
		echo "Testing $$service..."; \
		cd services/$$service && go test -v ./... && cd ../..; \
	done
	@echo "$(GREEN)All tests passed.$(NC)"

test-integration: ## Run integration tests
	@echo "$(GREEN)Running integration tests...$(NC)"
	cd tests/integration && go test -v -tags=integration ./...

test-benchmark: ## Run performance benchmarks
	@echo "$(GREEN)Running benchmarks...$(NC)"
	cd tests/benchmark && go test -bench=. -benchmem ./...

test-coverage: ## Generate test coverage report
	@echo "$(GREEN)Generating coverage report...$(NC)"
	@for service in $(GO_SERVICES); do \
		cd services/$$service && go test -coverprofile=coverage.out ./... && cd ../..; \
	done

# ============================================================================
# Linting & Formatting
# ============================================================================

lint: ## Run linters
	@echo "$(GREEN)Running linters...$(NC)"
	@for service in $(GO_SERVICES); do \
		echo "Linting $$service..."; \
		cd services/$$service && golangci-lint run ./... && cd ../..; \
	done

fmt: ## Format code
	@echo "$(GREEN)Formatting code...$(NC)"
	@for service in $(GO_SERVICES); do \
		cd services/$$service && go fmt ./... && cd ../..; \
	done

# ============================================================================
# Kubernetes (Kind) Management
# ============================================================================

k8s-create: ## Create Kind cluster
	@echo "$(GREEN)Creating Kind cluster...$(NC)"
	kind create cluster --name $(KIND_CLUSTER) --config infra/kubernetes/kind-config.yaml
	@echo "$(GREEN)Cluster created.$(NC)"

k8s-delete: ## Delete Kind cluster
	@echo "$(YELLOW)Deleting Kind cluster...$(NC)"
	kind delete cluster --name $(KIND_CLUSTER)
	@echo "$(GREEN)Cluster deleted.$(NC)"

k8s-deploy: ## Deploy to Kind cluster
	@echo "$(GREEN)Deploying to Kubernetes...$(NC)"
	kubectl apply -k deploy/kubernetes/base
	@echo "$(GREEN)Deployment complete.$(NC)"

k8s-dashboard: ## Open Kubernetes dashboard
	@echo "$(GREEN)Starting Kubernetes dashboard...$(NC)"
	kubectl proxy &
	@echo "Dashboard: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/"

# ============================================================================
# Chaos Engineering
# ============================================================================

chaos-install: ## Install Chaos Mesh
	@echo "$(GREEN)Installing Chaos Mesh...$(NC)"
	kubectl apply -f https://mirrors.chaos-mesh.org/v2.6.0/install.yaml
	@echo "$(GREEN)Chaos Mesh installed.$(NC)"

chaos-pod-kill: ## Run pod failure experiment
	@echo "$(YELLOW)Running pod kill experiment...$(NC)"
	kubectl apply -f infra/chaos/pod-kill.yaml

chaos-network-delay: ## Run network delay experiment
	@echo "$(YELLOW)Running network delay experiment...$(NC)"
	kubectl apply -f infra/chaos/network-delay.yaml

# ============================================================================
# Utilities
# ============================================================================

clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	rm -rf bin/
	rm -rf dist/
	@for service in $(GO_SERVICES); do \
		rm -f services/$$service/coverage.out; \
	done
	cd flink-jobs && ./gradlew clean || true
	@echo "$(GREEN)Clean complete.$(NC)"

deps: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	@for service in $(GO_SERVICES); do \
		cd services/$$service && go mod download && cd ../..; \
	done
	@echo "$(GREEN)Dependencies installed.$(NC)"

proto: ## Generate protobuf code
	@echo "$(GREEN)Generating protobuf code...$(NC)"
	protoc --go_out=. --go-grpc_out=. libs/proto/*.proto
	@echo "$(GREEN)Protobuf code generated.$(NC)"

docs: ## Generate documentation
	@echo "$(GREEN)Generating documentation...$(NC)"
	cd docs && mkdocs build
	@echo "$(GREEN)Documentation generated.$(NC)"

# ============================================================================
# Development Shortcuts
# ============================================================================

dev: infra-up db-migrate ## Start development environment
	@echo "$(GREEN)Development environment ready!$(NC)"

run-payment: ## Run payment service locally
	cd services/payment-service && go run ./cmd/server

run-account: ## Run account service locally
	cd services/account-service && go run ./cmd/server

logs: ## View all logs
	$(DOCKER_COMPOSE) logs -f

watch: ## Watch for changes and rebuild (requires entr)
	find services -name '*.go' | entr -r make services-build

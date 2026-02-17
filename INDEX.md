# Testing & Startup Guide — Master Index

Welcome to Nexus RTP! This guide helps you get started with local testing and ensures everything is working correctly before production deployment.

## 📋 Quick Navigation

### **Just Want to Start?**
→ **Run this one command:** `bash start.sh`

This automatically starts everything with health checks and displays all service URLs.

---

## 📚 Guide Overview

| Guide | Purpose | When to Use |
|-------|---------|------------|
| **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** | 6-part comprehensive testing guide (600+ lines) | Complete testing workflow from startup to pre-launch |
| **[start.sh](start.sh)** | Automated startup script with health checks | Quick automated startup (replaces manual steps) |
| **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** | One-line command reference for common tasks | Copy-paste commands for testing, debugging, monitoring |
| **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** | Solutions to 12 common problems | When something isn't working as expected |

---

## 🚀 Getting Started (3 Options)

### **Option 1: Fully Automated (Recommended) — 2 minutes**

```bash
bash start.sh
```

This script:
- ✅ Checks prerequisites (Docker, Go, docker-compose)
- ✅ Starts infrastructure (CockroachDB, Kafka, Redis, Kong, monitoring)
- ✅ Runs database migrations
- ✅ Starts all business services
- ✅ Performs health checks
- ✅ Displays all service URLs
- ✅ Optionally runs smoke tests

**When it completes, you'll see:**
```
Kong Gateway:        http://localhost:8000
CockroachDB UI:      http://localhost:8080
Kafka UI:            http://localhost:8090
Grafana:             http://localhost:3000
Prometheus:          http://localhost:9090
```

---

### **Option 2: Step-by-Step Manual — 5 minutes**

Follow [TESTING_CHECKLIST.md Part 1](TESTING_CHECKLIST.md#part-1-starting-the-application):

```bash
# 1. Start infrastructure
make infra-up

# 2. Wait ~15 seconds, then run migrations
make db-migrate

# 3. Start business services
make services-up

# 4. Verify everything is running
docker compose ps
```

---

### **Option 3: Advanced Setup for Development**

```bash
# Infrastructure only (no services)
make infra-up

# Access database directly
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure

# In another terminal, run services manually
cd services/payment-service && go run main.go
cd services/account-service && go run main.go
# ... etc
```

---

## ✅ Next Steps After Startup

### **1. Verify Infrastructure (5 min)**
→ See [TESTING_CHECKLIST.md Part 3.1](TESTING_CHECKLIST.md#31-cockroachdb-console) (CockroachDB verification)

**Quick checks:**
```bash
# Check all services are running
docker compose ps

# Verify database
docker exec -it nexus-cockroachdb-1 cockroach node ls --insecure

# Verify Kafka topics
docker exec nexus-kafka-1 kafka-topics --list --bootstrap-server localhost:9092
```

### **2. Test APIs (10 min)**
→ See [TESTING_CHECKLIST.md Part 3.3](TESTING_CHECKLIST.md#33-payment-api-manual-testing) (Curly commands)

**Quick test: Create a payment**
```bash
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "amount": "100.00",
    "currency": "USD",
    "debtorAccount": "ACC-001-SETTLE",
    "creditorAccount": "ACC-002-NOSTRO",
    "debtorName": "Test Corp",
    "creditorName": "Test Ltd",
    "paymentType": "INSTANT",
    "purpose": "Test Payment"
  }' | jq .
```

### **3. Run Smoke Tests (2 min)**
→ See [tests/smoke_test.sh](tests/smoke_test.sh)

```bash
bash tests/smoke_test.sh
```

**Output shows:**
- ✓ All infrastructure health checks passed
- ✓ Idempotency working
- ✓ Payment creation working
- ✓ Database integrity verified
- ✓ Balance invariant maintained

### **4. Run Full Test Suite (5 min)**
→ See [TESTING_CHECKLIST.md Part 2](TESTING_CHECKLIST.md#part-2-running-tests)

```bash
# Unit tests
make test

# Integration tests
make test-integration

# Test with coverage report
make test-coverage
```

### **5. Monitor Everything (5 min)**
→ See [TESTING_CHECKLIST.md Part 3.4 & 3.5](TESTING_CHECKLIST.md#34-grafana-dashboards) (Dashboards)

**Access dashboards:**
- **Grafana:** http://localhost:3000 (username: admin, password: admin)
- **Prometheus:** http://localhost:9090
- **CockroachDB:** http://localhost:8080
- **Kafka:** http://localhost:8090

---

## 🔧 Common Commands

### **Startup & Control**
```bash
bash start.sh              # Automated startup (recommended)
make infra-up             # Start infrastructure only
make services-up          # Start services only
make infra-down           # Stop everything
docker compose ps         # Check running services
make logs                 # View live logs
```

### **Testing**
```bash
bash tests/smoke_test.sh   # Quick smoke tests
make test                  # Unit tests
make test-integration      # Integration tests
bash chaos/network_partition.sh  # Chaos test
```

### **Database**
```bash
# Access database
docker exec -it nexus-cockroachdb-1 cockroach sql --insecure

# Quick queries
docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT COUNT(*) FROM nexus_ledger.payments;"

docker exec nexus-cockroachdb-1 cockroach sql --insecure -e "
  SELECT SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) -
         SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) AS balance
  FROM nexus_ledger.ledger_entries;"
```

### **Debugging**
```bash
docker logs -f service_name              # View service logs
docker exec service_name curl localhost  # Test from inside container
lsof -i :8000                           # Check port usage
docker stats                            # Monitor resource usage
```

---

## 📖 Detailed Guides

### **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** — Comprehensive 6-Part Guide
**Parts:**
1. **Starting the Application** — 3 options (automated, manual, advanced)
2. **Running Tests** — Unit, integration, benchmark, coverage
3. **UI Testing** — Manual verification of each component
4. **Testing Workflow** — Full 30-minute QA sequence
5. **Troubleshooting** — 7 common issues with solutions
6. **Pre-Launch Checklist** — 20 items to sign off before going live

### **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** — Command Reference
One-line commands for:
- Startup & management
- Database operations
- API testing (payment service)
- Kafka & event streaming
- Monitoring & observability
- Service health & debugging
- Testing & validation
- Docker & container management
- Performance testing
- Deployment & release

### **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — Problem Solver
Solutions for:
1. Docker containers won't start
2. Port conflicts
3. CockroachDB not responding
4. Database migrations fail
5. Services not connected (network issues)
6. Payment creation returns 500 error
7. Idempotency not working
8. Kafka events not flowing
9. High latency or slow responses
10. Out of disk space
11. Tests failing with "connection refused"
12. Grafana can't connect to Prometheus

**Plus:** Nuclear options and quick diagnostics script

---

## 🎯 Testing Checklist

### **Before Going to Production:**

**Infrastructure** ✓
- [ ] All 3 CockroachDB nodes are UP
- [ ] Kafka topics created and messages flowing
- [ ] Redis responding to ping
- [ ] Kong health check passes

**Database Integrity** ✓
- [ ] Balance invariant = 0 (conservation of value)
- [ ] No duplicate payment IDs
- [ ] No orphaned ledger entries
- [ ] Replication factor = 3 for all tables

**API Testing** ✓
- [ ] Can create a payment (HTTP 201)
- [ ] Idempotency working (same key = same result)
- [ ] Key reuse rejected (different payload = 409)
- [ ] Get payment status returns correct data
- [ ] Authentication flow working (login → token → authorized)

**Monitoring** ✓
- [ ] Grafana showing metrics (P95 < 500ms, P99 < 1s)
- [ ] Prometheus scraping all targets
- [ ] Alertmanager configured
- [ ] Dashboards displaying correctly

**Performance** ✓
- [ ] Payment creation < 200ms P99
- [ ] API response < 500ms P99
- [ ] Database queries < 50ms P99
- [ ] No memory leaks (sustained load test)

See complete checklist in [TESTING_CHECKLIST.md Part 6](TESTING_CHECKLIST.md#part-6-pre-launch-validation-checklist).

---

## 🆘 Need Help?

1. **Getting Started?** → Run `bash start.sh`
2. **Want detailed steps?** → Read [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)
3. **Need a quick command?** → Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
4. **Something broken?** → See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
5. **Architecture overview?** → Read [docs/whitepaper.md](docs/whitepaper.md)
6. **Feature summary?** → Check [ENHANCEMENT_SUMMARY.md](ENHANCEMENT_SUMMARY.md)

---

## 📞 Support Resources

| Resource | Purpose |
|----------|---------|
| [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) | Complete testing guide |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | Command reference (copy-paste) |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Problem solutions |
| [docs/whitepaper.md](docs/whitepaper.md) | Architecture & design |
| [ENHANCEMENT_SUMMARY.md](ENHANCEMENT_SUMMARY.md) | Features implemented |
| [CHANGELOG.md](CHANGELOG.md) | What changed & when |
| [Makefile](Makefile) | All available targets |
| [docker-compose.yml](docker-compose.yml) | Service topology |

---

## ✨ Quick Stats

**System Overview:**
- **Services:** 8 Go microservices + 1 Flink job
- **Data:** CockroachDB (3-node distributed SQL cluster)
- **Events:** Kafka (3 brokers, 9+ topics)
- **Cache:** Redis (7.2)
- **Gateway:** Kong 3.5
- **Monitoring:** Prometheus + Grafana
- **Total Containers:** 13+ (infrastructure + services)

**Expected Startup Time:**
- Infrastructure only: ~30 seconds
- With migrations: ~45 seconds
- With all services: ~60 seconds
- With smoke tests: ~2 minutes

**Key Features:**
- ✅ Distributed transactions (ACID compliance)
- ✅ Idempotency guarantees (exactly-once payment processing)
- ✅ Double-entry bookkeeping (balance invariant)
- ✅ Real-time events (Kafka)
- ✅ High availability (3-node replication)
- ✅ Comprehensive monitoring (Grafana + Prometheus)
- ✅ Chaos testing (network, database, load)

---

## 🎓 Learning Path

**For new developers:**
1. Read: [ENHANCEMENT_SUMMARY.md](ENHANCEMENT_SUMMARY.md) (5 min) — Overview
2. Read: [docs/whitepaper.md](docs/whitepaper.md) (15 min) — Architecture
3. Run: `bash start.sh` (2 min) — See it running
4. Test: Follow [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) Part 3 (30 min) — Hands-on

**For QA/testers:**
1. Run: `bash start.sh`
2. Follow: [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) Part 4 (30-min workflow)
3. Sign off: [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) Part 6 (checklist)

**For operations:**
1. Study: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Use: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
3. Reference: [runbooks/](runbooks/) (on-call playbooks)

---

## 📝 Version & Status

- **Status:** ✅ Production-Ready (90%+ test coverage)
- **Go Modules:** All 19 modules compile with 0 errors
- **Docker Compose:** Tested ✓
- **Database:** CockroachDB 23.2 (3-node cluster) ✓
- **Last Updated:** 2024
- **Tested On:** macOS, Linux, Windows (with Docker)

Ready to get started? **Run `bash start.sh` now!**

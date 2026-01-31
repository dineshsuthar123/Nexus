# Nexus: Global Real-Time Payment & Settlement Network

[![Go Version](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat&logo=go)](https://golang.org/)
[![Java Version](https://img.shields.io/badge/Java-17+-ED8B00?style=flat&logo=openjdk)](https://openjdk.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> A production-grade Global Real-Time Payments (RTP) and Settlement Network designed to process transactions with sub-second latency, guaranteed exactly-once semantics, and native ISO 20022 compliance.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INGRESS PLANE                                   │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────────────────┐ │
│  │ Kong Gateway│──│ GraphQL/REST API │──│ ISO 20022 Schema Validation     │ │
│  └─────────────┘  └──────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LEDGER PLANE                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         CockroachDB Cluster                              ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       ││
│  │  │ Node 1  │  │ Node 2  │  │ Node 3  │  │ Node 4  │  │ Node 5  │       ││
│  │  │us-east-1│  │us-west-2│  │eu-cent-1│  │ap-south │  │ap-north │       ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  • Serializable Snapshot Isolation (SSI)  • Geo-Partitioned Tables          │
│  • Double-Entry Bookkeeping               • Transactional Outbox Pattern    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               EVENT PLANE                                    │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────────────────┐  │
│  │ Apache Kafka │◄───│ Debezium CDC   │◄───│ CockroachDB Changefeed     │  │
│  │  Cluster     │    │ Connector      │    │                            │  │
│  └──────────────┘    └────────────────┘    └────────────────────────────┘  │
│  Topics: nexus.events.raw │ nexus.payments.enriched │ nexus.fraud.alerts   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INTELLIGENCE PLANE                                 │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────┐│
│  │      Apache Flink           │    │       Moov Watchman                  ││
│  │  ┌─────────────────────┐   │    │  ┌─────────────────────────────┐    ││
│  │  │ Velocity Detection  │   │    │  │ OFAC SDN Screening          │    ││
│  │  │ Smurfing Detection  │   │    │  │ Jaro-Winkler Matching       │    ││
│  │  │ Geo-Anomaly Check   │   │    │  │ < 10ms Response Time        │    ││
│  │  └─────────────────────┘   │    │  └─────────────────────────────┘    ││
│  └─────────────────────────────┘    └─────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Sub-Second Latency**: End-to-end payment processing in < 1000ms
- **Exactly-Once Semantics**: Transactional Outbox + Idempotent Consumers
- **ISO 20022 Native**: Full support for pacs.008, pacs.002, pacs.004, camt.053
- **Global Scale**: Geo-distributed CockroachDB with data residency controls
- **Real-Time Fraud Detection**: Apache Flink CEP for behavioral analysis
- **Sanctions Screening**: Moov Watchman for OFAC/SDN compliance
- **Automated Reconciliation**: 3-way match with fuzzy fallback

## Project Structure

```
nexus/
├── services/                    # Go microservices
│   ├── payment-service/         # Core payment processing (pacs.008)
│   ├── account-service/         # Account management & balances
│   ├── reconciliation-service/  # 3-way match reconciliation
│   ├── notification-service/    # Event-driven notifications
│   └── gateway-service/         # API Gateway wrapper
├── flink-jobs/                  # Java Flink streaming jobs
│   ├── fraud-detection/         # CEP fraud patterns
│   └── enrichment/              # Payment enrichment streams
├── libs/                        # Shared libraries
│   ├── iso20022/                # ISO 20022 message types (Go)
│   ├── common/                  # Shared utilities
│   └── proto/                   # Protocol Buffers definitions
├── infra/                       # Infrastructure as Code
│   ├── docker/                  # Docker Compose for local dev
│   ├── kubernetes/              # K8s manifests (Kind compatible)
│   ├── cockroachdb/             # CockroachDB schemas & migrations
│   ├── kafka/                   # Kafka topic definitions
│   └── chaos/                   # Chaos Mesh experiments
├── deploy/                      # Deployment configurations
│   ├── helm/                    # Helm charts
│   └── scripts/                 # Deployment scripts
├── tests/                       # Integration & performance tests
│   ├── integration/             # End-to-end tests
│   ├── benchmark/               # TPC-C style benchmarks
│   └── chaos/                   # Chaos engineering tests
└── docs/                        # Documentation
    ├── adr/                     # Architecture Decision Records
    └── api/                     # API documentation
```

## Quick Start

### Prerequisites

- Docker Desktop (or Docker + Docker Compose)
- Go 1.21+
- Java 17+ (for Flink jobs)
- Kind (Kubernetes in Docker) - for K8s deployment
- Make

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/nexus.git
cd nexus

# Start infrastructure (CockroachDB, Kafka, Redis, Kong)
make infra-up

# Run database migrations
make db-migrate

# Start all services
make services-up

# Run tests
make test

# View logs
make logs
```

### Docker Compose Services

| Service | Port | Description |
|---------|------|-------------|
| Kong Gateway | 8000, 8443 | API Gateway |
| Payment Service | 8080 | Core payment processing |
| Account Service | 8081 | Account management |
| CockroachDB | 26257, 8080 | Distributed SQL |
| Kafka | 9092 | Event streaming |
| Kafka UI | 8090 | Kafka management UI |
| Redis | 6379 | Caching layer |
| Flink JobManager | 8082 | Flink dashboard |
| Watchman | 8084 | Sanctions screening |
| Prometheus | 9090 | Metrics |
| Grafana | 3000 | Dashboards |

## Latency Budget (< 1000ms)

| Stage | Budget | Description |
|-------|--------|-------------|
| Ingress & Validation | 50ms | JSON schema validation |
| Sanctions Check | 100ms | OFAC SDN screening |
| Ledger Reservation | 250ms | CockroachDB consensus write |
| Risk Analysis | 100ms | Flink fraud evaluation |
| Rail Transmission | 400ms | External rail acknowledgement |
| Response & Finality | 100ms | pacs.002 status report |
| **Total** | **~900ms** | 10% buffer for jitter |

## API Examples

### Create Payment (pacs.008)

```bash
curl -X POST http://localhost:8000/api/v1/payments \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "MSG-2026-01-31-001",
    "creationDateTime": "2026-01-31T10:30:00Z",
    "numberOfTransactions": 1,
    "settlementMethod": "CLRG",
    "creditTransfer": {
      "paymentId": "PAY-001",
      "endToEndId": "E2E-001",
      "uetr": "eb6305c9-1f7f-49de-aed0-16487c27b42d",
      "amount": {
        "value": 1000.00,
        "currency": "USD"
      },
      "debtor": {
        "name": "John Doe",
        "account": {
          "iban": "US12345678901234567890"
        }
      },
      "creditor": {
        "name": "Jane Smith",
        "account": {
          "iban": "GB98765432109876543210"
        }
      }
    }
  }'
```

### Check Payment Status (pacs.002)

```bash
curl http://localhost:8000/api/v1/payments/eb6305c9-1f7f-49de-aed0-16487c27b42d/status
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| API Gateway | Kong | Traffic management, rate limiting |
| Services | Go 1.21 | High-performance microservices |
| Stream Processing | Apache Flink (Java) | CEP fraud detection |
| Database | CockroachDB | Distributed SQL ledger |
| Message Queue | Apache Kafka | Event backbone |
| CDC | Debezium | Change Data Capture |
| Caching | Redis | Session & rate limit cache |
| Sanctions | Moov Watchman | OFAC screening |
| Orchestration | Kubernetes (Kind) | Container orchestration |
| Monitoring | Prometheus + Grafana | Observability |
| Tracing | Jaeger | Distributed tracing |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
#   N e x u s  
 
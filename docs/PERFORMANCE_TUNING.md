# Production Performance Tuning Guide — Nexus RTP Platform

## 1. Go Service Tuning

### 1.1 Runtime Settings

```bash
# Environment variables for all Go services
GOGC=100                    # GC target percentage (default 100; increase to 200 for throughput)
GOMEMLIMIT=1800MiB          # Soft memory limit (set to ~90% of container limit)
GOMAXPROCS=0                # Auto-detect CPU count (default; leave as-is)
```

**Recommendation**: For payment-service under high load, set `GOGC=200` and `GOMEMLIMIT=3500MiB` (with 4Gi container limit) to reduce GC pauses at the cost of higher memory usage.

### 1.2 HTTP Server Tuning

```go
// Recommended settings for production Go HTTP servers
server := &http.Server{
    ReadTimeout:       5 * time.Second,
    WriteTimeout:      10 * time.Second,
    IdleTimeout:       120 * time.Second,
    ReadHeaderTimeout: 2 * time.Second,
    MaxHeaderBytes:    1 << 20, // 1 MB
}
```

### 1.3 Connection Pool Settings

```go
// CockroachDB connection pool
db.SetMaxOpenConns(50)           // Max connections per pod
db.SetMaxIdleConns(25)           // Keep 50% idle
db.SetConnMaxLifetime(30 * time.Minute)
db.SetConnMaxIdleTime(5 * time.Minute)

// Redis connection pool
redisPool := &redis.Options{
    PoolSize:     30,
    MinIdleConns: 10,
    DialTimeout:  3 * time.Second,
    ReadTimeout:  2 * time.Second,
    WriteTimeout: 2 * time.Second,
    PoolTimeout:  4 * time.Second,
}
```

## 2. CockroachDB Tuning

### 2.1 Cluster Settings

```sql
-- Increase max ranges per node for better distribution
SET CLUSTER SETTING kv.range_max_bytes = '128 MiB';

-- Optimize for OLTP workloads
SET CLUSTER SETTING kv.transaction.max_intents_bytes = '4 MiB';
SET CLUSTER SETTING kv.transaction.max_refresh_spans_bytes = '4 MiB';

-- Connection limits
SET CLUSTER SETTING server.max_connections_per_gateway = 500;

-- SQL execution
SET CLUSTER SETTING sql.defaults.distsql = 'auto';
SET CLUSTER SETTING sql.stats.automatic_collection.enabled = true;

-- Admission control (resource throttling)
SET CLUSTER SETTING admission.enabled = true;
SET CLUSTER SETTING admission.sql_kv_response.enabled = true;
```

### 2.2 Table-Level Optimizations

```sql
-- Payment table: hot path, optimize for point lookups
ALTER TABLE nexus_ledger.payments CONFIGURE ZONE USING
  range_min_bytes = 134217728,  -- 128 MiB
  range_max_bytes = 536870912,  -- 512 MiB
  gc.ttlseconds = 86400;       -- 24h GC

-- Ledger entries: append-heavy, optimize for sequential writes
ALTER TABLE nexus_ledger.ledger_entries CONFIGURE ZONE USING
  range_min_bytes = 134217728,
  range_max_bytes = 536870912;

-- Add covering indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON nexus_ledger.payments (status, created_at DESC)
  STORING (amount, currency, from_account, to_account);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_payment
  ON nexus_ledger.ledger_entries (payment_id)
  STORING (amount, entry_type, account_id);
```

### 2.3 Query Performance Checklist

- [ ] All queries use indexed lookups (no full table scans on payments/ledger_entries)
- [ ] Pagination uses keyset pagination (`WHERE id > $last_id LIMIT N`), not OFFSET
- [ ] Batch inserts for ledger entries (multi-row INSERT)
- [ ] Read-only queries use `AS OF SYSTEM TIME '-5s'` for follower reads
- [ ] Large result sets stream rows, not buffer in memory

## 3. Kafka Tuning

### 3.1 Producer Settings (Go services)

```go
producerConfig := &sarama.Config{
    Producer: sarama.ProducerConfig{
        RequiredAcks: sarama.WaitForAll,        // RF=3, acks=all
        Retry: sarama.RetryConfig{
            Max: 5,
            Backoff: 100 * time.Millisecond,
        },
        Flush: sarama.FlushConfig{
            Frequency: 10 * time.Millisecond,   // Batch for 10ms
            Messages:  100,                     // Or 100 messages
            Bytes:     1024 * 1024,             // Or 1MB
        },
        Compression: sarama.CompressionLZ4,     // Best throughput/latency ratio
        MaxMessageBytes: 10 * 1024 * 1024,      // 10 MB
        Idempotent: true,                        // Exactly-once producer
    },
}
```

### 3.2 Consumer Settings

```go
consumerConfig := &sarama.Config{
    Consumer: sarama.ConsumerConfig{
        Group: sarama.GroupConfig{
            Rebalance: sarama.RebalanceConfig{
                Strategy: sarama.BalanceStrategySticky,  // Minimize rebalancing
                Timeout:  60 * time.Second,
            },
            Session: sarama.SessionConfig{
                Timeout: 30 * time.Second,
            },
            Heartbeat: sarama.HeartbeatConfig{
                Interval: 3 * time.Second,
            },
        },
        MaxProcessingTime: 5 * time.Second,
        Fetch: sarama.FetchConfig{
            Min:     1,                    // Min 1 byte
            Default: 1024 * 1024,          // Default 1 MB
            Max:     10 * 1024 * 1024,     // Max 10 MB
        },
        Offsets: sarama.OffsetConfig{
            AutoCommit: sarama.AutoCommitConfig{
                Enable:   false,           // Manual commit for exactly-once
            },
        },
    },
}
```

### 3.3 Broker Settings

```properties
# server.properties for production
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=1048576
socket.receive.buffer.bytes=1048576
socket.request.max.bytes=104857600
log.retention.hours=168
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000
num.partitions=12
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
auto.create.topics.enable=false
message.max.bytes=10485760
```

## 4. Redis Tuning

### 4.1 Server Configuration

```conf
# redis.conf
maxmemory 2gb
maxmemory-policy noeviction     # CRITICAL: don't evict idempotency keys
save ""                         # Disable RDB snapshotting (data is ephemeral cache)
appendonly no                   # Disable AOF (cache-only mode)
tcp-backlog 511
timeout 0
tcp-keepalive 300
hz 10
```

### 4.2 Key Design

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `idempotency:{key}` | 24h | Idempotency deduplication |
| `session:{token}` | 30m | Active session cache |
| `rate:{client_id}:{window}` | 60s | Rate limit counters |
| `cache:account:{id}` | 5m | Account balance cache |

## 5. Kong Gateway Tuning

```yaml
# kong.conf
proxy_listen: "0.0.0.0:8000 reuseport backlog=16384"
nginx_worker_processes: auto
nginx_worker_connections: 16384
upstream_keepalive_pool_size: 512
upstream_keepalive_max_requests: 10000
upstream_keepalive_idle_timeout: 60
db_cache_ttl: 0  # If DB-less mode
```

## 6. Resource Sizing Reference

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit | Replicas |
|---------|-------------|-----------|---------------|-------------|----------|
| payment-service | 500m | 2000m | 512Mi | 2Gi | 3–20 |
| account-service | 250m | 1000m | 256Mi | 1Gi | 2–10 |
| auth-service | 250m | 1000m | 256Mi | 1Gi | 2–12 |
| reconciliation-service | 500m | 2000m | 512Mi | 2Gi | 2–8 |
| notification-service | 200m | 500m | 256Mi | 512Mi | 2–8 |
| ws-gateway | 200m | 1000m | 256Mi | 1Gi | 2–10 |
| analytics-service | 250m | 1000m | 256Mi | 1Gi | 2–6 |
| audit-service | 200m | 500m | 256Mi | 512Mi | 2–4 |

## 7. Benchmark Baseline Targets

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| Payment TPS (sustained) | 1,000 | — | Run benchmark_suite.js |
| Payment TPS (peak) | 10,000 | — | Run with SCENARIO=spike |
| Payment P50 latency | < 100ms | — | |
| Payment P95 latency | < 500ms | — | SLO |
| Payment P99 latency | < 1s | — | SLO |
| Auth P99 latency | < 200ms | — | SLO |
| DB query P99 | < 50ms | — | SLO |
| Memory per pod | < 70% limit | — | |
| CPU per pod | < 65% limit | — | HPA trigger |

**Run benchmarks:**
```bash
# Ramp test (default)
k6 run loadtest/benchmark_suite.js

# Soak test (2 hours)
k6 run -e SCENARIO=soak loadtest/benchmark_suite.js

# Spike test
k6 run -e SCENARIO=spike loadtest/benchmark_suite.js

# Breakpoint test (find limits)
k6 run -e SCENARIO=breakpoint loadtest/benchmark_suite.js
```

Results are saved to `loadtest/results/benchmark_summary.json`.

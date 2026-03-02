# Chaos Experiments

Runnable chaos engineering scripts for Nexus RTP Platform.

## Experiments

| Script | Target | Validates |
|---|---|---|
| `kill_kafka_broker.sh` | Kafka broker | Consumer recovery, no duplicate settlements, idempotency |
| `kill_notification_service.sh` | Notification service | Payment flow unaffected, queue backlog recovery |
| `db_latency.sh` | CockroachDB | Graceful timeout handling, idempotency under latency |
| `db_failover.sh` | CockroachDB node | Data integrity during node loss, conservation of value |
| `network_partition.sh` | Service mesh | Circuit breaker behavior, graceful degradation, recovery |
| `idempotency_stress.sh` | Payment service | Exactly-once under concurrency, key reuse rejection |

## Prerequisites

- Docker Compose stack running: `docker-compose -f infra/docker/docker-compose.yml --profile services up -d`
- `curl`, `jq` available
- For `db_latency.sh`: container needs `tc` (traffic control) — if not available, test degrades gracefully

## Running

```bash
# Run ALL experiments with consolidated report
bash chaos/run_all.sh

# Quick mode (reduced durations for CI, skips slow tests)
bash chaos/run_all.sh --quick

# Run single experiment
bash chaos/run_all.sh db_failover

# Run individual script directly
bash chaos/kill_kafka_broker.sh

# Customize parameters
DOWNTIME_SECONDS=30 LATENCY_MS=500 bash chaos/db_latency.sh
```

## Reports

Reports are saved to `chaos/reports/` as JSON files with experiment results and verdict.

## CI Integration

Chaos experiments are **not run in CI by default** — they require infrastructure and can be destructive.
For gated staging runs, use the `chaos-check` GitHub Actions workflow (manual trigger).

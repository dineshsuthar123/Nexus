# Disaster Recovery — Nexus RTP Platform

## Overview

This document defines the Recovery Time Objective (RTO), Recovery Point Objective (RPO),
and recovery procedures for the Nexus RTP platform.

## Recovery Targets

| Component | RPO | RTO | Backup Method | Backup Frequency |
|-----------|-----|-----|---------------|-----------------|
| CockroachDB (ledger) | **4 hours** | **1 hour** | Full + incremental to S3 | Full daily 2am, inc every 4h |
| CockroachDB (auth) | **4 hours** | **1 hour** | Same as ledger | Same |
| Kafka topics | **0** (replicated) | **15 min** | RF=3, min.insync=2 | Continuous replication |
| Redis cache | **N/A** (ephemeral) | **5 min** | Not backed up | Redis cluster auto-failover |
| Vault secrets | **24 hours** | **30 min** | Vault raft snapshots | Daily |
| Application state | **0** (stateless) | **2 min** | Container images in registry | On every build |
| Grafana dashboards | **24 hours** | **15 min** | Dashboard JSON in Git | On change |

### Summary

| Metric | Target | Measured |
|--------|--------|----------|
| **RPO** | ≤ 4 hours | 4h (incremental backup cadence) |
| **RTO** | ≤ 1 hour | ~45 min (tested in staging) |

## Backup Architecture

```
┌──────────────────────────────────────────────────────────────┐
│   CockroachDB Cluster (3 nodes, RF=3)                       │
│                                                              │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
│   │ Node 1  │  │ Node 2  │  │ Node 3  │                    │
│   └────┬────┘  └────┬────┘  └────┬────┘                    │
│        │             │             │                         │
│        └──────┬──────┘─────────────┘                        │
│               │                                              │
│      BACKUP TO S3 (scheduled)                                │
│               │                                              │
│        ┌──────▼──────┐      ┌──────────────┐                │
│        │ Full @2am   │─────►│ S3 Bucket    │                │
│        │ Inc @4h     │      │ (versioned)  │                │
│        └─────────────┘      │ 90d retention│                │
│                              └──────┬───────┘                │
│                                     │                        │
│               ┌─────────────────────▼─────┐                 │
│               │ Daily Verify Job @4am     │                 │
│               │ • Restore to test DB      │                 │
│               │ • Schema check            │                 │
│               │ • Row count check         │                 │
│               │ • Referential integrity   │                 │
│               │ • Balance invariant       │                 │
│               └───────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

## Recovery Procedures

### Scenario 1: Single Node Failure

**Impact**: None (CockroachDB RF=3 tolerates 1 node loss)

```bash
# CockroachDB auto-rebalances. Monitor:
kubectl get pods -n nexus-rtp -l app=cockroachdb
cockroach node status --url="$COCKROACH_URL"

# If node doesn't recover in 5 minutes:
kubectl delete pod cockroachdb-2 -n nexus-rtp  # Force restart
```

### Scenario 2: Full Cluster Data Loss

**Impact**: Complete data loss — use S3 backup

```bash
# 1. Ensure new CockroachDB cluster is running
kubectl get pods -n nexus-rtp -l app=cockroachdb

# 2. Restore from latest backup
cockroach sql --url="$COCKROACH_URL" --execute="
    RESTORE DATABASE nexus
    FROM LATEST IN 's3://nexus-backups/nexus?AWS_ACCESS_KEY_ID=...'
    WITH new_db_name = 'nexus';
"

# 3. Verify data
./scripts/restore_and_smoke.sh

# 4. Restart all services to reconnect
kubectl rollout restart deployment -n nexus-rtp
```

**Estimated time**: 30–60 minutes depending on data size.

### Scenario 3: Point-in-Time Recovery

**Impact**: Data corruption detected — recover to specific timestamp

```bash
# 1. Identify the safe timestamp (before corruption)
SAFE_TIME="2026-02-15 10:30:00"

# 2. Restore with PITR
cockroach sql --url="$COCKROACH_URL" --execute="
    RESTORE DATABASE nexus
    FROM LATEST IN 's3://nexus-backups/nexus?...'
    AS OF SYSTEM TIME '${SAFE_TIME}'
    WITH new_db_name = 'nexus_recovered';
"

# 3. Verify recovered data
./scripts/restore_and_smoke.sh nexus_recovered

# 4. Swap databases
cockroach sql --url="$COCKROACH_URL" --execute="
    ALTER DATABASE nexus RENAME TO nexus_corrupted;
    ALTER DATABASE nexus_recovered RENAME TO nexus;
"

# 5. Restart services
kubectl rollout restart deployment -n nexus-rtp
```

### Scenario 4: Kafka Cluster Failure

**Impact**: Event processing halted (payments stuck in PENDING)

```bash
# 1. Kafka auto-recovers with RF=3. Monitor:
kubectl get pods -n nexus-rtp -l app=kafka

# 2. Check consumer lag after recovery
kafka-consumer-groups --bootstrap-server kafka:9092 \
    --describe --all-groups

# 3. If topics lost (catastrophic):
# Re-create topics from config
./infra/docker/kafka-init.sh

# 4. Replay pending payments from outbox table
cockroach sql --url="$COCKROACH_URL" --execute="
    UPDATE nexus.outbox SET processed = false
    WHERE created_at > '${SAFE_TIME}' AND processed = true;
"
# Debezium CDC will re-publish these events
```

### Scenario 5: Vault Failure

**Impact**: Services cannot fetch secrets at startup

```bash
# 1. Services cache secrets in memory — running services unaffected
# 2. New pod starts will fail — prevent scaling events

# 3. Restore Vault from Raft snapshot
vault operator raft snapshot restore /path/to/vault-snapshot.snap

# 4. Unseal Vault
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>

# 5. Verify
vault status
vault kv get nexus/keys/jwt-signing
```

## Backup Verification

### Automated (Daily)

A CronJob runs at 4am UTC daily:
1. Restores the latest backup to `nexus_verify_test`
2. Checks table count (≥5 tables)
3. Checks row counts for core tables
4. Validates referential integrity
5. Drops the test database

Monitor: `backup_verify_status` metric in Grafana.

### Manual Verification

```bash
# Run the full restore and smoke test
./scripts/restore_and_smoke.sh

# Or target a specific backup
./scripts/restore_and_smoke.sh s3://nexus-backups/nexus/full_20260215_020000
```

## Backup Retention Policy

| Type | Retention | Storage Estimate |
|------|-----------|-----------------|
| Full backups | 90 days | ~50GB per backup |
| Incremental backups | 30 days | ~5GB per backup |
| Vault snapshots | 30 days | ~100MB per snapshot |
| WAL/CDC logs | 7 days | ~10GB/day |

## Monitoring & Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| `BackupJobFailed` | CronJob failed | P1 — Critical |
| `BackupVerifyFailed` | Verify job failed | P1 — Critical |
| `BackupOlderThan24h` | No new backup in 24h | P2 — Warning |
| `BackupRestoreTimeTooLong` | Restore > 60min | P2 — Warning |

### Prometheus Alert Rules

```yaml
- alert: BackupJobFailed
  expr: kube_job_status_failed{job_name=~".*backup.*"} > 0
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "CockroachDB backup job failed"
    runbook: "https://docs.nexus-rtp.internal/runbooks/backup-failure"
```

## DR Drill Schedule

| Frequency | Drill Type | Owner |
|-----------|-----------|-------|
| Weekly | Automated backup verify | CI/CD |
| Monthly | Full restore to staging | SRE |
| Quarterly | Full DR simulation (multi-AZ failover) | SRE + DBA |
| Annually | Tabletop exercise with stakeholders | SRE Lead |

## Escalation

1. **L1 (On-call SRE)**: Execute runbook, restore from backup
2. **L2 (DBA)**: Complex PITR, data reconciliation
3. **L3 (VP Eng + Security)**: Data breach assessment, regulatory notification

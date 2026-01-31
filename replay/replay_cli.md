# Nexus RTP Deterministic Replay CLI

## Overview

The Replay CLI provides deterministic reconstruction of ledger state at any point in time. 
Every replay produces byte-identical results given the same event sequence—enabling auditors, 
regulators, and incident responders to independently verify account balances.

## Installation

```bash
go install github.com/nexus-rtp/replay/cmd/replay-cli@latest
```

Or build from source:

```bash
cd replay && go build -o replay-cli ./cmd/replay-cli
```

## Core Commands

### 1. Replay to Timestamp

Reconstruct ledger state at a specific point in time.

```bash
replay-cli replay \
  --timestamp "2024-01-15T14:30:00Z" \
  --kafka-brokers "kafka-1:9092,kafka-2:9092,kafka-3:9092" \
  --topic "ledger.events" \
  --output state.json
```

**Flags:**
- `--timestamp, -t` : Target timestamp (RFC 3339 format) [required]
- `--kafka-brokers, -b` : Comma-separated Kafka broker addresses [required]
- `--topic` : Kafka topic containing ledger events [default: ledger.events]
- `--output, -o` : Output file for state JSON [default: stdout]
- `--format` : Output format: json, csv, table [default: json]
- `--hash-only` : Only output final state hash (for quick verification)

**Example Output:**
```json
{
  "replay_timestamp": "2024-01-15T14:30:00Z",
  "event_count": 847293,
  "accounts": {
    "ACC-001": {"balance": 1500000, "currency": "USD"},
    "ACC-002": {"balance": 750000, "currency": "USD"}
  },
  "final_hash": "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
}
```

---

### 2. Regulator Replay

Generate a complete audit trail for a specific account, including opening balance, 
every transaction, running balances, and closing balance with cryptographic verification.

```bash
replay-cli regulator \
  --account ACC-12345 \
  --start "2024-01-01T00:00:00Z" \
  --end "2024-01-31T23:59:59Z" \
  --output audit_bundle.json \
  --sign
```

**Flags:**
- `--account, -a` : Account ID to audit [required]
- `--start` : Period start timestamp [required]
- `--end` : Period end timestamp [required]
- `--output, -o` : Output file path [required]
- `--sign` : Sign output with Ed25519 key from Vault
- `--key-id` : Vault key ID for signing [default: audit-signing-key]
- `--include-raw-events` : Include full event payloads (increases file size)

**Output Structure:**
```json
{
  "account_id": "ACC-12345",
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "opening_balance": 50000000,
  "closing_balance": 62500000,
  "total_credits": 25000000,
  "total_debits": 12500000,
  "net_change": 12500000,
  "event_count": 142,
  "events": [
    {
      "id": "EVT-001",
      "timestamp": "2024-01-02T09:15:00Z",
      "transaction_id": "TX-001",
      "type": "credit",
      "amount": 100000,
      "running_balance": 50100000,
      "hash": "abc123..."
    }
  ],
  "hash_chain": "def456...",
  "verification_hash": "789abc...",
  "signature": "base64-ed25519-signature"
}
```

---

### 3. Compare States

Compare live database state against replayed state to detect discrepancies.

```bash
replay-cli compare \
  --timestamp "2024-01-15T14:30:00Z" \
  --db-uri "postgresql://ledger:***@cockroach-lb:26257/ledger" \
  --output diff_report.json
```

**Flags:**
- `--timestamp, -t` : Timestamp for comparison [required]
- `--db-uri` : Database connection URI [required]
- `--kafka-brokers` : Kafka brokers for replay [required]
- `--topic` : Kafka topic [default: ledger.events]
- `--output, -o` : Diff report output path
- `--fail-on-mismatch` : Exit with code 1 if any discrepancy found
- `--tolerance` : Balance tolerance in smallest units [default: 0]

**Exit Codes:**
- `0` : States match exactly
- `1` : Discrepancies found (with --fail-on-mismatch)
- `2` : Hash chain verification failed
- `3` : Connection/configuration error

---

### 4. Create Snapshot

Create a snapshot for faster future replays.

```bash
replay-cli snapshot create \
  --timestamp "2024-01-01T00:00:00Z" \
  --output snapshots/2024-01-01.snap
```

**Flags:**
- `--timestamp, -t` : Snapshot timestamp [required]
- `--output, -o` : Snapshot file path [required]
- `--compress` : Enable gzip compression [default: true]

### 5. List Snapshots

```bash
replay-cli snapshot list --dir snapshots/
```

**Output:**
```
TIMESTAMP                    EVENTS      SIZE      HASH
2024-01-01T00:00:00Z        1,234,567   45.2 MB   abc123...
2024-02-01T00:00:00Z        2,891,234   98.7 MB   def456...
```

---

### 6. Verify Exported Report

Verify the integrity of an exported regulator report.

```bash
replay-cli verify audit_bundle.json
```

**Output:**
```
✓ JSON structure valid
✓ Hash chain intact (142 events)
✓ Verification hash matches
✓ Ed25519 signature valid (key: audit-signing-key)
✓ Timestamp within expected range

VERIFICATION PASSED
```

**Flags:**
- `--public-key` : Path to Ed25519 public key (if not using Vault)
- `--vault-addr` : Vault address for key retrieval

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KAFKA_BROKERS` | Comma-separated Kafka brokers | localhost:9092 |
| `KAFKA_TOPIC` | Ledger events topic | ledger.events |
| `DB_URI` | CockroachDB connection string | - |
| `VAULT_ADDR` | HashiCorp Vault address | - |
| `VAULT_TOKEN` | Vault authentication token | - |
| `SNAPSHOT_DIR` | Default snapshot directory | ./snapshots |
| `LOG_LEVEL` | Logging level: debug, info, warn, error | info |
| `LOG_FORMAT` | Log format: json, text | json |

---

## Use Cases

### 1. Daily Reconciliation (Automated)

```bash
#!/bin/bash
# Run daily at 00:05 UTC to verify previous day

YESTERDAY=$(date -u -d "yesterday" +%Y-%m-%dT23:59:59Z)

replay-cli compare \
  --timestamp "$YESTERDAY" \
  --db-uri "$DB_URI" \
  --kafka-brokers "$KAFKA_BROKERS" \
  --output "/var/log/nexus/reconciliation/$(date +%Y-%m-%d).json" \
  --fail-on-mismatch

if [ $? -ne 0 ]; then
  echo "CRITICAL: Reconciliation mismatch detected" | \
    slack-notify --channel "#payments-oncall"
fi
```

### 2. Regulatory Audit Request

When a regulator requests account history:

```bash
# Generate signed audit bundle
replay-cli regulator \
  --account ACC-12345 \
  --start "2023-01-01T00:00:00Z" \
  --end "2023-12-31T23:59:59Z" \
  --output regulatory_request_12345.json \
  --sign \
  --include-raw-events

# Verify before sending
replay-cli verify regulatory_request_12345.json

# Hash for chain of custody
sha256sum regulatory_request_12345.json > regulatory_request_12345.sha256
```

### 3. Incident Investigation

Reconstruct state at the moment of an incident:

```bash
# Find state 1 minute before incident
replay-cli replay \
  --timestamp "2024-01-15T14:29:00Z" \
  --output before_incident.json

# Find state 1 minute after
replay-cli replay \
  --timestamp "2024-01-15T14:31:00Z" \
  --output after_incident.json

# Diff the states
jq -s '.[0].accounts as $before | .[1].accounts | 
  to_entries | map(select(.value.balance != $before[.key].balance))' \
  before_incident.json after_incident.json
```

### 4. Disaster Recovery Validation

After restoring from backup:

```bash
# Compare restored DB against replay
replay-cli compare \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --db-uri "$RESTORED_DB_URI" \
  --kafka-brokers "$KAFKA_BROKERS" \
  --fail-on-mismatch

if [ $? -eq 0 ]; then
  echo "Disaster recovery validation PASSED"
else
  echo "CRITICAL: DR validation FAILED - do not proceed"
  exit 1
fi
```

---

## Performance Considerations

### Replay Speed

| Event Count | Without Snapshot | With Snapshot |
|-------------|------------------|---------------|
| 100,000     | ~2 seconds       | ~0.5 seconds  |
| 1,000,000   | ~20 seconds      | ~5 seconds    |
| 10,000,000  | ~3 minutes       | ~30 seconds   |
| 100,000,000 | ~30 minutes      | ~5 minutes    |

### Recommended Snapshot Strategy

- Create daily snapshots at midnight UTC
- Retain 7 daily + 4 weekly + 12 monthly snapshots
- Store in S3/GCS with versioning enabled

```bash
# Cron: 0 1 * * * (daily at 01:00 UTC)
replay-cli snapshot create \
  --timestamp "$(date -u -d 'yesterday 23:59:59' +%Y-%m-%dT%H:%M:%SZ)" \
  --output "s3://nexus-snapshots/daily/$(date +%Y-%m-%d).snap"
```

---

## Cryptographic Guarantees

1. **Hash Chain Integrity**: Every event links to its predecessor via SHA-256
2. **Determinism**: Same events → same state hash (verified via property tests)
3. **Non-Repudiation**: Ed25519 signatures on all audit exports
4. **Timestamp Authority**: Optional RFC 3161 timestamping for legal evidence

---

## Exit Codes Reference

| Code | Meaning |
|------|---------|
| 0    | Success |
| 1    | Discrepancy detected / verification failed |
| 2    | Hash chain broken |
| 3    | Configuration error |
| 4    | Connection failure (Kafka/DB) |
| 5    | Snapshot not found |
| 10   | Invalid signature |
| 11   | Key not found in Vault |

---

## See Also

- [Invariants Specification](../proofs/invariants.md)
- [Diff Report JSON Schema](./replay_diff_report.schema.json)
- [Audit Bundle Schema](../audit/audit_bundle_schema.json) (Phase 3)

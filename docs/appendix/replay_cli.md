# Replay CLI Documentation

**Command:** `replay_cli`  
**Module:** [`replay/`](../../replay/)  
**Source:** [`replay/engine.go`](../../replay/engine.go)  
**Commit:** `dfb54ad`

---

## 1. Overview

The Replay CLI enables deterministic reconstruction of ledger state at any historical point in time. This is essential for:

- **Regulatory audits:** Reconstruct exact state for examination periods
- **Debugging:** Time-travel to investigate production issues
- **Verification:** Prove that replayed state matches live state

---

## 2. Installation

```bash
cd replay
go build -o replay_cli ./cmd/replay_cli
```

Or use directly:

```bash
go run ./cmd/replay_cli [command] [flags]
```

---

## 3. Commands

### 3.1 `replay` — Reconstruct State

Replay events to reconstruct ledger state at a specific point in time.

**Usage:**

```bash
./replay_cli replay \
    --topics outbox.transactions,debezium.transactions \
    --from "2026-01-01T00:00:00Z" \
    --to "2026-01-31T23:59:59Z" \
    --out replay_state.json
```

**Flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--topics` | Yes | Comma-separated Kafka topics to consume |
| `--from` | Yes | Start timestamp (RFC 3339) |
| `--to` | Yes | End timestamp (RFC 3339) |
| `--out` | Yes | Output file for reconstructed state |
| `--kafka-brokers` | No | Kafka broker addresses (default: `localhost:9092`) |
| `--snapshot-dir` | No | Directory containing snapshots |
| `--verbose` | No | Enable verbose logging |

**Output:**

```json
{
  "timestamp": "2026-01-31T23:59:59Z",
  "hash": "a3f2c8d9e1b4f7a2c5d8e3f1a4b7c2d5e8f1a3b6c9d2e5f8a1b4c7d0e3f6a9",
  "accounts": {
    "acc-001": {"balance": 150000, "last_tx": "tx-789"},
    "acc-002": {"balance": 250000, "last_tx": "tx-790"}
  },
  "event_count": 45892,
  "merkle_root": "b4c7d0e3f6a9b2c5e8f1a4d7c0e3f6a9b2c5e8f1a4d7c0e3f6a9b2c5e8f1a4d7"
}
```

---

### 3.2 `compare` — Compare States

Compare replayed state against live state and generate a diff report.

**Usage:**

```bash
./replay_cli compare \
    --replay replay_state.json \
    --live live_state.json \
    --out replay_vs_live_diff.json
```

**Flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--replay` | Yes | Path to replayed state JSON |
| `--live` | Yes | Path to live state JSON |
| `--out` | Yes | Output file for diff report |
| `--strict` | No | Fail on any difference (default: false) |

**Output (no differences):**

```json
{
  "status": "MATCH",
  "replay_hash": "a3f2c8d9e1b4f7a2...",
  "live_hash": "a3f2c8d9e1b4f7a2...",
  "differences": [],
  "verified_at": "2026-02-01T10:30:00Z"
}
```

**Output (with differences):**

```json
{
  "status": "MISMATCH",
  "replay_hash": "a3f2c8d9e1b4f7a2...",
  "live_hash": "b5d8e2f1c4a7b0d3...",
  "differences": [
    {
      "type": "balance_mismatch",
      "account_id": "acc-042",
      "replay_value": 150000,
      "live_value": 150100,
      "delta": 100,
      "first_divergent_tx": "tx-12345",
      "divergent_at": "2026-01-15T14:32:17Z"
    }
  ],
  "verified_at": "2026-02-01T10:30:00Z"
}
```

---

### 3.3 `verify` — Verify Hash Chain

Verify the integrity of the hash chain in a replayed state.

**Usage:**

```bash
./replay_cli verify \
    --state replay_state.json \
    --events events.jsonl
```

**Output:**

```json
{
  "status": "VALID",
  "entries_verified": 45892,
  "hash_chain_intact": true,
  "final_hash": "a3f2c8d9e1b4f7a2...",
  "verification_time_ms": 1523
}
```

---

### 3.4 `snapshot` — Create Snapshot

Create a snapshot of the current state for faster future replays.

**Usage:**

```bash
./replay_cli snapshot \
    --state live_state.json \
    --out snapshots/2026-01-31.snapshot
```

---

## 4. Diff Report Schema

The diff report follows the schema in [`replay/replay_diff_report.schema.json`](../../replay/replay_diff_report.schema.json):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["status", "replay_hash", "live_hash", "differences", "verified_at"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["MATCH", "MISMATCH"]
    },
    "replay_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "live_hash": {
      "type": "string",
      "pattern": "^[a-f0-9]{64}$"
    },
    "differences": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "account_id"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["balance_mismatch", "missing_account", "extra_account", "hash_mismatch"]
          },
          "account_id": {"type": "string"},
          "replay_value": {"type": "integer"},
          "live_value": {"type": "integer"},
          "delta": {"type": "integer"},
          "first_divergent_tx": {"type": "string"},
          "divergent_at": {"type": "string", "format": "date-time"}
        }
      }
    },
    "verified_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

---

## 5. Example: Full Audit Workflow

### Step 1: Request Period State from Live System

```bash
curl -X GET "https://api.nexus-rtp.io/v1/state?at=2026-01-31T23:59:59Z" \
    -H "Authorization: Bearer $TOKEN" \
    -o live_state.json
```

### Step 2: Replay Events for Same Period

```bash
./replay_cli replay \
    --topics outbox.transactions,debezium.transactions \
    --from "2026-01-01T00:00:00Z" \
    --to "2026-01-31T23:59:59Z" \
    --kafka-brokers kafka-1:9092,kafka-2:9092,kafka-3:9092 \
    --snapshot-dir ./snapshots \
    --out replay_state.json
```

### Step 3: Compare States

```bash
./replay_cli compare \
    --replay replay_state.json \
    --live live_state.json \
    --out replay_vs_live_diff.json \
    --strict
```

### Step 4: Verify Hash Chain

```bash
./replay_cli verify \
    --state replay_state.json \
    --events events.jsonl
```

### Step 5: Generate Audit Bundle

```bash
./audit_cli bundle \
    --state replay_state.json \
    --sign \
    --out audit_bundle_2026_01.json
```

---

## 6. Sample Output Files

### 6.1 `replay_state.json`

```json
{
  "timestamp": "2026-01-31T23:59:59Z",
  "hash": "a3f2c8d9e1b4f7a2c5d8e3f1a4b7c2d5e8f1a3b6c9d2e5f8a1b4c7d0e3f6a9",
  "accounts": {
    "acc-001": {
      "balance": 1500000,
      "currency": "USD",
      "last_tx": "tx-789",
      "last_update": "2026-01-31T22:45:12Z"
    },
    "acc-002": {
      "balance": 2500000,
      "currency": "USD",
      "last_tx": "tx-790",
      "last_update": "2026-01-31T23:12:45Z"
    }
  },
  "ledger_summary": {
    "event_count": 45892,
    "first_event": "2026-01-01T00:00:01Z",
    "last_event": "2026-01-31T23:59:58Z",
    "total_volume": 125000000000
  },
  "merkle_root": "b4c7d0e3f6a9b2c5e8f1a4d7c0e3f6a9b2c5e8f1a4d7c0e3f6a9b2c5e8f1a4d7",
  "hash_chain_head": "c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5e8"
}
```

### 6.2 `replay_vs_live_diff.json` (Mismatch Example)

```json
{
  "status": "MISMATCH",
  "replay_hash": "a3f2c8d9e1b4f7a2c5d8e3f1a4b7c2d5e8f1a3b6c9d2e5f8a1b4c7d0e3f6a9",
  "live_hash": "b5d8e2f1c4a7b0d3e6f9a2b5c8d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5",
  "differences": [
    {
      "type": "balance_mismatch",
      "account_id": "acc-042",
      "replay_value": 1500000,
      "live_value": 1500100,
      "delta": 100,
      "first_divergent_tx": "tx-12345",
      "divergent_at": "2026-01-15T14:32:17Z"
    }
  ],
  "verified_at": "2026-02-01T10:30:00Z",
  "investigation_required": true,
  "suggested_actions": [
    "Review transaction tx-12345 for duplicate processing",
    "Check event ordering between 2026-01-15T14:30:00Z and 2026-01-15T14:35:00Z",
    "Compare Kafka consumer offsets at divergence point"
  ]
}
```

---

## 7. Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (or MATCH in compare) |
| 1 | General error |
| 2 | MISMATCH detected in compare (with --strict) |
| 3 | Hash chain verification failed |
| 4 | Missing required arguments |
| 5 | File I/O error |

---

## 8. Performance

| Operation | Events | Time | Memory |
|-----------|--------|------|--------|
| Replay (cold) | 1M | 45s | 2GB |
| Replay (with snapshot) | 1M | 8s | 500MB |
| Compare | 10K accounts | 200ms | 100MB |
| Verify | 1M events | 30s | 1GB |

---

## 9. References

- **Source:** [`replay/engine.go`](../../replay/engine.go)
- **Tests:** [`replay/engine_test.go`](../../replay/engine_test.go)
- **Schema:** [`replay/replay_diff_report.schema.json`](../../replay/replay_diff_report.schema.json)
- **Commit:** `dfb54ad`

---

*Use `./replay_cli --help` for complete command reference.*

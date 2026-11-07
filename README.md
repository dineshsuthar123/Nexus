# Nexus RTP

Go payment APIs and a Next.js operations dashboard backed by CockroachDB, Redis and Kafka. The payment service uses sharded balance reservations, double-entry ledger records, idempotency and a transactional outbox.

[Documentation](docs/README.md) ? [Architecture](docs/ARCHITECTURE.md) ? [API specification](docs/openapi.yaml) ? [Measured performance](docs/performance/README.md)

<!-- performance-results:start -->
### Measured local performance (2026-11-07)

| Payment attempts | p50 | p95 | p99 | Sustained accepted payments/s | Acceptance failures |
|---:|---:|---:|---:|---:|---:|
| 14,709 | 35.37 ms | 109.08 ms | 152.94 ms | 107.35 | 0.00% |

Direct API, 1–25 closed-loop users, real single-node in-memory CockroachDB and Redis.
Sanctions unavailable: payments were accepted for review. Settlement, Kafka delivery,
gateway/auth, production capacity and uptime were not measured.
Thresholds: **PASS**; persisted database invariants: **PASS**.

Frontend production lab, ten fresh-context navigations per route: median LCP `/` 750 ms, `/auth/login` 152 ms, `/performance` 68 ms. No CPU/network throttling.

See [methodology and raw evidence](docs/performance/README.md). Other performance figures below are design targets or historical claims unless linked to a recorded run.
<!-- performance-results:end -->

## Run the measured performance test

Requirements: Go 1.25.6+, Python 3, Docker with Compose, and k6. For browser measurements, install Node 20+ and the frontend's pinned pnpm dependencies.

```sh
python scripts/performance/run.py
```

The runner builds the current payment service, starts isolated CockroachDB and Redis, seeds dedicated accounts, runs baseline/ramp/sustain/spike/recovery phases, and checks persisted ledger invariants. It stops its service and dependencies afterward. Raw local logs and binaries stay in ignored `loadtest/results/`.

Publish a completed run, measure the production frontend, and verify consistency:

```sh
python scripts/performance/publish.py loadtest/results/<run-id>
node scripts/performance/frontend.cjs loadtest/results/<run-id>
python scripts/performance/publish.py loadtest/results/<run-id>
python scripts/performance/publish.py --check
```

The [full report](docs/performance/README.md) records the exact workload, environment, raw evidence, checksums and limitations. The current run measures acceptance with sanctions screening unavailable; settlement, downstream delivery, production capacity and availability require separate tests. Recovery latency stayed above baseline after the spike.

## Develop locally

Create local environment configuration from `.env.example`, then use the startup helper:

```sh
bash start.sh
```

The full development stack requires Docker resources for the database cluster, event services and monitoring. Follow the [testing guide](docs/guides/TESTING_CHECKLIST.md) and [troubleshooting guide](docs/guides/TROUBLESHOOTING.md) for component startup and diagnosis.

For the frontend workspace:

```sh
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm build:ui
corepack pnpm dev
```

The default direct payment and account API ports are 8085 and 8086. The isolated benchmark uses 18085, 26270 and 6390; its browser runner uses 13000.

## Validate changes

From the repository root:

```sh
go test ./services/payment-service/... ./services/account-service/... ./pkg/idempotency/...
go vet ./services/payment-service/...
node --test scripts/performance/summary.test.mjs
python scripts/performance/publish.py --check
```

From `frontend/`:

```sh
corepack pnpm --filter @nexus/web test
```

The [validation report](docs/reports/PERFORMANCE_VALIDATION_2026-11-07.md) identifies the checks actually run. Production frontend builds use TypeScript and lint checks; existing lint warnings remain.

## Repository structure

| Directory | Purpose |
|---|---|
| `services/` | Payment, account, auth, reconciliation, notification, analytics, audit and WebSocket services |
| `pkg/`, `libs/` | Shared Go packages and ISO 20022 models |
| `frontend/` | Next.js app and shared UI library |
| `infra/`, `migrations/` | Development/deployment infrastructure and schema changes |
| `flink-jobs/` | Stream processing and fraud detection |
| `tests/`, `loadtest/` | Integration, contract, end-to-end and performance harnesses |
| `scripts/` | Development and operational automation; performance tools under `scripts/performance/` |
| `docs/` | Architecture, API reference, guides, current validation and performance evidence |
| `runbooks/`, `DR/`, `RELEASE/`, `COMPLIANCE/` | Incident response, recovery, release and compliance procedures |
| `proofs/`, `replay/`, `audit/`, `security/` | Invariants, deterministic replay, audit tooling and security controls |

New reports belong in `docs/reports/`; promoted performance evidence belongs in `docs/performance/runs/<run-id>/`. Generated builds, environments, logs, screenshots and scratch results are ignored. Obsolete completion reports, duplicate indexes, marketing comparisons and old patch/PR instructions have been removed.

## License

See [LICENSE](LICENSE).

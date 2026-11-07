# Recorded performance

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

See [methodology and raw evidence](README.md). Other performance figures below are design targets or historical claims unless linked to a recorded run.
<!-- performance-results:end -->

Run: [`20261107T080650Z`](runs/20261107T080650Z/manifest.json). Revision: `93b0021ae72d25f1c8a74d618edafb61c5892f3f` with local changes; payment source SHA-256: `032c5644399a27b15baeb29191dcbcbb73cd1852b7f912047d31727ff5cf392d`.

## Reproduce

```sh
python scripts/performance/run.py
# After the backend run, publish its summary before building the frontend:
python scripts/performance/publish.py loadtest/results/<run-id>
node scripts/performance/frontend.cjs loadtest/results/<run-id>
python scripts/performance/publish.py loadtest/results/<run-id>
python scripts/performance/publish.py --check
```

Run from the repository root with Go 1.25.6+, Python 3, Docker Desktop, k6, Node and the installed frontend dependencies. Install the Playwright Chromium browser if missing. The runner creates the exclusive `nexus-performance` Compose project on ports 26270/6390, builds the current payment service on 18085, seeds 32 funded USD accounts, and tears down its processes and containers. It refuses concurrent runs. No development data or persistent volumes are used. The browser runner builds and starts production Next.js on port 13000 and closes its server afterward.

If interrupted, clean up only this test project:

```sh
docker compose -p nexus-performance -f infra/docker/docker-compose.performance.yml down
```

## Method

Three setup payments warm the connection pool and sanctions circuit; they are excluded from payment latency samples. Each measured iteration creates a unique USD 1 payment and verifies its transaction ID by reading it back. Every fifth iteration replays the same Idempotency-Key and every tenth lists payments. HTTP 2xx alone does not count as acceptance: a durable transaction ID and PENDING/SANCTIONED status are required. Rejected, malformed and missing-account responses fail the test. All attempted creates contribute to latency, including failures.

Phases are sequential, with five-second drain gaps: baseline 1 user/20s; ramp 1→5→10 users/40s; sustain 10 users/60s; spike 25 users/30s; recovery 1 user/20s. Each iteration has 50ms think time. Phase rates divide accepted creates by the observed phase elapsed time through the final completed request, including drain work. They are achieved acceptance rates, not settlement TPS or a capacity ceiling. Percentiles aggregate measured attempts; they are not averages of per-phase percentiles. Baseline/recovery have fewer samples and noisier tails.

## Phase results

| Phase | Attempts | p50 ms | p95 ms | p99 ms | Accepted/s | Failures |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 244 | 26.46 | 32.84 | 43.86 | 12.20 | 0.00% |
| ramp | 2357 | 24.51 | 37.49 | 48.33 | 58.90 | 0.00% |
| sustain | 6440 | 32.69 | 52.70 | 77.24 | 107.35 | 0.00% |
| spike | 5556 | 51.41 | 133.55 | 176.38 | 184.39 | 0.00% |
| recovery | 112 | 112.80 | 139.34 | 156.38 | 5.59 | 0.00% |

## Endpoint and correctness results

| Endpoint | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|
| Create payment | 35.37 | 109.08 | 152.94 |
| Status read-back | 5.87 | 14.50 | 25.98 |
| List payments | 27.31 | 200.03 | 281.09 |
| Idempotent replay | 1.59 | 3.82 | 6.42 |

- HTTP requests (including setup/read/list/replay): 33,840; failure rate: 0.00%.
- Read-back success: 100.00%; replay identity: 100.00%.
- Post-run SQL checks transaction/UETR uniqueness, two balanced ledger legs per transaction, nonnegative shards, one outbox event per transaction, and total shard reservation equal to payment principal.
- Gates: payment p95 <500ms, p99 <1000ms, acceptance ≥99% overall and per phase, HTTP failure <1%, all read-back/replay/check assertions passing; every phase must have samples.

## Findings

- Recovery p95 was 139.34ms versus 32.84ms at baseline. Passing global latency gates does not establish a return to baseline; investigate with a longer recovery/soak and database profiles.
- No before/after optimization comparison was run; no speedup claim is established.

## Resource observations

API mean CPU: 31.15% of one core from process CPU-time delta; API RSS after load: 62.91 MiB. Container sampling: 40 snapshots, roughly five seconds apart. CPU percentages sum across cores and can exceed 100%; sparse sampled maxima are not true peaks.

| Container | Highest sampled CPU (one-core %) | Highest sampled memory | Memory limit used |
|---|---:|---|---:|
| nexus-performance-database-1 | 1097.52% | 880.4MiB / 2GiB | 42.99% |
| nexus-performance-redis-1 | 14.76% | 14.9MiB / 256MiB | 5.82% |

## Production frontend measurements

Build: 54.46s (shared UI library plus Next.js); Chromium 145.0.7632.6; fresh 1365×768 desktop browser contexts, no throttling, no API mocks. Ten navigations per public route. These are lab navigation observations; no field Core Web Vitals or authenticated workflow claims.

| Route | Samples | Median TTFB ms | Median FCP ms | Median LCP ms | Median load ms | Median JS KiB | Max CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 10 | 3.95 | 76.00 | 750.00 | 105.80 | 545.83 | 0.0000 |
| `/auth/login` | 10 | 3.50 | 62.00 | 152.00 | 111.00 | 553.61 | 0.0691 |
| `/performance` | 10 | 3.15 | 68.00 | 68.00 | 88.90 | 282.79 | 0.0000 |

The test runs the production Node server from `.next-performance`, with standalone packaging disabled. This isolates the local benchmark from Windows/pnpm standalone junction cleanup. Linux deployment packaging remains a separate build validation.

- Local desktop browser without CPU or network throttling
- Ten samples per route; p95 is exploratory, not a field Core Web Vitals assessment
- Public navigation only; authenticated financial workflows are not measured
- LCP observed through load plus 800ms; late content and user interactions are outside the window

## Environment and limitations

- Single-node in-memory CockroachDB on shared Docker Desktop hardware
- Sanctions endpoint intentionally unavailable; payments enter SANCTIONED review
- No gateway, auth, Kafka delivery, fraud processing, settlement or cross-region network measured
- Closed-loop users with 50ms think time; achieved rate is not maximum capacity
- Load generator and service share the host; no production throughput or uptime inference

Container CPU/memory samples and before/after Prometheus snapshots are retained in the run directory. They cover the database/Redis and API process respectively, not production pod sizing. The manifest records host/tool versions, Docker limits and image IDs. Source fingerprints distinguish the tested working tree from HEAD.

## Evidence layout

- `latest.json`: canonical machine-readable published result.
- `runs/20261107T080650Z/`: original k6 summary, manifest, SQL validation, resource samples and Prometheus snapshots; `checksums.json` verifies evidence bytes.
- `../../loadtest/results/` (ignored): binaries, service logs, build logs, screenshots and scratch runs. Promote evidence with `publish.py`; do not commit generated binaries.
- Frontend JSON and documentation blocks are generated from the same run. `publish.py --check` detects drift.

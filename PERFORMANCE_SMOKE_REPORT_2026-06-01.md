# Nexus RTP Performance Smoke Report - 2026-06-01

## Scope

This run validates that the k6 benchmark harness is aligned with the current local API contract and can produce repeatable latency artifacts against the running Docker Compose services.

## Harness Changes

- Updated `loadtest/benchmark_suite.js` to use current payment payload fields: `messageId`, `creationDateTime`, `endToEndId`, `uetr`, `debtorAccountId`, and `creditorAccountId`.
- Switched the benchmark account pool to the seeded local UUID accounts from `003_seed_local.sql`.
- Added a fast `smoke` scenario for CI/local regression checks.
- Removed remote k6 helper imports so the harness runs in restricted/offline environments.
- Added p99 trend reporting via `summaryTrendStats`.
- Made auth flow opt-in with `INCLUDE_AUTH_FLOW=true`; direct payment/account service latency can now be measured without failing on missing local auth seed users.

## Validation Command

```bash
k6 run -e SCENARIO=smoke -e SMOKE_DURATION=8s -e API_URL=http://localhost:8085 -e ACCOUNT_URL=http://localhost:8086 -e AUTH_URL=http://localhost:8088 loadtest/benchmark_suite.js
```

## Result

- HTTP requests: 262
- HTTP failure rate: 0.00%
- Payment p95 latency: 53 ms
- Payment p99 latency: 811 ms
- Payment success rate: 1.00
- Total harness errors: 0
- Timeouts: 0

The p99 is currently dominated by the first sanctions fallback path while Watchman is down; after the sanctions circuit is open, repeated payment creates are much faster. This is acceptable for a smoke proof, but production-grade benchmarking still needs sustained ramp/soak/spike runs with Watchman backed by a stable offline sanctions dataset.

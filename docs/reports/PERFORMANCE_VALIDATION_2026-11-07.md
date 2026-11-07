# Performance and repository validation — 2026-11-07

The [recorded performance report](../performance/README.md) and [machine-readable baseline](../performance/latest.json) contain the measured results and exact limits. This work does not establish production capacity or a before/after speedup.

## Completed validation

| Check | Result |
|---|---|
| Five-phase k6 run against the built payment service, real CockroachDB and Redis | PASS: 14,709 attempted payments, 33,840 HTTP requests, zero failures |
| Accepted payment read-back and identical transaction ID on replay | PASS: 100% |
| SQL checks: transaction uniqueness, balanced legs, nonnegative shards, outbox count, reservation totals | PASS: 14,712 persisted payments including three warm-up payments |
| `go test ./services/payment-service/...` | PASS |
| `go vet ./services/payment-service/...` | PASS |
| `go test ./pkg/idempotency/... ./services/account-service/...` | PASS |
| `corepack pnpm --filter @nexus/web test` from `frontend/` | PASS: 7 files, 142 tests |
| Production UI library + Next.js build in `.next-performance` | PASS: build, TypeScript and lint checks; existing lint warnings remain |
| Playwright Chromium navigation measurements | PASS: 30 fresh-context navigations across home, login and performance pages, zero page exceptions |
| `node --test scripts/performance/summary.test.mjs` | PASS: 6 checks for missing, disabled, zero, invalid and boundary observations |
| `python scripts/performance/publish.py --check` | PASS: documentation, UI copies and evidence checksums match |
| Local links in reorganized guides, reports and entry points | PASS |

## Code and harness fixes

- The starting working tree did not compile: the API still called a removed `CancelPayment`. Restored the existing cancellation implementation in its own `cancellation.go`, preserving the current PENDING creation behavior.
- Corrected the test mock so transactional and nontransactional existence queries share the configured data. The duplicate-UETR regression now exercises the transactional lookup and passes.
- Added isolated database/Redis dependencies, a five-phase load harness, source/environment manifests, sampled container usage, API Prometheus snapshots, persisted ledger checks and a publication/check command.
- Removed fabricated fallback latency/throughput/error/uptime values from dashboard cards. Published lab measurements are explicitly separate from live telemetry and appear on the home page, dashboard, analytics and performance evidence page.
- Added a CI consistency check for generated performance documentation and frontend copies.
- Fixed the older configurable suite's summary so missing/disabled samples are explicitly unmeasured and observed zeros remain zeros. Rejected HTTP 2xx payments no longer count as successful creation.
- The frontend dependency tree initially contained missing files. Reinstalled exact lockfile versions. Repeated Windows standalone-output builds reproduced the linked-package cleanup problem described in [Next.js issue 82157](https://github.com/vercel/next.js/issues/82157). Performance builds use a separate `.next-performance` directory and a production Node server, with standalone packaging disabled for this test.
- Corrected commit hooks to run Go formatting/imports and module-aware vet commands on Windows. Formatters exclude byte-preserved evidence; credential checks inspect staged repository files rather than ignored dependency fixtures and local files.

## Repository organization

- Removed obsolete audits, completion/smoke snapshots, duplicate project/index documents, unsupported marketing comparisons and old PR/patch instructions. Previously committed content remains in Git history; local originals are backed up under ignored `diagnostics/local/`.
- Testing, quick-reference and troubleshooting guides live under `docs/guides/`, with relative links repaired and the main README serving as the setup entry point.
- Removed incomplete historical performance scratch results and superseded benchmark/release-document helpers. Retained the validated load harness and grouped the CSV-to-SVG utility under `scripts/performance/`.
- Current raw evidence lives under `docs/performance/runs/<run-id>/`. New dated reports belong here, with navigation in `docs/README.md`.
- Root scratch logs were moved to ignored `diagnostics/local/`; Python environments and separate performance build output are ignored. Binaries, browser screenshots, local logs and failed attempts remain in ignored `loadtest/results/`.
- Application changes were preserved. The user requested a commit and push to `main` after documentation cleanup.

## Follow-up indicated by the measurements

Recovery p95 remained above the baseline after the spike. Profile database activity and run a longer recovery/soak before claiming recovery behavior. Screening-available, gateway/auth, Kafka delivery, fraud and settlement tests require separate environments and evidence. The present run deliberately routes accepted payments into sanctions review.

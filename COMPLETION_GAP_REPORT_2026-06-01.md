# Nexus RTP Completion Gap Report

Date: 2026-06-01
Author: Codex engineering audit
Scope: Current working tree under `fintechP`
Audience: Founder/CTO, engineering leads, security, infra, product

## Executive Summary

Nexus RTP has unusually broad engineering ambition for a single repository: Go microservices, CockroachDB ledger schema, Kafka/outbox, Flink fraud jobs, sanctions screening, Next.js frontend, shared UI package, Helm/Kubernetes, observability, load tests, runbooks, compliance artifacts, and audit-bundle concepts.

The codebase is not yet near-perfect or production-ready. It is best described as a high-potential platform prototype with strong architectural scaffolding, partial domain depth, and significant integration drift.

The largest problem is not lack of code. The largest problem is that the contracts between layers are inconsistent:

- Frontend auth expects a different login response shape than the backend returns.
- Frontend payment statuses and action payloads do not match backend payment state and API payloads.
- Backend payment state transitions make the normal create-to-settle path ambiguous.
- TypeScript strict type-check fails with many API-shape mismatches.
- Payment-service unit tests are currently red.
- Several services have little or no test coverage beyond package compilation.
- Security controls exist as documentation and templates, but not consistently enforced in runtime paths.

Current completion estimate:

- Product/demo completeness: 60-70 percent
- Engineering correctness completeness: 55-65 percent
- Production readiness: 35-45 percent
- Near-perfect target readiness: 20-30 percent

Overall grade today: B- for ambition and structure, C for integration quality, C- for production readiness.

The shortest path to excellence is not more features. It is contract unification, red-to-green quality gates, threat-model-driven security hardening, and realistic end-to-end validation through the gateway and production-like infrastructure.

## Verified Current State

Commands run on 2026-06-01:

| Area | Command | Result |
|---|---|---|
| Payment service | `go test ./...` in `services/payment-service` | Fails in `internal/service` |
| Account service | `go test ./...` in `services/account-service` | Passes, but many packages have no tests |
| Auth service | `go test ./...` in `services/auth-service` | Passes, but API package has no tests |
| Notification service | `go test ./...` in `services/notification-service` | Passes |
| Reconciliation service | `go test ./...` | Passes by compilation only; no test files |
| Audit service | `go test ./...` | Passes by compilation only; no test files |
| Analytics service | `go test ./...` | Passes by compilation only; no test files |
| WebSocket gateway | `go test ./...` | Passes hub tests |
| Shared packages | `go test ./...` in `pkg/idempotency`, `pkg/multitenancy`, `libs/iso20022` | Passes, ISO package has no tests |
| Web app type-check | `pnpm --filter @nexus/web type-check` | Fails |
| Web app unit tests | `pnpm --filter @nexus/web test` | Fails 2 payment-hook tests |
| UI package type-check | `pnpm --filter @nexus/ui typecheck` | Passes |
| UI package tests | `pnpm --filter @nexus/ui test` | Passes 24 tests |

Working tree status:

- Modified backend and infra files are present.
- Untracked audit docs, generated frontend components, load test outputs, `__pycache__`, health text files, and local artifacts are present.
- `frontend/apps/web/tsconfig.tsbuildinfo` is tracked/modified and should not be part of a clean source tree.

## Quality Gate Status

Near-perfect standard requires every gate below to be green before release:

| Gate | Required State | Current State | Priority |
|---|---|---|---|
| Backend unit tests | All Go modules pass | Payment service fails | P0 |
| Frontend type-check | `@nexus/web` and `@nexus/ui` pass strict TS | Web app fails | P0 |
| Frontend unit tests | All pass | Web app fails 2 tests | P0 |
| Contract tests | Generated types match backend OpenAPI | Drift exists | P0 |
| E2E tests | Gateway-based happy paths pass | Not verified in this audit | P0 |
| Security scan | No secrets, no critical findings | Secrets/defaults and insecure local config found | P0/P1 |
| Load test | Gateway-based, repeatable, clean failure classification | Existing artifacts are useful but not sufficient | P1 |
| Infra deploy | Staging install from clean checkout succeeds | Not verified in this audit | P1 |
| Observability | Metrics/alerts aligned with emitted metric names | Partial; likely drift | P1 |

## P0 Findings Blocking Completion

### P0-1: Frontend and backend auth response contracts do not match

Backend login returns a `LoginResponse` shaped as:

- `user`
- `tokens`
- `mfaRequired`
- `mfaSessionId`

Frontend NextAuth expects top-level:

- `accessToken`
- `refreshToken`
- `expiresIn`
- `user`

Risk:

- Login may succeed at HTTP level but fail to hydrate NextAuth tokens correctly.
- Token refresh also expects a different response shape than backend refresh returns. Backend returns `{ "tokens": tokenPair }`; frontend expects top-level token fields.

Completion requirement:

- Define one auth API contract in OpenAPI.
- Generate frontend types from that contract.
- Update either backend response shape or frontend mapping.
- Add contract tests for login, refresh, MFA challenge, MFA verify, logout, and `/me`.

Recommended contract:

```json
{
  "user": {},
  "tokens": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 900,
    "tokenType": "Bearer"
  },
  "mfaRequired": false,
  "mfaSessionId": ""
}
```

Frontend should map this explicitly instead of assuming top-level token fields.

### P0-2: Email verification is not implementable as written

Registration creates a random verification token and sends it by email, but the verification handler expects the token to be parseable as a user UUID.

Risk:

- New users cannot reliably verify email.
- Security posture is misleading because the flow appears present but is not complete.

Completion requirement:

- Add `email_verification_tokens` table or reuse a generalized token table.
- Store hashed token, user ID, expiry, used flag, created timestamp.
- Send plaintext token once.
- Verify by token hash, not user ID.
- Mark token used and user verified in one transaction.
- Revoke outstanding verification tokens after success.

### P0-3: MFA challenge session is not bound to verification

Login creates an `mfaSessionId`, but verification does not validate the session ID. It fetches user by email and validates the TOTP code.

Risk:

- MFA challenge has weak binding.
- Rate limiting and replay controls are incomplete.
- A valid TOTP for a user can be submitted without proving possession of the password challenge session from the same flow.

Completion requirement:

- Store MFA challenge sessions in Redis or database with short TTL.
- Fields: session ID hash, user ID, created time, expiry, attempt count, IP/user agent fingerprint, consumed flag.
- `VerifyMFA` must require and consume that session.
- Add rate limiting per user, IP, and session.

### P0-4: Payment lifecycle is inconsistent

`CreatePayment` creates normal payments with `PENDING`. `SettlePayment` validates only `CLEARED -> SETTLED`. Frontend allows settling `PENDING`, `PROCESSING`, `SANCTIONED`, and `CLEARED`.

Risk:

- The core payment happy path is ambiguous.
- Operators may see action buttons that backend rejects.
- Documentation, frontend, and backend state machine disagree.

Completion requirement:

- Publish a canonical payment state machine.
- Implement explicit transitions:
  - `PENDING -> SANCTIONED` when review required
  - `PENDING -> FRAUD_REVIEW` when fraud review required
  - `PENDING -> CLEARED` when compliance and fraud pass
  - `CLEARED -> SETTLED`
  - `CLEARED -> CANCELLED`
  - `SETTLED -> RETURNED`
  - Terminal: `REJECTED`, `RETURNED`, `CANCELLED`
- Add service methods and endpoints for `clear`, `reject`, `cancel`, and `settle`, or remove unsupported frontend actions.
- Add concurrency tests for every legal and illegal transition.

### P0-5: Payment-service test suite is red

`TestCreatePayment_Idempotency_DuplicateUETR` fails. The current test/mocks no longer exercise the transactional idempotency path correctly after the service switched to `ExistsByUETRTx`/`GetByUETRTx`.

Risk:

- CI is red.
- The project cannot claim exactly-once payment creation while the idempotency test is failing.

Completion requirement:

- Fix the test mocks to cover tx-aware idempotency functions.
- Add a real integration test with CockroachDB or testcontainers to prove duplicate UETR behavior under concurrency.
- Add a Redis idempotency middleware integration test for retry-with-same-key behavior.

### P0-6: Web app TypeScript strict mode fails

Observed categories:

- Payment status enum does not include backend statuses `SANCTIONED`, `CLEARED`, `FRAUD_REVIEW`.
- Payment detail page references `debtorAccountId`/`creditorAccountId` but `Payment` type defines `debtorAccount`/`creditorAccount`.
- Tests expect legacy response shapes like `items`, `statusText`, and older request DTOs.
- Test files use regex flags and iteration patterns incompatible with the configured TypeScript target.

Risk:

- Frontend cannot be considered build-safe.
- UI may compile under looser paths but fails strict validation.
- API contract drift is widespread.

Completion requirement:

- Set `target` to at least `ES2020` in web tsconfig.
- Regenerate frontend types from canonical OpenAPI.
- Fix tests to match current `ApiResponse` and `PaginatedResponse`.
- Align payment DTO fields with backend response.
- Make type-check mandatory in CI.

### P0-7: Return and cancel payment frontend actions are broken

Frontend return hook sends `{ reason }`; backend requires `reasonCode`.

Frontend defines a cancel endpoint `/payments/:uetr/cancel`; backend does not register a cancel route.

Risk:

- User-visible payment actions fail.
- Payment operations dashboard is misleading.

Completion requirement:

- Implement backend cancel endpoint or remove frontend cancel.
- Change return payload to `{ reasonCode, reasonText }`.
- Add frontend integration tests that assert exact payloads.
- Add backend handler tests for return/cancel error mapping.

### P0-8: IBAN lookup queries the wrong column

Frontend asks for IBAN. Schema has `iban`. Payment service `GetIDByIBAN` queries `account_number`.

Risk:

- Real customer IBAN payments fail unless account number happens to equal IBAN.
- Test seed data may hide this problem.

Completion requirement:

- Query `iban = $1` first, optionally fallback to `account_number = $1` only for legacy dev accounts.
- Normalize IBAN casing/spaces.
- Add uniqueness constraint or partial unique index on non-empty IBAN.
- Add tests with real IBAN values.

### P0-9: Manual JSON construction in payment handler

`remittanceInfo` is converted with string concatenation into `json.RawMessage`.

Risk:

- Quotes, backslashes, and control characters create invalid JSON.
- This is avoidable input-handling fragility in a financial path.

Completion requirement:

- Replace with `json.Marshal(map[string]string{"unstructured": frontReq.RemittanceInfo})`.
- Validate length and character policy for ISO 20022 remittance information.

## Frontend Completion Gaps

### Contract and data model

Missing or incomplete:

- Canonical generated API client from OpenAPI.
- Single source of truth for DTOs.
- Correct auth token response mapping.
- Payment status enum parity with backend.
- Account, balance, reconciliation, and audit response shape parity.
- Error model consistency across services.
- Versioned API deprecation handling.

Required work:

1. Update `docs/openapi.yaml` to reflect actual backend responses.
2. Generate `frontend/apps/web/src/types/api.generated.ts`.
3. Replace handwritten or stale DTOs in `frontend/apps/web/src/lib/api/types.ts`.
4. Add contract snapshots for every hook.
5. Enforce `pnpm --filter @nexus/web type-check` and `pnpm --filter @nexus/web test` in CI.

### UX and workflow completeness

Missing or partial:

- Payment lifecycle actions do not match backend state machine.
- Error messages often log to console rather than showing durable user feedback.
- MFA login flow in frontend does not appear aligned to backend's `mfaRequired`/`mfaSessionId`.
- Email verification and password reset pages require contract validation.
- Reconciliation and audit pages likely rely on optimistic/stale schemas.
- No verified production E2E journey from login -> account -> payment -> status -> reconciliation -> audit.

Required workflow tests:

- Register -> verify email -> login.
- Login with MFA challenge.
- Refresh token expiry and recovery.
- Create account.
- Create payment by account ID and by IBAN.
- Payment under sanctions review.
- Clear and settle payment.
- Return settled payment.
- Reconcile daily cycle.
- Download/verify audit bundle.
- WebSocket payment status update.

### Frontend quality

Current strengths:

- UI package has a structured component library.
- UI package type-check and tests pass.
- Web app has broad pages and hooks.
- React Query usage is a good direction.

Current weaknesses:

- Web app strict type-check fails.
- Web tests are not aligned with types.
- API client has a `pendingRequests` map but no implemented request deduplication.
- Error transformation may stringify undefined details.
- Frontend logging could leak operational/user data in development and staging if not controlled.

## Backend Completion Gaps

### Payment service

Strengths:

- Domain service layer exists.
- CockroachDB serializable transaction retries exist.
- Decimal arithmetic is used.
- Sharded balance operations reduce hot-row contention.
- Outbox pattern exists.
- Sanctions integration exists.
- Observability hooks exist.

Missing or incomplete:

- Red unit test for duplicate UETR idempotency.
- Ambiguous state machine and incomplete transition endpoints.
- No clear explicit fraud-clearing path connecting Flink fraud output to payment status.
- Sanctions failure policy is hardcoded to review/fail-open behavior.
- No circuit breaker around sanctions.
- Return/cancel APIs incomplete relative to frontend.
- No formal idempotency tests for all payment mutations.
- Manual JSON handling for remittance.
- IBAN lookup bug.
- Some SQL identifiers use reserved words and require quoting; this increases fragility.
- Background workers need distributed leadership or idempotent multi-instance design.

Completion requirements:

- Make payment-service test suite green.
- Implement state-machine API and tests.
- Add integration tests with real DB/Kafka/Redis.
- Add deterministic idempotency behavior for create, settle, return, cancel.
- Add outbox publisher ownership model: Debezium-only or app-publisher-only, not both ambiguous.
- Add dead-letter and replay tools for failed outbox events.

### Account service

Strengths:

- Unit tests pass for service layer.
- Cache layer exists.
- Account and audit repository separation exists.

Missing or incomplete:

- Account creation must initialize account shards or emit a reliable event consumed by payment service.
- API authorization and tenant isolation require stronger verification.
- Account balance read path must distinguish display balance from authoritative shard sum.
- No broad API tests reported.
- Customer model and account onboarding flow need alignment with frontend DTOs.

Completion requirements:

- Ensure account creation always creates shard rows in the same transaction.
- Add authoritative balance endpoint that reads `SUM(account_shard.balance)`.
- Add account-service API handler tests.
- Add tenant-scoped access tests.

### Auth service

Strengths:

- Password hashing uses bcrypt.
- JWT token service and RSA keys exist.
- Refresh token storage and revocation exist.
- MFA secret encryption exists.
- Audit logging exists.

Missing or incomplete:

- Email verification flow broken.
- MFA challenge session not enforced.
- Refresh token response contract differs from frontend.
- API package lacks tests.
- API key generation uses UUID-based random key; use `crypto/rand` high-entropy tokens.
- No login rate limiting or account lockout visible in handler.
- No password policy beyond minimum length.
- No device/session management UI/API.
- No CSRF strategy for cookie/session flows documented.

Completion requirements:

- Implement verification token table.
- Implement MFA session storage and consumption.
- Add rate limits for login, reset password, MFA verify, API key creation.
- Align frontend and backend auth DTOs.
- Add auth API integration tests.

### Reconciliation service

Strengths:

- Reconciliation module and scheduler exist.
- DB repository and API layers exist.

Missing or incomplete:

- No test files in service packages.
- Matching algorithm depth needs verification against real ledger and external settlement data.
- No operational workflow for discrepancy lifecycle completeness.
- No proof that reconciliation cannot double-resolve or lose discrepancy records under concurrent operators.

Completion requirements:

- Add unit tests for exact, fuzzy, and failed matches.
- Add integration tests for payment lifecycle -> reconciliation cycle.
- Add discrepancy state machine.
- Add audit entries for each manual resolution.

### Audit service

Strengths:

- Cryptographic audit-bundle concept exists.
- Standalone audit package has tests outside service.

Missing or incomplete:

- Service package has no tests.
- Need chain-of-custody design for key rotation and public-key discovery.
- Need durable bundle storage and immutability guarantees.
- Need API contract and UI verification flow validated.

Completion requirements:

- Add tests for bundle creation, verification, tamper detection, and key rotation.
- Define retention policy.
- Add object storage/WORM or immutable DB storage for production.

### Notification service

Strengths:

- API and service tests pass.
- Email abstraction supports disabled/stub mode.

Missing or incomplete:

- Production email provider integration needs verification.
- Notification preferences and delivery guarantees need contract tests.
- Retry/backoff/DLQ policies should be explicit.

### Analytics service

Strengths:

- Service skeleton exists.

Missing or incomplete:

- No tests.
- Analytics likely reads DB views whose schema has drifted across migrations.
- Requires metric definitions, retention, and performance isolation from OLTP DB.

Completion requirements:

- Add tests and sample data fixtures.
- Consider ClickHouse/Timescale/warehouse path for analytics at scale.
- Avoid heavy analytics queries on payment OLTP path.

### WebSocket gateway

Strengths:

- Hub tests pass.
- Kafka consumer and JWT validation exist.

Missing or incomplete:

- End-to-end event delivery not verified.
- Backpressure, slow-client handling, replay-on-reconnect, and tenant filtering need hard tests.
- Need strict origin and auth validation for production.

## Security Completion Gaps

### Critical security issues

1. Secrets/defaults appear in local `.env`, compose, and examples.
2. CockroachDB local compose runs with `--insecure` and `sslmode=disable`.
3. Kafka runs PLAINTEXT in local stack.
4. Kong admin API is exposed on host port `8001`.
5. Dev JWT keys are mounted into containers.
6. MFA encryption key has a deterministic default.
7. Auth flows have broken email verification and weak MFA challenge binding.
8. PII appears in logs: debtor/creditor names, emails, account identifiers.
9. No comprehensive authorization matrix is enforced/tested across services.
10. No end-to-end tenant isolation test suite across account/payment/reconciliation/audit.

### Required security work

P0:

- Remove committed local `.env` if it contains real secrets; keep `.env.example` only.
- Rotate any exposed local/shared secrets.
- Fix auth contract, email verification, MFA session binding.
- Add gateway auth tests for every protected route.
- Add rate limiting on auth and payment mutation endpoints.
- Add PII redaction policy and logger wrappers.

P1:

- Add mTLS for service-to-service calls in staging/production.
- Enforce TLS for CockroachDB and Kafka in non-dev environments.
- Add Vault or external-secrets integration as mandatory for staging/prod.
- Harden Kong admin API: cluster-only, authenticated, no public ingress.
- Add dependency scanning, container scanning, SAST, and secret scanning to CI.
- Add threat model documents for payment lifecycle, auth, outbox, audit bundles, and admin operations.

P2:

- Add formal PCI/SOC2 control mapping.
- Add key-rotation drill automation.
- Add tamper-evident operational logs.
- Add break-glass access procedure and audit trail.

## Database Completion Gaps

### Schema and migration concerns

The project contains multiple schema sources:

- `migrations/*.sql`
- `infra/docker/cockroachdb/init/*.sql`
- service repository expectations
- frontend generated/stale types

Risk:

- Drift between migration order, docker init schema, service SQL, and frontend contracts.
- A clean deploy from migrations may behave differently from a local docker init deploy.

Completion requirement:

- Choose one canonical migration system.
- Make docker init run the same migrations used in staging/production.
- Add schema drift checks in CI.
- Add a migration test that creates a fresh database from zero and runs every service's repository smoke tests.

### Ledger and transaction concerns

Missing or incomplete:

- Authoritative balance source is split between `account.balance` cache and `account_shard` truth.
- New account shard initialization should be guaranteed, not lazy-only.
- Need DB-level constraints for ledger leg balance:
  - transaction legs per state
  - positive amounts
  - valid currencies
  - valid statuses
  - no negative shards
- Need partitioning/sharding plan for large transaction tables.
- Need archival/retention policy for ledger, audit, and outbox.

Recommended DB work:

1. Add `account_shard` creation inside account creation transaction.
2. Add `CHECK (amount > 0)` and status/currency constraints where possible.
3. Add partial unique indexes for idempotency keys and UETR.
4. Add composite indexes for list/filter paths used by UI.
5. Add read model tables for UI list views if OLTP queries become too expensive.
6. Add data retention plan and partition by booking date/tenant/region.
7. Add backup restore drill to CI/staging schedule.

## Reliability Completion Gaps

### Single points and failure modes

Current or likely gaps:

- Sanctions dependency failure changes payment routing to review.
- Outbox retry sweep needs multi-instance coordination.
- Background reconciliation workers need distributed locks.
- Kafka producer/publisher failure behavior needs stronger tests.
- Redis outage disables idempotency middleware but DB UETR uniqueness remains only for payment creation, not all mutations.
- Frontend token refresh mismatch can cause user session failure.
- WebSocket reconnect/replay guarantees are not fully proven.

Required reliability work:

- Define failure policy for each dependency:
  - CockroachDB unavailable
  - Kafka unavailable
  - Redis unavailable
  - Watchman unavailable
  - Vault unavailable
  - SMTP unavailable
  - Jaeger/Prometheus unavailable
- Add circuit breakers and bounded retries.
- Add DLQs for outbox/Kafka processing.
- Add idempotent consumers for every Kafka topic.
- Add chaos tests for dependency failures.
- Add runbook drills and record outcomes.

## Latency, Performance, and Throughput

### Current performance posture

Positive:

- Payment hot path uses CockroachDB transactions and sharded account balances.
- `ReserveFundsShard` expected case is O(1).
- Fallback shard selection is O(K), where K=8, effectively constant.
- Kafka topics are partitioned.
- Redis idempotency middleware can reduce duplicate work when available.
- Load test artifacts exist.

Concerns:

- Current load tests must be re-run through Kong with correct service routing.
- Existing Locust account failures were previously caused by targeting wrong host/service.
- Sanctions screening is synchronous in create-payment path and has a 5 second client timeout.
- DB transaction timeout is 5 seconds, but p99 goals are sub-second.
- Reconciliation and analytics may compete with OLTP if not isolated.
- Outbox processing capacity and lag are not proven under sustained load.
- No current verified TPS number from a clean green build.

### Complexity analysis

Payment creation:

- UUID parsing and validation: O(1).
- Idempotency DB check: O(log N) with UETR unique index.
- Sanctions screening: O(1) local code, external API latency dominates.
- Shard debit: O(1) expected; O(K) fallback with K=8.
- Transaction insert and two leg inserts: O(log N) each due indexes.
- Outbox insert: O(log N).
- Overall local computational complexity: O(log N), dominated by DB index operations and external sanctions latency.

Payment listing:

- Current `COUNT(*)` plus ordered page query can become expensive at large scale.
- Complexity roughly O(N) for count depending on DB execution and O(log N + page_size) for indexed page query.
- Recommendation: use approximate counts, seek pagination, or materialized read model for high-volume dashboards.

Reconciliation:

- Daily reconciliation is at least O(T) for transactions in cycle.
- Fuzzy matching may become O(T*M) if not carefully indexed/windowed.
- Recommendation: partition by date/account/currency/status and use deterministic matching before fuzzy matching.

Outbox:

- Publishing is O(P) for pending rows per sweep.
- Needs batching, `SKIP LOCKED`, exponential backoff, and lag metrics.

Frontend:

- React Query caching is good.
- Large tables need server-side pagination and virtualized rows.
- WebSocket state updates should avoid invalidating broad query trees.

### Performance completion requirements

P0:

- Fix build/tests first so perf results are meaningful.
- Re-run load test through Kong with all services healthy.
- Publish baseline:
  - P50/P95/P99 latency by endpoint
  - throughput by endpoint
  - error rate by endpoint
  - DB retry rate
  - outbox lag
  - Kafka consumer lag
  - Redis hit/miss
  - sanctions latency and failure rate

P1:

- Add latency budgets per stage:
  - HTTP validation: < 5 ms
  - idempotency: < 10 ms
  - sanctions cache hit: < 5 ms
  - sanctions miss: < 150 ms target, circuit-break at configured threshold
  - DB reservation: < 100 ms p95
  - outbox insert: < 20 ms
- Add benchmarks for shard debit under concurrency.
- Add CockroachDB retry and contention dashboards.

P2:

- Add capacity model:
  - projected TPS
  - peak TPS
  - hot-account skew
  - shard count tuning
  - Kafka partitions
  - DB storage growth
  - audit storage growth
  - retention cost

## Infrastructure Completion Gaps

### Docker Compose

Strengths:

- Full local stack is represented.
- CockroachDB, Kafka, Debezium, Flink, Redis, Kong, Watchman, Prometheus, Grafana, Jaeger, and services are included.

Gaps:

- CockroachDB is insecure and exposed locally.
- Kafka is PLAINTEXT.
- Kong admin API is exposed.
- Default passwords are embedded.
- Service startup health dependencies are incomplete for all services.
- Compose uses profiles, so test instructions must be precise.
- Local stack is heavy; developers need a slim profile.

### Kubernetes/Helm

Strengths:

- Helm chart and production values exist.
- Autoscaling and resource settings are sketched.
- Ingress TLS is represented.
- Backup CronJob templates exist.

Gaps:

- `latest` and empty image tags require pipeline discipline.
- Production Jaeger endpoint format may not match service tracer expectations.
- Secret injection is described but not proven.
- NetworkPolicy coverage needs validation.
- Pod security standards, read-only root filesystems, seccomp, non-root users, and capabilities should be enforced chart-wide.
- Multi-region CockroachDB topology cannot be simulated by simple 3 pods without production locality planning.
- Disaster recovery restore procedure must be rehearsed.

Completion requirements:

- Add `helm template` validation to CI.
- Add `helm lint`.
- Add kubeconform/kubeval.
- Add staging deploy smoke test.
- Add sealed-secrets/external-secrets/Vault integration test.
- Add NetworkPolicy test.
- Add pod security enforcement.

## Observability Completion Gaps

Strengths:

- Prometheus rules exist.
- Grafana dashboards exist.
- Tracing code exists.
- Runbooks exist.

Gaps:

- Metric names in rules may not match actual emitted metric names.
- Tracing endpoint format has already shown drift in earlier artifacts.
- Alert thresholds are aspirational without clean baseline.
- Need trace IDs in error responses and logs.
- Need log redaction.
- Need service-level dashboards for each service, not only payment.

Completion requirements:

- Inventory actual metrics from running services.
- Align PromQL rules to real metric names.
- Add golden dashboard screenshots or dashboard linting.
- Add synthetic probes.
- Add SLO burn-rate alerts, not only threshold alerts.
- Add trace propagation through Kong -> service -> Kafka/outbox consumers.

## Testing Completion Plan

### Must-have test suites

Backend:

- Unit tests for every service package.
- Handler tests for every endpoint.
- Repository integration tests using CockroachDB.
- Contract tests against OpenAPI.
- Concurrency tests for payment transitions.
- Idempotency tests with Redis.
- Kafka/outbox integration tests.
- Auth security tests for login, MFA, refresh, reset, verification, rate limiting.
- Tenant isolation tests.

Frontend:

- Type-check clean.
- Hook tests aligned to generated DTOs.
- Component tests for core forms.
- E2E tests through gateway.
- Accessibility tests passing.
- Visual regression tests for critical pages.

Infrastructure:

- Docker compose smoke test.
- Helm lint/template validation.
- Kubernetes staging smoke test.
- Backup/restore drill.
- Chaos drills.

Performance:

- Benchmark shard debit.
- Benchmark payment create.
- Gateway load test.
- Soak test.
- Hot-account skew test.
- Outbox backlog recovery test.

## Product and Feature Completion Gaps

Core missing or partial product features:

- Complete payment lifecycle UI and backend.
- Account onboarding aligned to shard initialization.
- Customer onboarding/KYC workflow.
- Operator review queues for sanctions and fraud.
- Manual approval workflow with dual control.
- Reconciliation discrepancy management.
- Audit bundle verification UX.
- Admin user management.
- Role and permission management.
- API key lifecycle with scoped permissions.
- Webhook/event subscription management.
- Compliance reporting exports.
- Production-ready notification templates and preferences.

Operational features missing:

- Admin console for service health.
- Outbox replay UI/CLI.
- Dead-letter queue inspection.
- Payment repair workflow.
- Reconciliation repair workflow.
- Key rotation workflow.
- Tenant management.
- Data retention/erasure tooling where legally applicable.

## Repository Hygiene Gaps

Current issues:

- Generated/load-test artifacts are untracked in working tree.
- `__pycache__` is present.
- `tsconfig.tsbuildinfo` is modified.
- Health text files and local logs are present.
- Multiple audit reports overlap and some are stale.
- Documentation contains encoding/mojibake characters in some files.

Completion requirements:

- Clean `.gitignore`.
- Decide which reports are canonical.
- Move generated artifacts under `artifacts/` or exclude.
- Remove stale docs or mark superseded.
- Add `make verify` or equivalent single quality gate.

Recommended canonical command:

```bash
make verify
```

It should run:

- go tests for every module
- frontend type-check
- frontend unit tests
- UI package tests
- lint
- OpenAPI generation check
- Helm lint/template check
- secret scan

## Management Assessment

The project needs a stabilization phase before more feature work.

Recommended team ownership:

| Workstream | Owner Type | Duration |
|---|---|---|
| API contract unification | Staff backend + senior frontend | 1-2 weeks |
| Payment lifecycle correctness | Principal backend/financial systems engineer | 2-3 weeks |
| Auth/security hardening | Senior security engineer + backend | 2-3 weeks |
| Frontend type/test recovery | Senior frontend engineer | 1-2 weeks |
| Database/migration hardening | Senior backend/DB engineer | 2 weeks |
| Infra/staging reliability | Senior platform engineer | 2-4 weeks |
| Observability/SLO baseline | Platform/SRE | 1-2 weeks |
| Performance certification | Backend + SRE | 1-2 weeks after green build |

Minimum team for high-quality completion:

- 1 principal/staff backend engineer
- 1 senior frontend engineer
- 1 platform/SRE engineer
- 1 security engineer part-time
- 1 QA/test automation engineer
- 1 product owner with payments domain input

## Prioritized Roadmap

### Phase 0: Freeze and make the repo honest

Duration: 2-3 days

Deliverables:

- No new features.
- Clean working tree.
- Decide canonical report/docs.
- Add/repair `.gitignore`.
- Define `make verify`.
- Record current failures as tracked issues.

Exit criteria:

- Everyone can reproduce failures from a clean checkout.
- No generated artifacts pollute review.

### Phase 1: Contract recovery

Duration: 1-2 weeks

Deliverables:

- Canonical OpenAPI.
- Generated frontend API types.
- Auth contract fixed.
- Payment DTOs fixed.
- Account/reconciliation/audit DTOs fixed.
- Web type-check green.
- Web tests green.

Exit criteria:

- `pnpm --filter @nexus/web type-check` passes.
- `pnpm --filter @nexus/web test` passes.
- Contract test suite passes.

### Phase 2: Payment correctness

Duration: 2-3 weeks

Deliverables:

- Canonical payment state machine.
- Missing endpoints implemented or UI actions removed.
- Idempotency tests fixed.
- CockroachDB integration tests.
- Concurrent transition tests.
- IBAN lookup fixed.
- Remittance JSON fixed.
- Outbox semantics clarified.

Exit criteria:

- `go test ./...` passes for payment-service.
- E2E payment happy path passes.
- Duplicate UETR and duplicate idempotency key tests pass under concurrency.

### Phase 3: Auth and security hardening

Duration: 2-3 weeks

Deliverables:

- Email verification token persistence.
- MFA session binding.
- Rate limiting.
- Secret cleanup and rotation.
- PII logging redaction.
- Gateway authorization tests.
- Tenant isolation tests.

Exit criteria:

- Auth E2E tests pass.
- Security scan has no critical/high findings.
- Threat model reviewed.

### Phase 4: Database and infra hardening

Duration: 2-4 weeks

Deliverables:

- Unified migration path.
- Fresh DB migration test.
- Account shard initialization guaranteed.
- Helm lint/template checks.
- Staging deploy smoke test.
- Backup/restore drill.
- NetworkPolicy and PodSecurity validated.

Exit criteria:

- Fresh environment can be created automatically.
- Staging smoke passes.
- Restore drill documented and successful.

### Phase 5: Reliability and performance certification

Duration: 2-3 weeks

Deliverables:

- Load test through Kong.
- Soak test.
- Chaos tests.
- SLO dashboards aligned to real metrics.
- Alert runbooks tested.
- Capacity model published.

Exit criteria:

- Target throughput and latency met with error budget.
- P99 latency and success-rate SLOs are measured, not guessed.
- Operational on-call can diagnose common failure modes.

## Definition of Near-Perfect for This Project

The project should not be considered near-perfect until all items below are true:

1. A clean checkout has a green `make verify`.
2. Backend and frontend contracts are generated from one OpenAPI source.
3. Payment lifecycle is fully specified, implemented, tested, and reflected in UI.
4. Auth flows are secure and tested: register, verify, login, MFA, refresh, logout, reset.
5. Every service has unit and handler tests for core paths.
6. Core repositories have DB integration tests against real CockroachDB.
7. E2E tests pass through Kong, not direct service shortcuts.
8. Security scans are clean for critical/high findings.
9. No secrets are committed.
10. Staging deploy is automated and repeatable.
11. Backup and restore are tested.
12. Load tests prove latency/throughput targets.
13. Chaos tests prove dependency failure behavior.
14. SLO alerts map to real emitted metrics.
15. Documentation matches code and has no stale contradictions.

## Immediate Next Actions

Do these first, in this exact order:

1. Clean repository artifacts and `.gitignore`.
2. Fix auth response contract between backend and frontend.
3. Fix frontend TypeScript target and API type drift.
4. Fix payment-service idempotency test/mocks.
5. Fix payment state machine and unsupported frontend actions.
6. Fix return payload and remove or implement cancel.
7. Fix IBAN lookup and remittance JSON construction.
8. Add contract generation and CI gate.
9. Add DB migration-from-zero test.
10. Run full gateway E2E smoke.

## Bottom Line

Nexus RTP has the bones of a serious financial platform, but it is not finished. The codebase has enough depth to be worth finishing, and enough drift that finishing must be treated as a disciplined stabilization program rather than normal feature work.

The winning move is to stop expanding the surface area for a moment and make the existing promises true: green tests, one API contract, one state machine, secure auth flows, clean migrations, verified infrastructure, and measured performance.

Once those are in place, this project can move from impressive prototype to credible production-grade platform.

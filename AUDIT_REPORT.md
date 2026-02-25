# Comprehensive Go Backend Audit Report

**Project:** nexus-rtp (fintechP)
**Date:** Generated automatically
**Totals:** 93 Go files, 21,005 lines of Go code

---

## Executive Summary

This is a **real, non-trivial fintech platform** — not scaffolding. The codebase contains 8 microservices and 7 standalone modules with genuine business logic: double-entry ledger accounting, ISO 20022 payment messaging, 3-way reconciliation, TOTP MFA, Ed25519 audit signing, replay engines, and formal invariant checking. **All 8 services compile cleanly.** However, significant gaps exist: **6 of 8 services have zero unit tests**, several handlers contain TODO stubs, the `proofs/` module has a compilation error, and no service has integration or contract tests.

### Verdict: ~70% Real, ~20% Incomplete, ~10% Stub/Placeholder

---

## Part 1: Services (`services/`)

---

### 1. payment-service

| Metric | Value |
|--------|-------|
| **Files** | 11 Go files |
| **Lines** | 2,999 |
| **Compiles** | YES |
| **Tests** | **NONE** (0 test files) |
| **Dockerfile** | Multi-stage, non-root user, missing ENTRYPOINT (uses CMD) |

**Entry Point** (`cmd/server/main.go`, 162 lines): **REAL** — Full wiring: CockroachDB pool (pgx), Kafka producer, sanctions client, Redis-backed idempotency middleware, Gin router, graceful shutdown with `signal.NotifyContext`.

**Routes/Handlers** (`internal/api/handlers.go`, 462 lines):
| Route | Status |
|-------|--------|
| `POST /api/v1/payments` | **REAL** — Full payment creation with validation |
| `GET /api/v1/payments` | **REAL** — List with query params |
| `GET /api/v1/payments/:uetr` | **REAL** — Single payment lookup |
| `POST /payments/:uetr/settle` | **REAL** — Settlement with balance updates |
| `POST /payments/:uetr/return` | **STUB** — `TODO: Implement payment return logic`, returns hardcoded 501 |
| `POST /api/v1/messages/pacs.008` | **PARTIAL** — `TODO: Implement full pacs.008 parsing`, basic extraction only |
| `POST /messages/pacs.004` | **STUB** — Returns 501 Not Implemented |

**DB Layer** (`internal/db/`, ~1,030 lines across 4 files): **REAL** — `transaction_repository.go` (412 lines) has full SQL with `pgx`, parameterized queries, `FOR UPDATE` locking, double-entry transaction legs, CockroachDB retry logic. `account_repository.go` (271 lines) with balance operations. `outbox_repository.go` (173 lines) for transactional outbox pattern.

**Service Layer** (`internal/service/payment_service.go`, 542 lines): **REAL** — Sanctions screening, fund reservation with `db.Tx`, idempotency, Kafka event publishing, outbox pattern, OpenTelemetry spans.

**TODOs/Issues:**
- `handlers.go:392` — `TODO: Implement payment return logic`
- `handlers.go:434` — `TODO: Implement full pacs.008 parsing and validation`
- `pacs.004` handler returns 501
- Dockerfile uses named build context for idempotency package (requires `docker buildx`)
- **Zero tests for a payment service — critical gap**

---

### 2. account-service

| Metric | Value |
|--------|-------|
| **Files** | 9 Go files |
| **Lines** | 1,944 |
| **Compiles** | YES |
| **Tests** | **NONE** (0 test files) |
| **Dockerfile** | Multi-stage, HEALTHCHECK, ENTRYPOINT, non-root user |

**Entry Point** (`cmd/server/main.go`, 143 lines): **REAL** — DB pool with custom `PoolConfig` (min/max conns, health check period), Redis cache, idempotency middleware, repos, Gin router with graceful shutdown.

**Routes/Handlers** (`internal/api/handlers.go`, 446 lines):
| Route | Status |
|-------|--------|
| `POST /api/v1/accounts` | **REAL** — Account creation with type/currency validation |
| `GET /api/v1/accounts` | **REAL** — List with status filter |
| `GET /accounts/:id` | **REAL** — Single account lookup |
| `GET /accounts/:id/balance` | **REAL** — Balance query |
| `PATCH /accounts/:id/status` | **REAL** — Status transition with validation |
| `PATCH /accounts/:id/kyc` | **REAL** — KYC update |
| `GET /accounts/:id/audit` | **REAL** — Audit trail query |
| `GET /customers/:customerId/accounts` | **REAL** — Customer account lookup |

**DB Layer** (`internal/db/`, ~592 lines): **REAL** — `account_repository.go` (349 lines) with full CRUD, optimistic locking (version column), `GetForUpdate` with `FOR UPDATE`, balance queries, `RETURNING` clauses. `audit_repository.go` (149 lines) for audit trail entries.

**Service Layer** (`internal/service/account_service.go`, 394 lines): **REAL** — Account lifecycle with Redis caching, audit trail writes, proper error handling, OTel spans.

**TODOs/Issues:**
- **Zero tests — unacceptable for a financial account service**
- No input sanitization beyond Gin binding

---

### 3. auth-service

| Metric | Value |
|--------|-------|
| **Files** | 14 Go files |
| **Lines** | 2,542 |
| **Compiles** | YES |
| **Tests** | **2 test files** (193 lines total) |
| **Dockerfile** | Multi-stage, copies `keys/` dir, HEALTHCHECK, ENTRYPOINT |

**Entry Point** (`cmd/server/main.go`, 158 lines): **REAL** — RSA key pair loading from filesystem, JWT token service, TOTP MFA service, 6 repositories (user, refresh token, MFA, audit, password reset, API key), CORS middleware.

**Routes/Handlers** (`internal/api/handlers.go` 315 lines + `user_handlers.go` 141 lines):
| Route | Status |
|-------|--------|
| `POST /auth/register` | **REAL** — Registration with bcrypt |
| `POST /auth/login` | **REAL** — Login with MFA check |
| `POST /auth/refresh` | **REAL** — Token rotation with family-based revocation |
| `POST /auth/forgot-password` | **REAL** — Token generation |
| `POST /auth/reset-password` | **REAL** — Token validation |
| `POST /mfa/setup,confirm,verify,disable` | **REAL** — Full TOTP MFA flow |
| `GET /users/profile`, `PUT`, `POST /password` | **REAL** — Profile management |
| `GET/POST/DELETE /users/api-keys` | **REAL** — API key CRUD |

**DB Layer** (`internal/db/repositories.go`, 401 lines): **REAL** — Full SQL for users, refresh tokens (family-based tracking for rotation attack detection), MFA records, audit logs, password resets, API keys.

**Service Layer** (`internal/service/auth_service.go`, 612 lines): **REAL** — bcrypt passwords, JWT RS256, TOTP MFA (encrypt/decrypt with AES-GCM), token rotation with family revocation, audit logging. Most complete service in the project.

**Tests:**
- `token_service_test.go` (119 lines): Tests token generation/validation, invalid token, expired token, different user tokens
- `mfa_service_test.go` (74 lines): Tests TOTP generation/validation, invalid key length, backup codes, encrypt/decrypt round-trip
- **Tests are REAL but limited** — no handler tests, no service layer tests, no DB tests

**TODOs/Issues:**
- `config.go:80-81` — **SECURITY: Hardcoded MFA encryption key** `"PLACEHOLDER_32_BYTE_KEY_REPLACE_"` with `TODO: Replace with Vault-backed secret`
- `auth_service.go:188` — `TODO: Send email verification email asynchronously`
- `auth_service.go:377` — `TODO: Send email with reset link containing resetToken`
- RSA keys loaded from filesystem instead of Vault (`pkg/vault` exists but is not wired in)
- `cmd/genkeys/main.go` (49 lines) generates RSA keys — utility tool

---

### 4. notification-service

| Metric | Value |
|--------|-------|
| **Files** | 12 Go files |
| **Lines** | 2,183 |
| **Compiles** | YES |
| **Tests** | **2 test files** (904 lines) — Best tested service |
| **Dockerfile** | Multi-stage, HEALTHCHECK, ENTRYPOINT |

**Entry Point** (`cmd/server/main.go`, 154 lines): **REAL** — Auto-creates DB schema (`EnsureSchema`), Kafka producer, email sender (SMTP or StubSender), CORS.

**Routes/Handlers** (`internal/api/handlers.go`, 190 lines):
| Route | Status |
|-------|--------|
| `POST /api/v1/notifications` | **REAL** — Create notification |
| `GET /api/v1/notifications` | **REAL** — List with pagination/filters |
| `PATCH /notifications/:id/read` | **REAL** — Mark single read |
| `PATCH /notifications/read-all` | **REAL** — Mark all read |
| `GET /preferences` | **REAL** — Get user preferences |
| `PUT /preferences` | **REAL** — Update preferences |

**DB Layer** (`internal/db/repositories.go`, 224 lines): **REAL** — Notification CRUD, preference upsert, paginated queries with filtering, `EnsureSchema` for table auto-creation.

**Service Layer** (`internal/service/notification_service.go`, 231 lines): **REAL** — Interface-based dependency injection (`NotificationRepository`, `PreferenceRepository`, `NotificationPublisher`), email sending via channel preferences.

**Tests:**
- `handlers_test.go` (286 lines): **REAL** — 10+ test cases with mock repos/publishers using interfaces, tests all handler paths
- `notification_service_test.go` (618 lines): **REAL & COMPREHENSIVE** — Function-based mocks implementing interfaces, tests Create/MarkRead/MarkAllRead/GetPreferences/UpdatePreferences with success/failure paths and email channel

**TODOs/Issues:**
- Email sender is a `StubSender` when SMTP is disabled (intentional for dev)
- No integration tests requiring real DB/Kafka

---

### 5. audit-service

| Metric | Value |
|--------|-------|
| **Files** | 5 Go files |
| **Lines** | 687 |
| **Compiles** | YES |
| **Tests** | **NONE** (0 test files in service; standalone `audit/` module has tests) |
| **Dockerfile** | Simple build, curl HEALTHCHECK, ENTRYPOINT |

**Entry Point** (`cmd/server/main.go`, 64 lines): **REAL but minimal** — No observability init, hardcoded `gin.ReleaseMode`, auto-creates audit table.

**Routes/Handlers** (`internal/api/handlers.go`, 179 lines):
| Route | Status |
|-------|--------|
| `POST /api/v1/audit/bundles` | **REAL** — Create signed bundle |
| `GET /audit/bundles` | **REAL** — List bundles |
| `GET /audit/bundles/:id` | **REAL** — Get bundle by ID |
| `GET /audit/bundles/:id/verify` | **REAL** — Verify bundle integrity |
| `GET /audit/bundles/:id/download` | **REAL** — Download as JSON |
| `GET /audit/bundles/reference/:type/:refId` | **REAL** — Lookup by reference |

**Service Layer** (`internal/audit/service.go`, 397 lines): **REAL** — Ed25519 signing, SHA-256 evidence hashing, bundle generation from live DB queries, verification with recomputed hash comparison.

**TODOs/Issues:**
- No observability/tracing (other services have it)
- Hardcoded `gin.ReleaseMode` without env config

---

### 6. reconciliation-service

| Metric | Value |
|--------|-------|
| **Files** | 10 Go files |
| **Lines** | 1,587 |
| **Compiles** | YES |
| **Tests** | **NONE** (0 test files) |
| **Dockerfile** | Multi-stage with idempotency build context |

**Entry Point** (`cmd/server/main.go`, 136 lines): **REAL** — Cron-based scheduler with configurable schedule, reconciliation engine, idempotency middleware.

**Routes/Handlers** (`internal/api/handlers.go`, 131 lines):
| Route | Status |
|-------|--------|
| `POST /api/v1/reconciliation/run` | **REAL** — Trigger manual reconciliation |
| `GET /reconciliation/cycles` | **STUB** — Returns empty array, `_ = start; _ = end` |
| `GET /reconciliation/cycles/:id` | **REAL** — Get cycle by ID |
| `GET /reconciliation/cycles/:id/discrepancies` | **REAL** — Get discrepancies |
| `POST /discrepancies/:id/resolve` | **REAL** — Resolve discrepancy |

**Engine** (`internal/reconciler/engine.go`, 368 lines): **REAL** — 3-way matching (transaction record vs legs, debits vs credits, account balance verification), auto-resolution for rounding differences < $0.01, discrepancy tracking with severity.

**Scheduler** (`internal/scheduler/scheduler.go`, 99 lines): **MOSTLY REAL** — Uses `robfig/cron/v3` for daily and real-time schedules. However, `runRealTimeReconciliation()` is **STUBBED**: `_ = ctx; _ = startTime; _ = endTime` with a comment about production implementation.

**TODOs/Issues:**
- `getCycles` handler is stubbed
- `runRealTimeReconciliation` is stubbed
- **Zero tests for a financial reconciliation engine — critical gap**

---

### 7. ws-gateway

| Metric | Value |
|--------|-------|
| **Files** | 5 Go files |
| **Lines** | 829 |
| **Compiles** | YES |
| **Tests** | **NONE** (0 test files) |
| **Dockerfile** | Multi-stage, copies `keys/` dir |

**Entry Point** (`cmd/server/main.go`, 72 lines): **REAL** — Hub pattern, Kafka consumer for 8 topics, JWT auth from RSA public key.

**Routes/Handlers** (`internal/api/handlers.go`, 284 lines): **REAL** — WebSocket upgrade with JWT auth, read/write pumps with ping/pong, Prometheus metrics (active connections gauge, messages counter), subscribe/unsubscribe commands.

**Hub** (`internal/hub/hub.go`, 211 lines): **REAL** — Client registry with user indexing (multiple connections per user), subscription matching with wildcards, concurrent-safe with `sync.RWMutex`.

**Kafka Consumer** (`internal/kafka/consumer.go`, 149 lines): **REAL** — Per-topic readers, topic-to-WebSocket-type mapping (8 topic types), JSON validation, graceful shutdown.

**TODOs/Issues:**
- No reconnection logic for Kafka
- No message persistence (if client disconnects, messages are lost)
- No rate limiting on WebSocket connections

---

### 8. analytics-service

| Metric | Value |
|--------|-------|
| **Files** | 5 Go files |
| **Lines** | 478 |
| **Compiles** | YES |
| **Tests** | **NONE** (0 test files) |
| **Dockerfile** | Standard pattern |

**Entry Point** (`cmd/server/main.go`, 57 lines): **REAL but minimal** — Similar to audit-service. No observability.

**Routes/Handlers** (`internal/api/handlers.go`, 94 lines):
| Route | Status |
|-------|--------|
| `GET /api/v1/analytics/summary` | **REAL** |
| `GET /analytics/volume` | **REAL** |
| `GET /analytics/performance` | **REAL** |
| `GET /analytics/trends` | **REAL** |

**Service Layer** (`internal/analytics/service.go`, 280 lines): **REAL** — Actual SQL analytics queries: aggregate transaction stats, time-series volume with `date_trunc`, P95/P99 percentiles using `percentile_cont`, throughput calculations, currency/status breakdowns, trend comparisons.

**TODOs/Issues:**
- Reads from `transactions` and `accounts` tables directly (cross-service DB access, no dedicated analytics schema)
- No caching for expensive aggregate queries
- Config file is only 18 lines (minimal)

---

## Part 2: Standalone Modules

---

### audit/ (3 files, 1,712 lines) — COMPILES

| File | Lines | Description |
|------|-------|-------------|
| `audit_bundle_signer.go` | 665 | **REAL** — Complete domain types (Amount, Direction, TransactionStatus, RequestType), AuditBundle with Evidence, Integrity (SHA-256), Ed25519 Signatures, BalanceProofs with merkle root computation, BundleBuilder pattern, FX details, counterparty info |
| `audit_verifier.go` | 552 | **REAL** — 8-check verification pipeline: schema validation, Ed25519 signature, evidence hash, hash chain, merkle root, balance invariant, temporal consistency, balance proofs |
| `audit_test.go` | 495 | **REAL** — Tests: create bundle with balanced double-entry, verify bundle with trusted key, detect tampering (modified transactions invalidate signature), JSON serialization round-trip |

**Verdict:** Production-quality cryptographic audit module. Standalone from the audit-service (which has simpler logic).

---

### proofs/ (2 files, 1,060 lines) — DOES NOT COMPILE

| File | Lines | Description |
|------|-------|-------------|
| `invariant_guard.go` | 427 | Runtime enforcement of ledger invariants with Ed25519-signed violations, settlement halt on critical violations, Prometheus metrics |
| `property_tests_test.go` | 633 | Property-based tests using `pgregory.net/rapid` for all invariants: conservation of value, double-entry closure, balance derivation, idempotency, currency homogeneity, FX rate bounds, overflow prevention, hash chain |

**COMPILATION ERROR:** `invariant_guard.go` references types (`Ledger`, `Transaction`, `Amount`, `InvariantViolation`) that are **only defined in the test file** (`property_tests_test.go`). These types need to be extracted to a separate non-test `.go` file. This is a structural bug.

**Verdict:** Impressive formal verification code, but broken build. The invariant checks themselves (INV-1 through INV-16) are real and mathematically sound.

---

### replay/ (2 files, 890 lines) — COMPILES

| File | Lines | Description |
|------|-------|-------------|
| `engine.go` | 475 | **REAL** — Event-sourced replay engine: ingest Kafka events, replay to arbitrary timestamp, snapshot-based optimization, regulator replay with step-by-step running balances, SHA-256 hash chain, state comparison (diff) between live and replayed, tamper-evident export with verification hash |
| `engine_test.go` | 415 | **REAL** — Tests: basic credit/debit replay, point-in-time replay at multiple timestamps, hash chain determinism (two engines produce identical hashes), regulator replay with opening/closing balance verification, tamper detection, state comparison with discrepancy detection |

**Verdict:** Production-quality audit/compliance module. One of the strongest modules in the project.

---

### libs/iso20022/ (2 files, 634 lines) — COMPILES

| File | Lines | Description |
|------|-------|-------------|
| `messages.go` | 335 | **REAL** — ISO 20022 pacs.008 (FI-to-FI Credit Transfer) and pacs.004 (Return) message types, with full nested structures: UETR, Amount (shopspring/decimal), Party, PostalAddress, FinancialInstitution, RemittanceInformation, ClearingSystem |
| `validation.go` | 299 | **REAL** — Comprehensive validator: pacs.008 and pacs.004 validation, field-level errors with codes, UETR format (UUID v4), IBAN check digit (mod 97), BIC format regex, ISO 4217 currency, max amount bounds, message ID length |

**Verdict:** Real ISO 20022 implementation. Not a full library but covers the critical pacs domain messages.

---

### pkg/idempotency/ (2 files, 684 lines) — COMPILES

| File | Lines | Description |
|------|-------|-------------|
| `middleware.go` | 371 | **REAL, PRODUCTION-QUALITY** — Redis-backed Gin middleware: SHA-256 request fingerprinting, distributed locking via `SETNX`, exponential backoff for concurrent requests, Prometheus metrics (hits/misses/collisions/lock wait time), safe header filtering, response recording/replay |
| `middleware_test.go` | 313 | **REAL** — Integration tests (require Redis): same-key-same-response, different-body-same-key returns 409, concurrent requests with only-one-execution guarantee |

**Wired into:** payment-service, account-service, reconciliation-service (via `replace` directives in go.mod)

**Verdict:** Production-ready shared middleware. One of the most polished components.

---

### pkg/multitenancy/ (2 files, 319 lines) — COMPILES

| File | Lines | Description |
|------|-------|-------------|
| `middleware.go` | 153 | **REAL** — Extracts `tenant_id` from JWT claims, `X-Tenant-ID` header, or Gin context; supports `RequireTenantID` enforcement, configurable skip paths, cross-tenant validation |
| `middleware_test.go` | 166 | **REAL** — Unit tests: JWT claim extraction, header extraction, default tenant, required tenant rejection, skip paths, `ValidateTenantAccess`, `FromContext` |

**Wired into:** **NOTHING** — No service currently uses this middleware.

**Verdict:** Ready for integration but unused. The services currently have no multi-tenancy.

---

### pkg/vault/ (3 files, 618 lines) — COMPILES

| File | Lines | Description |
|------|-------|-------------|
| `client.go` | 264 | **REAL** — HashiCorp Vault client with AppRole auth, token renewal goroutine, credential retrieval for DB/Kafka/Redis, TLS configuration |
| `key_provider.go` | 254 | **REAL** — RSA key pair management from Vault KV v2, in-memory caching with configurable refresh interval, Prometheus metrics (cache hits, fetch duration) |
| `token_service.go` | 100 | **REAL** — Vault-backed JWT token service with hot key rotation support |

**Wired into:** **NOTHING** — Auth-service loads keys from filesystem; MFA encryption key is hardcoded. This entire module is unused.

**Verdict:** Well-built Vault integration that should be wired in but isn't. Security gap.

---

## Part 3: Additional Code

### tests/ (4 files, 1,162 lines)
- `e2e/payment_flow_test.go` (298 lines): End-to-end payment flow test hitting real HTTP endpoints
- `exactly_once_test.go` (314 lines): Tests exactly-once delivery guarantees
- `chaos/chaos_engine.go` (390 lines): Chaos testing engine (kill processes, inject latency, partition networks)
- `chaos/cmd/runner/main.go` (160 lines): CLI for chaos tests

### security/ (2 files, 677 lines)
- `cert_rotation.go` (449 lines): mTLS certificate rotation manager
- `cert_rotation_test.go` (228 lines): Tests for cert rotation

---

## Part 4: Cross-Cutting Analysis

### Test Coverage Summary

| Service | Test Files | Test Lines | Verdict |
|---------|-----------|------------|---------|
| payment-service | 0 | 0 | **CRITICAL GAP** |
| account-service | 0 | 0 | **CRITICAL GAP** |
| auth-service | 2 | 193 | Minimal (auth utils only) |
| notification-service | 2 | 904 | **GOOD** (best tested) |
| audit-service | 0 | 0 | Gap (standalone module tested) |
| reconciliation-service | 0 | 0 | **CRITICAL GAP** |
| ws-gateway | 0 | 0 | Gap |
| analytics-service | 0 | 0 | Gap |

Total test lines in services: **1,097 out of 13,249 service lines = 8.3% test ratio**

Standalone module tests are better: audit (495 lines), proofs (633 lines), replay (415 lines), idempotency (313 lines), multitenancy (166 lines) = 2,022 test lines.

### Hardcoded Values / Security Issues

| Location | Issue | Severity |
|----------|-------|----------|
| auth-service `config.go:81` | MFA encryption key `"PLACEHOLDER_32_BYTE_KEY_REPLACE_"` | **CRITICAL** |
| auth-service `main.go` | RSA keys from filesystem, not Vault | HIGH |
| ws-gateway `main.go` | RSA keys from filesystem | HIGH |
| audit-service `main.go` | Hardcoded `gin.ReleaseMode` | LOW |
| pkg/vault | Vault module exists but is not wired into any service | HIGH |
| pkg/multitenancy | Multitenancy middleware unused | MEDIUM |

### Stubs and Incomplete Implementations

| Location | What's Stubbed |
|----------|---------------|
| payment-service `handlers.go:392` | Payment return endpoint (501) |
| payment-service `handlers.go:434` | pacs.008 full parsing |
| payment-service `handlers.go` | pacs.004 endpoint (501) |
| reconciliation-service `handlers.go:78-79` | `getCycles` returns empty array |
| reconciliation-service `scheduler.go:107-109` | Real-time reconciliation is no-op |
| auth-service `auth_service.go:188` | Email verification not sent |
| auth-service `auth_service.go:377` | Password reset email not sent |
| notification-service | Email sender is stub when SMTP disabled (intentional) |

### Architecture Patterns (Consistent Across Services)

- **Web Framework:** Gin (all 8 services)
- **Database:** CockroachDB via pgx/v5 (all services with DB)
- **Messaging:** Kafka via segmentio/kafka-go
- **Caching:** Redis via go-redis/v9
- **Tracing:** OpenTelemetry with Jaeger exporter (6 of 8 services)
- **Logging:** Uber's zap (all services)
- **Metrics:** Prometheus client_golang
- **Config:** Viper with env var binding
- **Module path:** `github.com/nexus-rtp/{service-name}`
- **Shared packages:** via `replace` directives (not published modules)

### Compilation Summary

| Module | Compiles | Notes |
|--------|----------|-------|
| payment-service | YES | |
| account-service | YES | |
| auth-service | YES | |
| notification-service | YES | |
| audit-service | YES | |
| reconciliation-service | YES | |
| ws-gateway | YES | |
| analytics-service | YES | |
| audit/ | YES | |
| **proofs/** | **NO** | Types defined in `_test.go` referenced by non-test file |
| replay/ | YES | |
| libs/iso20022/ | YES | |
| pkg/idempotency/ | YES | |
| pkg/multitenancy/ | YES | |
| pkg/vault/ | YES | |

### What's Genuinely Impressive

1. **Double-entry ledger** with transaction legs, `FOR UPDATE` locking, CockroachDB retry logic
2. **Idempotency middleware** with distributed Redis locking and Prometheus metrics
3. **Audit bundle system** with Ed25519 signatures, SHA-256 hash chains, merkle roots
4. **Replay engine** with point-in-time reconstruction and tamper-evident exports
5. **Property-based invariant tests** using `rapid` for formal ledger correctness
6. **3-way reconciliation engine** with auto-resolution for rounding differences
7. **ISO 20022 message types** with field-level validation (IBAN, BIC, UETR)
8. **Auth system** with TOTP MFA, token family rotation (revocation on reuse), bcrypt

### What Needs Immediate Attention

1. **Tests**: 6/8 services have zero tests. The payment-service (core business) and reconciliation-service (financial integrity) having no tests is a production blocker.
2. **proofs/ build failure**: Simple fix — extract `Ledger`, `Transaction`, `Amount`, `InvariantViolation` types from `property_tests_test.go` to a new `types.go` file.
3. **Hardcoded MFA key**: The `PLACEHOLDER_32_BYTE_KEY_REPLACE_` string in auth-service config is a security vulnerability.
4. **Vault integration**: `pkg/vault/` exists with full Vault client but no service uses it. Keys are loaded from filesystem.
5. **Stubbed endpoints**: Payment returns (pacs.004), real-time reconciliation, and email sending are incomplete.
6. **Cross-service DB access**: analytics-service reads `transactions` and `accounts` tables directly — breaks service boundaries.

---

## File-by-File Line Count (All 71 Service Go Files)

### payment-service (11 files, 2,999 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 162 |
| internal/api/handlers.go | 462 |
| internal/config/config.go | 80 |
| internal/db/account_repository.go | 271 |
| internal/db/outbox_repository.go | 173 |
| internal/db/pool.go | 115 |
| internal/db/transaction_repository.go | 412 |
| internal/kafka/producer.go | 212 |
| internal/observability/observability.go | 293 |
| internal/sanctions/client.go | 277 |
| internal/service/payment_service.go | 542 |

### account-service (9 files, 1,944 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 143 |
| internal/api/handlers.go | 446 |
| internal/cache/cache.go | 119 |
| internal/config/config.go | 80 |
| internal/db/account_repository.go | 349 |
| internal/db/audit_repository.go | 149 |
| internal/db/pool.go | 94 |
| internal/observability/observability.go | 170 |
| internal/service/account_service.go | 394 |

### auth-service (14 files, 2,542 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 158 |
| cmd/genkeys/main.go | 49 |
| internal/api/handlers.go | 315 |
| internal/api/user_handlers.go | 141 |
| internal/auth/mfa_service.go | 103 |
| internal/auth/mfa_service_test.go | 74 |
| internal/auth/token_service.go | 196 |
| internal/auth/token_service_test.go | 119 |
| internal/config/config.go | 103 |
| internal/db/pool.go | 79 |
| internal/db/repositories.go | 401 |
| internal/models/models.go | 82 |
| internal/observability/observability.go | 110 |
| internal/service/auth_service.go | 612 |

### notification-service (12 files, 2,183 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 154 |
| internal/api/handlers.go | 190 |
| internal/api/handlers_test.go | 286 |
| internal/config/config.go | 64 |
| internal/db/pool.go | 79 |
| internal/db/repositories.go | 224 |
| internal/email/sender.go | 69 |
| internal/kafka/producer.go | 85 |
| internal/models/models.go | 65 |
| internal/observability/observability.go | 118 |
| internal/service/notification_service.go | 231 |
| internal/service/notification_service_test.go | 618 |

### audit-service (5 files, 687 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 64 |
| internal/api/handlers.go | 179 |
| internal/audit/service.go | 397 |
| internal/config/config.go | 18 |
| internal/db/pool.go | 29 |

### reconciliation-service (10 files, 1,587 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 136 |
| internal/api/handlers.go | 131 |
| internal/config/config.go | 100 |
| internal/db/account_repository.go | 130 |
| internal/db/pool.go | 74 |
| internal/db/reconciliation_repository.go | 205 |
| internal/db/transaction_repository.go | 194 |
| internal/observability/observability.go | 150 |
| internal/reconciler/engine.go | 368 |
| internal/scheduler/scheduler.go | 99 |

### ws-gateway (5 files, 829 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 72 |
| internal/api/handlers.go | 284 |
| internal/config/config.go | 113 |
| internal/hub/hub.go | 211 |
| internal/kafka/consumer.go | 149 |

### analytics-service (5 files, 478 lines)
| File | Lines |
|------|-------|
| cmd/server/main.go | 57 |
| internal/api/handlers.go | 94 |
| internal/analytics/service.go | 280 |
| internal/config/config.go | 18 |
| internal/db/pool.go | 29 |

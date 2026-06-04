# Frontend Core Pages Hardening Report - 2026-06-04

## Scope

Hardened the dashboard Accounts and Reconciliation routes after live browser validation reproduced client-side exceptions at:

- `http://localhost:3001/dashboard/accounts`
- `http://localhost:3001/dashboard/reconciliation`

This slice also fixed local Docker stack startup blockers that prevented reliable end-to-end validation.

## Findings

### Accounts Page Crash

The account service returned live payloads in this shape:

- list array under `accounts`
- account type under `accountType`
- balances as decimal strings
- pending amounts as `pendingDebits` / `pendingCredits`
- account display name sometimes under `metadata.name`

The web app expected a `PaginatedResponse<Account>` with `data`, `items`, `type`, numeric `balance`, numeric `availableBalance`, and numeric `pendingBalance`. Because the page received records without the expected normalized fields, badge rendering crashed while reading badge configuration.

### Reconciliation Page Crash

The reconciliation service returned:

- list array under `cycles`

The web app expected `data`. The page accessed `data.data.length`, `data.data.filter`, and `data.data.map`, which caused the client-side exception when the live payload had no `data` array.

### Local Stack Startup Risk

The Docker stack initially conflicted with unrelated local services on host ports:

- Redis host port `6379`
- Kafka host port `9092`

Kafka also had a health check pointed at the host-facing listener instead of the internal broker listener.

## Changes Implemented

### Frontend Data Normalization

Added adapter-level response normalization in React Query hooks:

- `useAccounts` now accepts `data`, `items`, or `accounts`.
- Account records now normalize `accountType` to `type`.
- Decimal string balances normalize to numbers.
- `pendingDebits` / `pendingCredits` normalize into `pendingBalance`.
- Account display names fall back through `name`, `metadata.name`, and account identifiers.
- Pagination metadata is rebuilt consistently when the backend uses `limit`, `offset`, `total`, or partial pagination data.

Added equivalent normalization for reconciliation:

- `useReconciliationCycles` now accepts `data`, `items`, or `cycles`.
- Cycle records normalize `accountIds`, date fields, transaction counters, discrepancy counters, and match rate.
- Pagination metadata is rebuilt consistently.

### Defensive Rendering

Updated Accounts and Reconciliation pages to:

- Render from stable local arrays instead of repeatedly dereferencing `data?.data`.
- Use fallback badge labels/icons for unexpected enum values.
- Avoid `.length`, `.filter`, and `.map` on undefined arrays.
- Avoid account count rendering unless the cycle account list is an actual array.

### Docker Validation Resilience

Updated local host port bindings:

- Kafka host ports now default to `19092`, `19095`, `19096`.
- Redis host port now defaults to `16379`.
- Kafka internal health check now probes `kafka-1:29092`.

Internal Docker service addresses remain unchanged, so application service-to-service behavior is preserved.

## Validation

Passed:

- `docker compose -f infra\docker\docker-compose.yml config --quiet`
- `pnpm --filter @nexus/web type-check`
- `pnpm --filter @nexus/web test -- src/lib/hooks/__tests__/use-accounts.test.tsx src/lib/hooks/__tests__/use-reconciliation.test.tsx`
- `docker compose -f infra\docker\docker-compose.yml --profile frontend up -d --build frontend`

Focused hook test result:

- 2 test files passed
- 34 tests passed

Service health after stack startup:

- `http://localhost:8085/health -> 200`
- `http://localhost:8086/health -> 200`
- `http://localhost:8087/health -> 200`
- `http://localhost:8088/health -> 200`
- `http://localhost:8089/health -> 200`
- `http://localhost:8092/health -> 200`
- `http://localhost:8091/health -> 200`
- `http://localhost:8093/health -> 200`
- `http://localhost:8001/status -> 200`
- `http://localhost:3001 -> 200`

Browser validation after rebuild:

- `/dashboard/accounts`
  - HTTP 200
  - heading rendered as `Accounts`
  - application error banner count: `0`
  - page errors: `[]`

- `/dashboard/reconciliation`
  - HTTP 200
  - heading rendered as `Reconciliation`
  - application error banner count: `0`
  - page errors: `[]`

Screenshots:

- `C:\tmp\nexus-dashboard-accounts-fixed.png`
- `C:\tmp\nexus-dashboard-reconciliation-fixed.png`

## Residual Risk

The Accounts route still emits intermittent NextAuth client fetch console errors during navigation. Request tracing showed the session endpoint returns successful `200` responses before and after, while several in-flight `/api/auth/session` requests are aborted with `net::ERR_ABORTED` during route transition. This no longer blocks rendering and is separate from the fixed page exceptions, but it should be cleaned up in the next frontend reliability pass.

## Next Recommended Priority

Continue with frontend reliability by cleaning up the NextAuth session fetch abort noise and then harden `/dashboard/accounts/[id]`, `/dashboard/reconciliation/[id]`, and `/dashboard/reconciliation/new`, because searches already show similar assumptions around account and reconciliation response shapes on those pages.

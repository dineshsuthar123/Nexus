# E2E Validation Report - 2026-06-03

## Executive Summary

The platform is now running end to end locally across Docker services, Kong, CockroachDB, and the Next.js frontend. Payment create/read/cancel works through Kong, auth register/login works through Kong, and an authenticated browser session reaches the dashboard with live dashboard API calls returning 200.

This is not yet Stripe/Razorpay-grade. The main remaining gaps are frontend lint/type hygiene, duplicate database table surfaces, gateway DNS resiliency after service rebuilds, hardcoded development secrets, and incomplete production-grade reliability/performance gates.

## Changes Implemented In This Slice

- Split frontend API routing into browser and server-side URLs:
  - Browser: `NEXT_PUBLIC_API_URL=http://localhost:8000`
  - NextAuth server-side: `API_INTERNAL_URL=http://kong:8000`
- Added `getServerBaseUrl()` and moved NextAuth login/refresh calls to the internal base URL.
- Added routed dashboard health endpoint: `GET /api/v1/analytics/health`.
- Updated dashboard health hook to use `/api/v1/analytics/health` instead of unrouted `/api/v1/health`.
- Added missing static frontend routes: `/docs`, `/help`, `/privacy`, `/terms`.
- Removed hardcoded missing `/avatars/user.jpg` references and used existing avatar fallbacks.
- Fixed landing page CTA/link layout where arrow icons were rendering outside buttons.
- Cleaned auth footer copyright rendering.

## Validation Performed

### Service Health

All checked services returned HTTP 200:

- `payment-service`: `http://localhost:8085/health`
- `account-service`: `http://localhost:8086/health`
- `reconciliation-service`: `http://localhost:8087/health`
- `auth-service`: `http://localhost:8088/health`
- `ws-gateway`: `http://localhost:8089/health`
- `notification-service`: `http://localhost:8092/health`
- `audit-service`: `http://localhost:8091/health`
- `analytics-service`: `http://localhost:8093/health`
- Kong admin status: `http://localhost:8001/status`
- Frontend: `http://localhost:3001`

### Payment E2E Through Kong

`POST /api/v1/payments` through Kong succeeded:

- Created payment: `status=CLEARED`, `sanctions=CLEAR`, `processingMs=187`
- Readback succeeded: `status=CLEARED`, `amount=7.77`
- Cancel succeeded: `status=CANCELLED`

### Auth E2E Through Kong And Browser

- API registration through Kong succeeded.
- API login through Kong succeeded and returned access token data.
- Browser login through NextAuth succeeded and reached `http://localhost:3001/dashboard`.
- Authenticated dashboard loaded live data through Kong:
  - `/api/v1/analytics/summary`: 200
  - `/api/v1/analytics/volume`: 200
  - `/api/v1/analytics/performance`: 200
  - `/api/v1/analytics/health`: 200
  - `/api/v1/payments`: 200

### Frontend Route And Browser Checks

Playwright browser checks passed for:

- `/`
- `/auth/login`
- `/auth/register`
- `/dashboard` redirect when unauthenticated
- `/docs`
- `/privacy`
- `/terms`
- `/help`

Final browser probe reported no failed 4xx/5xx resource responses after fixes.

### Test And Build Checks

- `go test ./services/analytics-service/...`: passed.
- `pnpm --filter @nexus/web type-check`: passed.
- `pnpm --filter @nexus/web test -- src/lib/api/__tests__/client.test.ts src/__tests__/contract.test.ts`: 74 tests passed.
- Docker frontend production build passed.
- Docker analytics-service build passed.
- `docker compose -f infra/docker/docker-compose.yml config --quiet`: passed.

## Important Remaining Gaps

1. Frontend lint debt remains high.
   The production build passes, but emits many warnings for unused imports, unused variables, `any` usage, and hook dependency issues. This should be turned into a zero-warning policy before serious release work.

2. Database schema has duplicate active-looking table surfaces.
   The database contains both singular and plural tables, for example `transaction`/`transactions` and `transaction_leg`/`transaction_legs`. Payment writes are going to the singular `transaction` table, while plural `transactions` remains empty. This needs a migration/schema ownership cleanup to avoid future analytics, reconciliation, or reporting bugs.

3. Kong can cache stale service container IPs after rebuild.
   After rebuilding analytics-service, Kong routed to an old container IP until Kong was restarted. This is a local infrastructure reliability issue. The dev stack should configure Kong DNS behavior or use explicit upstream targets that refresh safely.

4. Dashboard health endpoint is currently shallow.
   `/api/v1/analytics/health` returns the frontend contract and proves routing works, but latency values are placeholders. It should measure real CockroachDB, Kafka, Redis, and service dependency probes.

5. Frontend design is usable but not yet category-leading.
   The dashboard now renders and the landing CTA bug is fixed, but there are still visual/system polish issues: inconsistent page density, some marketing-style areas, and card-heavy dashboard sections that need a deliberate product design pass.

6. Development secrets and local-only assumptions remain.
   `NEXTAUTH_SECRET` and local URLs are development defaults. Production deployment needs managed secrets, HTTPS-only cookies, strict CORS origins, environment-specific API URLs, and a hard secret-rotation story.

7. Performance claims are not yet proven.
   Payment smoke latency is sub-second locally, but there is no current sustained benchmark in this report proving Stripe/Razorpay-level throughput, p95/p99 latency, fault tolerance, or saturation behavior.

## Recommended Next Priority

1. Make Kong DNS/upstream behavior resilient after service rebuilds.
2. Clean the frontend lint debt enough to enforce warning-free builds.
3. Consolidate singular/plural database tables and update analytics/reconciliation contracts.
4. Add real dependency checks to `/api/v1/analytics/health`.
5. Run a controlled load test through Kong with p50/p95/p99 latency, error rate, throughput, DB pool, Kafka lag, and CPU/memory metrics captured.

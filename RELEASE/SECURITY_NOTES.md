# Security Notes — Release Incident & Remediation

## Incident: Hardcoded Mock Credentials in Repository

**Date detected:** 2026-02-17
**Severity:** Medium (mock/dev-only credentials, never used in production)
**Detection method:** GitGuardian automated scan on PR

### Summary

GitGuardian flagged hardcoded password values in the following files:

| File | Value | Risk | Status |
|------|-------|------|--------|
| `frontend/dev-mock/server.js` | Mock passwords (removed) | Mock server credential stored in code | **FIXED** — passwords removed, accepts any non-empty password |
| `frontend/apps/web/e2e/fixtures/auth.ts` | Test fixtures | E2E test fixture | **FIXED** — uses `process.env.E2E_TEST_PASSWORD \|\| '__MOCK_PASSWORD__'` |
| `frontend/apps/web/src/components/__tests__/login-form.test.tsx` | Test input values | Unit test mock data | **FIXED** — replaced with `MOCK_PASSWORD` constant |
| `frontend/apps/web/src/lib/hooks/__tests__/use-auth.test.tsx` | Test input values | Unit test mock data | **FIXED** — replaced with `MOCK_PASSWORD` constant |
| `frontend/apps/web/e2e/auth.spec.ts` | E2E test passwords | E2E test input | **FIXED** — replaced with env-var backed constant |
| `frontend/apps/web/e2e/auth.a11y.spec.ts` | A11y test password | A11y test input | **FIXED** — replaced with env-var backed constant |
| `scripts/staging-smoke-test.sh` | Smoke test passwords | Smoke test inline passwords | **FIXED** — uses `${SMOKE_TEST_PASSWORD:-__MOCK_PASSWORD__}` |
| `infra/docker/docker-compose.yml` | Grafana dev setup password | Development config | **FIXED** — uses env variable reference |
| `infra/helm/nexus-platform/values.yaml` | Grafana admin password | Helm default values | **FIXED** — cleared, must be set via `--set` or Vault |
| `infra/helm/nexus-platform/values.staging.yaml` | Grafana staging password | Helm staging values | **FIXED** — cleared, must be set via `--set` or Vault |

### Remediation Actions Taken

1. **`frontend/dev-mock/server.js`** — Removed `password` fields from `MOCK_USERS` entirely. Mock login now accepts any non-empty password (dev-only behavior).

2. **`frontend/apps/web/e2e/fixtures/auth.ts`** — Replaced hardcoded passwords with `process.env.E2E_TEST_PASSWORD || '__MOCK_PASSWORD__'`. Real test passwords should be injected via CI secret `E2E_TEST_PASSWORD`.

3. **`scripts/staging-smoke-test.sh`** — Replaced inline passwords with `${SMOKE_TEST_PASSWORD:-__MOCK_PASSWORD__}` environment variable references.

4. **`infra/docker/docker-compose.yml`** — Changed Grafana admin credentials to use environment variables `${GF_ADMIN_USER:-admin}` and `${GF_ADMIN_PASSWORD:-changeme}`.

### Credential Rotation

- **Mock server passwords:** No rotation needed — these were never used in staging/production. The mock server is strictly for local development.
- **Grafana admin:** If `nexus123` was used in any deployed environment, rotate the Grafana admin password via the Grafana API or environment variable override.
- **Smoke test passwords:** If `SmokeTest123!` or `SystemTest123!` were registered in staging, reset those accounts or rotate passwords.

### Git History

The credentials existed in git history. If GitGuardian continues to flag after the fix commit:
- Use `git filter-repo` or BFG Repo Cleaner to purge from history
- Coordinate force-push with all contributors
- Ensure all downstream clones rebase

### Prevention

- All future credentials must be stored in Vault, `.env.local` (gitignored), or CI secret variables.
- GitGuardian and gitleaks scans run on every PR.
- See `security/KEY_ROTATION.md` for rotation procedures.
- See `COMPLIANCE/KEY_MANAGEMENT_POLICY.md` for credential management policy.

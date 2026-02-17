# Change Control Procedure — Nexus RTP Platform

**Document Owner:** Engineering
**Last Updated:** 2025-01-15
**Classification:** Internal

---

## 1. Purpose

Defines the change management process for all modifications to production systems,
satisfying PCI-DSS Requirement 6.4 and SOC 2 CC8.1. All changes follow a documented,
reviewable process with rollback capability.

## 2. Change Categories

| Category | Description | Approval | Lead Time | Examples |
|----------|-------------|----------|-----------|----------|
| **Standard** | Pre-approved, low-risk | Auto (CI) | 0–1 day | Dependency bump, docs |
| **Normal** | Feature/bugfix | 1 reviewer + CI | 1–3 days | New endpoint, schema change |
| **Significant** | Architecture change | 2 reviewers + lead | 3–5 days | New service, DB migration |
| **Emergency** | Hotfix for P0 incident | 1 reviewer (post-hoc) | < 1 hour | Security patch, data fix |

## 3. Change Request Workflow

```
Developer → Branch → Code → PR → Review → CI → Merge → Deploy
    │           │        │      │      │       │       │       │
    │           │        │      │      │       │       │       └─ Canary → Promote
    │           │        │      │      │       │       └─ Helm release
    │           │        │      │      │       └─ All gates pass
    │           │        │      │      └─ Approval from required reviewers
    │           │        │      └─ PR template filled (description, test plan, rollback)
    │           │        └─ Unit + integration tests
    │           └─ Feature branch from main
    └─ Ticket created in issue tracker
```

## 4. PR Template (Required Fields)

```markdown
## Summary
<!-- What changes and why -->

## Type
- [ ] Feature
- [ ] Bugfix
- [ ] Schema migration
- [ ] Infrastructure change
- [ ] Security patch

## Risk Assessment
- [ ] Low (no data model changes, backward compatible)
- [ ] Medium (new API endpoint, config change)
- [ ] High (schema migration, encryption change, auth change)

## Test Plan
<!-- How was this tested? -->
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Load test results (if applicable)

## Rollback Plan
<!-- How to revert if issues are found -->

## Security Checklist
- [ ] No secrets in code
- [ ] Input validation added
- [ ] Auth/authz verified
- [ ] PII/PAN handling reviewed

## Database Changes
- [ ] Migration is backward compatible
- [ ] Migration tested with restore
- [ ] No data loss risk
```

## 5. CI Pipeline Gates

Every PR must pass ALL gates before merge:

| Gate | Tool | Threshold |
|------|------|-----------|
| Unit tests | `go test` | 100% pass |
| Integration tests | `go test -tags=integration` | 100% pass |
| Coverage | `go test -cover` | ≥ 80% |
| Linting | `golangci-lint` | 0 errors |
| SAST | Semgrep / gosec | 0 High/Critical |
| Dependency scan | `govulncheck` | 0 Critical |
| Container scan | Trivy | 0 Critical |
| Secret detection | trufflehog | 0 findings |
| API contract | OpenAPI diff | No breaking changes |

## 6. Database Migration Rules

1. All migrations MUST be idempotent (use `IF NOT EXISTS`, `IF EXISTS`)
2. Migrations run as pre-upgrade Helm hook (see `templates/migrations-job.yaml`)
3. Schema changes MUST be backward compatible (add columns, not remove)
4. Destructive changes require 2-phase approach:
   - Phase 1: Add new column/table, dual-write
   - Phase 2: Migrate data, switch reads
   - Phase 3: Remove old column/table (next release)
5. All migrations tested against backup restore

## 7. Deployment Process

### 7.1 Standard Deployment (Canary)
1. Merge PR to `main`
2. CI builds images, pushes to registry
3. Deploy canary (5% traffic) via Helm
4. Automated health gate (5 min): error rate < 1%, P99 < 500ms
5. Promote to 25% traffic
6. Health gate (10 min)
7. Promote to 100%

### 7.2 Emergency Deployment
1. Hotfix branch from latest release tag
2. Minimal review (1 reviewer)
3. Direct deployment (skip canary if P0 security fix)
4. Post-incident review within 48 hours
5. Backport fix to `main`

## 8. Rollback Criteria

Automatic rollback triggers:
- Error rate > 5% (canary)
- P99 latency > 2x baseline
- Health check failures > 3 consecutive
- Panic/crash loop detected

Manual rollback:
```bash
helm rollback nexus-platform -n nexus
```

## 9. Change Log

All changes tracked via:
- Git commit history (immutable)
- Helm release history (`helm history nexus-platform`)
- CockroachDB migration table (`schema_migrations`)
- Vault audit log (configuration changes)

## 10. Audit Trail

| Event | Where | Retention |
|-------|-------|-----------|
| Code change | Git (GitHub) | Permanent |
| PR approval | GitHub | Permanent |
| CI result | CI system | 1 year |
| Deployment | Helm history | 90 days |
| Config change | Vault audit log | 1 year |
| DB migration | schema_migrations table | Permanent |

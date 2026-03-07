# BLOCKERS — Production Readiness

> Last updated by automation agent on the `agent/production-readiness-fixes` branch.

## Summary

| Category | Status | Details |
|----------|--------|---------|
| Code compilation (Go) | ✅ PASS | All 8 services compile |
| Code compilation (Java/Flink) | ✅ PASS | `mvn -B compile` succeeds |
| Code compilation (Frontend) | ✅ PASS | `pnpm build` succeeds |
| Unit tests (Frontend) | ✅ PASS | 139/139 tests pass with coverage |
| Unit tests (UI package) | ✅ PASS | All pass with coverage |
| ESLint | ✅ PASS | Warnings only, no errors |
| Vitest coverage | ✅ PASS | v8 provider loads correctly |
| CI honesty | ✅ FIXED | `\|\| true` removed from critical steps |
| Playwright config | ✅ FIXED | bind() error resolved |
| GitGuardian secrets | ✅ FIXED | sk_live_ replaced, exclusions expanded |
| Build scripts | ✅ CREATED | `scripts/build-images.sh`, `scripts/promote-images.sh` |
| Staging workflow | ✅ FIXED | Build context corrected, 2 missing services added |

---

## BLOCKING Issues (require human action)

### B1: Missing GitHub Secrets

The following secrets are referenced by CI/CD workflows but **not configured** in the repository:

| Secret | Used By | Required For |
|--------|---------|-------------|
| `PROD_KUBECONFIG` | production-deploy.yml | Kubernetes cluster access |
| `STAGING_KUBECONFIG` | staging-deploy.yml | Staging cluster access |
| `VAULT_ADDR` | production-deploy.yml | Vault health check pre-flight |
| `VAULT_TOKEN` | production-deploy.yml | Vault authentication |
| `PAGERDUTY_TOKEN` | production-deploy.yml | Incident escalation check |
| `GRAFANA_API_KEY` | production-deploy.yml, staging-deploy.yml | Dashboard snapshots |
| `GRAFANA_URL` | production-deploy.yml | Grafana server URL |
| `REGISTRY_USER` | staging-deploy.yml | Container registry auth |
| `REGISTRY_PASSWORD` | staging-deploy.yml | Container registry auth |

**Already configured:**
- ✅ `NEXTAUTH_SECRET`
- ✅ `SLACK_WEBHOOK_URL`
- ✅ `PROD_TEST_TOKEN`

### B2: No Kubernetes Cluster

Neither a staging nor production Kubernetes cluster exists. The deploy workflows require:
- A running K8s cluster (EKS, GKE, AKS, or self-hosted)
- CockroachDB operator or StatefulSet deployed
- Kafka operator deployed
- Vault server accessible from cluster
- Kong ingress controller installed

**Minimum viable option:** Use k3d/k3s locally or in CI for validation.

### B3: No Container Registry

The workflows reference `registry.nexus-rtp.internal` which does not exist. Options:
1. Use GitHub Container Registry (ghcr.io) — update `REGISTRY` env in workflows
2. Use Docker Hub with a private repo
3. Deploy Harbor or similar self-hosted registry

### B4: Container Images Never Built

Docker daemon was unavailable for local validation. The Dockerfiles exist and are structurally correct (Go multi-stage, frontend 4-stage), but no image has ever been built from them. Once Docker is running:

```bash
./scripts/build-images.sh v1.0.0
```

### B5: Database Migrations Not Validated Against Live DB

The SQL migrations in `migrations/` are syntactically correct but have never been run against a real CockroachDB instance. The staging-deploy workflow includes migration steps that need a running cluster.

---

## Operator Checklist (to unblock production)

```bash
# 1. Provision infrastructure
#    - Kubernetes cluster (staging + production)
#    - CockroachDB (3-node)
#    - Kafka (3-node)
#    - Redis
#    - Vault server
#    - Container registry

# 2. Configure GitHub Secrets
gh secret set PROD_KUBECONFIG --body "$(base64 < ~/.kube/config)"
gh secret set STAGING_KUBECONFIG --body "$(base64 < ~/.kube/staging-config)"
gh secret set VAULT_ADDR --body "https://vault.nexus-rtp.internal:8200"
gh secret set VAULT_TOKEN --body "<root-or-approle-token>"
gh secret set PAGERDUTY_TOKEN --body "<pagerduty-api-token>"
gh secret set GRAFANA_API_KEY --body "<grafana-service-account-key>"
gh secret set GRAFANA_URL --body "https://grafana.nexus-rtp.internal"
gh secret set REGISTRY_USER --body "<registry-username>"
gh secret set REGISTRY_PASSWORD --body "<registry-password>"

# 3. Build & push images
./scripts/build-images.sh v1.0.0 --push

# 4. Run staging deploy
gh workflow run staging-deploy.yml -f version=v1.0.0

# 5. After staging smoke tests pass, run production canary
gh workflow run production-deploy.yml -f version=v1.0.0
```

---

## Non-Blocking Issues (tracked for follow-up)

| Issue | Severity | Notes |
|-------|----------|-------|
| Pre-commit PAN scanner fails on Windows | Low | bash script, works on Linux/CI |
| E2E tests 100% mocked | Medium | No real backend integration tests |
| Proofs/replay modules not wired in | Low | Standalone verification tools |
| Some Go lint warnings | Low | Mostly unused variable warnings |
| Frontend `@typescript-eslint/no-explicit-any` warnings | Low | 30+ occurrences, non-blocking |

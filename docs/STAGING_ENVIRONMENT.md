# Staging Environment — Nexus RTP Platform

## Overview

The staging environment mirrors production topology with reduced resource footprint.
It is deployed to the `nexus-staging` namespace and is the final gate before production cutover.

## URLs

| Component     | URL                                           |
|---------------|-----------------------------------------------|
| Frontend      | `https://app.staging.nexus-rtp.internal`      |
| API Gateway   | `https://api.staging.nexus-rtp.internal`      |
| Grafana       | `https://grafana.staging.nexus-rtp.internal`  |
| Jaeger        | `https://jaeger.staging.nexus-rtp.internal`   |

## Architecture (Staging)

```
┌──────────────────────────────────────────────────────────┐
│  nginx-ingress                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Frontend  │  │ Kong API │  │ Grafana  │  │ Jaeger  │ │
│  │ (Next.js) │  │ Gateway  │  │          │  │         │ │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └─────────┘ │
│       │              │                                    │
│       │         ┌────┴──────────────┐                    │
│       │         │  Backend Services │                    │
│       │         ├──────────────────┤                    │
│       └────────►│ payment (×2)     │                    │
│                 │ account (×2)     │                    │
│                 │ reconciliation   │                    │
│                 │ auth             │                    │
│                 │ notification     │                    │
│                 │ ws-gateway       │                    │
│                 └────┬─────────────┘                    │
│                      │                                    │
│  ┌───────────────────┴────────────────────┐              │
│  │ CockroachDB (1) │ Kafka (1) │ Redis   │              │
│  └────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────┘
```

## Deployment

### Automated (CI)

Pushes to `main` trigger the staging deploy workflow (`.github/workflows/staging-deploy.yml`):

1. Build frontend + backend Docker images
2. Run database migrations
3. Helm deploy with `values.staging.yaml` overlay
4. Smoke tests (`scripts/staging-smoke-test.sh`)
5. E2E Playwright tests against staging
6. Grafana screenshot capture

### Manual

```bash
# Deploy specific version
helm upgrade --install nexus infra/helm/nexus-platform \
  -f infra/helm/nexus-platform/values.yaml \
  -f infra/helm/nexus-platform/values.staging.yaml \
  --set frontend.image.tag=staging-abc1234 \
  --set paymentService.image.tag=staging-abc1234 \
  --set accountService.image.tag=staging-abc1234 \
  --set reconciliationService.image.tag=staging-abc1234 \
  --namespace nexus-staging \
  --create-namespace \
  --wait --timeout 10m

# Or via GitHub Actions manual trigger
gh workflow run staging-deploy.yml \
  -f version=staging-abc1234 \
  -f canary_weight=10
```

### Canary Deploys

Set `canary_weight > 0` in the manual trigger to enable canary:

```bash
# Deploy canary at 10% traffic
gh workflow run staging-deploy.yml -f canary_weight=10

# Promote to 50%
gh workflow run staging-deploy.yml -f canary_weight=50

# Full promotion
gh workflow run staging-deploy.yml -f canary_weight=0
```

## Resource Comparison

| Resource          | Production        | Staging           |
|-------------------|-------------------|-------------------|
| Frontend          | 2 replicas, HPA   | 1 replica, no HPA |
| Payment Service   | 3 replicas, HPA 3-10 | 2 replicas, HPA 2-5 |
| Account Service   | 3 replicas, HPA 3-8  | 2 replicas, HPA 2-4 |
| Reconciliation    | 2 replicas, HPA 2-6  | 1 replica          |
| CockroachDB       | 3-node, 50Gi      | 1-node, 10Gi      |
| Kafka             | 3-broker, 50Gi    | 1-broker, 10Gi     |
| Redis             | master + 2 replicas | standalone         |
| Prometheus        | 50Gi              | 10Gi               |
| Flink TaskManager | 2 replicas         | 1 replica          |
| Watchman          | 2 replicas, HPA    | 1 replica, no HPA |

## Smoke Tests

Run the smoke test suite after deployment:

```bash
STAGING_URL="https://app.staging.nexus-rtp.internal" \
API_URL="https://api.staging.nexus-rtp.internal" \
NAMESPACE="nexus-staging" \
  scripts/staging-smoke-test.sh
```

### What's tested

1. **Frontend health** — `/api/health`, login page, HTML response
2. **API gateway** — health endpoint, auth reachability, payment auth-gate
3. **Pod health** — all pods Running, per-service checks
4. **Data stores** — CockroachDB, Kafka, Redis connectivity
5. **Critical flows** — registration + login, payment creation
6. **Monitoring** — Prometheus + Grafana reachable

Results are written to `staging-artifacts/smoke/smoke-results.json`.

## Secrets Required

| Secret                | Where          | Purpose                          |
|-----------------------|----------------|----------------------------------|
| `STAGING_KUBECONFIG`  | GitHub Secrets | kubectl access to staging cluster |
| `REGISTRY_USER`       | GitHub Secrets | Docker registry login             |
| `REGISTRY_PASSWORD`   | GitHub Secrets | Docker registry password          |
| `NEXTAUTH_SECRET`     | GitHub Secrets | NextAuth.js session signing       |
| `GRAFANA_API_KEY`     | GitHub Secrets | Grafana screenshot rendering      |
| `SLACK_WEBHOOK_URL`   | GitHub Secrets | Deploy notification (optional)    |

## Troubleshooting

### Frontend pods CrashLooping

```bash
kubectl logs -n nexus-staging -l app.kubernetes.io/component=frontend --tail=50
kubectl describe pod -n nexus-staging -l app.kubernetes.io/component=frontend
```

Common causes:
- Missing `NEXTAUTH_SECRET` → set via Helm `--set`
- Wrong `NEXT_PUBLIC_API_URL` → check `values.staging.yaml`
- Image not found → verify registry push completed

### Rollback

```bash
# List releases
helm history nexus -n nexus-staging

# Rollback to previous
helm rollback nexus 0 -n nexus-staging --wait

# Emergency: scale down everything
kubectl scale deploy --all --replicas=0 -n nexus-staging
```

### View smoke test logs

```bash
# Locally
cat staging-artifacts/smoke/smoke.log

# In CI
# Download the `staging-smoke-results` artifact from the Actions run
```

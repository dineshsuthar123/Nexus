# Kong DNS Resilience Report - 2026-06-03

## Objective

Reduce the local stack risk where Kong keeps routing to a stale backend container IP after a service is rebuilt or recreated.

## Change

Kong now explicitly uses Docker embedded DNS and short DNS cache windows:

- `KONG_DNS_RESOLVER=127.0.0.11:53`
- `KONG_DNS_ORDER=LAST,A,CNAME`
- `KONG_DNS_VALID_TTL=5`
- `KONG_DNS_STALE_TTL=0`
- `KONG_DNS_NOT_FOUND_TTL=1`
- `KONG_DNS_ERROR_TTL=1`

This keeps Kong from serving stale DNS answers for long periods in the Docker Compose development stack.

## Validation

Validated on the local Docker stack:

- `docker compose -f infra/docker/docker-compose.yml config --quiet`: passed.
- Recreated Kong with the new DNS environment.
- Confirmed Kong container environment contains the DNS settings.
- Verified baseline `GET http://localhost:8000/api/v1/analytics/health`: 200.
- Rebuilt/recreated `analytics-service` without restarting Kong.
- Probed `GET http://localhost:8000/api/v1/analytics/health` 10 times after service recreation: 10/10 returned 200.
- Checked recent Kong logs for analytics health routing failures: no `No route to host` or 502 errors observed after the change.

## Caveat

Docker reused the same analytics-service IP during this specific validation run, so the test proves the new Kong DNS config is active and the route remains healthy across service recreation. The original stale-IP failure remains a scenario to keep in CI with a forced-IP-change harness.

## Next Hardening Step

Add a deterministic infrastructure test that forces backend IP churn, then verifies Kong recovers without a restart. That will make this protection regression-proof.

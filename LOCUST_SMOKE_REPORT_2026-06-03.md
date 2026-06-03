# Nexus RTP Locust Smoke Report - 2026-06-03

## Scope

Validated the cleaned Locust harness against the running local direct services with auth skipped and a separate account-service host.

## Command

```bash
LOADTEST_HOST=http://localhost:8085 LOADTEST_ACCOUNT_HOST=http://localhost:8086 LOADTEST_SKIP_AUTH=true locust -f loadtest/locustfile.py --headless --users 2 --spawn-rate 2 --run-time 8s
```

## Result

- Total requests: 33
- Failures: 0
- Average RPS: 5.2
- Peak RPS: 7.0
- Aggregate p50 latency: 46 ms
- Aggregate p95 latency: 320 ms
- Aggregate p99 latency: 360 ms

Endpoint p95:

- `POST /payments`: 320 ms
- `GET /payments/{uetr}/status`: 11 ms
- `GET /accounts/{id}`: 41 ms

This is a smoke validation only. It proves the Locust harness runs against current APIs; production comparison still needs longer ramp, spike, and soak runs with stable sanctions data and dedicated test balances.

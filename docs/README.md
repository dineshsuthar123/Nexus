# Documentation

| Location | Contents |
|---|---|
| [Performance](performance/README.md) | Actual measurements, methodology, limitations and raw evidence |
| [Testing guide](guides/TESTING_CHECKLIST.md) | Setup and testing procedures |
| [Quick reference](guides/QUICK_REFERENCE.md) | Operational commands |
| [Troubleshooting](guides/TROUBLESHOOTING.md) | Common development issues |
| [Architecture](ARCHITECTURE.md) | Service and payment flow design |
| [Tuning](PERFORMANCE_TUNING.md) | Configuration advice and design targets |
| [Validation report](reports/PERFORMANCE_VALIDATION_2026-11-07.md) | Checks performed for the recorded performance work |
| [API specification](openapi.yaml) | API contracts |

The repository root contains entry points and project configuration. Service code stays in `services/`, shared Go modules in `pkg/` and `libs/`, the web workspace in `frontend/`, infrastructure in `infra/`, and automation in `scripts/`.

New dated reports belong in `docs/reports/`. Current performance evidence belongs in `docs/performance/runs/<run-id>/`; scratch logs, binaries, screenshots and failed attempts stay in ignored `loadtest/results/`.

# Performance tests

The measured baseline uses `measured.js`, coordinated by `python scripts/performance/run.py` from the repository root. It validates accepted writes, persisted read-back, Redis idempotent replay and database invariants under baseline, ramp, sustained, spike and recovery loads.

See [recorded performance](../docs/performance/README.md) for actual results, reproduction commands, test conditions and limitations. `python scripts/performance/publish.py --check` verifies synchronized docs/UI and evidence checksums.

Other harnesses remain available for separately configured environments:

| Harness | Purpose |
|---|---|
| `benchmark_suite.js` | Configurable smoke/ramp/soak/spike/breakpoint scenarios |
| `loadtest.js` | Legacy broad payment/account scenario suite |
| `locustfile.py` | Python/Locust scenarios |

`load_test_config.yml` contains target load profiles, not observed results. `cost_model.yml` contains estimates. Results under `results/` are ignored; promoted evidence lives under `docs/performance/runs/`. Superseded experiments and incomplete historical scratch results have been removed.

"""Promote a completed run and synchronize documentation and frontend copies.

python scripts/performance/publish.py loadtest/results/<run-id>
python scripts/performance/publish.py --check
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import statistics

ROOT = Path(__file__).resolve().parents[2]
PERF = ROOT / "docs/performance"
START = "<!-- performance-results:start -->"
END = "<!-- performance-results:end -->"
DOCS = ["README.md", "docs/PERFORMANCE_TUNING.md", "docs/ARCHITECTURE.md",
        "frontend/README.md", "docs/guides/TESTING_CHECKLIST.md"]


def encoded(data):
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def trend(values):
    return {"average_ms": values["avg"], "p50_ms": values["med"],
            "p95_ms": values["p(95)"], "p99_ms": values["p(99)"], "max_ms": values["max"]}


def resources(source, elapsed):
    def prometheus(filename, metric):
        content = (source / filename).read_text(encoding="utf-8")
        match = re.search(r"^" + re.escape(metric) + r" ([0-9.eE+-]+)$", content, re.M)
        return float(match.group(1)) if match else None
    before = prometheus("prometheus-before.txt", "process_cpu_seconds_total")
    after = prometheus("prometheus-after.txt", "process_cpu_seconds_total")
    result = {"api_average_cpu_core_percent": (after - before) / elapsed * 100 if before is not None and after is not None else None,
              "api_rss_after_mib": prometheus("prometheus-after.txt", "process_resident_memory_bytes") / 1048576,
              "containers": {}}
    samples = [json.loads(line) for line in (source / "resources.ndjson").read_text(encoding="utf-8").splitlines()]
    result["container_sample_count"] = len(samples)
    for sample in samples:
        for container in sample.get("containers", []):
            name = container["Name"]
            value = result["containers"].setdefault(name, {"max_cpu_core_percent": 0, "max_memory_percent": 0, "max_memory_usage": ""})
            value["max_cpu_core_percent"] = max(value["max_cpu_core_percent"], float(container["CPUPerc"].rstrip('%')))
            memory = float(container["MemPerc"].rstrip('%'))
            if memory > value["max_memory_percent"]:
                value["max_memory_percent"] = memory
                value["max_memory_usage"] = container["MemUsage"]
    return result


def summarize(source):
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    raw = json.loads((source / "k6-summary.json").read_text(encoding="utf-8"))
    metrics = raw["metrics"]
    failed = [f"{name}: {threshold}" for name, metric in metrics.items()
              for threshold, result in metric.get("thresholds", {}).items() if not result["ok"]]
    total = metrics["payments_attempted"]["values"]["count"]
    if total <= 0:
        raise ValueError("Refusing to publish a run without payment samples")
    phases = []
    for name in ["baseline", "ramp", "sustain", "spike", "recovery"]:
        tags = f"{{phase:{name}}}"
        elapsed = metrics[f"phase_elapsed_ms{tags}"]["values"]["max"] / 1000
        count = metrics[f"payments_accepted{tags}"]["values"]["count"]
        phases.append({"name": name, "samples": metrics[f"payments_attempted{tags}"]["values"]["count"],
                       **trend(metrics[f"payment_latency_ms{tags}"]["values"]),
                       "accepted": count, "elapsed_seconds": elapsed,
                       "accepted_per_second": count / elapsed,
                       "failure_rate": 1 - metrics[f"payment_accepted{tags}"]["values"]["rate"]})
    result = {
        "schema_version": 1, "run_id": source.name,
        "measured_at": manifest["finished_at"], "git_commit": manifest["git_commit"],
        "working_tree_dirty": manifest["working_tree_dirty"], "source_sha256": manifest["source_sha256"],
        "scope": manifest["scope"], "limitations": manifest["limitations"],
        "payment": {"samples": total, **trend(metrics["payment_latency_ms"]["values"])},
        "http_requests": metrics["http_reqs"]["values"]["count"],
        "http_failure_rate": metrics["http_req_failed"]["values"]["rate"],
        "payment_failure_rate": 1 - metrics["payment_accepted"]["values"]["rate"],
        "sustained_payments_per_second": next(p["accepted_per_second"] for p in phases if p["name"] == "sustain"),
        "readback_success_rate": metrics["readback_verified"]["values"]["rate"],
        "replay_success_rate": metrics["replay_verified"]["values"]["rate"],
        "status": trend(metrics["status_latency_ms"]["values"]),
        "list": trend(metrics["list_latency_ms"]["values"]),
        "replay": trend(metrics["replay_latency_ms"]["values"]),
        "thresholds_passed": not failed and manifest["k6_exit_code"] == 0,
        "failed_thresholds": failed,
        "database_validation_passed": manifest["database_validation_passed"],
        "phases": phases,
        "resources": resources(source, manifest["load_elapsed_seconds"]),
        "findings": [
            f"Recovery p95 was {phases[-1]['p95_ms']:.2f}ms versus {phases[0]['p95_ms']:.2f}ms at baseline. Passing global latency gates does not establish a return to baseline; investigate with a longer recovery/soak and database profiles.",
            "No before/after optimization comparison was run; no speedup claim is established.",
        ],
    }
    frontend = source / "frontend.json"
    if frontend.is_file():
        browser = json.loads(frontend.read_text(encoding="utf-8"))
        result["frontend"] = {"build_seconds": browser["build_seconds"], "browser": browser["browser"],
                              "limitations": browser["limitations"], "routes": []}
        for route in browser["routes"]:
            samples = route["samples"]
            summary = {"path": route["path"], "samples": len(samples)}
            for metric in ["ttfb_ms", "fcp_ms", "lcp_ms", "load_ms", "cls", "script_encoded_bytes"]:
                values = [s[metric] for s in samples if s[metric] is not None]
                summary[metric] = {"median": statistics.median(values), "max": max(values)} if values else None
            result["frontend"]["routes"].append(summary)
    return result


def ui_data(data):
    # Keep the UI input stable when adding browser evidence about that UI build.
    return {key: value for key, value in data.items() if key != "frontend"}


def block(data, relative_link):
    payment = data["payment"]
    browser_note = ""
    if "frontend" in data:
        routes = data["frontend"]["routes"]
        observed = [f"`{route['path']}` {route['lcp_ms']['median']:.0f} ms" for route in routes if route['lcp_ms']]
        browser_note = "\nFrontend production lab, ten fresh-context navigations per route: median LCP " + ", ".join(observed) + ". No CPU/network throttling.\n"
    return f"""{START}
### Measured local performance ({data['measured_at'][:10]})

| Payment attempts | p50 | p95 | p99 | Sustained accepted payments/s | Acceptance failures |
|---:|---:|---:|---:|---:|---:|
| {payment['samples']:,} | {payment['p50_ms']:.2f} ms | {payment['p95_ms']:.2f} ms | {payment['p99_ms']:.2f} ms | {data['sustained_payments_per_second']:.2f} | {data['payment_failure_rate'] * 100:.2f}% |

Direct API, 1–25 closed-loop users, real single-node in-memory CockroachDB and Redis.
Sanctions unavailable: payments were accepted for review. Settlement, Kafka delivery,
gateway/auth, production capacity and uptime were not measured.
Thresholds: **{'PASS' if data['thresholds_passed'] else 'FAIL'}**; persisted database invariants: **{'PASS' if data['database_validation_passed'] else 'FAIL'}**.
{browser_note}
See [methodology and raw evidence]({relative_link}). Other performance figures below are design targets or historical claims unless linked to a recorded run.
{END}"""


def report(data):
    p = data["payment"]
    lines = ["# Recorded performance", "", block(data, "README.md"), "",
             f"Run: [`{data['run_id']}`](runs/{data['run_id']}/manifest.json). "
             f"Revision: `{data['git_commit']}` with local changes; payment source SHA-256: `{data['source_sha256']}`.", "",
             "## Reproduce", "", "```sh", "python scripts/performance/run.py",
             "# After the backend run, publish its summary before building the frontend:",
             "python scripts/performance/publish.py loadtest/results/<run-id>",
             "node scripts/performance/frontend.cjs loadtest/results/<run-id>",
             "python scripts/performance/publish.py loadtest/results/<run-id>",
             "python scripts/performance/publish.py --check", "```", "",
             "Run from the repository root with Go 1.25.6+, Python 3, Docker Desktop, k6, Node and the installed frontend dependencies. "
             "Install the Playwright Chromium browser if missing. The runner creates the exclusive `nexus-performance` Compose project "
             "on ports 26270/6390, builds the current payment service on 18085, seeds 32 funded USD accounts, and tears down its processes and containers. "
             "It refuses concurrent runs. No development data or persistent volumes are used. "
             "The browser runner builds and starts production Next.js on port 13000 and closes its server afterward.", "",
             "If interrupted, clean up only this test project:", "", "```sh",
             "docker compose -p nexus-performance -f infra/docker/docker-compose.performance.yml down", "```", "",
             "## Method", "", "Three setup payments warm the connection pool and sanctions circuit; they are excluded from payment latency samples. "
             "Each measured iteration creates a unique USD 1 payment and verifies its transaction ID by reading it back. "
             "Every fifth iteration replays the same Idempotency-Key and every tenth lists payments. "
             "HTTP 2xx alone does not count as acceptance: a durable transaction ID and PENDING/SANCTIONED status are required. "
             "Rejected, malformed and missing-account responses fail the test. All attempted creates contribute to latency, including failures.", "",
             "Phases are sequential, with five-second drain gaps: baseline 1 user/20s; ramp 1→5→10 users/40s; "
             "sustain 10 users/60s; spike 25 users/30s; recovery 1 user/20s. Each iteration has 50ms think time. "
             "Phase rates divide accepted creates by the observed phase elapsed time through the final completed request, including drain work. "
             "They are achieved acceptance rates, not settlement TPS or a capacity ceiling. Percentiles aggregate measured attempts; "
             "they are not averages of per-phase percentiles. Baseline/recovery have fewer samples and noisier tails.", "",
             "## Phase results", "", "| Phase | Attempts | p50 ms | p95 ms | p99 ms | Accepted/s | Failures |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    for phase in data["phases"]:
        lines.append(f"| {phase['name']} | {phase['samples']} | {phase['p50_ms']:.2f} | {phase['p95_ms']:.2f} | {phase['p99_ms']:.2f} | {phase['accepted_per_second']:.2f} | {phase['failure_rate'] * 100:.2f}% |")
    lines += ["", "## Endpoint and correctness results", "",
              "| Endpoint | p50 ms | p95 ms | p99 ms |", "|---|---:|---:|---:|"]
    for key, label in [("payment", "Create payment"), ("status", "Status read-back"), ("list", "List payments"), ("replay", "Idempotent replay")]:
        value = data[key]
        lines.append(f"| {label} | {value['p50_ms']:.2f} | {value['p95_ms']:.2f} | {value['p99_ms']:.2f} |")
    lines += ["", f"- HTTP requests (including setup/read/list/replay): {data['http_requests']:,}; failure rate: {data['http_failure_rate'] * 100:.2f}%.",
              f"- Read-back success: {data['readback_success_rate'] * 100:.2f}%; replay identity: {data['replay_success_rate'] * 100:.2f}%.",
              "- Post-run SQL checks transaction/UETR uniqueness, two balanced ledger legs per transaction, nonnegative shards, one outbox event per transaction, and total shard reservation equal to payment principal.",
              "- Gates: payment p95 <500ms, p99 <1000ms, acceptance ≥99% overall and per phase, HTTP failure <1%, all read-back/replay/check assertions passing; every phase must have samples.", ""]
    lines += ["## Findings", ""] + [f"- {item}" for item in data["findings"]] + [""]
    usage = data["resources"]
    lines += ["## Resource observations", "",
              f"API mean CPU: {usage['api_average_cpu_core_percent']:.2f}% of one core from process CPU-time delta; API RSS after load: {usage['api_rss_after_mib']:.2f} MiB. "
              f"Container sampling: {usage['container_sample_count']} snapshots, roughly five seconds apart. CPU percentages sum across cores and can exceed 100%; sparse sampled maxima are not true peaks.", "",
              "| Container | Highest sampled CPU (one-core %) | Highest sampled memory | Memory limit used |", "|---|---:|---|---:|"]
    for name, container in usage["containers"].items():
        lines.append(f"| {name} | {container['max_cpu_core_percent']:.2f}% | {container['max_memory_usage']} | {container['max_memory_percent']:.2f}% |")
    lines += [""]
    if data["failed_thresholds"]:
        lines += ["Failed thresholds:", ""] + [f"- `{item}`" for item in data["failed_thresholds"]] + [""]
    if "frontend" in data:
        browser = data["frontend"]
        lines += ["## Production frontend measurements", "", f"Build: {browser['build_seconds']:.2f}s (shared UI library plus Next.js); Chromium {browser['browser']}; fresh 1365×768 desktop browser contexts, no throttling, no API mocks. Ten navigations per public route. "
                  "These are lab navigation observations; no field Core Web Vitals or authenticated workflow claims.", "",
                  "| Route | Samples | Median TTFB ms | Median FCP ms | Median LCP ms | Median load ms | Median JS KiB | Max CLS |",
                  "|---|---:|---:|---:|---:|---:|---:|---:|"]
        for route in browser["routes"]:
            def val(key, divisor=1):
                metric = route[key]
                return f"{metric['median'] / divisor:.2f}" if metric else "not observed"
            lines.append(f"| `{route['path']}` | {route['samples']} | {val('ttfb_ms')} | {val('fcp_ms')} | {val('lcp_ms')} | {val('load_ms')} | {val('script_encoded_bytes', 1024)} | {route['cls']['max']:.4f} |")
        lines += ["", "The test runs the production Node server from `.next-performance`, with standalone packaging disabled. "
                  "This isolates the local benchmark from Windows/pnpm standalone junction cleanup. Linux deployment packaging remains a separate build validation.", ""]
        lines += [f"- {item}" for item in browser["limitations"]] + [""]
    lines += ["## Environment and limitations", ""] + [f"- {item}" for item in data["limitations"]]
    lines += ["", "Container CPU/memory samples and before/after Prometheus snapshots are retained in the run directory. "
              "They cover the database/Redis and API process respectively, not production pod sizing. "
              "The manifest records host/tool versions, Docker limits and image IDs. Source fingerprints distinguish the tested working tree from HEAD.", "",
              "## Evidence layout", "", "- `latest.json`: canonical machine-readable published result.",
              f"- `runs/{data['run_id']}/`: original k6 summary, manifest, SQL validation, resource samples and Prometheus snapshots; `checksums.json` verifies evidence bytes.",
              "- `../../loadtest/results/` (ignored): binaries, service logs, build logs, screenshots and scratch runs. Promote evidence with `publish.py`; do not commit generated binaries.",
              "- Frontend JSON and documentation blocks are generated from the same run. `publish.py --check` detects drift.", ""]
    return "\n".join(lines)


def sync(data, check=False):
    errors = []
    def write(path, content):
        if check:
            if not path.is_file() or path.read_text(encoding="utf-8") != content:
                errors.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
    write(PERF / "latest.json", encoded(data))
    write(PERF / "README.md", report(data))
    write(ROOT / "frontend/apps/web/src/data/performance-baseline.json", encoded(ui_data(data)))
    write(ROOT / "frontend/apps/web/public/performance/latest.json", encoded(data))
    import os
    for doc in DOCS:
        path = ROOT / doc
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        link = os.path.relpath(PERF / "README.md", path.parent).replace("\\", "/")
        generated = block(data, link)
        if START in content:
            updated = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: generated, content, flags=re.S)
        else:
            first, rest = content.split("\n", 1)
            updated = first + "\n\n" + generated + "\n" + rest
        write(path, updated)
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, nargs="?")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        data = json.loads((PERF / "latest.json").read_text(encoding="utf-8"))
        source = PERF / "runs" / data["run_id"]
        errors = sync(summarize(source), check=True)
        for name, digest in json.loads((source / "checksums.json").read_text(encoding="utf-8")).items():
            if hashlib.sha256((source / name).read_bytes()).hexdigest() != digest:
                errors.append(f"evidence checksum: {name}")
        if errors:
            parser.exit(1, "Performance evidence drift: " + ", ".join(errors) + "\n")
        print("Performance docs, UI copies and evidence checksums are synchronized.")
        return
    if not args.source:
        parser.error("Provide a completed run directory, or --check")
    source = args.source.resolve()
    data = summarize(source)
    target = PERF / "runs" / source.name
    target.mkdir(parents=True, exist_ok=True)
    names = ["manifest.json", "k6-summary.json", "database-validation.csv", "resources.ndjson",
             "prometheus-before.txt", "prometheus-after.txt", "frontend.json"]
    for name in names:
        if (source / name).is_file() and source != target:
            shutil.copyfile(source / name, target / name)
    checksums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in sorted(target.iterdir()) if p.name != "checksums.json" and p.is_file()}
    (target / "checksums.json").write_text(encoded(checksums), encoding="utf-8")
    sync(data)
    print(f"Published {data['run_id']}: {data['payment']['samples']} attempts; thresholds {'PASS' if data['thresholds_passed'] else 'FAIL'}")


if __name__ == "__main__":
    main()

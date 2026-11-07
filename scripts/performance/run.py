"""Reproducible local payment benchmark; Python standard library only.

python scripts/performance/run.py
Raw logs stay in ignored loadtest/results/. Use publish.py to promote evidence.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import threading
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["docker", "compose", "-p", "nexus-performance", "-f",
           str(ROOT / "infra/docker/docker-compose.performance.yml")]


def command(args, *, cwd=ROOT, env=None, stdin=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=stdin, text=True,
                            encoding="utf-8", errors="replace", capture_output=True)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}):\n{result.stdout}\n{result.stderr}")
    return result.stdout


def sql(statement):
    return command(COMPOSE + ["exec", "-T", "database", "cockroach", "sql",
                             "--insecure", "--format=csv"], stdin=statement)


def seed():
    sql((ROOT / "infra/docker/cockroachdb/init/001_init_schema.sql").read_text(encoding="utf-8"))
    # An exclusive, in-memory benchmark database: no normal project migrations
    # with destructive legacy table conversions and no production credentials.
    sql("""USE nexus_ledger;
INSERT INTO customer (id, external_id, legal_name, kyc_status, country_code)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'PERF-CUSTOMER', 'Performance Test', 'VERIFIED', 'US');
""")
    accounts = []
    for index in range(1, 33):
        accounts.append(f"('bbbbbbbb-0000-4000-8000-{index:012d}', "
                        f"'aaaaaaaa-0000-4000-8000-000000000001', 'PERF-{index}', "
                        f"'Performance {index}', 'OPERATING', 'USD', 1000000000, 1000000000, 'ACTIVE')")
    sql("USE nexus_ledger; INSERT INTO account "
        "(id, customer_id, account_number, account_name, account_type, currency, balance, available_balance, status) "
        "VALUES " + ",".join(accounts) + ";")
    sql((ROOT / "migrations/008_account_sharding.sql").read_text(encoding="utf-8"))


def source_digest():
    digest = hashlib.sha256()
    paths = sorted((ROOT / "services/payment-service").rglob("*.go"))
    paths += sorted((ROOT / "pkg/idempotency").rglob("*.go"))
    paths += [ROOT / "loadtest/measured.js", ROOT / "scripts/performance/run.py",
              ROOT / "infra/docker/docker-compose.performance.yml"]
    for path in paths:
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def sample_resources(stop, output):
    ids = command(COMPOSE + ["ps", "-q"]).split()
    with (output / "resources.ndjson").open("w", encoding="utf-8") as stream:
        while not stop.is_set():
            try:
                sample = command(["docker", "stats", "--no-stream", "--format", "{{json .}}", *ids])
                stream.write(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(),
                                         "containers": [json.loads(line) for line in sample.splitlines()]}) + "\n")
                stream.flush()
            except RuntimeError as error:
                stream.write(json.dumps({"sampling_error": str(error)}) + "\n")
            stop.wait(3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    for tool in ["go", "docker", "k6"]:
        if not shutil.which(tool):
            parser.error(f"Required executable missing: {tool}")
    now = datetime.now(timezone.utc)
    output = (args.output or ROOT / "loadtest/results" / now.strftime("%Y%m%dT%H%M%SZ")).resolve()
    output.mkdir(parents=True, exist_ok=False)
    manifest = {
        "schema_version": 1, "started_at": now.isoformat(),
        "git_commit": command(["git", "rev-parse", "HEAD"]).strip(),
        "working_tree_dirty": bool(command(["git", "status", "--porcelain"]).strip()),
        "source_sha256": source_digest(),
        "host": {"os": platform.platform(), "architecture": platform.machine(),
                 "logical_cpus": os.cpu_count(), "processor": platform.processor()},
        "tools": {"go": command(["go", "version"]).strip(),
                  "k6": command(["k6", "version"]).strip(),
                  "docker": command(["docker", "version", "--format", "{{.Server.Version}}"]).strip()},
        "scope": "Local direct payment API acceptance with sanctions unavailable (REVIEW), real CockroachDB and Redis",
        "limitations": ["Single-node in-memory CockroachDB on shared Docker Desktop hardware",
                        "Sanctions endpoint intentionally unavailable; payments enter SANCTIONED review",
                        "No gateway, auth, Kafka delivery, fraud processing, settlement or cross-region network measured",
                        "Closed-loop users with 50ms think time; achieved rate is not maximum capacity",
                        "Load generator and service share the host; no production throughput or uptime inference"],
    }
    process = None
    stop = threading.Event()
    sampler = None
    service_log = None
    try:
        print("Starting isolated CockroachDB and Redis...", flush=True)
        # Refuse a concurrent run instead of deleting its data or processes.
        if command(COMPOSE + ["ps", "-q"]).strip():
            raise RuntimeError("Benchmark dependencies already running. Stop them with the documented compose down command first.")
        command(COMPOSE + ["up", "-d", "--wait"])
        manifest["docker_info"] = {
            "cpus": command(["docker", "info", "--format", "{{.NCPU}}"]).strip(),
            "memory_bytes": command(["docker", "info", "--format", "{{.MemTotal}}"]).strip(),
        }
        manifest["images"] = json.loads(command(COMPOSE + ["images", "--format", "json"]))
        seed()
        print("Building current payment-service source...", flush=True)
        binary = output / ("payment-service.exe" if os.name == "nt" else "payment-service")
        command(["go", "build", "-o", str(binary), "./cmd/server"], cwd=ROOT / "services/payment-service")
        env = {**os.environ, "PORT": "18085", "LOG_LEVEL": "warn", "GIN_MODE": "release",
               "DATABASE_URL": "postgresql://root@127.0.0.1:26270/nexus_ledger?sslmode=disable",
               "REDIS_URL": "redis://127.0.0.1:6390", "KAFKA_BROKERS": "127.0.0.1:19092",
               "WATCHMAN_URL": "http://127.0.0.1:18084", "JAEGER_ENDPOINT": "http://127.0.0.1:14318"}
        service_log = (output / "payment-service.log").open("w", encoding="utf-8")
        process = subprocess.Popen([str(binary)], cwd=ROOT, env=env, stdout=service_log, stderr=subprocess.STDOUT)
        for _ in range(60):
            if process.poll() is not None:
                raise RuntimeError("Payment service exited; inspect payment-service.log")
            try:
                with urllib.request.urlopen("http://127.0.0.1:18085/ready", timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError("Payment readiness timed out")
        sampler = threading.Thread(target=sample_resources, args=(stop, output), daemon=True)
        sampler.start()
        with urllib.request.urlopen("http://127.0.0.1:18085/metrics") as response:
            (output / "prometheus-before.txt").write_bytes(response.read())
        print("Running baseline, ramp, sustained load, spike and recovery (~195 seconds)...", flush=True)
        started = time.perf_counter()
        with (output / "k6.log").open("w", encoding="utf-8") as log:
            result = subprocess.run(["k6", "run", "--no-color", "-e", f"PERF_OUTPUT={output.as_posix()}",
                                     str(ROOT / "loadtest/measured.js")], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        manifest["load_elapsed_seconds"] = time.perf_counter() - started
        manifest["k6_exit_code"] = result.returncode
        if not (output / "k6-summary.json").is_file():
            raise RuntimeError("k6 did not produce a summary; inspect k6.log")
        with urllib.request.urlopen("http://127.0.0.1:18085/metrics") as response:
            (output / "prometheus-after.txt").write_bytes(response.read())
        validation = sql('''USE nexus_ledger;
SELECT count(*) AS transactions, count(DISTINCT uetr) AS unique_uetrs,
       count(*) FILTER (WHERE status = 'SANCTIONED') AS review_transactions FROM "transaction";
SELECT count(*) AS unbalanced_transactions FROM
 (SELECT transaction_id FROM transaction_leg GROUP BY transaction_id
  HAVING count(*) != 2 OR sum(CASE WHEN leg_type = 'DEBIT' THEN amount ELSE -amount END) != 0);
SELECT count(*) AS negative_shards FROM account_shard WHERE balance < 0;
SELECT count(*) AS outbox_events FROM outbox;
SELECT (SELECT sum(1000000000 - s.total) FROM
 (SELECT account_id, sum(balance) AS total FROM account_shard
  WHERE CAST(account_id AS STRING) LIKE 'bbbbbbbb-0000-4000-8000-%' GROUP BY account_id) s)
 - (SELECT coalesce(sum(amount), 0) FROM "transaction") AS reservation_difference;
''')
        (output / "database-validation.csv").write_text(validation, encoding="utf-8")
        # Fail if any persisted monetary invariant fails, independent of HTTP.
        rows = list(csv.reader(io.StringIO(validation)))
        values = {tuple(rows[i]): rows[i + 1] for i in range(len(rows) - 1) if rows[i] and not rows[i][0].isdigit()}
        summary = json.loads((output / "k6-summary.json").read_text(encoding="utf-8"))
        attempts = int(summary["metrics"]["payments_accepted"]["values"]["count"]) + 3
        manifest["database_validation_passed"] = (
            values.get(("transactions", "unique_uetrs", "review_transactions")) == [str(attempts)] * 3
            and values.get(("unbalanced_transactions",)) == ["0"]
            and values.get(("negative_shards",)) == ["0"]
            and values.get(("outbox_events",)) == [str(attempts)]
            and float(values.get(("reservation_difference",), ["nan"])[0]) == 0
        )
        print(f"k6 exit={result.returncode}; database invariants={manifest['database_validation_passed']}", flush=True)
    finally:
        stop.set()
        if sampler:
            sampler.join(timeout=15)
        if process:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if service_log:
            service_log.close()
        # Only tear down dependencies created by this invocation.
        if "images" in manifest:
            command(COMPOSE + ["down"])
        manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"Evidence: {output}", flush=True)
    return 0 if manifest.get("k6_exit_code") == 0 and manifest.get("database_validation_passed") else 1


if __name__ == "__main__":
    raise SystemExit(main())

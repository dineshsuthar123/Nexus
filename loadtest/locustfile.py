"""
Nexus RTP - Locust Performance Test
===================================
Measures RPS, p50/p95/p99 latency, error rate, and throughput.

Scenarios:
  - 70% payment_create  : POST /api/v1/payments
  - 15% payment_status  : GET  /api/v1/payments/{uetr}/status
  - 10% account_lookup  : GET  /api/v1/accounts/{id}
  -  5% auth_refresh    : POST /api/v1/auth/refresh

Usage:
  locust -f loadtest/locustfile.py --headless --users 50 --spawn-rate 5 --run-time 5m --host http://localhost:8000

Local direct-service run without auth setup:
  LOADTEST_HOST=http://localhost:8085 LOADTEST_ACCOUNT_HOST=http://localhost:8086 LOADTEST_SKIP_AUTH=true locust -f loadtest/locustfile.py --headless --users 10 --spawn-rate 2 --run-time 1m
"""

import os
import random
import time
import uuid

from locust import HttpUser, between, events, task
from locust.exception import StopUser

ALICE_ID = "bbbbbbbb-0000-0000-0000-000000000001"
BOB_ID = "bbbbbbbb-0000-0000-0000-000000000002"

DEFAULT_LOADTEST_HOST = (
    os.getenv("LOADTEST_HOST")
    or os.getenv("LOADTEST_HOST_URL")
    or "http://localhost:8000"
)
ACCOUNT_HOST = os.getenv("LOADTEST_ACCOUNT_HOST", "").rstrip("/")
AUTH_HOST = os.getenv("LOADTEST_AUTH_HOST", "").rstrip("/")


def _truthy_env(name: str) -> bool:
    return os.getenv(name, "").lower() in {"1", "true", "yes", "on"}


def _url(host: str, path: str) -> str:
    return f"{host}{path}" if host else path


def _register_and_login(client, suffix: str) -> tuple[str, str]:
    """Register a fresh user and return (access_token, refresh_token)."""
    if _truthy_env("LOADTEST_SKIP_AUTH"):
        return "loadtest-skip-auth-token", ""

    env_token = os.getenv("LOADTEST_ACCESS_TOKEN") or os.getenv("LOADTEST_TEST_TOKEN")
    if env_token:
        return env_token, os.getenv("LOADTEST_REFRESH_TOKEN", "")

    email = f"loadtest-{suffix}@nexusrtp.local"
    password = os.getenv("LOADTEST_PASSWORD", "LoadTest@2026!")

    with client.post(
        _url(AUTH_HOST, "/api/v1/auth/register"),
        json={
            "email": email,
            "password": password,
            "firstName": "Load",
            "lastName": "Tester",
            "organization": "Nexus Perf",
        },
        name="/auth/register [setup]",
        catch_response=True,
    ) as resp:
        resp.success()

    max_retries = int(os.getenv("LOADTEST_LOGIN_RETRIES", "5"))
    backoff = float(os.getenv("LOADTEST_LOGIN_BACKOFF", "0.5"))
    for attempt in range(1, max_retries + 1):
        with client.post(
            _url(AUTH_HOST, "/api/v1/auth/login"),
            json={"email": email, "password": password},
            name="/auth/login [setup]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                try:
                    data = resp.json()
                except Exception as exc:
                    resp.failure(f"Invalid JSON login response: {exc}")
                    if attempt == max_retries:
                        raise StopUser()
                    time.sleep(backoff)
                    backoff *= 2
                    continue

                tokens = data.get("tokens", {})
                access = data.get("accessToken") or tokens.get("accessToken") or ""
                refresh = data.get("refreshToken") or tokens.get("refreshToken") or ""
                if not access:
                    resp.failure(f"No access token in login response: {data}")
                    if attempt == max_retries:
                        raise StopUser()
                    time.sleep(backoff)
                    backoff *= 2
                    continue

                resp.success()
                return access, refresh

            if attempt == max_retries:
                raise StopUser()
            time.sleep(backoff)
            backoff *= 2

    raise StopUser()


class PaymentUser(HttpUser):
    wait_time = between(0.1, 0.5)
    host = DEFAULT_LOADTEST_HOST

    def on_start(self):
        uid = str(uuid.uuid4())[:8]
        self.access_token, self.refresh_token = _register_and_login(self.client, uid)
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        self.recent_uetrs: list[str] = []

    @task(70)
    def create_payment(self):
        uetr = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)

        with self.client.post(
            "/api/v1/payments",
            json={
                "messageId": f"MSG-{now_ms}",
                "creationDateTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "endToEndId": f"E2E-{now_ms}",
                "uetr": uetr,
                "amount": "1.00",
                "currency": "USD",
                "debtorAccountId": ALICE_ID,
                "creditorAccountId": BOB_ID,
                "debtorName": "Alice Wonderland",
                "creditorName": "Bob The Builder",
                "debtorCountry": "US",
                "creditorCountry": "GB",
            },
            headers={**self.headers, "X-Idempotency-Key": uetr},
            name="/payments [POST]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 201, 202):
                resp.success()
                data = resp.json()
                saved_uetr = data.get("uetr", uetr)
                if len(self.recent_uetrs) >= 20:
                    self.recent_uetrs.pop(0)
                self.recent_uetrs.append(saved_uetr)
            elif resp.status_code == 409:
                resp.success()
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")

    @task(15)
    def get_payment_status(self):
        if not self.recent_uetrs:
            return

        uetr = random.choice(self.recent_uetrs)
        with self.client.get(
            f"/api/v1/payments/{uetr}/status",
            headers=self.headers,
            name="/payments/{uetr}/status [GET]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")

    @task(10)
    def get_account(self):
        account_id = random.choice([ALICE_ID, BOB_ID])
        with self.client.get(
            _url(ACCOUNT_HOST, f"/api/v1/accounts/{account_id}"),
            headers=self.headers,
            name="/accounts/{id} [GET]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")

    @task(5)
    def refresh_token(self):
        if not self.refresh_token:
            return

        with self.client.post(
            _url(AUTH_HOST, "/api/v1/auth/refresh"),
            json={"refreshToken": self.refresh_token},
            name="/auth/refresh [POST]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                new_access = data.get("accessToken") or data.get("tokens", {}).get("accessToken")
                if new_access:
                    self.access_token = new_access
                    self.headers = {"Authorization": f"Bearer {new_access}"}
            resp.success()


@events.quitting.add_listener
def on_quit(environment, **kwargs):
    stats = environment.stats
    total = stats.total
    elapsed = time.time() - stats.start_time if stats.start_time else 1
    avg_rps = total.num_requests / elapsed if elapsed else 0
    peak_rps = max(total.num_reqs_per_sec.values()) if total.num_reqs_per_sec else 0

    print("\n" + "=" * 60)
    print("  NEXUS RTP - PERFORMANCE RESULTS")
    print("=" * 60)
    print(f"  Total requests  : {total.num_requests:,}")
    print(f"  Failures        : {total.num_failures:,} ({total.fail_ratio * 100:.1f}%)")
    print(f"  RPS (avg)       : {avg_rps:.1f}")
    print(f"  RPS (peak)      : {peak_rps:.1f}")
    print(f"  Latency P50     : {total.get_response_time_percentile(0.50):.0f} ms")
    print(f"  Latency P95     : {total.get_response_time_percentile(0.95):.0f} ms")
    print(f"  Latency P99     : {total.get_response_time_percentile(0.99):.0f} ms")
    print(f"  Latency max     : {total.max_response_time:.0f} ms")
    print(f"  Throughput      : {total.total_content_length / 1024 / 1024:.1f} MB received")
    print("=" * 60)
    print("\nPer-endpoint breakdown:")
    print(f"  {'Endpoint':<40} {'Reqs':>7} {'Fail%':>6} {'P95ms':>7}")
    print(f"  {'-' * 40} {'-' * 7} {'-' * 6} {'-' * 7}")
    for name, entry in sorted(stats.entries.items()):
        p95 = entry.get_response_time_percentile(0.95) or 0
        fail_pct = (entry.num_failures / entry.num_requests * 100) if entry.num_requests else 0
        endpoint = str(name[0])[:40]
        print(f"  {endpoint:<40} {entry.num_requests:>7,} {fail_pct:>5.1f}% {p95:>7.0f}")
    print()

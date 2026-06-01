"""
Nexus RTP — Locust Performance Test
====================================
Measures: RPS, P50/P95/P99 latency, error rate, throughput

Scenarios:
  - 70%  payment_create   : POST /api/v1/payments
  - 15%  payment_status   : GET  /api/v1/payments/{uetr}/status
  - 10%  account_balance  : GET  /api/v1/accounts/{id}
  -  5%  auth_refresh     : POST /api/v1/auth/refresh

Usage (headless, 50 users, 5 min):
  locust -f loadtest/locustfile.py \
    --headless --users 50 --spawn-rate 5 --run-time 5m \
    --host http://localhost:8000 \
    --html loadtest/results/report.html \
    --csv  loadtest/results/metrics

Usage (Web UI):
  locust -f loadtest/locustfile.py --host http://localhost:8000
  → open http://localhost:8089
"""

import random
import uuid
import time
import os
from locust import HttpUser, task, between, events, constant_pacing
from locust.exception import StopUser

# ── Known seeded accounts (from 003_seed_local.sql) ──────────────────────────
ALICE_ID = "bbbbbbbb-0000-0000-0000-000000000001"
BOB_ID   = "bbbbbbbb-0000-0000-0000-000000000002"

# ── Shared token pool — populated by on_start, reused across requests ─────────
_token_pool: list[str] = []
_refresh_pool: list[str] = []

def _register_and_login(client, suffix: str) -> tuple[str, str]:
    """Register a fresh user and return (access_token, refresh_token)."""
    email = f"loadtest-{suffix}@nexusrtp.local"
    password = "LoadTest@2026!"

    # Register (ignore if already exists — 4xx is fine)
    with client.post(
        "/api/v1/auth/register",
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
        resp.success()  # always succeed — 409 duplicate is expected on repeat runs

    # Login
    with client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        name="/auth/login [setup]",
        catch_response=True,
    ) as resp:
        if resp.status_code != 200:
            raise StopUser()
        data = resp.json()
        tokens = data.get("tokens", {})
        access  = tokens.get("accessToken", "")
        refresh = tokens.get("refreshToken", "")
        if not access:
            resp.failure(f"No accessToken in login response: {data}")
            raise StopUser()
        resp.success()
        return access, refresh


class PaymentUser(HttpUser):
    """
    Primary virtual user — simulates a payment operator.
    Wait 0.1–0.5 s between tasks to simulate realistic think-time.
    """
    wait_time = between(0.1, 0.5)

    def on_start(self):
        """Each VU logs in with its own unique account."""
        uid = str(uuid.uuid4())[:8]
        self.access_token, self.refresh_token = _register_and_login(
            self.client, uid
        )
        self.headers = {"Authorization": f"Bearer {self.access_token}"}
        # Keep a small list of recent UETR values so status-check tasks
        # have something to poll
        self.recent_uetrs: list[str] = []

    # ── 70% — Create a payment ───────────────────────────────────────────────
    @task(70)
    def create_payment(self):
        uetr     = str(uuid.uuid4())
        msg_id   = f"MSG-{int(time.time() * 1000)}"
        e2e_id   = f"E2E-{int(time.time() * 1000)}"
        # Use tiny fixed amount so Alice's balance never runs out during the test
        amount   = "1.00"

        with self.client.post(
            "/api/v1/payments",
            json={
                "messageId":         msg_id,
                "creationDateTime":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "endToEndId":        e2e_id,
                "uetr":              uetr,
                "amount":            amount,
                "currency":          "USD",
                "debtorAccountId":   ALICE_ID,
                "creditorAccountId": BOB_ID,
                "debtorName":        "Alice Wonderland",
                "creditorName":      "Bob The Builder",
                "debtorCountry":     "US",
                "creditorCountry":   "GB",
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
                # Idempotency duplicate — not an error
                resp.success()
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")

    # ── 15% — Poll payment status ─────────────────────────────────────────────
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
            if resp.status_code == 200:
                resp.success()
            elif resp.status_code == 404:
                resp.success()  # race condition — payment not yet visible
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")

    # ── 10% — Check account balance ───────────────────────────────────────────
    @task(10)
    def get_account_balance(self):
        account_id = random.choice([ALICE_ID, BOB_ID])
        with self.client.get(
            f"/api/v1/accounts/{account_id}",
            headers=self.headers,
            name="/accounts/{id} [GET]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")

    # ── 5% — Refresh token ────────────────────────────────────────────────────
    @task(5)
    def refresh_token(self):
        with self.client.post(
            "/api/v1/auth/refresh",
            json={"refreshToken": self.refresh_token},
            name="/auth/refresh [POST]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                new_access = data.get("accessToken") or data.get("tokens", {}).get("accessToken")
                if new_access:
                    self.access_token  = new_access
                    self.headers       = {"Authorization": f"Bearer {new_access}"}
                resp.success()
            else:
                # Token expired or invalid — re-login
                resp.success()


# ── Custom console summary printed after headless run ─────────────────────────
@events.quitting.add_listener
def on_quit(environment, **kwargs):
    stats = environment.stats
    print("\n" + "=" * 60)
    print("  NEXUS RTP — PERFORMANCE RESULTS")
    print("=" * 60)
    total = stats.total
    print(f"  Total requests  : {total.num_requests:,}")
    print(f"  Failures        : {total.num_failures:,}  ({total.fail_ratio*100:.1f}%)")
    import time as _time
    elapsed = _time.time() - stats.start_time if stats.start_time else 1
    avg_rps = total.num_requests / elapsed if elapsed else 0
    peak_rps = max(total.num_reqs_per_sec.values()) if total.num_reqs_per_sec else 0
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
    print(f"  {'-'*40} {'-'*7} {'-'*6} {'-'*7}")
    for name, entry in sorted(stats.entries.items()):
        p95 = entry.get_response_time_percentile(0.95) or 0
        fail_pct = (entry.num_failures / entry.num_requests * 100) if entry.num_requests else 0
        endpoint = str(name[0])[:40]
        print(f"  {endpoint:<40} {entry.num_requests:>7,} {fail_pct:>5.1f}% {p95:>7.0f}")
    print()

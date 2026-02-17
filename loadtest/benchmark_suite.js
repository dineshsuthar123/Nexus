// Nexus RTP Production Benchmark Suite
// Comprehensive ramp/soak/spike tests for production readiness validation
//
// Usage:
//   k6 run --out json=results.json loadtest/benchmark_suite.js
//   k6 run -e SCENARIO=soak loadtest/benchmark_suite.js
//   k6 run -e SCENARIO=spike loadtest/benchmark_suite.js
//   k6 run -e SCENARIO=breakpoint loadtest/benchmark_suite.js

import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// =============================================================================
// METRICS
// =============================================================================
const paymentLatency = new Trend('payment_latency_ms', true);
const authLatency = new Trend('auth_latency_ms', true);
const accountLatency = new Trend('account_latency_ms', true);
const e2eLatency = new Trend('e2e_latency_ms', true);

const paymentSuccess = new Rate('payment_success_rate');
const authSuccess = new Rate('auth_success_rate');
const sloCompliance = new Rate('slo_compliance_rate');

const totalRequests = new Counter('total_requests');
const totalErrors = new Counter('total_errors');
const timeouts = new Counter('request_timeouts');

// =============================================================================
// CONFIG
// =============================================================================
const BASE_URL = __ENV.API_URL || 'http://localhost:8085';
const AUTH_URL = __ENV.AUTH_URL || 'http://localhost:8088';
const ACCOUNT_URL = __ENV.ACCOUNT_URL || 'http://localhost:8086';

// SLO thresholds
const SLO = {
  payment_p95_ms: 500,
  payment_p99_ms: 1000,
  payment_success_rate: 0.999,
  auth_p99_ms: 200,
  e2e_p99_ms: 3000,
};

// =============================================================================
// SCENARIOS
// =============================================================================
const SCENARIO = __ENV.SCENARIO || 'ramp';

const scenarios = {
  // Ramp test: gradually increase to peak, hold, then decrease
  ramp: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },    // Warm up
        { duration: '3m', target: 200 },   // Ramp to baseline
        { duration: '5m', target: 500 },   // Ramp to moderate
        { duration: '5m', target: 1000 },  // Ramp to peak
        { duration: '10m', target: 1000 }, // Hold at peak
        { duration: '3m', target: 200 },   // Cool down
        { duration: '2m', target: 0 },     // Stop
      ],
      gracefulRampDown: '30s',
    },
  },

  // Soak test: sustained load for extended period
  soak: {
    sustained_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '2h',
    },
  },

  // Spike test: sudden traffic spikes
  spike: {
    spike_pattern: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '2m', target: 50 },     // Baseline
        { duration: '10s', target: 2000 },  // Spike to 40x
        { duration: '3m', target: 2000 },   // Hold spike
        { duration: '10s', target: 50 },    // Drop back
        { duration: '5m', target: 50 },     // Recovery period
        { duration: '10s', target: 3000 },  // Bigger spike
        { duration: '3m', target: 3000 },   // Hold
        { duration: '10s', target: 50 },    // Drop
        { duration: '5m', target: 50 },     // Cool down
      ],
      gracefulRampDown: '30s',
    },
  },

  // Breakpoint test: find the breaking point
  breakpoint: {
    find_limit: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 500 },
        { duration: '5m', target: 1000 },
        { duration: '5m', target: 2000 },
        { duration: '5m', target: 5000 },
        { duration: '5m', target: 10000 },
      ],
      preAllocatedVUs: 500,
      maxVUs: 10000,
    },
  },
};

export const options = {
  scenarios: scenarios[SCENARIO] || scenarios.ramp,
  thresholds: {
    // SLO-based thresholds — test fails if these are breached
    'payment_latency_ms': [
      { threshold: `p(95)<${SLO.payment_p95_ms}`, abortOnFail: false },
      { threshold: `p(99)<${SLO.payment_p99_ms}`, abortOnFail: false },
    ],
    'auth_latency_ms': [
      { threshold: `p(99)<${SLO.auth_p99_ms}`, abortOnFail: false },
    ],
    'e2e_latency_ms': [
      { threshold: `p(99)<${SLO.e2e_p99_ms}`, abortOnFail: false },
    ],
    'payment_success_rate': [
      { threshold: `rate>${SLO.payment_success_rate}`, abortOnFail: false },
    ],
    'http_req_failed': [
      { threshold: 'rate<0.01', abortOnFail: false },
    ],
  },
  noConnectionReuse: false,
  userAgent: 'NexusRTP-Benchmark/1.0',
};

// =============================================================================
// SETUP — authenticate and prepare test data
// =============================================================================
export function setup() {
  // Get auth token
  const loginRes = http.post(`${AUTH_URL}/api/v1/auth/login`, JSON.stringify({
    email: __ENV.TEST_EMAIL || 'loadtest@nexus-rtp.internal',
    password: __ENV.TEST_PASSWORD || 'loadtest-password',
  }), { headers: { 'Content-Type': 'application/json' } });

  const token = loginRes.json('access_token') || 'test-token';

  // Pre-create test accounts
  const accounts = [];
  for (let i = 0; i < 100; i++) {
    accounts.push(`BENCH-${String(i).padStart(6, '0')}`);
  }

  return { token, accounts, startTime: Date.now() };
}

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
    'X-Request-ID': uuidv4(),
  };

  // Weighted scenario selection (production traffic pattern)
  const rand = Math.random();
  if (rand < 0.40) {
    testPaymentCreation(headers, data);
  } else if (rand < 0.60) {
    testPaymentQuery(headers, data);
  } else if (rand < 0.75) {
    testAccountBalance(headers, data);
  } else if (rand < 0.85) {
    testAuthentication(data);
  } else if (rand < 0.95) {
    testIdempotencyRetry(headers, data);
  } else {
    testEndToEndFlow(headers, data);
  }

  sleep(Math.random() * 0.5); // Jitter
}

// =============================================================================
// TEST SCENARIOS
// =============================================================================

function testPaymentCreation(headers, data) {
  const fromAccount = data.accounts[Math.floor(Math.random() * data.accounts.length)];
  const toAccount = data.accounts[Math.floor(Math.random() * data.accounts.length)];
  const amount = (Math.random() * 9999 + 1).toFixed(2);
  const currencies = ['USD', 'EUR', 'GBP'];
  const currency = currencies[Math.floor(Math.random() * currencies.length)];

  const payload = JSON.stringify({
    from_account: fromAccount,
    to_account: toAccount,
    amount: parseFloat(amount),
    currency: currency,
    reference: `BENCH-${uuidv4().substring(0, 8)}`,
    metadata: { benchmark: true, scenario: SCENARIO },
  });

  headers['Idempotency-Key'] = uuidv4();

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/payments`, payload, { headers, timeout: '10s' });
  const duration = Date.now() - start;

  totalRequests.add(1);
  paymentLatency.add(duration);

  const success = check(res, {
    'payment created (201/202)': (r) => r.status === 201 || r.status === 202,
    'has payment ID': (r) => r.json('id') !== undefined || r.json('payment_id') !== undefined,
    'latency under SLO': () => duration < SLO.payment_p99_ms,
  });

  paymentSuccess.add(success ? 1 : 0);
  sloCompliance.add(duration < SLO.payment_p95_ms ? 1 : 0);

  if (!success) {
    totalErrors.add(1);
    if (duration >= 10000) timeouts.add(1);
  }
}

function testPaymentQuery(headers, data) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/payments?limit=10&status=completed`, { headers, timeout: '5s' });
  const duration = Date.now() - start;

  totalRequests.add(1);
  paymentLatency.add(duration);

  check(res, {
    'query success (200)': (r) => r.status === 200,
    'has results': (r) => {
      try { return Array.isArray(r.json('payments') || r.json('data')); }
      catch { return false; }
    },
  });
}

function testAccountBalance(headers, data) {
  const account = data.accounts[Math.floor(Math.random() * data.accounts.length)];

  const start = Date.now();
  const res = http.get(`${ACCOUNT_URL}/api/v1/accounts/${account}/balance`, { headers, timeout: '5s' });
  const duration = Date.now() - start;

  totalRequests.add(1);
  accountLatency.add(duration);

  check(res, {
    'balance query success': (r) => r.status === 200 || r.status === 404, // 404 ok for non-existent test accounts
  });
}

function testAuthentication(data) {
  const start = Date.now();
  const res = http.post(`${AUTH_URL}/api/v1/auth/login`, JSON.stringify({
    email: __ENV.TEST_EMAIL || 'loadtest@nexus-rtp.internal',
    password: __ENV.TEST_PASSWORD || 'loadtest-password',
  }), { headers: { 'Content-Type': 'application/json' }, timeout: '5s' });
  const duration = Date.now() - start;

  totalRequests.add(1);
  authLatency.add(duration);

  const success = check(res, {
    'auth success (200)': (r) => r.status === 200,
    'has access_token': (r) => {
      try { return r.json('access_token') !== undefined; }
      catch { return false; }
    },
    'auth latency under SLO': () => duration < SLO.auth_p99_ms,
  });

  authSuccess.add(success ? 1 : 0);
}

function testIdempotencyRetry(headers, data) {
  const idempotencyKey = uuidv4();
  const payload = JSON.stringify({
    from_account: data.accounts[0],
    to_account: data.accounts[1],
    amount: 10.00,
    currency: 'USD',
    reference: `IDEM-${idempotencyKey.substring(0, 8)}`,
  });

  headers['Idempotency-Key'] = idempotencyKey;

  // First request
  const res1 = http.post(`${BASE_URL}/api/v1/payments`, payload, { headers, timeout: '10s' });

  // Retry with same idempotency key — should return same result
  const res2 = http.post(`${BASE_URL}/api/v1/payments`, payload, { headers, timeout: '10s' });

  totalRequests.add(2);

  check(res2, {
    'idempotent retry returns same status': () => res1.status === res2.status,
    'idempotent retry returns same body': () => {
      try {
        const id1 = res1.json('id') || res1.json('payment_id');
        const id2 = res2.json('id') || res2.json('payment_id');
        return id1 === id2;
      } catch { return false; }
    },
  });
}

function testEndToEndFlow(headers, data) {
  const e2eStart = Date.now();

  group('E2E: Full Payment Flow', () => {
    // 1. Check sender balance
    const senderBalance = http.get(
      `${ACCOUNT_URL}/api/v1/accounts/${data.accounts[0]}/balance`,
      { headers, timeout: '5s' }
    );

    // 2. Create payment
    const idempotencyKey = uuidv4();
    headers['Idempotency-Key'] = idempotencyKey;

    const payment = http.post(`${BASE_URL}/api/v1/payments`, JSON.stringify({
      from_account: data.accounts[0],
      to_account: data.accounts[1],
      amount: 1.00,
      currency: 'USD',
      reference: `E2E-${uuidv4().substring(0, 8)}`,
    }), { headers, timeout: '10s' });

    check(payment, {
      'e2e: payment created': (r) => r.status === 201 || r.status === 202,
    });

    // 3. Query payment status (poll)
    if (payment.status === 201 || payment.status === 202) {
      let paymentId;
      try { paymentId = payment.json('id') || payment.json('payment_id'); }
      catch { return; }

      if (paymentId) {
        sleep(0.5);
        const status = http.get(`${BASE_URL}/api/v1/payments/${paymentId}`, { headers, timeout: '5s' });
        check(status, {
          'e2e: payment queryable': (r) => r.status === 200,
        });
      }
    }
  });

  const e2eDuration = Date.now() - e2eStart;
  e2eLatency.add(e2eDuration);
  totalRequests.add(1);
}

// =============================================================================
// CUSTOM SUMMARY
// =============================================================================
export function handleSummary(data) {
  const summary = {
    scenario: SCENARIO,
    timestamp: new Date().toISOString(),
    slo_results: {
      payment_p95_ms: {
        target: SLO.payment_p95_ms,
        actual: data.metrics.payment_latency_ms?.values?.['p(95)'] || 'N/A',
        pass: (data.metrics.payment_latency_ms?.values?.['p(95)'] || 0) < SLO.payment_p95_ms,
      },
      payment_p99_ms: {
        target: SLO.payment_p99_ms,
        actual: data.metrics.payment_latency_ms?.values?.['p(99)'] || 'N/A',
        pass: (data.metrics.payment_latency_ms?.values?.['p(99)'] || 0) < SLO.payment_p99_ms,
      },
      payment_success_rate: {
        target: SLO.payment_success_rate,
        actual: data.metrics.payment_success_rate?.values?.rate || 'N/A',
        pass: (data.metrics.payment_success_rate?.values?.rate || 0) > SLO.payment_success_rate,
      },
      auth_p99_ms: {
        target: SLO.auth_p99_ms,
        actual: data.metrics.auth_latency_ms?.values?.['p(99)'] || 'N/A',
        pass: (data.metrics.auth_latency_ms?.values?.['p(99)'] || 0) < SLO.auth_p99_ms,
      },
      e2e_p99_ms: {
        target: SLO.e2e_p99_ms,
        actual: data.metrics.e2e_latency_ms?.values?.['p(99)'] || 'N/A',
        pass: (data.metrics.e2e_latency_ms?.values?.['p(99)'] || 0) < SLO.e2e_p99_ms,
      },
    },
    totals: {
      requests: data.metrics.total_requests?.values?.count || 0,
      errors: data.metrics.total_errors?.values?.count || 0,
      timeouts: data.metrics.request_timeouts?.values?.count || 0,
    },
  };

  return {
    'stdout': textSummary(data, { indent: '  ', enableColors: true }),
    'loadtest/results/benchmark_summary.json': JSON.stringify(summary, null, 2),
  };
}

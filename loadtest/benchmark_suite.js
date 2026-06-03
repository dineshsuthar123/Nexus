// Nexus RTP Production Benchmark Suite
// Current-contract k6 scenarios for payment latency, idempotency, and read paths.
//
// Quick local smoke:
//   k6 run -e SCENARIO=smoke loadtest/benchmark_suite.js
//
// Larger profiles:
//   k6 run -e SCENARIO=ramp loadtest/benchmark_suite.js
//   k6 run -e SCENARIO=soak loadtest/benchmark_suite.js
//   k6 run -e SCENARIO=spike loadtest/benchmark_suite.js
//   k6 run -e SCENARIO=breakpoint loadtest/benchmark_suite.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

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

const BASE_URL = __ENV.API_URL || 'http://localhost:8085';
const AUTH_URL = __ENV.AUTH_URL || 'http://localhost:8088';
const ACCOUNT_URL = __ENV.ACCOUNT_URL || 'http://localhost:8086';
const INCLUDE_AUTH_FLOW = String(__ENV.INCLUDE_AUTH_FLOW || 'false').toLowerCase() === 'true';

const SEEDED_ACCOUNTS = (
  __ENV.BENCHMARK_ACCOUNTS ||
  'bbbbbbbb-0000-0000-0000-000000000001,bbbbbbbb-0000-0000-0000-000000000002'
).split(',').map((id) => id.trim()).filter(Boolean);

const SLO = {
  payment_p95_ms: Number(__ENV.SLO_PAYMENT_P95_MS || 500),
  payment_p99_ms: Number(__ENV.SLO_PAYMENT_P99_MS || 1000),
  payment_success_rate: Number(__ENV.SLO_PAYMENT_SUCCESS_RATE || 0.99),
  auth_p99_ms: Number(__ENV.SLO_AUTH_P99_MS || 300),
  e2e_p99_ms: Number(__ENV.SLO_E2E_P99_MS || 3000),
};

const SCENARIO = __ENV.SCENARIO || 'smoke';

const scenarios = {
  smoke: {
    smoke: {
      executor: 'constant-vus',
      vus: Number(__ENV.SMOKE_VUS || 4),
      duration: __ENV.SMOKE_DURATION || '20s',
      gracefulStop: '5s',
    },
  },
  ramp: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 200 },
        { duration: '5m', target: 500 },
        { duration: '5m', target: 1000 },
        { duration: '10m', target: 1000 },
        { duration: '3m', target: 200 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  soak: {
    sustained_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '2h',
    },
  },
  spike: {
    spike_pattern: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '10s', target: 2000 },
        { duration: '3m', target: 2000 },
        { duration: '10s', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '10s', target: 3000 },
        { duration: '3m', target: 3000 },
        { duration: '10s', target: 50 },
        { duration: '5m', target: 50 },
      ],
      gracefulRampDown: '30s',
    },
  },
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

const thresholds = {
  payment_latency_ms: [
    { threshold: `p(95)<${SLO.payment_p95_ms}`, abortOnFail: false },
    { threshold: `p(99)<${SLO.payment_p99_ms}`, abortOnFail: false },
  ],
  e2e_latency_ms: [
    { threshold: `p(99)<${SLO.e2e_p99_ms}`, abortOnFail: false },
  ],
  payment_success_rate: [
    { threshold: `rate>${SLO.payment_success_rate}`, abortOnFail: false },
  ],
  http_req_failed: [
    { threshold: 'rate<0.01', abortOnFail: false },
  ],
};

if (INCLUDE_AUTH_FLOW) {
  thresholds.auth_latency_ms = [
    { threshold: `p(99)<${SLO.auth_p99_ms}`, abortOnFail: false },
  ];
}

export const options = {
  scenarios: scenarios[SCENARIO] || scenarios.smoke,
  thresholds,
  noConnectionReuse: false,
  userAgent: 'NexusRTP-Benchmark/2.0',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  console.log(`Benchmark scenario: ${SCENARIO}`);
  console.log(`Payment API: ${BASE_URL}`);
  console.log(`Account API: ${ACCOUNT_URL}`);
  console.log(`Auth API: ${AUTH_URL}`);
  console.log(`Auth flow enabled: ${INCLUDE_AUTH_FLOW}`);

  const health = http.get(`${BASE_URL}/health`, { timeout: '5s' });
  if (health.status !== 200) {
    console.warn(`Payment health returned ${health.status}; continuing so gateway runs can still be measured.`);
  }

  const token = loginToken();
  return {
    token,
    accounts: SEEDED_ACCOUNTS,
    startTime: Date.now(),
  };
}

export default function (data) {
  const rand = Math.random();
  if (rand < 0.48) {
    testPaymentCreation(data);
  } else if (rand < 0.68) {
    testPaymentQuery(data);
  } else if (rand < 0.85) {
    testAccountLookup(data);
  } else if (rand < 0.90 && INCLUDE_AUTH_FLOW) {
    testAuthentication();
  } else if (rand < 0.96) {
    testIdempotencyRetry(data);
  } else {
    testEndToEndFlow(data);
  }

  sleep(Math.random() * 0.2);
}

function loginToken() {
  if (__ENV.TEST_ACCESS_TOKEN) {
    return __ENV.TEST_ACCESS_TOKEN;
  }
  if (!INCLUDE_AUTH_FLOW) {
    return 'benchmark-placeholder-token';
  }

  const email = __ENV.TEST_EMAIL || 'admin@nexus-rtp.dev';
  const password = __ENV.TEST_PASSWORD || 'admin123';
  const res = http.post(`${AUTH_URL}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
    timeout: '5s',
  });

  if (res.status !== 200) {
    console.warn(`Auth login returned ${res.status}; direct service benchmarks will continue with a placeholder token.`);
    return 'benchmark-placeholder-token';
  }

  const token = jsonValue(res, 'accessToken') || jsonValue(res, 'tokens.accessToken');
  if (!token) {
    console.warn('Auth login response did not include an access token; using placeholder token.');
    return 'benchmark-placeholder-token';
  }
  return token;
}

function requestHeaders(token, idempotencyKey = null) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Request-ID': uuidv4(),
  };
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey;
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}

function paymentPayload(data, amount = null) {
  const uetr = uuidv4();
  const short = uetr.substring(0, 8);
  return {
    messageId: `MSG-${short}`,
    creationDateTime: new Date().toISOString(),
    endToEndId: `E2E-${short}`,
    uetr,
    amount: amount || Number((Math.random() * 49 + 1).toFixed(2)),
    currency: 'USD',
    debtorAccountId: data.accounts[0],
    creditorAccountId: data.accounts[1],
    debtorName: 'Benchmark Debtor',
    creditorName: 'Benchmark Creditor',
    debtorCountry: 'US',
    creditorCountry: 'US',
    remittanceInfo: 'k6 benchmark payment',
  };
}

function jsonValue(res, path) {
  try {
    return res.json(path);
  } catch {
    return undefined;
  }
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isCreateAccepted(res) {
  return [200, 201, 202].includes(res.status);
}

function isReviewOrProcessableStatus(status) {
  return ['CLEARED', 'SANCTIONED', 'FRAUD_REVIEW', 'PENDING', 'SETTLED', 'COMPLETED', 'CANCELLED'].includes(status);
}

function testPaymentCreation(data) {
  const payload = paymentPayload(data);
  const idempotencyKey = uuidv4();
  const headers = requestHeaders(data.token, idempotencyKey);

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/payments`, JSON.stringify(payload), { headers, timeout: '10s' });
  const duration = Date.now() - start;

  totalRequests.add(1);
  paymentLatency.add(duration);

  const success = check(res, {
    'payment create accepted': isCreateAccepted,
    'payment has uetr': (r) => jsonValue(r, 'uetr') !== undefined,
    'payment has transaction id or review response': (r) => jsonValue(r, 'transactionId') !== undefined || jsonValue(r, 'status') === 'REJECTED',
    'payment latency under p99 SLO': () => duration < SLO.payment_p99_ms,
  });

  paymentSuccess.add(success ? 1 : 0);
  sloCompliance.add(duration < SLO.payment_p95_ms ? 1 : 0);
  if (!success) {
    totalErrors.add(1);
    if (duration >= 10000) timeouts.add(1);
  }
}

function testPaymentQuery(data) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/v1/payments?page=1&pageSize=20`, {
    headers: requestHeaders(data.token),
    timeout: '5s',
  });
  const duration = Date.now() - start;

  totalRequests.add(1);
  paymentLatency.add(duration);

  const ok = check(res, {
    'payment list success': (r) => r.status === 200,
    'payment list has data array': (r) => Array.isArray(jsonValue(r, 'data')) || Array.isArray(jsonValue(r, 'payments')),
  });
  if (!ok) totalErrors.add(1);
}

function testAccountLookup(data) {
  const account = data.accounts[Math.floor(Math.random() * data.accounts.length)];
  const start = Date.now();
  const res = http.get(`${ACCOUNT_URL}/api/v1/accounts/${account}`, {
    headers: requestHeaders(data.token),
    timeout: '5s',
  });
  const duration = Date.now() - start;

  totalRequests.add(1);
  accountLatency.add(duration);

  const ok = check(res, {
    'account lookup success': (r) => r.status === 200,
    'account lookup returns id': (r) => jsonValue(r, 'id') !== undefined,
  });
  if (!ok) totalErrors.add(1);
}

function testAuthentication() {
  const start = Date.now();
  const token = loginToken();
  const duration = Date.now() - start;

  totalRequests.add(1);
  authLatency.add(duration);

  const success = token !== 'benchmark-placeholder-token';
  check(null, {
    'auth login produced token': () => success,
    'auth latency under SLO': () => duration < SLO.auth_p99_ms,
  });
  authSuccess.add(success ? 1 : 0);
  if (!success) totalErrors.add(1);
}

function testIdempotencyRetry(data) {
  const idempotencyKey = uuidv4();
  const payload = paymentPayload(data, 1.23);
  const headers = requestHeaders(data.token, idempotencyKey);

  const res1 = http.post(`${BASE_URL}/api/v1/payments`, JSON.stringify(payload), { headers, timeout: '10s' });
  const res2 = http.post(`${BASE_URL}/api/v1/payments`, JSON.stringify(payload), { headers, timeout: '10s' });

  totalRequests.add(2);

  const ok = check(res2, {
    'idempotent retry accepted': (r) => isCreateAccepted(res1) && isCreateAccepted(r),
    'idempotent retry returns same uetr': (r) => jsonValue(res1, 'uetr') === jsonValue(r, 'uetr'),
    'idempotent retry returns same transaction': (r) => jsonValue(res1, 'transactionId') === jsonValue(r, 'transactionId'),
  });
  paymentSuccess.add(ok ? 1 : 0);
  if (!ok) totalErrors.add(1);
}

function testEndToEndFlow(data) {
  const e2eStart = Date.now();

  group('E2E: create, query, cancel', () => {
    const payload = paymentPayload(data, 2.34);
    const headers = requestHeaders(data.token, uuidv4());

    const payment = http.post(`${BASE_URL}/api/v1/payments`, JSON.stringify(payload), { headers, timeout: '10s' });
    const created = check(payment, {
      'e2e payment created': isCreateAccepted,
      'e2e status processable': (r) => isReviewOrProcessableStatus(jsonValue(r, 'status')),
    });

    if (!created) {
      totalErrors.add(1);
      return;
    }

    sleep(0.1);
    const uetr = jsonValue(payment, 'uetr') || payload.uetr;
    const status = http.get(`${BASE_URL}/api/v1/payments/${uetr}`, {
      headers: requestHeaders(data.token),
      timeout: '5s',
    });
    check(status, {
      'e2e payment queryable': (r) => r.status === 200,
    });

    const cancel = http.post(`${BASE_URL}/api/v1/payments/${uetr}/cancel`, JSON.stringify({
      reasonCode: 'CUST',
      reasonText: 'k6 benchmark cleanup',
    }), {
      headers: requestHeaders(data.token),
      timeout: '10s',
    });
    check(cancel, {
      'e2e payment cancelled or already terminal': (r) => r.status === 200 || r.status === 409,
    });
  });

  const e2eDuration = Date.now() - e2eStart;
  e2eLatency.add(e2eDuration);
  totalRequests.add(1);
}

export function handleSummary(data) {
  const summary = {
    scenario: SCENARIO,
    timestamp: new Date().toISOString(),
    urls: {
      payment: BASE_URL,
      account: ACCOUNT_URL,
      auth: AUTH_URL,
    },
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
      http_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
    },
  };

  return {
    stdout: formatTextSummary(data, summary),
    'loadtest/results/benchmark_summary.json': JSON.stringify(summary, null, 2),
  };
}

function formatTextSummary(data, summary) {
  const httpReqs = data.metrics.http_reqs?.values?.count || 0;
  const httpFailures = data.metrics.http_req_failed?.values?.rate || 0;
  const p95 = summary.slo_results.payment_p95_ms.actual;
  const p99 = summary.slo_results.payment_p99_ms.actual;
  const success = summary.slo_results.payment_success_rate.actual;

  return [
    '',
    '========== NEXUS RTP BENCHMARK SUMMARY ==========',
    `Scenario          : ${summary.scenario}`,
    `HTTP requests     : ${httpReqs}`,
    `HTTP failure rate : ${(httpFailures * 100).toFixed(2)}%`,
    `Payment p95       : ${p95} ms`,
    `Payment p99       : ${p99} ms`,
    `Payment success   : ${success}`,
    `Total errors      : ${summary.totals.errors}`,
    `Timeouts          : ${summary.totals.timeouts}`,
    '================================================',
    '',
  ].join('\n');
}

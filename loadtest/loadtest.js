// Nexus RTP k6 Load Test Script
// Run: k6 run --vus 100 --duration 30m loadtest.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// CUSTOM METRICS
// =============================================================================

// Counters
const paymentsCompleted = new Counter('payments_completed');
const paymentsFailed = new Counter('payments_failed');
const invariantViolations = new Counter('invariant_violations');
const idempotencyHits = new Counter('idempotency_hits');

// Trends
const paymentDuration = new Trend('payment_duration', true);
const balanceQueryDuration = new Trend('balance_query_duration', true);
const fxConversionDuration = new Trend('fx_conversion_duration', true);

// Rates
const paymentSuccessRate = new Rate('payment_success_rate');
const errorRate = new Rate('error_rate');

// Gauges
const activePayments = new Gauge('active_payments');

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = __ENV.API_URL || 'http://localhost:8085';
const AUTH_URL = __ENV.AUTH_URL || 'http://localhost:8088';
const ACCOUNT_URL = __ENV.ACCOUNT_URL || 'http://localhost:8086';
const NOTIFICATION_URL = __ENV.NOTIFICATION_URL || 'http://localhost:8087';

// Populated in setup() with JWT Bearer token
let AUTH_TOKEN = '';

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Request-ID': '',  // Set per-request
};

// Test data pools
const ACCOUNTS = [];
for (let i = 0; i < 10000; i++) {
  ACCOUNTS.push(`ACC-${String(i).padStart(6, '0')}`);
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];
const FX_PAIRS = ['USD/EUR', 'USD/GBP', 'EUR/GBP', 'USD/JPY', 'EUR/JPY'];

// =============================================================================
// OPTIONS
// =============================================================================

export const options = {
  scenarios: {
    // Baseline load
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 1000,           // 1000 TPS
      timeUnit: '1s',
      duration: '30m',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
    
    // Peak load burst
    peak_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 1000,
      stages: [
        { duration: '2m', target: 1000 },
        { duration: '5m', target: 10000 },
        { duration: '10m', target: 10000 },
        { duration: '2m', target: 1000 },
      ],
      preAllocatedVUs: 200,
      maxVUs: 2000,
      startTime: '35m',
    },
  },

  thresholds: {
    // Latency SLOs
    'http_req_duration{scenario:baseline}': ['p(50)<10', 'p(95)<50', 'p(99)<100'],
    'http_req_duration{scenario:peak_burst}': ['p(50)<20', 'p(95)<100', 'p(99)<200'],
    
    // Payment-specific latency
    'payment_duration': ['p(50)<50', 'p(95)<150', 'p(99)<300'],
    'balance_query_duration': ['p(50)<5', 'p(95)<20', 'p(99)<50'],
    
    // Error rates
    'http_req_failed': ['rate<0.001'],  // <0.1%
    'payment_success_rate': ['rate>0.999'],
    'error_rate': ['rate<0.001'],
    
    // Zero tolerance
    'invariant_violations': ['count==0'],
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function randomAccount() {
  return ACCOUNTS[Math.floor(Math.random() * ACCOUNTS.length)];
}

function randomAmount() {
  // Pareto distribution for realistic transaction amounts
  const u = Math.random();
  const alpha = 1.16;  // Shape parameter for 80/20 rule
  const xm = 100;      // Minimum amount ($1.00 in cents)
  return Math.floor(xm / Math.pow(u, 1/alpha));
}

function randomCurrency() {
  const weights = [0.4, 0.25, 0.15, 0.1, 0.1]; // USD, EUR, GBP, JPY, CNY
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    if (r < sum) return CURRENCIES[i];
  }
  return CURRENCIES[0];
}

function makeRequest(method, endpoint, payload = null, baseUrl = null) {
  const url = `${baseUrl || BASE_URL}${endpoint}`;
  const headers = {
    ...HEADERS,
    'X-Request-ID': uuidv4(),
    'Authorization': `Bearer ${AUTH_TOKEN}`,
  };
  
  const params = {
    headers: headers,
    timeout: '10s',
    tags: { endpoint: endpoint },
  };
  
  if (method === 'GET') {
    return http.get(url, params);
  } else {
    return http.post(url, JSON.stringify(payload), params);
  }
}

// =============================================================================
// SCENARIOS
// =============================================================================

export default function(data) {
  AUTH_TOKEN = data.token;

  // Weighted scenario selection (matches production traffic mix)
  const r = Math.random();
  
  if (r < 0.50) {
    paymentTransfer();
  } else if (r < 0.70) {
    balanceInquiry();
  } else if (r < 0.80) {
    fxConversion();
  } else if (r < 0.85) {
    paymentReversal();
  } else if (r < 0.90) {
    notificationFlow();
  } else if (r < 0.95) {
    reconciliationQuery();
  } else {
    analyticsQuery();
  }
}

// Payment Transfer (60% of traffic)
function paymentTransfer() {
  group('payment_transfer', () => {
    const sourceAccount = randomAccount();
    let destAccount = randomAccount();
    while (destAccount === sourceAccount) {
      destAccount = randomAccount();
    }
    
    const amount = randomAmount();
    const currency = randomCurrency();
    const idempotencyKey = uuidv4();
    
    const startTime = Date.now();
    activePayments.add(1);
    
    // Create payment
    const createRes = makeRequest('POST', '/api/v1/payments', {
      source_account: sourceAccount,
      destination_account: destAccount,
      amount: amount,
      currency: currency,
      idempotency_key: idempotencyKey,
    });
    
    const createOk = check(createRes, {
      'payment created': (r) => [201, 202].includes(r.status),
      'has payment_id': (r) => r.json('payment_id') !== undefined,
    });
    
    if (!createOk) {
      paymentsFailed.add(1);
      paymentSuccessRate.add(false);
      errorRate.add(true);
      activePayments.add(-1);
      return;
    }
    
    const paymentId = createRes.json('payment_id');
    
    // Check for idempotency hit
    if (createRes.status === 200) {
      idempotencyHits.add(1);
    }
    
    // Poll for completion (max 3 retries)
    let completed = false;
    for (let i = 0; i < 3; i++) {
      sleep(0.1);  // 100ms between retries
      
      const statusRes = makeRequest('GET', `/api/v1/payments/${paymentId}/status`);
      
      if (statusRes.status === 200) {
        const status = statusRes.json('status');
        if (status === 'COMPLETED') {
          completed = true;
          break;
        } else if (status === 'FAILED') {
          break;
        }
      }
    }
    
    const duration = Date.now() - startTime;
    paymentDuration.add(duration);
    activePayments.add(-1);
    
    if (completed) {
      paymentsCompleted.add(1);
      paymentSuccessRate.add(true);
      errorRate.add(false);
      
      // Verify balance invariant
      verifyInvariant(sourceAccount, destAccount, amount, paymentId);
    } else {
      paymentsFailed.add(1);
      paymentSuccessRate.add(false);
      errorRate.add(true);
    }
  });
}

// Balance Inquiry (25% of traffic)
function balanceInquiry() {
  group('balance_inquiry', () => {
    const accountId = randomAccount();
    
    const startTime = Date.now();
    const res = makeRequest('GET', `/api/v1/accounts/${accountId}/balance`);
    const duration = Date.now() - startTime;
    
    balanceQueryDuration.add(duration);
    
    const ok = check(res, {
      'balance returned': (r) => r.status === 200,
      'has balance field': (r) => r.json('balance') !== undefined,
      'has currency field': (r) => r.json('currency') !== undefined,
      'balance is number': (r) => typeof r.json('balance') === 'number',
    });
    
    errorRate.add(!ok);
  });
}

// FX Conversion (10% of traffic)
function fxConversion() {
  group('fx_conversion', () => {
    const pair = FX_PAIRS[Math.floor(Math.random() * FX_PAIRS.length)];
    const [sourceCurrency, targetCurrency] = pair.split('/');
    const amount = randomAmount();
    
    const startTime = Date.now();
    
    // Get quote
    const quoteRes = makeRequest('POST', '/api/v1/fx/quote', {
      source_currency: sourceCurrency,
      target_currency: targetCurrency,
      amount: amount,
    });
    
    const quoteOk = check(quoteRes, {
      'quote received': (r) => r.status === 200,
      'has quote_id': (r) => r.json('quote_id') !== undefined,
      'has rate': (r) => r.json('rate') !== undefined,
      'rate is positive': (r) => r.json('rate') > 0,
    });
    
    if (!quoteOk) {
      errorRate.add(true);
      return;
    }
    
    const quoteId = quoteRes.json('quote_id');
    
    // Execute conversion
    const convertRes = makeRequest('POST', '/api/v1/fx/convert', {
      quote_id: quoteId,
      idempotency_key: uuidv4(),
    });
    
    const duration = Date.now() - startTime;
    fxConversionDuration.add(duration);
    
    const convertOk = check(convertRes, {
      'conversion completed': (r) => [200, 201].includes(r.status),
      'has converted_amount': (r) => r.json('converted_amount') !== undefined,
    });
    
    errorRate.add(!convertOk);
  });
}

// Payment Reversal (5% of traffic)
function paymentReversal() {
  group('payment_reversal', () => {
    // First create a payment to reverse
    const sourceAccount = randomAccount();
    let destAccount = randomAccount();
    while (destAccount === sourceAccount) {
      destAccount = randomAccount();
    }
    
    const amount = randomAmount();
    const currency = randomCurrency();
    
    const createRes = makeRequest('POST', '/api/v1/payments', {
      source_account: sourceAccount,
      destination_account: destAccount,
      amount: amount,
      currency: currency,
      idempotency_key: uuidv4(),
    });
    
    if (createRes.status !== 201 && createRes.status !== 202) {
      errorRate.add(true);
      return;
    }
    
    const paymentId = createRes.json('payment_id');
    
    // Wait for completion
    sleep(0.2);
    
    // Request reversal
    const reversalRes = makeRequest('POST', `/api/v1/payments/${paymentId}/reverse`, {
      reason: 'CUSTOMER_REQUEST',
      idempotency_key: uuidv4(),
    });
    
    const ok = check(reversalRes, {
      'reversal accepted': (r) => [200, 201, 202].includes(r.status),
    });
    
    errorRate.add(!ok);
  });
}

// =============================================================================
// NOTIFICATION FLOW (5% of traffic)
// =============================================================================

function notificationFlow() {
  group('notification_flow', () => {
    // List notifications
    const listRes = makeRequest('GET', '/api/v1/notifications?limit=10', null, NOTIFICATION_URL);
    
    check(listRes, {
      'notifications listed': (r) => r.status === 200,
    });

    // Get notification preferences
    const prefsRes = makeRequest('GET', '/api/v1/notifications/preferences', null, NOTIFICATION_URL);
    
    check(prefsRes, {
      'preferences returned': (r) => r.status === 200 || r.status === 404,
    });

    errorRate.add(listRes.status !== 200);
  });
}

// =============================================================================
// RECONCILIATION QUERY (5% of traffic)
// =============================================================================

function reconciliationQuery() {
  group('reconciliation_query', () => {
    // List recent reconciliation cycles
    const cyclesRes = makeRequest('GET', '/api/v1/reconciliation/cycles?limit=5');
    
    check(cyclesRes, {
      'recon cycles returned': (r) => r.status === 200 || r.status === 404,
    });

    errorRate.add(cyclesRes.status >= 500);
  });
}

// =============================================================================
// ANALYTICS QUERY (5% of traffic)
// =============================================================================

function analyticsQuery() {
  group('analytics_query', () => {
    // Get transaction analytics summary
    const summaryRes = makeRequest('GET', '/api/v1/analytics/summary');
    
    check(summaryRes, {
      'analytics summary returned': (r) => r.status === 200 || r.status === 404,
    });

    // Get volume metrics
    const volumeRes = makeRequest('GET', '/api/v1/analytics/volume?period=24h');
    
    check(volumeRes, {
      'volume data returned': (r) => r.status === 200 || r.status === 404,
    });

    errorRate.add(summaryRes.status >= 500);
  });
}

// =============================================================================
// INVARIANT VERIFICATION
// =============================================================================

function verifyInvariant(sourceAccount, destAccount, amount, paymentId) {
  // Sample 1% of payments for invariant verification
  if (Math.random() > 0.01) return;
  
  // Get source balance
  const sourceRes = makeRequest('GET', `/api/v1/accounts/${sourceAccount}/balance`);
  const destRes = makeRequest('GET', `/api/v1/accounts/${destAccount}/balance`);
  
  // This is a simplified check - in production, we'd compare with
  // expected values from a shadow ledger
  
  const sourceBalance = sourceRes.json('balance');
  const destBalance = destRes.json('balance');
  
  // Check for negative balances (INV-5 violation)
  if (sourceBalance < 0) {
    console.error(`INVARIANT VIOLATION: Negative balance on ${sourceAccount}: ${sourceBalance}`);
    invariantViolations.add(1);
  }
  
  // Additional checks would go here
}

// =============================================================================
// LIFECYCLE HOOKS
// =============================================================================

export function setup() {
  console.log('Starting Nexus RTP load test');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Auth:   ${AUTH_URL}`);
  console.log(`Accounts pool: ${ACCOUNTS.length}`);
  
  // Verify connectivity
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    console.warn(`Health check returned ${healthRes.status} — continuing anyway`);
  }
  
  // Authenticate to get JWT token (Kong validates JWT on all protected routes)
  let token = __ENV.JWT_TOKEN || '';
  if (!token) {
    const loginRes = http.post(`${AUTH_URL}/api/v1/auth/login`, JSON.stringify({
      email: __ENV.TEST_EMAIL || 'admin@nexus-rtp.dev',
      password: __ENV.TEST_PASSWORD || 'admin123',
    }), { headers: { 'Content-Type': 'application/json' }, timeout: '10s' });

    if (loginRes.status === 200) {
      try {
        token = loginRes.json('access_token') || loginRes.json('token') || '';
        console.log('JWT token acquired from auth service');
      } catch (e) {
        console.warn('Could not parse auth response, using fallback token');
        token = 'test-token';
      }
    } else {
      console.warn(`Auth login returned ${loginRes.status}, using fallback token`);
      token = 'test-token';
    }
  }
  
  return { startTime: Date.now(), token: token };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration}s`);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: '  ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  // Custom summary formatting
  const metrics = data.metrics;
  
  let output = '\n========== NEXUS RTP LOAD TEST RESULTS ==========\n\n';
  
  output += '📊 THROUGHPUT\n';
  output += `   Requests:     ${metrics.http_reqs?.values?.count || 0}\n`;
  output += `   TPS (avg):    ${(metrics.http_reqs?.values?.rate || 0).toFixed(2)}\n`;
  
  output += '\n⏱️  LATENCY\n';
  const duration = metrics.http_req_duration?.values || {};
  output += `   p50:  ${(duration['p(50)'] || 0).toFixed(2)}ms\n`;
  output += `   p95:  ${(duration['p(95)'] || 0).toFixed(2)}ms\n`;
  output += `   p99:  ${(duration['p(99)'] || 0).toFixed(2)}ms\n`;
  output += `   max:  ${(duration.max || 0).toFixed(2)}ms\n`;
  
  output += '\n✅ SUCCESS RATES\n';
  output += `   Payments:     ${((metrics.payment_success_rate?.values?.rate || 0) * 100).toFixed(3)}%\n`;
  output += `   HTTP:         ${((1 - (metrics.http_req_failed?.values?.rate || 0)) * 100).toFixed(3)}%\n`;
  
  output += '\n🔒 INVARIANTS\n';
  output += `   Violations:   ${metrics.invariant_violations?.values?.count || 0}\n`;
  
  output += '\n==================================================\n';
  
  return output;
}

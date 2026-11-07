// Actual payment acceptance, durable read-back and idempotency, against run.py's
// isolated database. A rejected payment is a failure even when HTTP returns 2xx.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const base = __ENV.API_URL || 'http://127.0.0.1:18085';
const output = __ENV.PERF_OUTPUT || 'loadtest/results';
const phases = ['baseline', 'ramp', 'sustain', 'spike', 'recovery'];
const paymentLatency = new Trend('payment_latency_ms', true);
const statusLatency = new Trend('status_latency_ms', true);
const listLatency = new Trend('list_latency_ms', true);
const replayLatency = new Trend('replay_latency_ms', true);
const accepted = new Rate('payment_accepted');
const acceptedCount = new Counter('payments_accepted');
const attemptedCount = new Counter('payments_attempted');
const phaseElapsed = new Trend('phase_elapsed_ms');
const verified = new Rate('readback_verified');
const replayVerified = new Rate('replay_verified');
const thresholds = {
  checks: ['rate==1'],
  http_req_failed: ['rate<0.01'],
  payment_accepted: ['rate>=0.99'],
  readback_verified: ['rate==1'],
  replay_verified: ['rate==1'],
  payment_latency_ms: ['p(95)<500', 'p(99)<1000'],
};
// Materialize per-phase metrics in k6's JSON summary.
for (const phase of phases) {
  thresholds[`payment_latency_ms{phase:${phase}}`] = ['min>=0'];
  thresholds[`payments_attempted{phase:${phase}}`] = ['count>0'];
  thresholds[`phase_elapsed_ms{phase:${phase}}`] = ['max>0'];
  thresholds[`payments_accepted{phase:${phase}}`] = ['count>0'];
  thresholds[`payment_accepted{phase:${phase}}`] = ['rate>=0.99'];
}

export const options = {
  scenarios: {
    baseline: { executor: 'constant-vus', vus: 1, duration: '20s', gracefulStop: '5s' },
    ramp: { executor: 'ramping-vus', startTime: '25s', startVUs: 1,
      stages: [{ duration: '20s', target: 5 }, { duration: '20s', target: 10 }], gracefulRampDown: '5s', gracefulStop: '5s' },
    sustain: { executor: 'constant-vus', startTime: '70s', vus: 10, duration: '60s', gracefulStop: '5s' },
    spike: { executor: 'constant-vus', startTime: '135s', vus: 25, duration: '30s', gracefulStop: '5s' },
    recovery: { executor: 'constant-vus', startTime: '170s', vus: 1, duration: '20s', gracefulStop: '5s' },
  },
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}
function account(index) {
  return `bbbbbbbb-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
function json(response) {
  try { return response.json(); } catch (_) { return {}; }
}
function create() {
  const uetr = uuid();
  const body = JSON.stringify({
    messageId: `PF${uetr.replace(/-/g, '')}`, creationDateTime: new Date().toISOString(),
    endToEndId: uetr.replace(/-/g, ''), uetr, amount: '1.00', currency: 'USD', chargeBearer: 'SHAR',
    debtorAccountId: account((exec.vu.idInTest % 16) + 1),
    creditorAccountId: account((exec.vu.idInTest % 16) + 17),
    debtorName: 'Performance Debtor', creditorName: 'Performance Creditor',
    debtorCountry: 'US', creditorCountry: 'US',
  });
  return { uetr, body, params: { headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': uetr,
  }, tags: { name: 'POST /payments' }, timeout: '10s' } };
}
function isAccepted(response, uetr) {
  const data = json(response);
  return (response.status === 200 || response.status === 201 || response.status === 202)
    && data.uetr === uetr && Boolean(data.transactionId)
    && ['PENDING', 'SANCTIONED'].includes(data.status);
}

export function setup() {
  for (const path of ['/health', '/ready']) {
    if (http.get(`${base}${path}`).status !== 200) fail(`${path} is unavailable`);
  }
  // Warm the pool and sanctions circuit outside measured payment samples.
  for (let i = 0; i < 3; i++) {
    const req = create();
    const response = http.post(`${base}/api/v1/payments`, req.body, req.params);
    if (!isAccepted(response, req.uetr)) fail(`Preflight payment failed: ${response.status} ${response.body}`);
  }
}

export default function () {
  const tags = { phase: exec.scenario.name };
  attemptedCount.add(1, tags);
  const req = create();
  const response = http.post(`${base}/api/v1/payments`, req.body, req.params);
  paymentLatency.add(response.timings.duration, tags);
  const ok = isAccepted(response, req.uetr);
  accepted.add(ok, tags);
  if (ok) acceptedCount.add(1, tags);
  check(response, { 'payment accepted with durable transaction ID': () => ok });
  if (!ok) { phaseElapsed.add(Date.now() - exec.scenario.startTime, tags); sleep(0.05); return; }

  const status = http.get(`${base}/api/v1/payments/${req.uetr}/status`, {
    tags: { name: 'GET /payments/:uetr/status' }, timeout: '10s',
  });
  statusLatency.add(status.timings.duration, tags);
  const readback = json(status);
  const found = status.status === 200 && readback.uetr === req.uetr
    && readback.transactionId === json(response).transactionId;
  verified.add(found, tags);
  check(status, { 'payment read-back matches created transaction': () => found });

  if (exec.scenario.iterationInTest % 5 === 0) {
    const replay = http.post(`${base}/api/v1/payments`, req.body, {
      ...req.params, tags: { name: 'POST /payments (idempotent replay)' },
    });
    replayLatency.add(replay.timings.duration, tags);
    const same = isAccepted(replay, req.uetr)
      && json(replay).transactionId === json(response).transactionId;
    replayVerified.add(same, tags);
    check(replay, { 'idempotent replay keeps transaction ID': () => same });
  }
  if (exec.scenario.iterationInTest % 10 === 0) {
    const list = http.get(`${base}/api/v1/payments?limit=20&offset=0`, {
      tags: { name: 'GET /payments' }, timeout: '10s',
    });
    listLatency.add(list.timings.duration, tags);
    check(list, { 'payment list succeeds': r => r.status === 200 });
  }
  phaseElapsed.add(Date.now() - exec.scenario.startTime, tags);
  sleep(0.05);
}

export function handleSummary(data) {
  return { [`${output}/k6-summary.json`]: JSON.stringify(data, null, 2),
    stdout: `\nMeasured ${data.metrics.payments_attempted?.values.count || 0} payment attempts. Raw results: ${output}/k6-summary.json\n` };
}

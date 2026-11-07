import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateMetric } from '../../loadtest/lib/summary.mjs';

test('missing observations are not marked as passing', () => {
  const result = evaluateMetric({ metrics: {} }, 'latency', 'p(99)', 1000);
  assert.equal(result.actual, null);
  assert.equal(result.pass, null);
  assert.equal(result.status, 'not_measured');
});
test('disabled auth is reported separately from a successful auth measurement', () => {
  const result = evaluateMetric({ metrics: {} }, 'auth', 'p(99)', 200, { enabled: false });
  assert.equal(result.status, 'disabled');
  assert.equal(result.pass, null);
});
test('an observed zero success rate remains zero and fails', () => {
  const result = evaluateMetric({ metrics: { accepted: { values: { rate: 0 } } } }, 'accepted', 'rate', 0.99, { higherIsBetter: true });
  assert.equal(result.actual, 0);
  assert.equal(result.pass, false);
});
test('an observed zero latency is retained', () => {
  const result = evaluateMetric({ metrics: { latency: { values: { 'p(99)': 0 } } } }, 'latency', 'p(99)', 1000);
  assert.equal(result.actual, 0);
  assert.equal(result.pass, true);
});
test('invalid observations cannot become passing measurements', () => {
  for (const value of [NaN, Infinity, undefined, null, '10']) {
    assert.equal(evaluateMetric({ metrics: { latency: { values: { 'p(99)': value } } } }, 'latency', 'p(99)', 1000).pass, null);
  }
});
test('threshold equality respects the strict k6 comparator', () => {
  assert.equal(evaluateMetric({ metrics: { latency: { values: { 'p(99)': 1000 } } } }, 'latency', 'p(99)', 1000).pass, false);
});

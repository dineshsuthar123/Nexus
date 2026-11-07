// Shared, runtime-independent reporting rules. Missing data never passes a gate.
export function evaluateMetric(data, name, statistic, target, { higherIsBetter = false, enabled = true } = {}) {
  const value = enabled ? data.metrics[name]?.values?.[statistic] : undefined;
  const actual = Number.isFinite(value) ? value : null;
  const pass = actual === null ? null : higherIsBetter ? actual > target : actual < target;
  return { target, actual, pass, status: !enabled ? 'disabled' : actual === null ? 'not_measured' : pass ? 'passed' : 'failed' };
}

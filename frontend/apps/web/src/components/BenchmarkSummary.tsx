import Link from 'next/link';
import baseline from '@/data/performance-baseline.json';

/** Published local measurements are explicitly separate from live telemetry. */
export function BenchmarkSummary() {
  const payment = baseline.payment;
  const stats = [
    { label: 'Payment p95', value: `${payment.p95_ms.toFixed(1)} ms` },
    { label: 'Payment p99', value: `${payment.p99_ms.toFixed(1)} ms` },
    { label: 'Sustained acceptance', value: `${baseline.sustained_payments_per_second.toFixed(1)} /s` },
    { label: 'Acceptance failures', value: `${(baseline.payment_failure_rate * 100).toFixed(2)}%` },
  ];

  return (
    <section aria-label="Measured local performance" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Measured local performance</h2>
        <a href="/performance/latest.json" className="text-sm text-primary-600 underline dark:text-primary-400">Download results</a>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {baseline.measured_at.slice(0, 10)} · {payment.samples.toLocaleString('en-US')} payment attempts · Local test, 1–25 concurrent users.
        {' '}Payments accepted for sanctions review; settlement was not measured.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{stat.value}</div>
            <div className="mt-1 text-sm text-neutral-500">{stat.label}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-500">
        Single-node in-memory CockroachDB and Redis. <Link href="/performance" className="underline">Test conditions and evidence</Link>
      </p>
    </section>
  );
}

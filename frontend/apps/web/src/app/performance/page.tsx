import Link from 'next/link';
import { BenchmarkSummary } from '@/components/BenchmarkSummary';
import baseline from '@/data/performance-baseline.json';

export default function PerformancePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <Link href="/" className="text-sm underline">Nexus RTP</Link>
      <h1 className="text-3xl font-bold">Performance evidence</h1>
      <BenchmarkSummary />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Scope and limits</h2>
        <ul className="list-disc space-y-2 pl-5 text-neutral-600 dark:text-neutral-400">
          {baseline.limitations.map(item => <li key={item}>{item}</li>)}
        </ul>
        <p className="text-sm">Thresholds: {baseline.thresholds_passed ? 'passed' : 'failed'} · Database invariants: {baseline.database_validation_passed ? 'passed' : 'failed'}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Observed limits</h2>
        <ul className="list-disc space-y-2 pl-5 text-neutral-600 dark:text-neutral-400">
          {baseline.findings.map(item => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section className="overflow-x-auto">
        <h2 className="mb-3 text-xl font-semibold">Payment acceptance by phase</h2>
        <table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">Phase</th><th>Attempts</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Accepted /s</th></tr></thead>
          <tbody>{baseline.phases.map(phase => (
            <tr key={phase.name} className="border-t border-neutral-200 dark:border-slate-700">
              <td className="p-2">{phase.name}</td><td>{phase.samples}</td><td>{phase.p95_ms.toFixed(1)}</td><td>{phase.p99_ms.toFixed(1)}</td><td>{phase.accepted_per_second.toFixed(1)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  );
}

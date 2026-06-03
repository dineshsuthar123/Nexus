import { InfoPage } from '@/components/info-page';

export default function DocsPage() {
  return (
    <InfoPage
      eyebrow="Documentation"
      title="Build and operate real-time payment flows"
      description="Reference guidance for integrating with Nexus RTP payment APIs, ledger services, audit trails, and operational dashboards."
      sections={[
        {
          title: 'Payment API',
          body: 'Create, inspect, cancel, return, and settle payment instructions through the gateway-backed API surface.',
          points: ['Idempotency keys for mutation safety', 'UETR-based payment lookup', 'ISO 20022 message compatibility', 'Gateway routing through Kong'],
        },
        {
          title: 'Operational Workflows',
          body: 'The dashboard surfaces payments, accounts, reconciliation cycles, analytics, audit bundles, and notification workflows for operators.',
          points: ['Role-aware navigation', 'Reconciliation status tracking', 'Audit bundle verification', 'Real-time gateway connectivity'],
        },
        {
          title: 'Production Readiness',
          body: 'The platform is designed around service health checks, tracing, metrics, immutable audit evidence, and deterministic ledger outcomes.',
          points: ['Prometheus and Grafana observability', 'CockroachDB-backed ledger storage', 'Kafka event streaming', 'OpenTelemetry trace export'],
        },
      ]}
    />
  );
}

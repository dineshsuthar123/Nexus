import { InfoPage } from '@/components/info-page';

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="Terms"
      title="Platform terms for payment infrastructure usage"
      description="These terms summarize the operating expectations for using Nexus RTP in development, staging, and production environments."
      sections={[
        {
          title: 'Permitted Use',
          body: 'Use the platform only for authorized payment processing, testing, analytics, reconciliation, and operational support workflows.',
          points: ['No unauthorized account access', 'No synthetic traffic against production without approval', 'No bypassing audit or security controls', 'No storage of secrets in client code'],
        },
        {
          title: 'Operational Responsibility',
          body: 'Production deployments must be configured with hardened secrets, monitored infrastructure, tested recovery procedures, and documented access controls.',
          points: ['Rotate credentials regularly', 'Validate disaster recovery', 'Monitor latency and error budgets', 'Review audit evidence'],
        },
      ]}
    />
  );
}

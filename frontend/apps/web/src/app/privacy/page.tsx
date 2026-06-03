import { InfoPage } from '@/components/info-page';

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Privacy"
      title="Privacy controls for regulated payment operations"
      description="Nexus RTP treats payment data, identity metadata, and audit evidence as sensitive regulated information."
      sections={[
        {
          title: 'Data Handling',
          body: 'Operational data is scoped to payment processing, account servicing, reconciliation, fraud analysis, and compliance obligations.',
          points: ['Least-privilege access patterns', 'Sensitive token handling', 'Audit-focused retention boundaries', 'Environment-specific secrets'],
        },
        {
          title: 'Security Monitoring',
          body: 'Service events are correlated through request identifiers, metrics, logs, and traces so incidents can be investigated without exposing unnecessary customer data.',
          points: ['Request correlation IDs', 'Sanitized client logging', 'Gateway-level controls', 'Immutable audit references'],
        },
      ]}
    />
  );
}

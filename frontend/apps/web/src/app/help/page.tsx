import { InfoPage } from '@/components/info-page';

export default function HelpPage() {
  return (
    <InfoPage
      eyebrow="Help Center"
      title="Operational support for payments, accounts, and reconciliation"
      description="Use this page as the front door for platform support topics while the full knowledge base is being expanded."
      sections={[
        {
          title: 'Payment Issues',
          body: 'Start with the payment UETR, gateway request ID, current status, and the latest audit bundle reference.',
          points: ['Check payment status by UETR', 'Review sanctions and fraud status', 'Inspect ledger transaction references', 'Use cancellation reason codes consistently'],
        },
        {
          title: 'Platform Health',
          body: 'For infrastructure incidents, compare service health, Kong status, CockroachDB health, Kafka health, and trace export status.',
          points: ['Confirm service health endpoints', 'Check gateway status', 'Inspect recent deployment changes', 'Escalate repeated latency spikes'],
        },
      ]}
    />
  );
}

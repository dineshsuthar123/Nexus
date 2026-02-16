import type { Meta, StoryObj } from '@storybook/react';
import { Alert } from '../components/Alert/Alert';

const meta: Meta<typeof Alert> = {
  title: 'Components/Alert',
  component: Alert,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  args: {
    children: 'This is a default alert message.',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-4 max-w-lg">
      <Alert>Default: System information for your attention.</Alert>
      <Alert variant="destructive">Error: Payment processing failed. Please retry.</Alert>
    </div>
  ),
};

export const PaymentAlert: Story = {
  render: () => (
    <div className="max-w-lg">
      <Alert variant="destructive">
        <strong>Payment Failed</strong>
        <p className="mt-1 text-sm">
          Wire transfer UETR-2024-001 to Acme Corp was rejected. Reason: AM04 — Insufficient funds.
          Please ensure adequate balance and retry.
        </p>
      </Alert>
    </div>
  ),
};

export const ComplianceAlert: Story = {
  render: () => (
    <div className="max-w-lg">
      <Alert>
        <strong>AML Screening Required</strong>
        <p className="mt-1 text-sm">
          Transaction requires manual review before processing. Enhanced due diligence
          triggered by beneficiary screening.
        </p>
      </Alert>
    </div>
  ),
};

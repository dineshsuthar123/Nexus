import type { Meta, StoryObj } from '@storybook/react';
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from '../components/Toast/Toast';

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="relative min-h-[200px] p-8">
          <Story />
          <ToastViewport />
        </div>
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Default: Story = {
  render: () => (
    <Toast open duration={Infinity}>
      <div>
        <ToastTitle>Notification</ToastTitle>
        <ToastDescription>Your request has been received.</ToastDescription>
      </div>
      <ToastClose />
    </Toast>
  ),
};

export const Success: Story = {
  render: () => (
    <Toast open duration={Infinity} variant="success">
      <div>
        <ToastTitle>Payment Confirmed</ToastTitle>
        <ToastDescription>
          $15,000.00 USD sent to Acme Corp (PAY-2024-001234).
        </ToastDescription>
      </div>
      <ToastClose />
    </Toast>
  ),
};

export const Warning: Story = {
  render: () => (
    <Toast open duration={Infinity} variant="warning">
      <div>
        <ToastTitle>Rate Limit Warning</ToastTitle>
        <ToastDescription>
          API key &quot;prod-v2&quot; has used 85% of its hourly quota.
        </ToastDescription>
      </div>
      <ToastAction altText="View usage">View</ToastAction>
      <ToastClose />
    </Toast>
  ),
};

export const Danger: Story = {
  render: () => (
    <Toast open duration={Infinity} variant="danger">
      <div>
        <ToastTitle>Payment Failed</ToastTitle>
        <ToastDescription>
          Insufficient funds in account ••4521. Transaction rolled back.
        </ToastDescription>
      </div>
      <ToastAction altText="Retry payment">Retry</ToastAction>
      <ToastClose />
    </Toast>
  ),
};

export const Info: Story = {
  render: () => (
    <Toast open duration={Infinity} variant="info">
      <div>
        <ToastTitle>Scheduled Maintenance</ToastTitle>
        <ToastDescription>
          System maintenance window: Saturday 02:00–04:00 UTC.
        </ToastDescription>
      </div>
      <ToastClose />
    </Toast>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-3 max-w-md">
      <Toast open duration={Infinity} variant="success">
        <div>
          <ToastTitle>Success</ToastTitle>
          <ToastDescription>Reconciliation completed — 100% match rate.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toast open duration={Infinity} variant="warning">
        <div>
          <ToastTitle>Warning</ToastTitle>
          <ToastDescription>3 discrepancies detected in batch B-2024-045.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toast open duration={Infinity} variant="danger">
        <div>
          <ToastTitle>Error</ToastTitle>
          <ToastDescription>Connection to payment gateway timed out.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <Toast open duration={Infinity} variant="info">
        <div>
          <ToastTitle>Info</ToastTitle>
          <ToastDescription>New API version v2.1 is available.</ToastDescription>
        </div>
        <ToastClose />
      </Toast>
    </div>
  ),
};

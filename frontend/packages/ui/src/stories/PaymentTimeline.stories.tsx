import type { Meta, StoryObj } from '@storybook/react';
import { PaymentTimeline } from '../components/PaymentTimeline/PaymentTimeline';
import type { PaymentTimelineEntry } from '../components/PaymentTimeline/PaymentTimeline';

const meta: Meta<typeof PaymentTimeline> = {
  title: 'Fintech/PaymentTimeline',
  component: PaymentTimeline,
  tags: ['autodocs'],
  argTypes: {
    orientation: { control: 'select', options: ['vertical', 'horizontal'] },
  },
};

export default meta;
type Story = StoryObj<typeof PaymentTimeline>;

const successEntries: PaymentTimelineEntry[] = [
  { status: 'PENDING', timestamp: '2024-01-15T10:00:00Z', actor: 'user@company.com' },
  { status: 'PROCESSING', timestamp: '2024-01-15T10:00:05Z', actor: 'Payment Engine' },
  { status: 'COMPLETED', timestamp: '2024-01-15T10:00:12Z', details: 'Cleared via SWIFT gpi' },
  { status: 'SETTLED', timestamp: '2024-01-15T10:05:00Z', details: 'T+0 settlement confirmed' },
];

export const SuccessFlow: Story = {
  args: {
    entries: successEntries,
    currentStatus: 'SETTLED',
  },
};

const failedEntries: PaymentTimelineEntry[] = [
  { status: 'PENDING', timestamp: '2024-01-15T10:00:00Z', actor: 'api@tenant.com' },
  { status: 'PROCESSING', timestamp: '2024-01-15T10:00:05Z' },
  { status: 'FAILED', timestamp: '2024-01-15T10:00:08Z', reason: 'Insufficient funds in debtor account', details: 'Error code: AM04' },
];

export const FailedPayment: Story = {
  args: {
    entries: failedEntries,
    currentStatus: 'FAILED',
  },
};

const processingEntries: PaymentTimelineEntry[] = [
  { status: 'PENDING', timestamp: '2024-01-15T10:00:00Z' },
  { status: 'PROCESSING', timestamp: '2024-01-15T10:00:05Z', details: 'Awaiting compliance check' },
];

export const InProgress: Story = {
  args: {
    entries: processingEntries,
    currentStatus: 'PROCESSING',
  },
};

export const Horizontal: Story = {
  args: {
    entries: successEntries,
    currentStatus: 'SETTLED',
    orientation: 'horizontal',
  },
};

const returnedEntries: PaymentTimelineEntry[] = [
  { status: 'PENDING', timestamp: '2024-01-15T10:00:00Z' },
  { status: 'PROCESSING', timestamp: '2024-01-15T10:00:05Z' },
  { status: 'COMPLETED', timestamp: '2024-01-15T10:00:12Z' },
  { status: 'RETURNED', timestamp: '2024-01-16T14:30:00Z', reason: 'Beneficiary account closed', actor: 'Clearing House' },
];

export const ReturnedPayment: Story = {
  args: {
    entries: returnedEntries,
    currentStatus: 'RETURNED',
  },
};

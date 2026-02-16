import type { Meta, StoryObj } from '@storybook/react';
import { TransactionRow, TransactionList, TransactionSummary } from '../components/Transaction/Transaction';

const meta: Meta<typeof TransactionRow> = {
  title: 'Fintech/Transaction',
  component: TransactionRow,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof TransactionRow>;

export const CreditTransaction: Story = {
  args: {
    transactionId: 'tx-001',
    type: 'credit',
    status: 'completed',
    amount: 15000,
    currency: 'USD',
    description: 'Wire Transfer - Acme Corp',
    category: 'Payment Received',
    timestamp: new Date().toISOString(),
    counterparty: 'Acme Corporation',
    reference: 'REF-2024-001',
  },
};

export const DebitTransaction: Story = {
  args: {
    transactionId: 'tx-002',
    type: 'debit',
    status: 'completed',
    amount: 5250.75,
    currency: 'USD',
    description: 'Vendor Payment - CloudCo',
    category: 'Payment Sent',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    counterparty: 'CloudCo Inc',
    reference: 'REF-2024-002',
  },
};

export const PendingTransaction: Story = {
  args: {
    transactionId: 'tx-003',
    type: 'transfer',
    status: 'pending',
    amount: 50000,
    currency: 'EUR',
    description: 'Cross-border Transfer',
    timestamp: new Date().toISOString(),
    counterparty: 'Deutsche Bank',
  },
};

export const FailedTransaction: Story = {
  args: {
    transactionId: 'tx-004',
    type: 'debit',
    status: 'failed',
    amount: 100000,
    currency: 'GBP',
    description: 'Payment Rejected',
    timestamp: new Date().toISOString(),
    counterparty: 'Barclays PLC',
    reference: 'REF-2024-ERR',
  },
};

const sampleTransactions = [
  {
    date: 'Today',
    items: [
      {
        transactionId: 'tx-001',
        type: 'credit' as const,
        status: 'completed' as const,
        amount: 15000,
        currency: 'USD',
        description: 'Wire Transfer - Acme Corp',
        category: 'Payment Received',
        timestamp: new Date().toISOString(),
        counterparty: 'Acme Corporation',
        reference: 'REF-2024-001',
      },
      {
        transactionId: 'tx-002',
        type: 'debit' as const,
        status: 'processing' as const,
        amount: 5250.75,
        currency: 'USD',
        description: 'Vendor Payment',
        category: 'Payment Sent',
        timestamp: new Date().toISOString(),
        counterparty: 'CloudCo Inc',
      },
    ],
  },
  {
    date: 'Yesterday',
    items: [
      {
        transactionId: 'tx-003',
        type: 'transfer' as const,
        status: 'completed' as const,
        amount: 50000,
        currency: 'USD',
        description: 'Internal Transfer',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        reference: 'INT-001',
      },
    ],
  },
];

export const TransactionListView: StoryObj<typeof TransactionList> = {
  render: () => <TransactionList transactions={sampleTransactions} />,
};

export const TransactionListEmpty: StoryObj<typeof TransactionList> = {
  render: () => <TransactionList transactions={[]} />,
};

export const TransactionSummaryView: StoryObj<typeof TransactionSummary> = {
  render: () => (
    <TransactionSummary
      period="January 2024"
      income={125000}
      expenses={87500}
      currency="USD"
      transactionCount={142}
    />
  ),
};

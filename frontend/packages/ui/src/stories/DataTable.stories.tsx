import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from '../components/DataTable/DataTable';
import type { DataTableColumn } from '../components/DataTable/DataTable';

interface PaymentRow {
  id: string;
  reference: string;
  debtor: string;
  creditor: string;
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed' | 'processing';
  createdAt: string;
}

const meta: Meta<typeof DataTable<PaymentRow>> = {
  title: 'Fintech/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof DataTable<PaymentRow>>;

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    completed: 'bg-success-50 text-success-700',
    pending: 'bg-warning-50 text-warning-700',
    failed: 'bg-danger-50 text-danger-700',
    processing: 'bg-info-50 text-info-700',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || ''}`}>
      {status}
    </span>
  );
};

const columns: DataTableColumn<PaymentRow>[] = [
  { id: 'reference', header: 'Reference', accessorKey: 'reference', className: 'font-mono text-xs' },
  { id: 'debtor', header: 'Sender', accessorKey: 'debtor' },
  { id: 'creditor', header: 'Recipient', accessorKey: 'creditor' },
  {
    id: 'amount',
    header: 'Amount',
    cell: (row) => (
      <span className="font-medium">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).format(row.amount)}
      </span>
    ),
  },
  { id: 'status', header: 'Status', cell: (row) => statusBadge(row.status) },
  { id: 'createdAt', header: 'Date', accessorKey: 'createdAt', className: 'text-neutral-500' },
];

const sampleData: PaymentRow[] = [
  { id: '1', reference: 'PAY-2024-001234', debtor: 'TechStart LLC', creditor: 'Acme Corp', amount: 15000, currency: 'USD', status: 'completed', createdAt: '2024-01-15' },
  { id: '2', reference: 'PAY-2024-001235', debtor: 'Global Ventures', creditor: 'Globex Inc', amount: 8250, currency: 'EUR', status: 'pending', createdAt: '2024-01-15' },
  { id: '3', reference: 'PAY-2024-001236', debtor: 'Alpha Finance', creditor: 'Wayne Enterprises', amount: 25000, currency: 'GBP', status: 'processing', createdAt: '2024-01-14' },
  { id: '4', reference: 'PAY-2024-001237', debtor: 'Beta Holdings', creditor: 'Stark Industries', amount: 42500, currency: 'USD', status: 'failed', createdAt: '2024-01-14' },
  { id: '5', reference: 'PAY-2024-001238', debtor: 'Omega Partners', creditor: 'LexCorp', amount: 3750, currency: 'USD', status: 'completed', createdAt: '2024-01-13' },
];

export const Default: Story = {
  args: {
    data: sampleData,
    columns,
  },
};

export const Loading: Story = {
  args: {
    data: [],
    columns,
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns,
    emptyMessage: 'No payments match your filters. Try adjusting the date range.',
  },
};

export const Clickable: Story = {
  args: {
    data: sampleData,
    columns,
    onRowClick: (row: PaymentRow) => alert(`Clicked: ${row.reference}`),
  },
};

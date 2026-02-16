import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TablePagination,
} from '../components/Table/Table';

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof Table>;

const payments = [
  { id: 'PAY-001', recipient: 'Acme Corp', amount: '$15,000.00', currency: 'USD', status: 'completed', date: '2024-01-15' },
  { id: 'PAY-002', recipient: 'Globex Inc', amount: '€8,250.00', currency: 'EUR', status: 'pending', date: '2024-01-15' },
  { id: 'PAY-003', recipient: 'Wayne Enterprises', amount: '£25,000.00', currency: 'GBP', status: 'completed', date: '2024-01-14' },
  { id: 'PAY-004', recipient: 'Stark Industries', amount: '$42,500.00', currency: 'USD', status: 'failed', date: '2024-01-14' },
  { id: 'PAY-005', recipient: 'LexCorp', amount: '$3,750.00', currency: 'USD', status: 'completed', date: '2024-01-13' },
];

const statusColors: Record<string, string> = {
  completed: 'bg-success-50 text-success-700 border-success-200',
  pending: 'bg-warning-50 text-warning-700 border-warning-200',
  failed: 'bg-danger-50 text-danger-700 border-danger-200',
};

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent payment transactions</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="font-mono text-xs">{p.id}</TableCell>
            <TableCell className="font-medium">{p.recipient}</TableCell>
            <TableCell>{p.amount} {p.currency}</TableCell>
            <TableCell>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>
                {p.status}
              </span>
            </TableCell>
            <TableCell className="text-neutral-500">{p.date}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};

export const Sortable: Story = {
  render: () => {
    const [sortCol, setSortCol] = useState<string | null>('amount');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc');

    const handleSort = (col: string) => {
      if (sortCol === col) {
        setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
        if (sortDir === 'desc') setSortCol(null);
      } else {
        setSortCol(col);
        setSortDir('asc');
      }
    };

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead sortable sortDirection={sortCol === 'recipient' ? sortDir : null} onSort={() => handleSort('recipient')}>
              Recipient
            </TableHead>
            <TableHead sortable sortDirection={sortCol === 'amount' ? sortDir : null} onSort={() => handleSort('amount')}>
              Amount
            </TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.slice(0, 3).map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.id}</TableCell>
              <TableCell>{p.recipient}</TableCell>
              <TableCell>{p.amount}</TableCell>
              <TableCell>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>
                  {p.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  },
};

export const WithPagination: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.id}</TableCell>
                <TableCell>{p.recipient}</TableCell>
                <TableCell>{p.amount}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>
                    {p.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          page={page}
          totalPages={5}
          totalItems={48}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Recipient</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={4} className="h-24 text-center text-neutral-500">
            No payments found. Create your first payment to get started.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

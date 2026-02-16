import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DataGrid, DataGridPagination } from '../components/DataGrid/DataGrid';
import type { Column, SortDirection } from '../components/DataGrid/DataGrid';

interface TransactionRow {
  id: string;
  reference: string;
  counterparty: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  status: string;
  timestamp: string;
}

const meta: Meta<typeof DataGrid<TransactionRow>> = {
  title: 'Fintech/DataGrid',
  component: DataGrid,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof DataGrid<TransactionRow>>;

const generateData = (count: number): TransactionRow[] => {
  const counterparties = ['Acme Corp', 'Globex Inc', 'Wayne Enterprises', 'Stark Industries', 'LexCorp', 'Umbrella Corp', 'Weyland-Yutani', 'Cyberdyne Systems'];
  const statuses = ['completed', 'pending', 'failed', 'processing'];
  const currencies = ['USD', 'EUR', 'GBP'];

  return Array.from({ length: count }, (_, i) => ({
    id: `txn-${i + 1}`,
    reference: `TXN-2024-${String(i + 1).padStart(6, '0')}`,
    counterparty: counterparties[i % counterparties.length],
    type: i % 3 === 0 ? 'debit' : 'credit',
    amount: Math.round((Math.random() * 50000 + 100) * 100) / 100,
    currency: currencies[i % currencies.length],
    status: statuses[i % statuses.length],
    timestamp: new Date(Date.now() - i * 3600000).toISOString().slice(0, 19).replace('T', ' '),
  }));
};

const columns: Column<TransactionRow>[] = [
  { key: 'reference', header: 'Reference', width: 180, sortable: true },
  { key: 'counterparty', header: 'Counterparty', sortable: true },
  {
    key: 'type',
    header: 'Type',
    width: 80,
    cell: (row) => (
      <span className={`text-xs font-medium ${row.type === 'credit' ? 'text-success-600' : 'text-danger-600'}`}>
        {row.type === 'credit' ? '↓ CR' : '↑ DR'}
      </span>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    width: 140,
    align: 'right',
    sortable: true,
    cell: (row) => (
      <span className="font-mono">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: row.currency }).format(row.amount)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    width: 110,
    cell: (row) => {
      const colors: Record<string, string> = {
        completed: 'bg-success-100 text-success-700',
        pending: 'bg-warning-100 text-warning-700',
        failed: 'bg-danger-100 text-danger-700',
        processing: 'bg-info-100 text-info-700',
      };
      return (
        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${colors[row.status] || ''}`}>
          {row.status}
        </span>
      );
    },
  },
  { key: 'timestamp', header: 'Timestamp', width: 160, sortable: true },
];

export const Default: Story = {
  args: {
    data: generateData(50),
    columns,
    height: 400,
    getRowKey: (row) => row.id,
  },
};

export const WithSorting: Story = {
  render: () => {
    const [sortColumn, setSortColumn] = useState<string>('amount');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const data = generateData(30);

    return (
      <DataGrid
        data={data}
        columns={columns}
        height={350}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSortChange={(col, dir) => {
          setSortColumn(col);
          setSortDirection(dir);
        }}
        getRowKey={(row) => row.id}
      />
    );
  },
};

export const Striped: Story = {
  args: {
    data: generateData(20),
    columns,
    height: 350,
    striped: true,
    getRowKey: (row: TransactionRow) => row.id,
  },
};

export const Loading: Story = {
  args: {
    data: [],
    columns,
    height: 300,
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns,
    height: 300,
    emptyContent: (
      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-medium">No Transactions</p>
        <p className="text-sm text-neutral-400">No transactions match your current filters.</p>
      </div>
    ),
  },
};

export const WithPagination: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const allData = generateData(200);
    const start = (page - 1) * pageSize;
    const pageData = allData.slice(start, start + pageSize);

    return (
      <div>
        <DataGrid
          data={pageData}
          columns={columns}
          height={350}
          getRowKey={(row) => row.id}
        />
        <DataGridPagination
          page={page}
          totalPages={Math.ceil(allData.length / pageSize)}
          pageSize={pageSize}
          totalItems={allData.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    );
  },
};

export const LargeDataset: Story = {
  args: {
    data: generateData(1000),
    columns,
    height: 500,
    getRowKey: (row: TransactionRow) => row.id,
    overscan: 10,
  },
};

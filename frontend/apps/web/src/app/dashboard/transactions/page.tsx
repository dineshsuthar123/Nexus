'use client';

import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TransactionList,
  TransactionSummary,
  DataGrid,
  DataGridPagination,
  StatusBadge,
  Badge,
  Skeleton,
  type TransactionRowProps,
} from '@nexus/ui';
import { Search, Filter, Download, Plus, Calendar } from 'lucide-react';

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-description">
            View and manage all payment transactions
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Transaction
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TransactionSummary
          period="Today"
          income={125400}
          expenses={45200}
          transactionCount={342}
        />
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Pending
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                24
              </span>
              <Badge variant="warning" size="sm">
                Requires action
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Failed
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                3
              </span>
              <Badge variant="danger" size="sm">
                Review needed
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Success Rate
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-success-600 dark:text-success-400">
                99.12%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search by ID, description, or amount..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select defaultValue="all">
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Calendar className="mr-2 h-4 w-4" />
                Date Range
              </Button>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" />
                More Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Tabs */}
      <Tabs defaultValue="all">
        <TabsList variant="underline">
          <TabsTrigger value="all" variant="underline">
            All Transactions
            <Badge variant="default" size="sm" className="ml-2">
              1,247
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="incoming" variant="underline">
            Incoming
            <Badge variant="success" size="sm" className="ml-2">
              523
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="outgoing" variant="underline">
            Outgoing
            <Badge variant="default" size="sm" className="ml-2">
              698
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" variant="underline">
            Pending
            <Badge variant="warning" size="sm" className="ml-2">
              24
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="failed" variant="underline">
            Failed
            <Badge variant="danger" size="sm" className="ml-2">
              3
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Suspense fallback={<TransactionListSkeleton />}>
                <TransactionList
                  transactions={groupedTransactions}
                />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incoming">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Incoming transactions view
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outgoing">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Outgoing transactions view
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Pending transactions view
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Failed transactions view
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pagination */}
      <DataGridPagination
        page={1}
        totalPages={42}
        pageSize={25}
        totalItems={1247}
        onPageChange={(page) => console.log('Page:', page)}
        onPageSizeChange={(size) => console.log('Size:', size)}
      />
    </div>
  );
}

function TransactionListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// Mock data
const groupedTransactions: Array<{
  date: string;
  items: TransactionRowProps[];
}> = [
  {
    date: 'Today',
    items: [
      {
        transactionId: 'TXN-001',
        type: 'credit',
        status: 'completed',
        amount: 25000,
        description: 'Wire Transfer - Acme Corp',
        category: 'Business',
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        counterparty: 'Acme Corporation',
        reference: 'REF-2024-001',
      },
      {
        transactionId: 'TXN-002',
        type: 'debit',
        status: 'completed',
        amount: 1500,
        description: 'Vendor Payment - Office Supplies',
        category: 'Operations',
        timestamp: new Date(Date.now() - 1000 * 60 * 15),
        counterparty: 'Staples Inc',
        reference: 'REF-2024-002',
      },
      {
        transactionId: 'TXN-003',
        type: 'credit',
        status: 'processing',
        amount: 75000,
        description: 'International Transfer',
        category: 'International',
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        counterparty: 'Global Partners Ltd',
        reference: 'REF-2024-003',
      },
    ],
  },
  {
    date: 'Yesterday',
    items: [
      {
        transactionId: 'TXN-004',
        type: 'transfer',
        status: 'completed',
        amount: 5000,
        description: 'Internal Transfer',
        category: 'Internal',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
        counterparty: 'Operations Account',
        reference: 'REF-2024-004',
      },
      {
        transactionId: 'TXN-005',
        type: 'debit',
        status: 'failed',
        amount: 12500,
        description: 'Payroll Processing',
        category: 'Payroll',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 25),
        counterparty: 'Employee Payroll',
        reference: 'REF-2024-005',
      },
    ],
  },
];

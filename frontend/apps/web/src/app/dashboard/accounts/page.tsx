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
  Badge,
  CurrencyDisplay,
  AccountBalance,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  DataGrid,
  type Column,
} from '@nexus/ui';
import { Search, Plus, Download, MoreVertical, ArrowUpDown, Building2, Wallet } from 'lucide-react';

export const metadata = {
  title: 'Accounts',
};

type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  status: 'active' | 'inactive' | 'frozen';
  lastActivity: Date;
};

const columns: Column<Account>[] = [
  {
    key: 'name',
    label: 'Account Name',
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {row.type === 'treasury' ? (
            <Building2 className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          ) : (
            <Wallet className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
          )}
        </div>
        <div>
          <p className="font-medium text-neutral-900 dark:text-neutral-100">{row.name}</p>
          <p className="text-sm text-neutral-500">{row.id}</p>
        </div>
      </div>
    ),
  },
  {
    key: 'type',
    label: 'Type',
    sortable: true,
    render: (row) => (
      <Badge variant="secondary">
        {row.type.charAt(0).toUpperCase() + row.type.slice(1)}
      </Badge>
    ),
  },
  {
    key: 'balance',
    label: 'Balance',
    sortable: true,
    align: 'right',
    render: (row) => (
      <CurrencyDisplay
        amount={row.balance}
        currency={row.currency}
        showSign={false}
      />
    ),
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (row) => {
      const statusConfig = {
        active: { variant: 'success' as const, label: 'Active' },
        inactive: { variant: 'secondary' as const, label: 'Inactive' },
        frozen: { variant: 'danger' as const, label: 'Frozen' },
      };
      const config = statusConfig[row.status];
      return <Badge variant={config.variant}>{config.label}</Badge>;
    },
  },
  {
    key: 'lastActivity',
    label: 'Last Activity',
    sortable: true,
    render: (row) => (
      <span className="text-sm text-neutral-500">
        {row.lastActivity.toLocaleDateString()}
      </span>
    ),
  },
];

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-description">
            Manage treasury accounts and ledger balances
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Account
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AccountBalance
          label="Total Assets"
          balance={28450000}
          change={2.4}
        />
        <AccountBalance
          label="Available Balance"
          balance={15200000}
          change={1.2}
        />
        <AccountBalance
          label="Pending"
          balance={3500000}
          change={-0.8}
        />
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Total Accounts
            </div>
            <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              24
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="success" size="sm">18 active</Badge>
              <Badge variant="secondary" size="sm">6 inactive</Badge>
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
                placeholder="Search accounts..."
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
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="frozen">Frozen</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="treasury">Treasury</SelectItem>
                  <SelectItem value="operating">Operating</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                </SelectContent>
              </Select>
              <Select defaultValue="all">
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Tabs */}
      <Tabs defaultValue="all">
        <TabsList variant="underline">
          <TabsTrigger value="all" variant="underline">
            All Accounts
            <Badge variant="default" size="sm" className="ml-2">24</Badge>
          </TabsTrigger>
          <TabsTrigger value="treasury" variant="underline">
            Treasury
            <Badge variant="default" size="sm" className="ml-2">8</Badge>
          </TabsTrigger>
          <TabsTrigger value="operating" variant="underline">
            Operating
            <Badge variant="default" size="sm" className="ml-2">12</Badge>
          </TabsTrigger>
          <TabsTrigger value="payroll" variant="underline">
            Payroll
            <Badge variant="default" size="sm" className="ml-2">4</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="mt-4">
            <CardContent className="p-0">
              <Suspense fallback={<AccountsSkeleton />}>
                <DataGrid
                  data={accounts}
                  columns={columns}
                  keyField="id"
                  sortable
                  selectable
                  onRowClick={(row) => console.log('Clicked:', row.id)}
                />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="treasury">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Treasury accounts view
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operating">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Operating accounts view
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card className="mt-4">
            <CardContent className="p-6 text-center text-neutral-500">
              Payroll accounts view
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Mock data
const accounts: Account[] = [
  {
    id: 'ACC-001',
    name: 'Main Treasury',
    type: 'treasury',
    currency: 'USD',
    balance: 12500000,
    status: 'active',
    lastActivity: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: 'ACC-002',
    name: 'Operating Account',
    type: 'operating',
    currency: 'USD',
    balance: 2450000,
    status: 'active',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: 'ACC-003',
    name: 'European Treasury',
    type: 'treasury',
    currency: 'EUR',
    balance: 5800000,
    status: 'active',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: 'ACC-004',
    name: 'Payroll Account',
    type: 'payroll',
    currency: 'USD',
    balance: 890000,
    status: 'active',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: 'ACC-005',
    name: 'UK Operations',
    type: 'operating',
    currency: 'GBP',
    balance: 1250000,
    status: 'inactive',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  },
  {
    id: 'ACC-006',
    name: 'Reserve Account',
    type: 'treasury',
    currency: 'USD',
    balance: 8500000,
    status: 'active',
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 3),
  },
];

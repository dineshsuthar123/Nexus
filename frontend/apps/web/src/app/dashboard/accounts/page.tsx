/**
 * Nexus RTP Platform - Accounts List Page
 *
 * Displays all accounts with:
 * - Search and filters
 * - Account type badges
 * - Balance display
 * - Sortable columns
 * - Pagination
 * - Real-time updates via WebSocket
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  CurrencyDisplay,
  AccountBalance,
  Skeleton,
  DataTable,
  type DataTableColumn,
} from '@nexus/ui';
import {
  Search,
  Plus,
  Download,
  Building2,
  Wallet,
  RefreshCw,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

import { useAccounts, useAccountUpdates } from '@/lib/hooks';
import type { Account, AccountType, AccountStatus, AccountFilters, Pagination, Currency } from '@/lib/api/types';

// =============================================================================
// Configuration
// =============================================================================

const ACCOUNT_TYPES: Record<AccountType, { label: string; color: 'default' | 'secondary' | 'success' | 'warning' }> = {
  CHECKING: { label: 'Checking', color: 'default' },
  SAVINGS: { label: 'Savings', color: 'success' },
  TREASURY: { label: 'Treasury', color: 'secondary' },
  SETTLEMENT: { label: 'Settlement', color: 'default' },
  NOSTRO: { label: 'Nostro', color: 'secondary' },
  VOSTRO: { label: 'Vostro', color: 'warning' },
  INTERNAL: { label: 'Internal', color: 'success' },
  OPERATING: { label: 'Operating', color: 'default' },
};

const ACCOUNT_STATUSES: Record<AccountStatus, { label: string; color: 'default' | 'success' | 'warning' | 'danger' }> = {
  ACTIVE: { label: 'Active', color: 'success' },
  INACTIVE: { label: 'Inactive', color: 'default' },
  FROZEN: { label: 'Frozen', color: 'warning' },
  SUSPENDED: { label: 'Suspended', color: 'warning' },
  CLOSED: { label: 'Closed', color: 'danger' },
};

function formatEnumLabel(value: string | undefined) {
  if (!value) {
    return 'Unknown';
  }
  return value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// =============================================================================
// Components
// =============================================================================

function AccountTypeBadge({ type }: { type: AccountType }) {
  const config = ACCOUNT_TYPES[type] ?? { label: formatEnumLabel(type), color: 'default' as const };
  const icons: Record<AccountType, React.ReactNode> = {
    CHECKING: <Wallet className="h-3 w-3 mr-1" />,
    SAVINGS: <Building2 className="h-3 w-3 mr-1" />,
    TREASURY: <Building2 className="h-3 w-3 mr-1" />,
    NOSTRO: <TrendingUp className="h-3 w-3 mr-1" />,
    VOSTRO: <TrendingDown className="h-3 w-3 mr-1" />,
    SETTLEMENT: <Wallet className="h-3 w-3 mr-1" />,
    INTERNAL: <Building2 className="h-3 w-3 mr-1" />,
    OPERATING: <Wallet className="h-3 w-3 mr-1" />,
  };
  return (
    <Badge variant={config.color} className="flex items-center">
      {icons[type] ?? <Wallet className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
}

function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const config = ACCOUNT_STATUSES[status] ?? { label: formatEnumLabel(status), color: 'default' as const };
  return <Badge variant={config.color}>{config.label}</Badge>;
}

function AccountsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="border rounded-lg">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b">
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
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function AccountsPage() {
  const router = useRouter();

  // Filters state
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AccountType | ''>('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | ''>('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Build filters object
  const filters: AccountFilters = {
    ...(search && { search }),
    ...(typeFilter && { type: [typeFilter] }),
    ...(statusFilter && { status: [statusFilter] }),
    ...(currencyFilter && { currency: [currencyFilter as Currency] }),
  };

  // Build pagination object
  const pagination: Pagination = {
    page,
    pageSize,
    sortBy,
    sortOrder,
  };

  // Fetch accounts
  const { data, isLoading, error, refetch, isFetching } = useAccounts(filters, pagination);
  const accounts = data?.data ?? [];
  const totalAccounts = data?.pagination?.totalItems ?? accounts.length;
  const totalPages = data?.pagination?.totalPages ?? 1;

  // Real-time updates
  useAccountUpdates(() => {
    refetch();
  });

  const hasActiveFilters = !!typeFilter || !!statusFilter || !!currencyFilter;

  const clearFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setCurrencyFilter('');
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Table columns
  const columns: DataTableColumn<Account>[] = [
    {
      id: 'name',
      header: 'Account Name',
      cell: (account: Account) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
            {account.type === 'NOSTRO' ? (
              <TrendingUp className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            ) : account.type === 'VOSTRO' ? (
              <TrendingDown className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            ) : (
              <Wallet className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            )}
          </div>
          <div>
            <Link
              href={`/dashboard/accounts/${account.id}`}
              className="font-medium hover:text-primary hover:underline"
            >
              {account.name}
            </Link>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {account.accountNumber}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (account: Account) => <AccountTypeBadge type={account.type} />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (account: Account) => <AccountStatusBadge status={account.status} />,
    },
    {
      id: 'balance',
      header: 'Balance',
      cell: (account: Account) => (
        <CurrencyDisplay
          amount={account.availableBalance || 0}
          currency={account.currency}
          size="sm"
        />
      ),
    },
    {
      id: 'currency',
      header: 'Currency',
      cell: (account: Account) => (
        <span className="font-mono text-sm">{account.currency}</span>
      ),
    },
    {
      id: 'updatedAt',
      header: 'Last Updated',
      cell: (account: Account) => (
        <span className="text-sm text-muted-foreground">
          {new Date(account.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (account: Account) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/dashboard/accounts/${account.id}`);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/dashboard/accounts/${account.id}/edit`);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-description">
            Manage settlement, nostro, and vostro accounts
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button asChild>
            <Link href="/dashboard/accounts/new">
              <Plus className="mr-2 h-4 w-4" />
              New Account
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AccountBalance
          accountName="Total Assets"
          balance={accounts.reduce((sum, a) => sum + a.balance, 0)}
        />
        <AccountBalance
          accountName="Available Balance"
          balance={accounts.reduce((sum, a) => sum + a.availableBalance, 0)}
        />
        <AccountBalance
          accountName="Pending"
          balance={accounts.reduce((sum, a) => sum + a.pendingBalance, 0)}
        />
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Total Accounts
            </div>
            <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {totalAccounts}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="success" size="sm">
                {accounts.filter(a => a.status === 'ACTIVE').length} active
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={hasActiveFilters ? 'border-primary text-primary' : ''}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {[typeFilter, statusFilter, currencyFilter].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </form>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Account Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value as AccountType | '');
                    setPage(1);
                  }}
                  className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Types</option>
                  {Object.entries(ACCOUNT_TYPES).map(([value, { label }]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as AccountStatus | '');
                    setPage(1);
                  }}
                  className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Statuses</option>
                  {Object.entries(ACCOUNT_STATUSES).map(([value, { label }]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Currency</label>
                <select
                  value={currencyFilter}
                  onChange={(e) => {
                    setCurrencyFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Currencies</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>

              {hasActiveFilters && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <AccountsSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-destructive mb-4">Failed to load accounts</p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No accounts found</h3>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters
                ? 'Try adjusting your filters'
                : 'Create your first account to get started'}
            </p>
            {!hasActiveFilters && (
              <Button asChild>
                <Link href="/dashboard/accounts/new">
                  <Plus className="h-4 w-4 mr-2" />
                  New Account
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Results Count */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {((page - 1) * pageSize) + 1} - {' '}
              {Math.min(page * pageSize, totalAccounts)} of{' '}
              {totalAccounts} accounts
            </p>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <DataTable
                data={accounts}
                columns={columns}
                onRowClick={(account) => router.push(`/dashboard/accounts/${account.id}`)}
              />
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

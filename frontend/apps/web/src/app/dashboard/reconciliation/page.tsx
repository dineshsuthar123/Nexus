/**
 * Nexus RTP Platform - Reconciliation Cycles List Page
 *
 * Displays reconciliation cycles with:
 * - List of past and ongoing cycles
 * - Status indicators
 * - Quick actions to run new cycle
 * - Discrepancy counts
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
  CardDescription,
  Button,
  Input,
  Badge,
  Skeleton,
} from '@nexus/ui';
import {
  Search,
  Plus,
  RefreshCw,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Loader2,
  Play,
  Calendar,
  BarChart3,
} from 'lucide-react';

import { useReconciliationCycles } from '@/lib/hooks';
import type { ReconciliationCycle, ReconciliationStatus, Pagination, PaginatedResponse } from '@/lib/api/types';

// =============================================================================
// Configuration
// =============================================================================

const STATUS_CONFIG: Record<ReconciliationStatus, {
  label: string;
  color: 'success' | 'warning' | 'danger' | 'default' | 'secondary';
  icon: React.ReactNode;
}> = {
  PENDING: {
    label: 'Pending',
    color: 'default',
    icon: <Clock className="h-4 w-4" />,
  },
  RUNNING: {
    label: 'Running',
    color: 'warning',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  COMPLETED: {
    label: 'Completed',
    color: 'success',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  FAILED: {
    label: 'Failed',
    color: 'danger',
    icon: <XCircle className="h-4 w-4" />,
  },
  PARTIAL: {
    label: 'Partial',
    color: 'secondary',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
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

function CycleStatusBadge({ status }: { status: ReconciliationStatus }) {
  const config = STATUS_CONFIG[status] ?? {
    label: formatEnumLabel(status),
    color: 'default' as const,
    icon: <Clock className="h-4 w-4" />,
  };
  return (
    <Badge variant={config.color} className="flex items-center gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

function ReconciliationSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-10 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Summary Cards
// =============================================================================

function SummaryCards({ data }: { data: PaginatedResponse<ReconciliationCycle> | undefined }) {
  const cycles = data?.data ?? [];
  const completed = cycles.filter(c => c.status === 'COMPLETED').length;
  const running = cycles.filter(c => c.status === 'RUNNING').length;
  const withIssues = cycles.filter(c => (c.discrepancyCount || 0) > 0).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Cycles</p>
              <p className="text-2xl font-bold">{data?.pagination?.totalItems || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completed}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
              <Loader2 className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Running</p>
              <p className="text-2xl font-bold">{running}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">With Discrepancies</p>
              <p className="text-2xl font-bold">{withIssues}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function ReconciliationPage() {
  const router = useRouter();

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReconciliationStatus | ''>('');

  // Pagination state
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10 });

  // Build filters object
  const filters = {
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter }),
  };

  // Fetch reconciliation cycles
  const { data, isLoading, error, refetch, isFetching } = useReconciliationCycles(filters, pagination);
  const cycles = data?.data ?? [];
  const totalCycles = data?.pagination?.totalItems ?? cycles.length;
  const totalPages = data?.pagination?.totalPages ?? 1;

  const hasActiveFilters = !!statusFilter;

  const clearFilters = () => {
    setStatusFilter('');
    setPagination({ ...pagination, page: 1 });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination({ ...pagination, page: 1 });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Reconciliation</h1>
          <p className="page-description">
            Manage and monitor account reconciliation cycles
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/reconciliation/new">
              <Play className="h-4 w-4 mr-2" />
              Run Reconciliation
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards data={data} />

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by cycle ID or account..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as ReconciliationStatus | '');
                  setPagination({ ...pagination, page: 1 });
                }}
                className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All Statuses</option>
                {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <ReconciliationSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-destructive mb-4">Failed to load reconciliation cycles</p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </CardContent>
        </Card>
      ) : cycles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No reconciliation cycles found</h3>
            <p className="text-muted-foreground mb-4">
              {hasActiveFilters
                ? 'Try adjusting your filters'
                : 'Run your first reconciliation to get started'}
            </p>
            {!hasActiveFilters && (
              <Button asChild>
                <Link href="/dashboard/reconciliation/new">
                  <Play className="h-4 w-4 mr-2" />
                  Run Reconciliation
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
              Showing {(((pagination.page || 1) - 1) * (pagination.pageSize || 10)) + 1} - {' '}
              {Math.min((pagination.page || 1) * (pagination.pageSize || 10), totalCycles)} of{' '}
              {totalCycles} cycles
            </p>
          </div>

          {/* Cycles List */}
          <div className="space-y-4">
            {cycles.map((cycle) => {
              const accountCount = Array.isArray(cycle.accounts) ? cycle.accounts.length : 0;

              return (
              <Card
                key={cycle.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => router.push(`/dashboard/reconciliation/${cycle.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">Cycle #{cycle.id.slice(-8)}</h3>
                        <CycleStatusBadge status={cycle.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(cycle.startTime).toLocaleDateString()}
                        </span>
                        {accountCount > 0 && (
                          <span>{accountCount} accounts</span>
                        )}
                        {cycle.discrepancyCount != null && cycle.discrepancyCount > 0 && (
                          <Badge variant="danger" size="sm">
                            {cycle.discrepancyCount} discrepancies
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {cycle.matchRate != null && (
                        <div className="text-right">
                          <p className="text-2xl font-bold">{(cycle.matchRate * 100).toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">Match Rate</p>
                        </div>
                      )}
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page || 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination({ ...pagination, page: (pagination.page || 1) - 1 })}
                  disabled={(pagination.page || 1) <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination({ ...pagination, page: (pagination.page || 1) + 1 })}
                  disabled={(pagination.page || 1) >= totalPages}
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

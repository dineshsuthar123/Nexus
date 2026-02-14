/**
 * Nexus RTP Platform - Payments List Page
 * 
 * Full-featured payments list with:
 * - Data table with sorting and pagination
 * - Search and filters
 * - Real-time updates via WebSocket
 * - Bulk actions
 */

'use client';

import { useState, useCallback } from 'react';
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
} from '@nexus/ui';
import { 
  Plus,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from 'lucide-react';

import { usePayments, useInvalidatePayments } from '@/lib/hooks';
import { usePaymentUpdates } from '@/lib/websocket';
import type { Payment, PaymentStatus, PaymentFilters } from '@/lib/api/types';

// =============================================================================
// Types
// =============================================================================

type SortField = 'createdAt' | 'amount' | 'status';
type SortOrder = 'asc' | 'desc';

// =============================================================================
// Status Badge Component
// =============================================================================

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config: Record<PaymentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    PENDING: { 
      label: 'Pending', 
      variant: 'warning', 
      icon: <Clock className="h-3 w-3" /> 
    },
    PROCESSING: { 
      label: 'Processing', 
      variant: 'default', 
      icon: <RefreshCw className="h-3 w-3 animate-spin" /> 
    },
    SETTLED: { 
      label: 'Settled', 
      variant: 'success', 
      icon: <CheckCircle2 className="h-3 w-3" /> 
    },
    FAILED: { 
      label: 'Failed', 
      variant: 'destructive', 
      icon: <XCircle className="h-3 w-3" /> 
    },
    RETURNED: { 
      label: 'Returned', 
      variant: 'outline', 
      icon: <AlertCircle className="h-3 w-3" /> 
    },
    CANCELLED: { 
      label: 'Cancelled', 
      variant: 'outline', 
      icon: <XCircle className="h-3 w-3" /> 
    },
  };

  const { label, variant, icon } = config[status] || { label: status, variant: 'outline', icon: null };

  return (
    <Badge variant={variant} className="inline-flex items-center gap-1">
      {icon}
      {label}
    </Badge>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function PaymentsPage() {
  const router = useRouter();
  const invalidatePayments = useInvalidatePayments();

  // State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<PaymentFilters>({});
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch payments
  const { data, isLoading, isError, refetch } = usePayments(
    { ...filters, search: searchQuery || undefined },
    { page, pageSize, sortBy: sortField, sortOrder }
  );

  // Real-time updates
  usePaymentUpdates(
    useCallback(() => {
      invalidatePayments();
    }, [invalidatePayments])
  );

  // Handlers
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    refetch();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleViewPayment = (uetr: string) => {
    router.push(`/dashboard/payments/${uetr}`);
  };

  const totalPages = data?.totalPages || 1;
  const payments = data?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-description">
            Manage and monitor all payment transactions
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button asChild>
            <Link href="/dashboard/payments/new">
              <Plus className="mr-2 h-4 w-4" />
              New Payment
            </Link>
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by UETR, amount, or recipient..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-muted' : ''}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {Object.keys(filters).length > 0 && (
                <Badge variant="default" className="ml-2">
                  {Object.keys(filters).length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Status
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={filters.status?.[0] || ''}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      status: e.target.value ? [e.target.value] : undefined,
                    }));
                    setPage(1);
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="SETTLED">Settled</option>
                  <option value="FAILED">Failed</option>
                  <option value="RETURNED">Returned</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Type
                </label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={filters.type?.[0] || ''}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      type: e.target.value ? [e.target.value] : undefined,
                    }));
                    setPage(1);
                  }}
                >
                  <option value="">All Types</option>
                  <option value="INSTANT">Instant</option>
                  <option value="STANDARD">Standard</option>
                  <option value="SCHEDULED">Scheduled</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Min Amount
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={filters.minAmount || ''}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      minAmount: e.target.value ? parseFloat(e.target.value) : undefined,
                    }));
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Max Amount
                </label>
                <Input
                  type="number"
                  placeholder="999999.99"
                  value={filters.maxAmount || ''}
                  onChange={(e) => {
                    setFilters((prev) => ({
                      ...prev,
                      maxAmount: e.target.value ? parseFloat(e.target.value) : undefined,
                    }));
                  }}
                />
              </div>
              <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilters({});
                    setPage(1);
                  }}
                >
                  Clear Filters
                </Button>
                <Button onClick={() => refetch()}>Apply Filters</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading payments...</p>
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-4" />
              <p className="text-destructive mb-4">Failed to load payments</p>
              <Button onClick={() => refetch()}>Try Again</Button>
            </div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground mb-4">No payments found</p>
              <Button asChild>
                <Link href="/dashboard/payments/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first payment
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort('createdAt')}
                      >
                        Date
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      UETR
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Debtor
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Creditor
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort('amount')}
                      >
                        Amount
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => handleSort('status')}
                      >
                        Status
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((payment) => (
                    <tr 
                      key={payment.uetr} 
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => handleViewPayment(payment.uetr)}
                    >
                      <td className="py-3 px-4 text-sm">
                        {new Date(payment.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-sm font-mono">
                        {payment.uetr.slice(0, 8)}...
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div>
                          <p className="font-medium">{payment.debtorName}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {payment.debtorAccount?.slice(0, 12)}...
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div>
                          <p className="font-medium">{payment.creditorName}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {payment.creditorAccount?.slice(0, 12)}...
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <CurrencyDisplay
                          amount={payment.amount.value}
                          currency={payment.amount.currency}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <PaymentStatusBadge status={payment.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewPayment(payment.uetr);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && payments.length > 0 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to{' '}
                {Math.min(page * pageSize, data?.total || 0)} of {data?.total || 0} payments
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

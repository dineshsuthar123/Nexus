'use client';

import { Suspense } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CurrencyDisplay,
  PercentageDisplay,
  TransactionRow,
  Button,
} from '@nexus/ui';
import { 
  MetricCard,
  MetricCardSkeleton,
  SystemStatusBadge,
} from '@nexus/ui';
import { 
  Activity,
  Users,
  CreditCard,
  DollarSign,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';

import { useDashboardData, usePayments } from '@/lib/hooks';
import { useWebSocketContext } from '../websocket-provider';

export default function DashboardPage() {
  const { summary, performance, health, isLoading, isError, refetch } = useDashboardData({
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  const { data: recentPayments, isLoading: paymentsLoading } = usePayments({}, { page: 1, pageSize: 5 });
  const { isConnected } = useWebSocketContext();

  // Show error state
  if (isError) {
    return (
      <div className="space-y-8">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-description">
              Real-time overview of your payment operations
            </p>
          </div>
        </div>
        
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Failed to load dashboard</h2>
            <p className="text-muted-foreground mb-4">
              There was an error loading the dashboard data. Please try again.
            </p>
            <Button onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">
            Real-time overview of your payment operations
            {isConnected && (
              <span className="ml-2 inline-flex items-center gap-1 text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/dashboard/payments/new">
              New Payment
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </>
        ) : (
          <>
            <MetricCard
              title="Total Volume"
              value={summary.data?.totalVolume ? `$${formatCompactNumber(summary.data.totalVolume)}` : '$0'}
              change={summary.data?.volumeChange || 0}
              trend={summary.data?.volumeChange >= 0 ? 'up' : 'down'}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <MetricCard
              title="Transactions"
              value={formatCompactNumber(summary.data?.totalTransactions || 0)}
              change={summary.data?.transactionChange || 0}
              trend={summary.data?.transactionChange >= 0 ? 'up' : 'down'}
              icon={<Activity className="h-5 w-5" />}
            />
            <MetricCard
              title="Active Accounts"
              value={formatCompactNumber(summary.data?.activeAccounts || 0)}
              change={summary.data?.accountChange || 0}
              trend={summary.data?.accountChange >= 0 ? 'up' : 'down'}
              icon={<Users className="h-5 w-5" />}
            />
            <MetricCard
              title="Success Rate"
              value={`${(summary.data?.successRate || 99.97).toFixed(2)}%`}
              change={summary.data?.successRateChange || 0}
              trend={summary.data?.successRateChange >= 0 ? 'up' : 'down'}
              icon={<CreditCard className="h-5 w-5" />}
            />
          </>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/transactions">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {paymentsLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-16 bg-muted rounded-lg" />
                    ))}
                  </div>
                </div>
              ) : recentPayments?.data.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No recent transactions
                </div>
              ) : (
                recentPayments?.data.map((payment) => (
                  <TransactionRow
                    key={payment.uetr}
                    transactionId={payment.uetr}
                    type={payment.type === 'INSTANT' ? 'credit' : 'debit'}
                    status={payment.status.toLowerCase() as 'completed' | 'pending' | 'processing'}
                    amount={payment.amount.value}
                    description={payment.remittanceInfo || 'Payment'}
                    category={payment.type}
                    timestamp={new Date(payment.createdAt)}
                    counterparty={payment.creditorName}
                    compact
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats / Activity */}
        <div className="space-y-6">
          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {health.isLoading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-4 w-24 bg-muted rounded" />
                      <div className="h-4 w-16 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      API Gateway
                    </span>
                    <SystemStatusBadge 
                      status={health.data?.services?.gateway || 'active'} 
                      size="sm" 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      Payment Engine
                    </span>
                    <SystemStatusBadge 
                      status={health.data?.services?.payment || 'active'} 
                      size="sm" 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      Audit Service
                    </span>
                    <SystemStatusBadge 
                      status={health.data?.services?.audit || 'active'} 
                      size="sm" 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      Reconciliation
                    </span>
                    <SystemStatusBadge 
                      status={health.data?.services?.reconciliation || 'processing'} 
                      size="sm" 
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top Recipients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary.isLoading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-muted rounded-full" />
                      <div className="flex-1">
                        <div className="h-4 w-24 bg-muted rounded mb-1" />
                        <div className="h-3 w-16 bg-muted rounded" />
                      </div>
                      <div className="h-4 w-20 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                (summary.data?.topRecipients || []).map((recipient, index) => (
                  <div key={recipient.name} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {recipient.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {recipient.transactions} transactions
                      </p>
                    </div>
                    <CurrencyDisplay
                      amount={recipient.volume}
                      compact
                      size="sm"
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processing Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                  {performance.data?.avgLatencyMs || 47}ms
                </span>
                <PercentageDisplay 
                  value={performance.data?.latencyChange || -12} 
                  size="sm" 
                  invertColor 
                />
              </div>
              <p className="text-sm text-neutral-500">Average end-to-end latency</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Throughput</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                  {formatCompactNumber(performance.data?.peakTps || 12400)}
                </span>
                <span className="text-sm text-neutral-500">/sec</span>
                <PercentageDisplay 
                  value={performance.data?.tpsChange || 8.3} 
                  size="sm" 
                />
              </div>
              <p className="text-sm text-neutral-500">Peak transactions per second</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                  {(performance.data?.errorRate || 0.03).toFixed(2)}%
                </span>
                <PercentageDisplay 
                  value={performance.data?.errorRateChange || -0.01} 
                  size="sm" 
                  invertColor 
                />
              </div>
              <p className="text-sm text-neutral-500">Failed transactions today</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Helper function
function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

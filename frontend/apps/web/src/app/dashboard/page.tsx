'use client';

import { Suspense } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CurrencyDisplay,
  TransactionRow,
  Button,
  Badge,
  TrendSparkline,
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
  Globe,
  TrendingUp,
  Clock,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';

import { useDashboardData, usePayments } from '@/lib/hooks';
import { useWebSocketContext } from '../websocket-provider';

// Stagger animation for card grids
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0, 0, 0.2, 1] },
  },
};

// Mock sparkline data (in production: from API)
const sparklineDataSets = {
  volume: [42, 48, 55, 50, 62, 58, 70, 65, 78, 82, 75, 88, 92, 85],
  transactions: [120, 145, 132, 168, 155, 180, 172, 195, 188, 210, 205, 225, 218, 240],
  users: [80, 82, 85, 84, 88, 90, 92, 91, 95, 97, 96, 100, 102, 105],
  reach: [32, 33, 33, 34, 35, 35, 36, 37, 37, 38, 38, 39, 40, 40],
};

export default function DashboardPage() {
  const { summary, performance, health, isLoading, isError, refetch } = useDashboardData({
    refetchInterval: 30000,
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

        <Card variant="glass" className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-50 text-danger-500 dark:bg-danger-950">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Failed to load dashboard</h2>
            <p className="mt-2 text-sm text-neutral-500 max-w-sm">
              There was an error loading the dashboard data. Please check your connection and try again.
            </p>
            <Button onClick={() => refetch()} className="mt-6">
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
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/payments/new">
              New Payment
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid — staggered entrance */}
      <motion.div
        className="stats-grid"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </>
        ) : (
          <>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Total Volume"
                value={summary.data?.totalVolume ? `$${formatCompactNumber(summary.data.totalVolume)}` : '$0'}
                change={summary.data?.volumeChange || 0}
                trend={(summary.data?.volumeChange ?? 0) >= 0 ? 'up' : 'down'}
                icon={<DollarSign className="h-5 w-5" />}
                accent="accent"
                sparklineData={sparklineDataSets.volume}
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Transactions"
                value={formatCompactNumber(summary.data?.totalTransactions || 0)}
                change={summary.data?.transactionChange || 0}
                trend={(summary.data?.transactionChange ?? 0) >= 0 ? 'up' : 'down'}
                icon={<Activity className="h-5 w-5" />}
                accent="primary"
                sparklineData={sparklineDataSets.transactions}
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Active Users"
                value={formatCompactNumber(summary.data?.activeUsers || 0)}
                change={summary.data?.userChange || 0}
                trend={(summary.data?.userChange ?? 0) >= 0 ? 'up' : 'down'}
                icon={<Users className="h-5 w-5" />}
                accent="secondary"
                sparklineData={sparklineDataSets.users}
              />
            </motion.div>
            <motion.div variants={itemVariants}>
              <MetricCard
                title="Global Reach"
                value={`${summary.data?.globalReach || 0} countries`}
                change={summary.data?.newCountries || 0}
                trend={(summary.data?.newCountries ?? 0) >= 0 ? 'up' : 'down'}
                icon={<Globe className="h-5 w-5" />}
                accent="success"
                sparklineData={sparklineDataSets.reach}
              />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Main content grid */}
      <motion.div
        className="grid gap-6 lg:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Recent Transactions */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-800/30">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Recent Transactions</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/transactions">
                  View all
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {paymentsLoading ? (
                  <div className="p-6">
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <div className="h-10 w-10 animate-shimmer rounded-xl" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 animate-shimmer rounded" />
                            <div className="h-3 w-24 animate-shimmer rounded" />
                          </div>
                          <div className="h-4 w-20 animate-shimmer rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : recentPayments?.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800">
                      <CreditCard className="h-6 w-6 text-neutral-400" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      No recent transactions
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Your transactions will appear here
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" asChild>
                      <Link href="/dashboard/payments/new">
                        Make your first payment
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  recentPayments?.data.map((payment: any) => {
                    const statusMap: Record<string, string> = {
                      'PENDING': 'pending',
                      'SANCTIONED': 'processing',
                      'FRAUD_REVIEW': 'processing',
                      'CLEARED': 'processing',
                      'SETTLED': 'completed',
                      'REJECTED': 'failed',
                      'RETURNED': 'refunded',
                      'CANCELLED': 'cancelled',
                    };
                    const mappedStatus = statusMap[payment.status] || 'pending';

                    return (
                      <TransactionRow
                        key={payment.uetr || payment.transactionId}
                        transactionId={payment.uetr || payment.transactionId}
                        type="debit"
                        status={mappedStatus as any}
                        amount={Math.abs(parseFloat(payment.amount) || 0)}
                        currency={payment.currency || 'EUR'}
                        description={payment.creditorName || payment.debtorName || 'Payment'}
                        category={payment.currency}
                        timestamp={new Date(payment.createdAt)}
                        counterparty={payment.debtorName || ''}
                        compact
                      />
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right column */}
        <motion.div variants={itemVariants} className="space-y-6">
          {/* System Status */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/50 pb-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-50 text-success-600 dark:bg-success-100/10 dark:text-success-400">
                  <Zap className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">System Status</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {health.isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <div className="h-4 w-24 animate-shimmer rounded" />
                      <div className="h-5 w-16 animate-shimmer rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {[
                    { name: 'Database', key: 'database' },
                    { name: 'Kafka', key: 'kafka' },
                    { name: 'Redis', key: 'redis' },
                  ].map((service) => (
                    <div key={service.key} className="flex items-center justify-between py-0.5">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {service.name}
                      </span>
                      <SystemStatusBadge
                        status={(health.data?.checks as any)?.[service.key]?.status === 'healthy' ? 'active' : 'error'}
                        size="sm"
                      />
                    </div>
                  ))}
                  <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Overall Health
                      </span>
                      <SystemStatusBadge
                        status={health.data?.status === 'healthy' ? 'active' : 'error'}
                        size="sm"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top Recipients */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/50 pb-3 dark:border-neutral-800 dark:bg-neutral-800/30">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-50 text-secondary-600 dark:bg-secondary-950 dark:text-secondary-400">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Top Recipients</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {summary.isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 animate-shimmer rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-24 animate-shimmer rounded" />
                        <div className="h-3 w-16 animate-shimmer rounded" />
                      </div>
                      <div className="h-3.5 w-20 animate-shimmer rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                (summary.data?.topCategories || []).map((category, index) => (
                  <div key={category.name} className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                      index === 0 ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                      index === 1 ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' :
                      'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-500'
                    )}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {category.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {category.percentage.toFixed(1)}%
                      </p>
                    </div>
                    <CurrencyDisplay
                      amount={category.volume}
                      compact
                      size="sm"
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Performance Metrics */}
      <motion.div
        className="grid gap-6 lg:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Processing Time
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {performance.data?.averageLatency || 47}
                    </span>
                    <span className="text-sm font-medium text-neutral-400">ms</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    p99: <span className="font-medium text-neutral-700 dark:text-neutral-300">{performance.data?.p99Latency || 120}ms</span>
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Throughput
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {formatCompactNumber(performance.data?.throughput || 12400)}
                    </span>
                    <span className="text-sm font-medium text-neutral-400">/sec</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">Peak transactions per second</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-50 text-secondary-600 dark:bg-secondary-950/50 dark:text-secondary-400">
                  <Zap className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Error Rate
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
                      {(performance.data?.errorRate || 0.03).toFixed(2)}
                    </span>
                    <span className="text-sm font-medium text-neutral-400">%</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Uptime: <span className="font-medium text-success-600 dark:text-success-400">{(performance.data?.uptimePercentage || 99.99).toFixed(2)}%</span>
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 text-success-600 dark:bg-success-100/10 dark:text-success-400">
                  <Activity className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
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

// cn utility re-export for local use
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

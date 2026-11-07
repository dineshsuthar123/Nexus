'use client';

import { useState } from 'react';
import { BenchmarkSummary } from '@/components/BenchmarkSummary';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Skeleton,
  CurrencyDisplay,
  PercentageDisplay,
} from '@nexus/ui';
import {
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Activity,
  Users,
  Globe,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  useDashboardSummary,
  useVolumeAnalytics,
  usePerformanceMetrics,
  useTrendData,
} from '@/lib/hooks/use-analytics';

type Period = '7d' | '30d' | '90d';

export default function AnalyticsContent() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: summary, isLoading: summaryLoading, isError: summaryError, refetch: refetchSummary } = useDashboardSummary({ refetchInterval: 60_000 });
  const { data: volumeData, isLoading: volumeLoading } = useVolumeAnalytics(period === '30d' ? '30d' : period === '90d' ? '90d' : '7d');
  const { data: performance, isLoading: perfLoading } = usePerformanceMetrics({ refetchInterval: 30_000 });
  const { data: trendData, isLoading: trendLoading } = useTrendData(period === '30d' ? '30d' : period === '90d' ? '90d' : '7d');

  if (summaryError) {
    return (
      <div className="space-y-6">
        <BenchmarkSummary />
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-12 w-12 text-danger-500" />
          <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Failed to load analytics
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Could not fetch analytics data. Please try again.
          </p>
          <Button className="mt-4" onClick={() => refetchSummary()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BenchmarkSummary />
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-description">
            Transaction insights and performance metrics
          </p>
        </div>
        <div className="flex gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Total Volume
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <CurrencyDisplay
                      amount={summary?.totalVolume ?? 0}
                      compact
                      size="lg"
                      showSign={false}
                    />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  {summaryLoading ? (
                    <Skeleton className="h-4 w-20" />
                  ) : (
                    <>
                      {(summary?.volumeChange ?? 0) >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      <PercentageDisplay value={summary?.volumeChange ?? 0} size="sm" />
                      <span className="text-xs text-neutral-500">vs last period</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-950">
                <BarChart3 className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Transaction Count
                </p>
                <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    (summary?.totalTransactions ?? 0).toLocaleString()
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  {summaryLoading ? (
                    <Skeleton className="h-4 w-20" />
                  ) : (
                    <>
                      {(summary?.transactionChange ?? 0) >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      <PercentageDisplay value={summary?.transactionChange ?? 0} size="sm" />
                      <span className="text-xs text-neutral-500">vs last period</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-100 dark:bg-secondary-950">
                <Activity className="h-6 w-6 text-secondary-600 dark:text-secondary-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Active Users
                </p>
                <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    (summary?.activeUsers ?? 0).toLocaleString()
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  {summaryLoading ? (
                    <Skeleton className="h-4 w-20" />
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      <PercentageDisplay value={summary?.userChange ?? 0} size="sm" />
                      <span className="text-xs text-neutral-500">vs last period</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 dark:bg-accent-950">
                <Users className="h-6 w-6 text-accent-600 dark:text-accent-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Global Reach
                </p>
                <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-28" />
                  ) : (
                    `${summary?.globalReach ?? 0} countries`
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  {summaryLoading ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs">+{summary?.newCountries ?? 0} new this period</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100 dark:bg-success-950">
                <Globe className="h-6 w-6 text-success-600 dark:text-success-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="volume">
        <TabsList variant="underline">
          <TabsTrigger value="volume" variant="underline">
            Volume Trends
          </TabsTrigger>
          <TabsTrigger value="transactions" variant="underline">
            Transaction Breakdown
          </TabsTrigger>
          <TabsTrigger value="performance" variant="underline">
            System Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="volume">
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            {/* Volume Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Transaction Volume</CardTitle>
              </CardHeader>
              <CardContent>
                {volumeLoading || trendLoading ? (
                  <ChartSkeleton />
                ) : volumeData && volumeData.length > 0 ? (
                  <div className="h-80">
                    <div className="space-y-2">
                      {volumeData.map((point, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-neutral-500">{point.date}</span>
                          <div className="flex-1">
                            <div
                              className="h-6 rounded bg-primary-500"
                              style={{
                                width: `${Math.min(100, (point.volume / Math.max(...volumeData.map(v => v.volume))) * 100)}%`,
                              }}
                            />
                          </div>
                          <CurrencyDisplay amount={point.volume} compact size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-80 items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-900">
                    <div className="text-center">
                      <BarChart3 className="mx-auto h-12 w-12 text-neutral-300 dark:text-neutral-700" />
                      <p className="mt-2 text-sm text-neutral-500">
                        No volume data available for this period
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Categories */}
            <Card>
              <CardHeader>
                <CardTitle>Top Categories</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="space-y-6">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(summary?.topCategories ?? []).map((category) => (
                      <div key={category.name}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-neutral-700 dark:text-neutral-300">
                            {category.name}
                          </span>
                          <CurrencyDisplay amount={category.volume} compact size="sm" />
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                          <div
                            className="h-full rounded-full bg-primary-500"
                            style={{ width: `${category.percentage}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-neutral-500">
                          {category.percentage}% of total volume
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Transaction Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Transaction Types</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <ChartSkeleton height="h-64" />
                ) : (
                  <>
                    <div className="flex h-64 items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-900">
                      <div className="grid grid-cols-2 gap-4 p-4">
                        {(summary?.transactionTypes ?? []).map((type) => (
                          <div key={type.name} className="flex flex-col items-center gap-1">
                            <div
                              className="flex h-16 w-16 items-center justify-center rounded-full text-white text-sm font-bold"
                              style={{ backgroundColor: type.color }}
                            >
                              {type.percentage}%
                            </div>
                            <span className="text-xs text-neutral-500">{type.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      {(summary?.transactionTypes ?? []).map((type) => (
                        <div key={type.name} className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">
                            {type.name}
                          </span>
                          <span className="ml-auto text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {type.percentage}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Geographic Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(summary?.regions ?? []).map((region, index) => (
                      <div key={region.name} className="flex items-center gap-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                              {region.name}
                            </span>
                            <CurrencyDisplay amount={region.volume} compact size="sm" />
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                              <div
                                className="h-full rounded-full bg-primary-500"
                                style={{ width: `${region.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-neutral-500">
                              {region.percentage}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Avg. Processing Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {perfLoading ? (
                    <Skeleton className="h-10 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {performance?.averageLatency == null ? '—' : `${performance.averageLatency}ms`}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-neutral-500">Live processing telemetry</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live Throughput</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {perfLoading ? (
                    <Skeleton className="h-10 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {performance?.throughput == null ? '—' : performance.throughput.toFixed(1)}
                      </span>
                      <span className="text-sm text-neutral-500">/sec</span>
                    </div>
                  )}
                  <p className="text-sm text-neutral-500">Transactions per second</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Uptime</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {perfLoading ? (
                    <Skeleton className="h-10 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-success-600 dark:text-success-400">
                        {performance?.uptimePercentage == null ? '—' : `${performance.uptimePercentage}%`}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-neutral-500">Last 30 days</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {perfLoading ? (
                    <Skeleton className="h-10 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {performance?.errorRate == null ? '—' : `${performance.errorRate}%`}
                      </span>
                    </div>
                  )}
                  <p className="text-sm text-neutral-500">Failed transactions</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">API Response</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {perfLoading ? (
                    <Skeleton className="h-10 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {performance?.p95Latency == null ? '—' : `${performance.p95Latency}ms`}
                      </span>
                      <span className="text-sm text-neutral-500">p95</span>
                    </div>
                  )}
                  <p className="text-sm text-neutral-500">API gateway latency</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">P99 Latency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {perfLoading ? (
                    <Skeleton className="h-10 w-24" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {performance?.p99Latency == null ? '—' : `${performance.p99Latency}ms`}
                      </span>
                      <span className="text-sm text-neutral-500">p99</span>
                    </div>
                  )}
                  <p className="text-sm text-neutral-500">Tail latency</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartSkeleton({ height = 'h-80' }: { height?: string }) {
  return (
    <div className={`${height} animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800`} />
  );
}

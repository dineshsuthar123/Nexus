import { Suspense } from 'react';
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
  Badge,
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
} from 'lucide-react';

export const metadata = {
  title: 'Analytics',
};

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-description">
            Transaction insights and performance metrics
          </p>
        </div>
        <div className="flex gap-3">
          <Select defaultValue="30d">
            <SelectTrigger className="w-[160px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
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
                  <CurrencyDisplay
                    amount={48250000}
                    compact
                    size="lg"
                    showSign={false}
                  />
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  <TrendingUp className="h-4 w-4" />
                  <PercentageDisplay value={12.5} size="sm" />
                  <span className="text-xs text-neutral-500">vs last month</span>
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
                  284,392
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  <TrendingUp className="h-4 w-4" />
                  <PercentageDisplay value={8.3} size="sm" />
                  <span className="text-xs text-neutral-500">vs last month</span>
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
                  1,847
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  <TrendingUp className="h-4 w-4" />
                  <PercentageDisplay value={4.2} size="sm" />
                  <span className="text-xs text-neutral-500">vs last month</span>
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
                  42 countries
                </div>
                <div className="mt-1 flex items-center gap-1 text-success-600">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">+3 new this month</span>
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
            {/* Volume Chart Placeholder */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Transaction Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<ChartSkeleton />}>
                  <div className="flex h-80 items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-900">
                    <div className="text-center">
                      <BarChart3 className="mx-auto h-12 w-12 text-neutral-300 dark:text-neutral-700" />
                      <p className="mt-2 text-sm text-neutral-500">
                        Chart component with Recharts
                      </p>
                      <p className="text-xs text-neutral-400">
                        Will display volume over time
                      </p>
                    </div>
                  </div>
                </Suspense>
              </CardContent>
            </Card>

            {/* Top Categories */}
            <Card>
              <CardHeader>
                <CardTitle>Top Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {topCategories.map((category) => (
                    <div key={category.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {category.name}
                        </span>
                        <CurrencyDisplay
                          amount={category.volume}
                          compact
                          size="sm"
                        />
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
                <div className="flex h-64 items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-900">
                  <div className="text-center">
                    <PieChart className="mx-auto h-12 w-12 text-neutral-300 dark:text-neutral-700" />
                    <p className="mt-2 text-sm text-neutral-500">
                      Pie chart with type distribution
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {transactionTypes.map((type) => (
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
              </CardContent>
            </Card>

            {/* Geographic Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Geographic Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {regions.map((region, index) => (
                    <div key={region.name} className="flex items-center gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">
                            {region.name}
                          </span>
                          <CurrencyDisplay
                            amount={region.volume}
                            compact
                            size="sm"
                          />
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
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                      47ms
                    </span>
                    <PercentageDisplay value={-12} size="sm" invertColor />
                  </div>
                  <p className="text-sm text-neutral-500">End-to-end latency</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Peak Throughput</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                      12.4K
                    </span>
                    <span className="text-sm text-neutral-500">/sec</span>
                  </div>
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
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-success-600 dark:text-success-400">
                      99.99%
                    </span>
                  </div>
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
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                      0.03%
                    </span>
                    <PercentageDisplay value={-0.01} size="sm" invertColor />
                  </div>
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
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                      23ms
                    </span>
                    <span className="text-sm text-neutral-500">p95</span>
                  </div>
                  <p className="text-sm text-neutral-500">API gateway latency</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cache Hit Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-success-600 dark:text-success-400">
                      94.2%
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">Redis cache efficiency</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-80 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
  );
}

// Mock data
const topCategories = [
  { name: 'Wire Transfers', volume: 18500000, percentage: 38 },
  { name: 'ACH Payments', volume: 12400000, percentage: 26 },
  { name: 'International', volume: 9800000, percentage: 20 },
  { name: 'Internal Transfers', volume: 7550000, percentage: 16 },
];

const transactionTypes = [
  { name: 'Credits', percentage: 45, color: '#10b981' },
  { name: 'Debits', percentage: 35, color: '#ef4444' },
  { name: 'Transfers', percentage: 15, color: '#3b82f6' },
  { name: 'Reversals', percentage: 5, color: '#8b5cf6' },
];

const regions = [
  { name: 'North America', volume: 22500000, percentage: 47 },
  { name: 'Europe', volume: 14400000, percentage: 30 },
  { name: 'Asia Pacific', volume: 7200000, percentage: 15 },
  { name: 'Other', volume: 4150000, percentage: 8 },
];

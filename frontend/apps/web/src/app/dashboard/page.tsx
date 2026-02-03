import { Suspense } from 'react';
import { 
  DashboardCard, 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CurrencyDisplay,
  PercentageDisplay,
  TransactionRow,
  StatusBadge,
  SkeletonDashboardCard,
  Button,
} from '@nexus/ui';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownLeft,
  Activity,
  Users,
  CreditCard,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Dashboard',
};

export default function DashboardPage() {
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
          <Button variant="outline">Export Report</Button>
          <Button>
            New Payment
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <Suspense fallback={<StatsLoadingSkeleton />}>
        <div className="stats-grid">
          <DashboardCard
            title="Total Volume"
            value="$12,847,392"
            change={12.5}
            trend="up"
            icon={<DollarSign className="h-5 w-5" />}
          />
          <DashboardCard
            title="Transactions"
            value="284,392"
            change={8.2}
            trend="up"
            icon={<Activity className="h-5 w-5" />}
          />
          <DashboardCard
            title="Active Accounts"
            value="12,847"
            change={-2.4}
            trend="down"
            icon={<Users className="h-5 w-5" />}
          />
          <DashboardCard
            title="Success Rate"
            value="99.97%"
            change={0.02}
            trend="up"
            icon={<CreditCard className="h-5 w-5" />}
          />
        </div>
      </Suspense>

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
              {recentTransactions.map((tx) => (
                <TransactionRow
                  key={tx.transactionId}
                  {...tx}
                  compact
                />
              ))}
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  API Gateway
                </span>
                <StatusBadge status="active" size="sm" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Payment Engine
                </span>
                <StatusBadge status="active" size="sm" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Audit Service
                </span>
                <StatusBadge status="active" size="sm" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Reconciliation
                </span>
                <StatusBadge status="processing" size="sm" />
              </div>
            </CardContent>
          </Card>

          {/* Top Recipients */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Recipients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topRecipients.map((recipient, index) => (
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
              ))}
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
                  47ms
                </span>
                <PercentageDisplay value={-12} size="sm" invertColor />
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
                  12.4K
                </span>
                <span className="text-sm text-neutral-500">/sec</span>
                <PercentageDisplay value={8.3} size="sm" />
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
                  0.03%
                </span>
                <PercentageDisplay value={-0.01} size="sm" invertColor />
              </div>
              <p className="text-sm text-neutral-500">Failed transactions today</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatsLoadingSkeleton() {
  return (
    <div className="stats-grid">
      {[...Array(4)].map((_, i) => (
        <SkeletonDashboardCard key={i} />
      ))}
    </div>
  );
}

// Mock data
const recentTransactions = [
  {
    transactionId: 'TXN-001',
    type: 'credit' as const,
    status: 'completed' as const,
    amount: 25000,
    description: 'Wire Transfer - Acme Corp',
    category: 'Business',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    counterparty: 'Acme Corporation',
  },
  {
    transactionId: 'TXN-002',
    type: 'debit' as const,
    status: 'completed' as const,
    amount: 1500,
    description: 'Vendor Payment - Office Supplies',
    category: 'Operations',
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    counterparty: 'Staples Inc',
  },
  {
    transactionId: 'TXN-003',
    type: 'credit' as const,
    status: 'processing' as const,
    amount: 75000,
    description: 'International Transfer',
    category: 'International',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    counterparty: 'Global Partners Ltd',
  },
  {
    transactionId: 'TXN-004',
    type: 'transfer' as const,
    status: 'completed' as const,
    amount: 5000,
    description: 'Internal Transfer',
    category: 'Internal',
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    counterparty: 'Operations Account',
  },
  {
    transactionId: 'TXN-005',
    type: 'debit' as const,
    status: 'pending' as const,
    amount: 12500,
    description: 'Payroll Processing',
    category: 'Payroll',
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    counterparty: 'Employee Payroll',
  },
];

const topRecipients = [
  { name: 'Acme Corporation', volume: 2450000, transactions: 156 },
  { name: 'Global Partners Ltd', volume: 1850000, transactions: 89 },
  { name: 'Tech Solutions Inc', volume: 980000, transactions: 234 },
  { name: 'Finance Corp', volume: 750000, transactions: 67 },
];

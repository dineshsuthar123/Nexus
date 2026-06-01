/**
 * Nexus RTP Platform - Account Detail Page
 *
 * Displays comprehensive account details including:
 * - Account summary and balance
 * - Transaction history
 * - Balance chart
 * - Account actions
 */

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  CurrencyDisplay,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@nexus/ui';
import {
  ArrowLeft,
  Building2,
  Wallet,
  Pencil,
  Download,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  Copy,
  CheckCheck,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Ban,
} from 'lucide-react';

import { useAccount, useAccountBalance, useUpdateAccountStatus } from '@/lib/hooks';
import type { AccountType, AccountStatus } from '@/lib/api/types';

// =============================================================================
// Configuration
// =============================================================================

const TYPE_CONFIG: Record<AccountType, { label: string; icon: React.ReactNode; color: string }> = {
  CHECKING: { label: 'Checking Account', icon: <Wallet className="h-5 w-5" />, color: 'bg-sky-500' },
  SAVINGS: { label: 'Savings Account', icon: <Building2 className="h-5 w-5" />, color: 'bg-emerald-500' },
  TREASURY: { label: 'Treasury Account', icon: <Building2 className="h-5 w-5" />, color: 'bg-indigo-500' },
  SETTLEMENT: { label: 'Settlement Account', icon: <Wallet className="h-5 w-5" />, color: 'bg-blue-500' },
  NOSTRO: { label: 'Nostro Account', icon: <TrendingUp className="h-5 w-5" />, color: 'bg-green-500' },
  VOSTRO: { label: 'Vostro Account', icon: <TrendingDown className="h-5 w-5" />, color: 'bg-amber-500' },
  INTERNAL: { label: 'Internal Account', icon: <Building2 className="h-5 w-5" />, color: 'bg-purple-500' },
  OPERATING: { label: 'Operating Account', icon: <Wallet className="h-5 w-5" />, color: 'bg-slate-500' },
};

const STATUS_CONFIG: Record<AccountStatus, { label: string; color: 'success' | 'default' | 'warning' | 'danger' }> = {
  ACTIVE: { label: 'Active', color: 'success' },
  INACTIVE: { label: 'Inactive', color: 'default' },
  FROZEN: { label: 'Frozen', color: 'warning' },
  SUSPENDED: { label: 'Suspended', color: 'warning' },
  CLOSED: { label: 'Closed', color: 'danger' },
};

// =============================================================================
// Copy Button
// =============================================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-muted rounded transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <CheckCheck className="h-4 w-4 text-success" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function AccountDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// Mock Recent Transactions
// =============================================================================

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description: string;
  counterparty: string;
  date: string;
}

const mockTransactions: Transaction[] = [
  {
    id: 'TXN001',
    type: 'credit',
    amount: 150000,
    currency: 'EUR',
    description: 'Incoming payment',
    counterparty: 'Acme Corp',
    date: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'TXN002',
    type: 'debit',
    amount: 75000,
    currency: 'EUR',
    description: 'Outgoing transfer',
    counterparty: 'Global Partners',
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'TXN003',
    type: 'credit',
    amount: 250000,
    currency: 'EUR',
    description: 'Settlement received',
    counterparty: 'Bank ABC',
    date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'TXN004',
    type: 'debit',
    amount: 45000,
    currency: 'EUR',
    description: 'Fee payment',
    counterparty: 'Service Provider',
    date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

// =============================================================================
// Main Component
// =============================================================================

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params.id as string;

  const { data: account, isLoading, error, refetch } = useAccount(accountId);
  const { data: balance } = useAccountBalance(accountId);
  const updateStatus = useUpdateAccountStatus();

  const [showSuspendDialog, setShowSuspendDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Accounts
        </Link>
        <AccountDetailSkeleton />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Accounts
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Account Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The account "{accountId}" could not be found.
            </p>
            <Button asChild>
              <Link href="/dashboard/accounts">View All Accounts</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const typeConfig = TYPE_CONFIG[account.type];
  const statusConfig = STATUS_CONFIG[account.status];

  const handleSuspend = async () => {
    try {
      await updateStatus.mutateAsync({
        id: accountId,
        status: account.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
      });
      setShowSuspendDialog(false);
      refetch();
    } catch (error) {
      console.error('Failed to update account status:', error);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Accounts
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${typeConfig.color} text-white`}>
              {typeConfig.icon}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{account.name}</h1>
                <Badge variant={statusConfig.color}>{statusConfig.label}</Badge>
              </div>
              {account.accountNumber && (
                <p className="text-muted-foreground flex items-center gap-2">
                  <span className="font-mono text-sm">{account.accountNumber}</span>
                  <CopyButton text={account.accountNumber} />
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Statement
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href={`/dashboard/accounts/${accountId}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            {account.status !== 'CLOSED' && (
              <Button
                variant={account.status === 'SUSPENDED' ? 'secondary' : 'danger'}
                size="sm"
                onClick={() => setShowSuspendDialog(true)}
              >
                {account.status === 'SUSPENDED' ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Activate
                  </>
                ) : (
                  <>
                    <Ban className="mr-2 h-4 w-4" />
                    Suspend
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Available Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyDisplay
              amount={balance?.availableBalance || account.availableBalance || 0}
              currency={account.currency}
              size="lg"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Updated {new Date(account.updatedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Pending Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyDisplay
              amount={balance?.pendingBalance || account.pendingBalance || 0}
              currency={account.currency}
              size="lg"
            />
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Processing transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">Reserved Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyDisplay
              amount={(balance as any)?.reserved || 0}
              currency={account.currency}
              size="lg"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Held for settlements
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              {account.accountNumber && (
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Account Number</dt>
                  <dd className="text-sm font-mono flex items-center gap-1">
                    {account.accountNumber}
                    <CopyButton text={account.accountNumber} />
                  </dd>
                </div>
              )}
              {account.iban && (
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">IBAN</dt>
                  <dd className="text-sm font-mono flex items-center gap-1">
                    {account.iban}
                    <CopyButton text={account.iban} />
                  </dd>
                </div>
              )}
              {account.bic && (
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">BIC/SWIFT</dt>
                  <dd className="text-sm font-mono">{account.bic}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Type</dt>
                <dd className="text-sm">{typeConfig.label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Currency</dt>
                <dd className="text-sm font-mono">{account.currency}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Created</dt>
                <dd className="text-sm">
                  {new Date(account.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity Summary</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-success/10">
                <div className="flex items-center gap-2 text-success mb-1">
                  <ArrowDownLeft className="h-4 w-4" />
                  <span className="text-sm font-medium">Credits</span>
                </div>
                <p className="text-2xl font-bold">142</p>
                <p className="text-sm text-muted-foreground">+€2.4M received</p>
              </div>
              <div className="p-4 rounded-lg bg-destructive/10">
                <div className="flex items-center gap-2 text-destructive mb-1">
                  <ArrowUpRight className="h-4 w-4" />
                  <span className="text-sm font-medium">Debits</span>
                </div>
                <p className="text-2xl font-bold">98</p>
                <p className="text-sm text-muted-foreground">-€1.8M sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <CardDescription>Latest activity on this account</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/accounts/${accountId}/transactions`}>
              View All
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {mockTransactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className={`
                    flex h-10 w-10 items-center justify-center rounded-full
                    ${txn.type === 'credit' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}
                  `}>
                    {txn.type === 'credit' ? (
                      <ArrowDownLeft className="h-5 w-5" />
                    ) : (
                      <ArrowUpRight className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{txn.description}</p>
                    <p className="text-sm text-muted-foreground">{txn.counterparty}</p>
                  </div>
                </div>
                <div className="text-right">
                  <CurrencyDisplay
                    amount={txn.type === 'credit' ? txn.amount : -txn.amount}
                    currency={txn.currency}
                    size="sm"
                    showSign
                    colorBySign
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(txn.date).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Suspend Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {account.status === 'SUSPENDED' ? 'Activate Account' : 'Suspend Account'}
            </DialogTitle>
            <DialogDescription>
              {account.status === 'SUSPENDED'
                ? 'This will restore the account to active status and allow transactions.'
                : 'This will temporarily disable all transactions on this account.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 rounded-lg border">
              <p className="font-medium">{account.name}</p>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                {account.accountNumber}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)}>
              Cancel
            </Button>
            <Button
              variant={account.status === 'SUSPENDED' ? 'secondary' : 'danger'}
              onClick={handleSuspend}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : account.status === 'SUSPENDED' ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Activate Account
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Suspend Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

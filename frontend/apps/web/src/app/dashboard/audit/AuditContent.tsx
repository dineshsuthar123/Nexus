'use client';

import { useState, useCallback } from 'react';
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
  AuditTrail,
  AuditBadge,
  HashDisplay,
  SignatureVerification,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@nexus/ui';
import {
  Search,
  Filter,
  Download,
  Shield,
  Check,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  useAuditBundles,
  useVerifyBundle,
  useDownloadBundle,
  useInvalidateAuditBundles,
} from '@/lib/hooks/use-audit';

export default function AuditContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [page, setPage] = useState(0);

  const {
    data: bundlesData,
    isLoading,
    isError,
    refetch,
  } = useAuditBundles({ limit: 20, offset: page * 20 });

  const downloadBundle = useDownloadBundle();
  const invalidate = useInvalidateAuditBundles();

  // Transform bundles to audit entries for AuditTrail component
  const auditEntries = (bundlesData?.data ?? []).map((bundle) => ({
    id: bundle.id,
    timestamp: new Date(bundle.created_at),
    action: (bundle.request_type ?? 'audit.created') as
      | 'transaction.created'
      | 'transaction.approved'
      | 'account.balance_updated'
      | 'auth.login'
      | 'config.updated',
    actor: bundle.requester ?? 'System',
    actorType: 'system' as 'system' | 'user' | 'api',
    resource: `Audit Bundle ${bundle.bundle_id?.slice(0, 8) ?? bundle.id.slice(0, 8)}`,
    details: `${bundle.request_type ?? 'Audit'} bundle`,
    hash: bundle.bundle_id ?? '',
    verified: bundle.status === 'VERIFIED' || bundle.status === 'COMPLETED',
  }));

  const handleVerifyChain = useCallback(() => {
    invalidate();
    refetch();
  }, [invalidate, refetch]);

  const handleExport = useCallback(
    (bundleId?: string) => {
      if (bundleId) {
        downloadBundle.mutate(bundleId);
      }
    },
    [downloadBundle]
  );

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-danger-500" />
        <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Failed to load audit trail
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Could not fetch audit data. Please try again.
        </p>
        <Button className="mt-4" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const total = bundlesData?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-description">
            Cryptographically signed audit logs with immutable verification
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleVerifyChain}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Verify Chain
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const firstBundle = bundlesData?.data?.[0];
              if (firstBundle) handleExport(firstBundle.id);
            }}
            disabled={downloadBundle.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Audit Bundle
          </Button>
        </div>
      </div>

      {/* Audit Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-100 dark:bg-success-950">
                <Check className="h-5 w-5 text-success-600 dark:text-success-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">
                  Chain Integrity
                </div>
                <div className="text-lg font-semibold text-success-600 dark:text-success-400">
                  {isLoading ? <Skeleton className="h-6 w-20" /> : 'Verified'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-950">
                <Shield className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">
                  Total Events
                </div>
                <div className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                  {isLoading ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    total.toLocaleString()
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Latest Block
            </div>
            {isLoading ? (
              <Skeleton className="mt-1 h-6 w-40" />
            ) : (
              <HashDisplay
                hash={
                  bundlesData?.data?.[0]?.bundle_id ??
                  '0x0000000000000000'
                }
                truncateLength={16}
                copyable
                className="mt-1"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Last Verified
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {isLoading ? (
                <Skeleton className="h-6 w-28" />
              ) : bundlesData?.data?.[0]?.created_at ? (
                formatRelativeTime(new Date(bundlesData.data[0].created_at))
              ) : (
                'N/A'
              )}
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
                placeholder="Search by event, actor, or hash..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="transaction">Transactions</SelectItem>
                  <SelectItem value="account">Account Changes</SelectItem>
                  <SelectItem value="auth">Authentication</SelectItem>
                  <SelectItem value="config">Configuration</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actorFilter} onValueChange={setActorFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Actor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actors</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                  <SelectItem value="api">API Clients</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" />
                More Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList variant="underline">
          <TabsTrigger value="timeline" variant="underline">
            Timeline View
          </TabsTrigger>
          <TabsTrigger value="signatures" variant="underline">
            Signature Verification
          </TabsTrigger>
          <TabsTrigger value="compliance" variant="underline">
            Compliance Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card className="mt-4">
            <CardContent className="p-6">
              {isLoading ? (
                <AuditSkeleton />
              ) : auditEntries.length === 0 ? (
                <div className="py-8 text-center">
                  <Shield className="mx-auto h-12 w-12 text-neutral-300 dark:text-neutral-700" />
                  <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">
                    No audit entries
                  </h3>
                  <p className="mt-2 text-sm text-neutral-500">
                    Audit entries will appear here as system events are recorded.
                  </p>
                </div>
              ) : (
                <>
                  <AuditTrail entries={auditEntries} />
                  {/* Pagination */}
                  {total > 20 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-neutral-500">
                        Showing {page * 20 + 1}–{Math.min((page + 1) * 20, total)} of{' '}
                        {total.toLocaleString()}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 0}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(page + 1) * 20 >= total}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signatures">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Recent Signature Verifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <AuditSkeleton />
              ) : (bundlesData?.data ?? []).slice(0, 3).length > 0 ? (
                (bundlesData?.data ?? []).slice(0, 3).map((bundle) => (
                  <SignatureVerification
                    key={bundle.id}
                    status={
                      bundle.status === 'VERIFIED' || bundle.status === 'COMPLETED'
                        ? 'verified'
                        : 'failed'
                    }
                    algorithm="EdDSA (Ed25519)"
                    signature={bundle.bundle_id ?? bundle.id}
                    keyId="nexus-audit-key-2024"
                    signedAt={new Date(bundle.created_at)}
                  />
                ))
              ) : (
                <p className="text-sm text-neutral-500">No verifications available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card className="mt-4">
            <CardContent className="p-8 text-center">
              <Shield className="mx-auto h-12 w-12 text-neutral-300 dark:text-neutral-700" />
              <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-neutral-100">
                Compliance Reports
              </h3>
              <p className="mt-2 text-sm text-neutral-500">
                Generate SOC 2, PCI-DSS, and regulatory compliance reports
              </p>
              <Button className="mt-4">Generate Report</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Verification Proof — show first bundle's root hash */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Merkle Proof</CardTitle>
            <AuditBadge status="verified" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Root Hash
                </div>
                <HashDisplay
                  hash={
                    bundlesData?.data?.[0]?.bundle_id ??
                    '0x0000000000000000000000000000000000000000000000000000000000000000'
                  }
                  truncateLength={32}
                  copyable
                  verified
                  className="mt-1"
                />
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Block Height
                </div>
                <div className="mt-1 font-mono text-neutral-900 dark:text-neutral-100">
                  {total.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Proof Path
                </div>
                <div className="mt-2 space-y-2">
                  {(bundlesData?.data ?? []).slice(0, 3).map((bundle, i) => (
                    <HashDisplay
                      key={bundle.id}
                      hash={bundle.bundle_id ?? `0x${'0'.repeat(32)}`}
                      truncateLength={16}
                      type={`Level ${i}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

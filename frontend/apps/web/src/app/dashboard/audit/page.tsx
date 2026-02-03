import { Suspense } from 'react';
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
import { Search, Filter, Download, Shield, Check, RefreshCw } from 'lucide-react';

export const metadata = {
  title: 'Audit Trail',
};

export default function AuditPage() {
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
          <Button variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Verify Chain
          </Button>
          <Button variant="outline">
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
                  Verified
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
                  1,284,392
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
            <HashDisplay
              hash="0x7b8a9c4d2e1f..."
              length={16}
              copyable
              className="mt-1"
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Last Verified
            </div>
            <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              2 minutes ago
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
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select defaultValue="all">
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
              <Select defaultValue="all">
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
              <Suspense fallback={<AuditSkeleton />}>
                <AuditTrail entries={auditEntries} />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signatures">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Recent Signature Verifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SignatureVerification
                status="valid"
                algorithm="EdDSA (Ed25519)"
                keyId="nexus-audit-key-2024"
                timestamp={new Date(Date.now() - 1000 * 60 * 2)}
              />
              <SignatureVerification
                status="valid"
                algorithm="EdDSA (Ed25519)"
                keyId="nexus-audit-key-2024"
                timestamp={new Date(Date.now() - 1000 * 60 * 15)}
              />
              <SignatureVerification
                status="valid"
                algorithm="EdDSA (Ed25519)"
                keyId="nexus-audit-key-2024"
                timestamp={new Date(Date.now() - 1000 * 60 * 30)}
              />
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
              <Button className="mt-4">
                Generate Report
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Verification Proof */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Merkle Proof</CardTitle>
            <AuditBadge status="verified" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Root Hash
              </div>
              <HashDisplay
                hash="0x7b8a9c4d2e1f5a3b8c9d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b"
                length={32}
                copyable
                showVerified
                className="mt-1"
              />
            </div>
            <div>
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Block Height
              </div>
              <div className="mt-1 font-mono text-neutral-900 dark:text-neutral-100">
                1,284,392
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Proof Path
              </div>
              <div className="mt-2 space-y-2">
                <HashDisplay
                  hash="0x1234567890abcdef..."
                  length={16}
                  label="Level 0"
                />
                <HashDisplay
                  hash="0xfedcba0987654321..."
                  length={16}
                  label="Level 1"
                />
                <HashDisplay
                  hash="0xabcdef1234567890..."
                  length={16}
                  label="Level 2"
                />
              </div>
            </div>
          </div>
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

// Mock audit data
const auditEntries = [
  {
    id: 'audit-001',
    timestamp: new Date(Date.now() - 1000 * 60 * 2),
    action: 'transaction.created' as const,
    actor: 'System',
    actorType: 'system' as const,
    resource: 'Transaction TXN-001',
    details: 'Created wire transfer for $25,000.00 to Acme Corporation',
    hash: '0x7b8a9c4d2e1f5a3b8c9d0e2f4a6b8c0d',
    verified: true,
  },
  {
    id: 'audit-002',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    action: 'transaction.approved' as const,
    actor: 'John Doe',
    actorType: 'user' as const,
    resource: 'Transaction TXN-001',
    details: 'Approved transaction with dual authorization',
    hash: '0x2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b',
    verified: true,
  },
  {
    id: 'audit-003',
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
    action: 'account.balance_updated' as const,
    actor: 'System',
    actorType: 'system' as const,
    resource: 'Account ACC-001',
    details: 'Balance updated: $1,250,000.00 → $1,275,000.00',
    hash: '0x4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d',
    verified: true,
  },
  {
    id: 'audit-004',
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    action: 'auth.login' as const,
    actor: 'John Doe',
    actorType: 'user' as const,
    resource: 'Session SES-001',
    details: 'Successful authentication via SSO',
    hash: '0x6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d',
    verified: true,
  },
  {
    id: 'audit-005',
    timestamp: new Date(Date.now() - 1000 * 60 * 20),
    action: 'config.updated' as const,
    actor: 'Admin',
    actorType: 'user' as const,
    resource: 'Settings',
    details: 'Updated rate limiting configuration',
    hash: '0x8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e',
    verified: true,
  },
];

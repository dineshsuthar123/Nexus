/**
 * Nexus RTP Platform - Reconciliation Cycle Detail Page
 *
 * Displays comprehensive cycle details including:
 * - Cycle summary and status
 * - Matched/unmatched transactions
 * - Discrepancies list with resolution actions
 * - Progress timeline
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
  Input,
  DataTable,
} from '@nexus/ui';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Loader2,
  Download,
  RefreshCw,
  Eye,
  FileText,
  Link2,
  Calendar,
  BarChart3,
  CheckCheck,
  X,
  ArrowRight,
} from 'lucide-react';

import {
  useReconciliationCycle,
  useDiscrepancies,
  useResolveDiscrepancy,
  useReconciliationCyclePolling,
} from '@/lib/hooks';
import type { ReconciliationStatus, Discrepancy, DiscrepancyResolution } from '@/lib/api/types';

// =============================================================================
// Configuration
// =============================================================================

const STATUS_CONFIG: Record<ReconciliationStatus, {
  label: string;
  color: 'success' | 'warning' | 'danger' | 'default' | 'secondary';
  icon: React.ReactNode;
  description: string;
}> = {
  PENDING: {
    label: 'Pending',
    color: 'default',
    icon: <Clock className="h-4 w-4" />,
    description: 'Waiting to start',
  },
  RUNNING: {
    label: 'Running',
    color: 'warning',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    description: 'Reconciliation in progress',
  },
  COMPLETED: {
    label: 'Completed',
    color: 'success',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'All accounts reconciled',
  },
  FAILED: {
    label: 'Failed',
    color: 'danger',
    icon: <XCircle className="h-4 w-4" />,
    description: 'Reconciliation failed',
  },
  PARTIAL: {
    label: 'Partial',
    color: 'secondary',
    icon: <AlertTriangle className="h-4 w-4" />,
    description: 'Partially completed with issues',
  },
};

const RESOLUTION_OPTIONS: Array<{
  value: DiscrepancyResolution;
  label: string;
  description: string;
}> = [
  {
    value: 'ACCEPTED',
    label: 'Accept',
    description: 'Accept the discrepancy as valid',
  },
  {
    value: 'REJECTED',
    label: 'Reject',
    description: 'Reject and flag for investigation',
  },
  {
    value: 'ADJUSTED',
    label: 'Adjust',
    description: 'Make manual adjustment',
  },
  {
    value: 'PENDING_REVIEW',
    label: 'Review Later',
    description: 'Mark for later review',
  },
];

// =============================================================================
// Components
// =============================================================================

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// =============================================================================
// Discrepancy Resolution Dialog
// =============================================================================

function ResolveDiscrepancyDialog({
  discrepancy,
  open,
  onOpenChange,
  onResolve,
  isResolving,
}: {
  discrepancy: Discrepancy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (resolution: DiscrepancyResolution, notes: string) => void;
  isResolving: boolean;
}) {
  const [selectedResolution, setSelectedResolution] = useState<DiscrepancyResolution>('PENDING_REVIEW');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    onResolve(selectedResolution, notes);
  };

  if (!discrepancy) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve Discrepancy</DialogTitle>
          <DialogDescription>
            Choose how to handle this discrepancy
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Discrepancy Info */}
          <div className="p-4 rounded-lg bg-muted/50">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Type</span>
              <span className="text-sm font-medium">{discrepancy.type}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Account</span>
              <span className="text-sm font-mono">{discrepancy.accountId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Difference</span>
              <CurrencyDisplay
                amount={discrepancy.difference || 0}
                currency={discrepancy.currency || 'EUR'}
                size="sm"
                showSign
              />
            </div>
          </div>

          {/* Resolution Options */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Resolution</label>
            <div className="grid grid-cols-2 gap-2">
              {RESOLUTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedResolution(option.value)}
                  className={`
                    p-3 rounded-lg border text-left transition-all
                    ${selectedResolution === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <span className="font-medium text-sm">{option.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              placeholder="Add any notes about this resolution..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isResolving}>
            {isResolving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resolving...
              </>
            ) : (
              <>
                <CheckCheck className="mr-2 h-4 w-4" />
                Resolve
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function ReconciliationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const cycleId = params.id as string;

  const { data: cycle, isLoading, error, refetch } = useReconciliationCycle(cycleId);
  const { data: discrepanciesData } = useDiscrepancies(cycleId);
  const resolveDiscrepancy = useResolveDiscrepancy();

  // Poll for updates if cycle is running
  useReconciliationCyclePolling(cycleId, {
    enabled: cycle?.status === 'RUNNING',
  });

  // Extract discrepancies from paginated response
  const discrepancies = discrepanciesData?.data || [];

  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<Discrepancy | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);

  const handleResolve = async (resolution: DiscrepancyResolution, notes: string) => {
    if (!selectedDiscrepancy) return;

    // Map our resolution type to the hook's expected type
    const resolutionMap: Record<DiscrepancyResolution, 'ACCEPT_SOURCE' | 'ACCEPT_TARGET' | 'MANUAL' | 'IGNORE'> = {
      ACCEPTED: 'ACCEPT_SOURCE',
      REJECTED: 'IGNORE',
      ADJUSTED: 'MANUAL',
      PENDING_REVIEW: 'IGNORE',
    };

    try {
      await resolveDiscrepancy.mutateAsync({
        id: selectedDiscrepancy.id,
        resolution: resolutionMap[resolution],
        notes,
      });
      setShowResolveDialog(false);
      setSelectedDiscrepancy(null);
      refetch();
    } catch (error) {
      console.error('Failed to resolve discrepancy:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <Link
          href="/dashboard/reconciliation"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reconciliation
        </Link>
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !cycle) {
    return (
      <div className="max-w-6xl mx-auto">
        <Link
          href="/dashboard/reconciliation"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reconciliation
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Cycle Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The reconciliation cycle could not be found.
            </p>
            <Button asChild>
              <Link href="/dashboard/reconciliation">View All Cycles</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[cycle.status];
  const unresolvedCount = discrepancies?.filter(d => d.resolution === 'PENDING_REVIEW' || !d.resolution).length || 0;

  // Discrepancy table columns
  const discrepancyColumns = [
    {
      id: 'type',
      header: 'Type',
      cell: (d: Discrepancy) => (
        <Badge variant="secondary">{d.type}</Badge>
      ),
    },
    {
      id: 'accountId',
      header: 'Account',
      cell: (d: Discrepancy) => (
        <span className="font-mono text-sm">{d.accountId}</span>
      ),
    },
    {
      id: 'difference',
      header: 'Difference',
      cell: (d: Discrepancy) => (
        <CurrencyDisplay
          amount={d.difference || 0}
          currency={d.currency || 'EUR'}
          size="sm"
          showSign
        />
      ),
    },
    {
      id: 'resolution',
      header: 'Status',
      cell: (d: Discrepancy) => (
        d.resolution ? (
          <Badge variant={d.resolution === 'ACCEPTED' ? 'success' : 'secondary'}>
            {d.resolution}
          </Badge>
        ) : (
          <Badge variant="warning">Pending</Badge>
        )
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (d: Discrepancy) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDiscrepancy(d);
            setShowResolveDialog(true);
          }}
          disabled={d.resolution === 'ACCEPTED' || d.resolution === 'REJECTED'}
        >
          Resolve
        </Button>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/reconciliation"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reconciliation
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">Reconciliation Cycle</h1>
              <Badge variant={statusConfig.color} className="flex items-center gap-1">
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(cycle.startTime).toLocaleString()}
              {cycle.endTime && (
                <>
                  <ArrowRight className="h-4 w-4" />
                  {new Date(cycle.endTime).toLocaleString()}
                </>
              )}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Progress (if running) */}
      {cycle.status === 'RUNNING' && cycle.progress != null && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{cycle.progress}%</span>
            </div>
            <ProgressBar value={cycle.progress} />
            <p className="text-xs text-muted-foreground mt-2">{statusConfig.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Match Rate</p>
            <p className="text-3xl font-bold">
              {cycle.matchRate != null ? `${(cycle.matchRate * 100).toFixed(1)}%` : '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Matched</p>
            <p className="text-3xl font-bold text-success">{cycle.matchedCount || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Unmatched</p>
            <p className="text-3xl font-bold text-warning">{cycle.unmatchedCount || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Discrepancies</p>
            <p className="text-3xl font-bold text-destructive">{cycle.discrepancyCount || 0}</p>
            {unresolvedCount > 0 && (
              <p className="text-xs text-muted-foreground">{unresolvedCount} unresolved</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Discrepancies Table */}
      {discrepancies && discrepancies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discrepancies</CardTitle>
            <CardDescription>
              {unresolvedCount > 0
                ? `${unresolvedCount} discrepancies need resolution`
                : 'All discrepancies have been resolved'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              data={discrepancies}
              columns={discrepancyColumns}
            />
          </CardContent>
        </Card>
      )}

      {/* No Discrepancies */}
      {(!discrepancies || discrepancies.length === 0) && cycle.status === 'COMPLETED' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CheckCircle2 className="h-12 w-12 text-success mb-4" />
            <h3 className="text-lg font-semibold mb-2">Perfect Match</h3>
            <p className="text-muted-foreground">
              All accounts reconciled with no discrepancies
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resolution Dialog */}
      <ResolveDiscrepancyDialog
        discrepancy={selectedDiscrepancy}
        open={showResolveDialog}
        onOpenChange={setShowResolveDialog}
        onResolve={handleResolve}
        isResolving={resolveDiscrepancy.isPending}
      />
    </div>
  );
}

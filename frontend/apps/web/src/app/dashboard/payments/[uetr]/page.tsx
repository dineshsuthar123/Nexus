/**
 * Nexus RTP Platform - Payment Detail Page
 * 
 * Displays comprehensive payment details including:
 * - Payment summary and status
 * - Debtor/Creditor information
 * - Status timeline
 * - Available actions (settle, return, cancel)
 * - Audit trail
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
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
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RotateCcw,
  Ban,
  FileText,
  Download,
  Send,
  Building2,
  User,
  Calendar,
  Hash,
  Zap,
  Shield,
  Loader2,
  Copy,
  CheckCheck,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

import { 
  usePayment, 
  useSettlePayment, 
  useReturnPayment, 
  useCancelPayment 
} from '@/lib/hooks';
import { PaymentStatus, PaymentType } from '@/lib/api/types';

// =============================================================================
// Status Configuration
// =============================================================================

const STATUS_CONFIG: Record<PaymentStatus, {
  label: string;
  color: 'warning' | 'success' | 'destructive' | 'default' | 'secondary';
  icon: React.ReactNode;
  description: string;
}> = {
  PENDING: { 
    label: 'Pending', 
    color: 'warning',
    icon: <Clock className="h-4 w-4" />,
    description: 'Payment is awaiting processing',
  },
  PROCESSING: { 
    label: 'Processing', 
    color: 'secondary',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    description: 'Payment is being processed',
  },
  SETTLED: { 
    label: 'Settled', 
    color: 'success',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'Payment completed successfully',
  },
  FAILED: { 
    label: 'Failed', 
    color: 'destructive',
    icon: <XCircle className="h-4 w-4" />,
    description: 'Payment failed to process',
  },
  RETURNED: { 
    label: 'Returned', 
    color: 'secondary',
    icon: <RotateCcw className="h-4 w-4" />,
    description: 'Payment was returned',
  },
  CANCELLED: { 
    label: 'Cancelled', 
    color: 'default',
    icon: <Ban className="h-4 w-4" />,
    description: 'Payment was cancelled',
  },
};

const TYPE_CONFIG: Record<PaymentType, {
  label: string;
  icon: React.ReactNode;
}> = {
  INSTANT: { label: 'Instant Payment', icon: <Zap className="h-4 w-4" /> },
  STANDARD: { label: 'Standard Payment', icon: <Clock className="h-4 w-4" /> },
  SCHEDULED: { label: 'Scheduled Payment', icon: <Calendar className="h-4 w-4" /> },
};

// =============================================================================
// Status Timeline
// =============================================================================

interface TimelineEvent {
  status: string;
  timestamp: string;
  description: string;
}

function StatusTimeline({ payment }: { payment: any }) {
  // Generate timeline from payment data
  const events: TimelineEvent[] = [
    {
      status: 'created',
      timestamp: payment.createdAt,
      description: 'Payment initiated',
    },
  ];

  // Add status changes based on current status
  if (['PROCESSING', 'SETTLED', 'FAILED', 'RETURNED', 'CANCELLED'].includes(payment.status)) {
    events.push({
      status: 'processing',
      timestamp: payment.updatedAt || payment.createdAt,
      description: 'Payment processing started',
    });
  }

  if (payment.status === 'SETTLED') {
    events.push({
      status: 'settled',
      timestamp: payment.settledAt || payment.updatedAt,
      description: 'Payment settled successfully',
    });
  }

  if (payment.status === 'RETURNED') {
    events.push({
      status: 'returned',
      timestamp: payment.returnedAt || payment.updatedAt,
      description: `Payment returned: ${payment.returnReason || 'No reason provided'}`,
    });
  }

  if (payment.status === 'CANCELLED') {
    events.push({
      status: 'cancelled',
      timestamp: payment.cancelledAt || payment.updatedAt,
      description: 'Payment cancelled',
    });
  }

  if (payment.status === 'FAILED') {
    events.push({
      status: 'failed',
      timestamp: payment.updatedAt,
      description: payment.failureReason || 'Payment failed',
    });
  }

  return (
    <div className="space-y-4">
      {events.map((event, index) => (
        <div key={index} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`
              flex h-8 w-8 items-center justify-center rounded-full border-2
              ${event.status === 'settled' ? 'bg-success text-success-foreground border-success' : 
                event.status === 'failed' ? 'bg-destructive text-destructive-foreground border-destructive' :
                'border-primary bg-primary/10'}
            `}>
              {event.status === 'created' && <Send className="h-4 w-4" />}
              {event.status === 'processing' && <Clock className="h-4 w-4" />}
              {event.status === 'settled' && <CheckCircle2 className="h-4 w-4" />}
              {event.status === 'returned' && <RotateCcw className="h-4 w-4" />}
              {event.status === 'cancelled' && <Ban className="h-4 w-4" />}
              {event.status === 'failed' && <XCircle className="h-4 w-4" />}
            </div>
            {index < events.length - 1 && (
              <div className="w-0.5 flex-1 bg-border my-1" />
            )}
          </div>
          <div className="pb-4">
            <p className="font-medium text-sm">{event.description}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(event.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

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

function PaymentDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
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
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function PaymentDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const uetr = params.uetr as string;
  const justCreated = searchParams.get('created') === 'true';

  const { data: payment, isLoading, error, refetch } = usePayment(uetr);
  const settlePayment = useSettlePayment();
  const returnPayment = useReturnPayment();
  const cancelPayment = useCancelPayment();

  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  // Show success toast if just created
  useEffect(() => {
    if (justCreated) {
      // Could integrate with toast notification system
      console.log('Payment created successfully');
    }
  }, [justCreated]);

  // Action handlers
  const handleSettle = async () => {
    try {
      await settlePayment.mutateAsync(uetr);
      setShowSettleDialog(false);
      refetch();
    } catch (error) {
      console.error('Failed to settle payment:', error);
    }
  };

  const handleReturn = async () => {
    try {
      await returnPayment.mutateAsync({ uetr, reason: returnReason });
      setShowReturnDialog(false);
      setReturnReason('');
      refetch();
    } catch (error) {
      console.error('Failed to return payment:', error);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPayment.mutateAsync({ uetr, reason: 'Cancelled by user' });
      setShowCancelDialog(false);
      refetch();
    } catch (error) {
      console.error('Failed to cancel payment:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard/payments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Payments
        </Link>
        <PaymentDetailSkeleton />
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard/payments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Payments
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Payment Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The payment with UETR "{uetr}" could not be found.
            </p>
            <Button asChild>
              <Link href="/dashboard/payments">View All Payments</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[payment.status];
  const typeConfig = TYPE_CONFIG[payment.type];
  const canSettle = payment.status === 'PENDING' || payment.status === 'PROCESSING';
  const canReturn = payment.status === 'SETTLED';
  const canCancel = payment.status === 'PENDING';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/payments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Payments
        </Link>

        {justCreated && (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 text-success p-3 mb-4">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Payment created successfully</span>
          </div>
        )}

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">Payment Details</h1>
              <Badge variant={statusConfig.color} className="flex items-center gap-1">
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2">
              <Hash className="h-4 w-4" />
              <span className="font-mono text-sm">{payment.uetr}</span>
              <CopyButton text={payment.uetr} />
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            {canSettle && (
              <Button size="sm" onClick={() => setShowSettleDialog(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Settle
              </Button>
            )}
            {canReturn && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowReturnDialog(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Return
              </Button>
            )}
            {canCancel && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowCancelDialog(true)}
              >
                <Ban className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Amount Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyDisplay
              amount={payment.amount.value}
              currency={payment.amount.currency}
              size="lg"
            />
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              {typeConfig.icon}
              <span>{typeConfig.label}</span>
            </div>
          </CardContent>
        </Card>

        {/* Sender Card */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Sender</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">{payment.debtorName}</p>
            <p className="text-sm text-muted-foreground font-mono">
              {payment.debtorAccount}
            </p>
            <p className="text-xs text-muted-foreground">
              BIC: {payment.debtorBic}
            </p>
          </CardContent>
        </Card>

        {/* Recipient Card */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Recipient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">{payment.creditorName}</p>
            <p className="text-sm text-muted-foreground font-mono">
              {payment.creditorAccount}
            </p>
            <p className="text-xs text-muted-foreground">
              BIC: {payment.creditorBic}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Details & Timeline Row */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        {/* Payment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">UETR</dt>
                <dd className="text-sm font-mono flex items-center gap-1">
                  {payment.uetr.slice(0, 8)}...
                  <CopyButton text={payment.uetr} />
                </dd>
              </div>
              {payment.endToEndId && (
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">End-to-End ID</dt>
                  <dd className="text-sm font-mono">{payment.endToEndId}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Created</dt>
                <dd className="text-sm">
                  {new Date(payment.createdAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Last Updated</dt>
                <dd className="text-sm">
                  {new Date(payment.updatedAt).toLocaleString()}
                </dd>
              </div>
              {payment.remittanceInfo && (
                <div className="flex justify-between">
                  <dt className="text-sm text-muted-foreground">Reference</dt>
                  <dd className="text-sm">{payment.remittanceInfo}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Status Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline payment={payment} />
          </CardContent>
        </Card>
      </div>

      {/* Failure/Return Reason */}
      {(payment.status === 'FAILED' && payment.failureReason) && (
        <Card className="mt-6 border-destructive">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              Failure Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{payment.failureReason}</p>
          </CardContent>
        </Card>
      )}

      {(payment.status === 'RETURNED' && payment.returnReason) && (
        <Card className="mt-6 border-warning">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Return Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{payment.returnReason}</p>
          </CardContent>
        </Card>
      )}

      {/* Settle Dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to settle this payment? This action will mark the payment as completed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-center gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <CurrencyDisplay
                  amount={payment.amount.value}
                  currency={payment.amount.currency}
                  size="lg"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSettle}
              disabled={settlePayment.isPending}
            >
              {settlePayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Settle
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Payment</DialogTitle>
            <DialogDescription>
              Please provide a reason for returning this payment.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Return Reason *</label>
            <textarea
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px]"
              placeholder="Enter the reason for returning this payment..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleReturn}
              disabled={returnPayment.isPending || !returnReason.trim()}
            >
              {returnPayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Confirm Return
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this payment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">
                This payment will be permanently cancelled and cannot be recovered.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Payment
            </Button>
            <Button 
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelPayment.isPending}
            >
              {cancelPayment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Cancel Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

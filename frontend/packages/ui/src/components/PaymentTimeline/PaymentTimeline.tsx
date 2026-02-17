'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export type PaymentTimelineStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'SETTLED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RETURNED';

export interface PaymentTimelineEntry {
  status: PaymentTimelineStatus;
  timestamp: string;
  actor?: string;
  reason?: string;
  details?: string;
}

export interface PaymentTimelineProps {
  entries: PaymentTimelineEntry[];
  currentStatus: PaymentTimelineStatus;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}

// =============================================================================
// Status Config
// =============================================================================

const STATUS_CONFIG: Record<
  PaymentTimelineStatus,
  { icon: React.ElementType; color: string; label: string; bgColor: string }
> = {
  PENDING: { icon: Clock, color: 'text-yellow-500', label: 'Pending', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  PROCESSING: { icon: Loader2, color: 'text-blue-500', label: 'Processing', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  COMPLETED: { icon: CheckCircle2, color: 'text-green-500', label: 'Completed', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  SETTLED: { icon: CheckCircle2, color: 'text-emerald-600', label: 'Settled', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  FAILED: { icon: XCircle, color: 'text-red-500', label: 'Failed', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  REJECTED: { icon: XCircle, color: 'text-red-600', label: 'Rejected', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  CANCELLED: { icon: AlertTriangle, color: 'text-gray-500', label: 'Cancelled', bgColor: 'bg-gray-100 dark:bg-gray-900/30' },
  RETURNED: { icon: RotateCcw, color: 'text-orange-500', label: 'Returned', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
};

// =============================================================================
// Component
// =============================================================================

export const PaymentTimeline = React.forwardRef<HTMLDivElement, PaymentTimelineProps>(
  ({ entries, currentStatus, className, orientation = 'vertical' }, ref) => {
    const isVertical = orientation === 'vertical';

    return (
      <div
        ref={ref}
        className={cn(
          'payment-timeline',
          isVertical ? 'flex flex-col' : 'flex flex-row items-start overflow-x-auto',
          className
        )}
        role="list"
        aria-label="Payment status timeline"
      >
        {entries.map((entry, index) => {
          const config = STATUS_CONFIG[entry.status];
          const Icon = config.icon;
          const isLast = index === entries.length - 1;
          const isCurrent = entry.status === currentStatus && isLast;

          return (
            <div
              key={`${entry.status}-${index}`}
              className={cn(
                'relative flex',
                isVertical ? 'pb-8 last:pb-0' : 'flex-col items-center pr-8 last:pr-0 min-w-[140px]'
              )}
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute',
                    isVertical
                      ? 'left-[18px] top-[36px] bottom-0 w-0.5 bg-border'
                      : 'top-[18px] left-[36px] right-0 h-0.5 bg-border'
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Icon */}
              <div
                className={cn(
                  'relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2',
                  isCurrent ? 'border-primary ring-2 ring-primary/20' : 'border-border',
                  config.bgColor
                )}
              >
                <Icon
                  className={cn('h-4 w-4', config.color, entry.status === 'PROCESSING' && 'animate-spin')}
                />
              </div>

              {/* Content */}
              <div className={cn('ml-4', !isVertical && 'ml-0 mt-2 text-center')}>
                <p className={cn('text-sm font-medium', isCurrent && 'text-primary')}>
                  {config.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                {entry.actor && (
                  <p className="text-xs text-muted-foreground">by {entry.actor}</p>
                )}
                {entry.reason && (
                  <p className="text-xs text-destructive mt-1">{entry.reason}</p>
                )}
                {entry.details && (
                  <p className="text-xs text-muted-foreground mt-1">{entry.details}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

PaymentTimeline.displayName = 'PaymentTimeline';

export default PaymentTimeline;

'use client';

import * as React from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { cn, formatCurrency, formatRelativeTime } from '../../lib/utils';
import { Badge, StatusBadge, type StatusType } from '../Badge';

/* -----------------------------------------------------------------------------
 * Transaction Status
 * -------------------------------------------------------------------------- */

export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'on_hold';

export type TransactionType =
  | 'credit'
  | 'debit'
  | 'transfer'
  | 'refund'
  | 'fee'
  | 'interest'
  | 'adjustment';

const transactionStatusMap: Record<TransactionStatus, { status: StatusType; label: string }> = {
  pending: { status: 'pending', label: 'Pending' },
  processing: { status: 'processing', label: 'Processing' },
  completed: { status: 'completed', label: 'Completed' },
  failed: { status: 'failed', label: 'Failed' },
  cancelled: { status: 'cancelled', label: 'Cancelled' },
  refunded: { status: 'active', label: 'Refunded' },
  on_hold: { status: 'pending', label: 'On Hold' },
};

const transactionTypeIcons: Record<TransactionType, React.ElementType> = {
  credit: ArrowDownLeft,
  debit: ArrowUpRight,
  transfer: RefreshCw,
  refund: ArrowDownLeft,
  fee: ArrowUpRight,
  interest: ArrowDownLeft,
  adjustment: RefreshCw,
};

/* -----------------------------------------------------------------------------
 * Transaction Row
 * -------------------------------------------------------------------------- */

export interface TransactionRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Unique transaction ID */
  transactionId: string;
  /** Transaction type */
  type: TransactionType;
  /** Transaction status */
  status: TransactionStatus;
  /** Amount (positive for credit, negative for debit) */
  amount: number;
  /** Currency code */
  currency?: string;
  /** Description/merchant name */
  description: string;
  /** Category */
  category?: string;
  /** Timestamp */
  timestamp: Date | string;
  /** Counterparty name */
  counterparty?: string;
  /** Reference number */
  reference?: string;
  /** On click handler */
  onSelect?: () => void;
  /** Actions menu */
  actions?: React.ReactNode;
  /** Compact mode */
  compact?: boolean;
}

const TransactionRow = React.forwardRef<HTMLDivElement, TransactionRowProps>(
  (
    {
      className,
      transactionId,
      type,
      status,
      amount,
      currency = 'USD',
      description,
      category,
      timestamp,
      counterparty,
      reference,
      onSelect,
      actions,
      compact = false,
      ...props
    },
    ref
  ) => {
    const TypeIcon = transactionTypeIcons[type] || RefreshCw;
    const isCredit = type === 'credit' || type === 'refund' || type === 'interest';
    // _displayAmount available for custom formatting
    void (isCredit ? Math.abs(amount) : -Math.abs(amount));
    // Normalize status to lowercase and map; fallback for unknown backend statuses
    const normalizedStatus = (status || '').toLowerCase() as TransactionStatus;
    const statusConfig = transactionStatusMap[normalizedStatus] ?? { status: 'pending' as StatusType, label: status || 'Unknown' };

    const formattedTime = typeof timestamp === 'string'
      ? timestamp
      : formatRelativeTime(timestamp);

    return (
      <div
        ref={ref}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          'flex items-center gap-4 border-b border-neutral-100 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900',
          onSelect && 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800',
          compact && 'py-2',
          className
        )}
        {...props}
      >
        {/* Icon */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isCredit
              ? 'bg-success-100 text-success-600 dark:bg-success-900 dark:text-success-400'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
          )}
        >
          <TypeIcon className="h-5 w-5" />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-900 truncate dark:text-neutral-100">
              {description}
            </p>
            {status !== 'completed' && (
              <StatusBadge status={statusConfig.status} size="sm" />
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            {counterparty && <span>{counterparty}</span>}
            {counterparty && category && <span>•</span>}
            {category && <span>{category}</span>}
            <span>•</span>
            <span>{formattedTime}</span>
          </div>
        </div>

        {/* Amount */}
        <div className="text-right">
          <p
            className={cn(
              'font-mono font-medium tabular-nums',
              isCredit
                ? 'text-success-600 dark:text-success-400'
                : 'text-neutral-900 dark:text-neutral-100'
            )}
          >
            {isCredit ? '+' : '−'}{formatCurrency(Math.abs(amount), currency)}
          </p>
          {reference && !compact && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {reference}
            </p>
          )}
        </div>

        {/* Actions */}
        {actions && (
          <div className="shrink-0">{actions}</div>
        )}
      </div>
    );
  }
);
TransactionRow.displayName = 'TransactionRow';

/* -----------------------------------------------------------------------------
 * Transaction List
 * -------------------------------------------------------------------------- */

export interface TransactionListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Transactions grouped by date */
  transactions: Array<{
    date: string;
    items: TransactionRowProps[];
  }>;
  /** Empty state content */
  emptyContent?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Compact mode */
  compact?: boolean;
}

const TransactionList = React.forwardRef<HTMLDivElement, TransactionListProps>(
  ({ className, transactions, emptyContent, loading, compact, ...props }, ref) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      );
    }

    if (transactions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {emptyContent || (
            <>
              <div className="mb-4 rounded-full bg-neutral-100 p-3 dark:bg-neutral-800">
                <Clock className="h-6 w-6 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No transactions to display
              </p>
            </>
          )}
        </div>
      );
    }

    return (
      <div ref={ref} className={cn('divide-y divide-neutral-200 dark:divide-neutral-700', className)} {...props}>
        {transactions.map((group) => (
          <div key={group.date}>
            <div className="sticky top-0 bg-neutral-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              {group.date}
            </div>
            <div>
              {group.items.map((transaction) => (
                <TransactionRow
                  key={transaction.transactionId}
                  compact={compact}
                  {...transaction}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
);
TransactionList.displayName = 'TransactionList';

/* -----------------------------------------------------------------------------
 * Transaction Summary Card
 * -------------------------------------------------------------------------- */

export interface TransactionSummaryProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Period label */
  period: string;
  /** Total income */
  income: number;
  /** Total expenses */
  expenses: number;
  /** Currency */
  currency?: string;
  /** Number of transactions */
  transactionCount?: number;
}

const TransactionSummary = React.forwardRef<HTMLDivElement, TransactionSummaryProps>(
  (
    {
      className,
      period,
      income,
      expenses,
      currency = 'USD',
      transactionCount,
      ...props
    },
    ref
  ) => {
    const netAmount = income - expenses;
    const isPositive = netAmount >= 0;

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900',
          className
        )}
        {...props}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {period}
          </h3>
          {transactionCount !== undefined && (
            <Badge variant="outline" size="sm">
              {transactionCount} transactions
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Income</p>
            <p className="font-mono text-lg font-semibold text-success-600 tabular-nums dark:text-success-400">
              +{formatCurrency(income, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Expenses</p>
            <p className="font-mono text-lg font-semibold text-neutral-900 tabular-nums dark:text-neutral-100">
              −{formatCurrency(expenses, currency)}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Net</p>
            <p
              className={cn(
                'font-mono text-lg font-semibold tabular-nums',
                isPositive
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-danger-600 dark:text-danger-400'
              )}
            >
              {isPositive ? '+' : '−'}{formatCurrency(Math.abs(netAmount), currency)}
            </p>
          </div>
        </div>
      </div>
    );
  }
);
TransactionSummary.displayName = 'TransactionSummary';

export {
  TransactionRow,
  TransactionList,
  TransactionSummary,
  transactionStatusMap,
  transactionTypeIcons,
};

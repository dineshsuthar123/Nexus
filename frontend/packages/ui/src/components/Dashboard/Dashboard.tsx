'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from '../Card/Card';
import { PercentageDisplay } from '../Currency/Currency';

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  trend = 'neutral',
  icon,
  footer,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {title}
            </p>
            <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {value}
            </p>
            {change !== undefined && (
              <div className="mt-2 flex items-center gap-1">
                {trend === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-success-500" />
                ) : trend === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-danger-500" />
                ) : null}
                <PercentageDisplay 
                  value={change} 
                  size="sm"
                />
                <span className="text-xs text-neutral-500">vs last period</span>
              </div>
            )}
          </div>
          {icon && (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400">
              {icon}
            </div>
          )}
        </div>
        {footer && (
          <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-8 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          </div>
          <div className="h-12 w-12 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
        </div>
      </CardContent>
    </Card>
  );
}

export interface SystemStatusBadgeProps {
  status: 'active' | 'inactive' | 'processing' | 'error' | 'pending' | 'completed';
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

const statusConfig: Record<SystemStatusBadgeProps['status'], { label: string; className: string; dotClassName: string }> = {
  active: {
    label: 'Active',
    className: 'text-success-700 bg-success-50 dark:text-success-300 dark:bg-success-950',
    dotClassName: 'bg-success-500',
  },
  inactive: {
    label: 'Inactive',
    className: 'text-neutral-700 bg-neutral-100 dark:text-neutral-300 dark:bg-neutral-800',
    dotClassName: 'bg-neutral-400',
  },
  processing: {
    label: 'Processing',
    className: 'text-primary-700 bg-primary-50 dark:text-primary-300 dark:bg-primary-950',
    dotClassName: 'bg-primary-500 animate-pulse',
  },
  error: {
    label: 'Error',
    className: 'text-danger-700 bg-danger-50 dark:text-danger-300 dark:bg-danger-950',
    dotClassName: 'bg-danger-500',
  },
  pending: {
    label: 'Pending',
    className: 'text-warning-700 bg-warning-50 dark:text-warning-300 dark:bg-warning-950',
    dotClassName: 'bg-warning-500',
  },
  completed: {
    label: 'Completed',
    className: 'text-success-700 bg-success-50 dark:text-success-300 dark:bg-success-950',
    dotClassName: 'bg-success-500',
  },
};

export function SystemStatusBadge({
  status,
  size = 'md',
  showDot = true,
  className,
}: SystemStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        config.className,
        className
      )}
    >
      {showDot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClassName)} />
      )}
      {config.label}
    </span>
  );
}

'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card, CardContent } from '../Card/Card';
import { PercentageDisplay } from '../Currency/Currency';
import { Sparkline } from '../Sparkline/Sparkline';

// =============================================================================
// Accent color configs for metric cards
// =============================================================================

const accentColors = {
  primary: {
    border: 'border-l-primary-500',
    iconBg: 'bg-primary-50 dark:bg-primary-950/50',
    iconText: 'text-primary-600 dark:text-primary-400',
    sparkline: 'rgb(37, 99, 235)', // primary-600
  },
  secondary: {
    border: 'border-l-secondary-500',
    iconBg: 'bg-secondary-50 dark:bg-secondary-950/50',
    iconText: 'text-secondary-600 dark:text-secondary-400',
    sparkline: 'rgb(20, 184, 166)', // secondary-500
  },
  accent: {
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    iconText: 'text-amber-600 dark:text-amber-400',
    sparkline: 'rgb(245, 158, 11)', // accent-500
  },
  success: {
    border: 'border-l-success-500',
    iconBg: 'bg-success-50 dark:bg-success-100/10',
    iconText: 'text-success-600 dark:text-success-400',
    sparkline: 'rgb(34, 197, 94)', // success-500
  },
  danger: {
    border: 'border-l-danger-500',
    iconBg: 'bg-danger-50 dark:bg-danger-100/10',
    iconText: 'text-danger-600 dark:text-danger-400',
    sparkline: 'rgb(239, 68, 68)', // danger-500
  },
  info: {
    border: 'border-l-info-500',
    iconBg: 'bg-info-50 dark:bg-info-100/10',
    iconText: 'text-info-600 dark:text-info-400',
    sparkline: 'rgb(59, 130, 246)', // info-500
  },
} as const;

export type MetricAccentColor = keyof typeof accentColors;

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Accent color for the left border and icon container */
  accent?: MetricAccentColor;
  /** Sparkline data points (7-14 values recommended) */
  sparklineData?: number[];
}

export function MetricCard({
  title,
  value,
  change,
  trend = 'neutral',
  icon,
  footer,
  className,
  accent = 'primary',
  sparklineData,
}: MetricCardProps) {
  const colors = accentColors[accent];

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-l-4 transition-all duration-300 ease-out',
        'hover:shadow-lg hover:-translate-y-0.5',
        'dark:hover:shadow-neutral-900/40',
        colors.border,
        className
      )}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {title}
            </p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 animate-count-up">
              {value}
            </p>
            <div className="mt-2 flex items-center gap-2">
              {change !== undefined && (
                <div className="flex items-center gap-1">
                  {trend === 'up' ? (
                    <TrendingUp className="h-3.5 w-3.5 text-success-500" />
                  ) : trend === 'down' ? (
                    <TrendingDown className="h-3.5 w-3.5 text-danger-500" />
                  ) : null}
                  <PercentageDisplay
                    value={change}
                    size="sm"
                  />
                  <span className="text-[11px] text-neutral-400">vs last period</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {icon && (
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  colors.iconBg,
                  colors.iconText
                )}
              >
                {icon}
              </div>
            )}
            {sparklineData && sparklineData.length >= 2 && (
              <Sparkline
                data={sparklineData}
                width={80}
                height={28}
                color={
                  trend === 'up'
                    ? 'rgb(34, 197, 94)'
                    : trend === 'down'
                    ? 'rgb(239, 68, 68)'
                    : colors.sparkline
                }
                strokeWidth={1.5}
                showFill
              />
            )}
          </div>
        </div>
        {footer && (
          <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card className="border-l-4 border-l-neutral-200 dark:border-l-neutral-700">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2.5">
            <div className="h-3 w-20 animate-shimmer rounded" />
            <div className="h-7 w-28 animate-shimmer rounded" />
            <div className="h-3 w-24 animate-shimmer rounded" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="h-10 w-10 animate-shimmer rounded-xl" />
            <div className="h-7 w-20 animate-shimmer rounded" />
          </div>
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

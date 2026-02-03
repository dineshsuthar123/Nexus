'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Base Skeleton
 * -------------------------------------------------------------------------- */

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to animate the skeleton */
  animate?: boolean;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, animate = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-md bg-neutral-200 dark:bg-neutral-800',
        animate && 'animate-pulse',
        className
      )}
      {...props}
    />
  )
);
Skeleton.displayName = 'Skeleton';

/* -----------------------------------------------------------------------------
 * Skeleton Text
 * -------------------------------------------------------------------------- */

export interface SkeletonTextProps extends SkeletonProps {
  /** Number of lines */
  lines?: number;
  /** Last line width (percentage) */
  lastLineWidth?: string;
}

const SkeletonText = React.forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ lines = 3, lastLineWidth = '60%', className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{
            width: i === lines - 1 ? lastLineWidth : '100%',
          }}
        />
      ))}
    </div>
  )
);
SkeletonText.displayName = 'SkeletonText';

/* -----------------------------------------------------------------------------
 * Skeleton Avatar
 * -------------------------------------------------------------------------- */

export interface SkeletonAvatarProps extends SkeletonProps {
  /** Size of the avatar */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

const SkeletonAvatar = React.forwardRef<HTMLDivElement, SkeletonAvatarProps>(
  ({ size = 'md', className, ...props }, ref) => (
    <Skeleton
      ref={ref}
      className={cn('rounded-full', sizeClasses[size], className)}
      {...props}
    />
  )
);
SkeletonAvatar.displayName = 'SkeletonAvatar';

/* -----------------------------------------------------------------------------
 * Skeleton Card
 * -------------------------------------------------------------------------- */

export interface SkeletonCardProps extends SkeletonProps {
  /** Show header section */
  header?: boolean;
  /** Number of content lines */
  lines?: number;
  /** Show footer section */
  footer?: boolean;
}

const SkeletonCard = React.forwardRef<HTMLDivElement, SkeletonCardProps>(
  ({ header = true, lines = 3, footer = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900',
        className
      )}
      {...props}
    >
      {header && (
        <div className="mb-4 flex items-center space-x-3">
          <SkeletonAvatar size="md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      )}
      <SkeletonText lines={lines} />
      {footer && (
        <div className="mt-4 flex justify-end space-x-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      )}
    </div>
  )
);
SkeletonCard.displayName = 'SkeletonCard';

/* -----------------------------------------------------------------------------
 * Skeleton Table Row
 * -------------------------------------------------------------------------- */

export interface SkeletonTableRowProps extends SkeletonProps {
  /** Number of columns */
  columns?: number;
}

const SkeletonTableRow = React.forwardRef<HTMLDivElement, SkeletonTableRowProps>(
  ({ columns = 5, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center space-x-4 py-3', className)}
      {...props}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 flex-1"
          style={{
            maxWidth: i === 0 ? '200px' : undefined,
          }}
        />
      ))}
    </div>
  )
);
SkeletonTableRow.displayName = 'SkeletonTableRow';

/* -----------------------------------------------------------------------------
 * Skeleton Dashboard Card
 * -------------------------------------------------------------------------- */

const SkeletonDashboardCard = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900',
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
      <div className="mt-4">
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
);
SkeletonDashboardCard.displayName = 'SkeletonDashboardCard';

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonDashboardCard,
};

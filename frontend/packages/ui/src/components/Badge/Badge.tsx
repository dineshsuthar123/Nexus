'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
        secondary: 'bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200',
        success: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200',
        warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200',
        danger: 'bg-danger-100 text-danger-800 dark:bg-danger-900 dark:text-danger-200',
        info: 'bg-info-100 text-info-800 dark:bg-info-900 dark:text-info-200',
        outline: 'border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-sm',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Whether to show a dot indicator */
  dot?: boolean;
  /** Dot color - uses variant color if not specified */
  dotColor?: string;
  /** Icon to show before the text */
  icon?: React.ReactNode;
  /** Whether the badge is removable */
  removable?: boolean;
  /** Callback when remove button is clicked */
  onRemove?: () => void;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant,
      size,
      dot,
      dotColor,
      icon,
      removable,
      onRemove,
      children,
      ...props
    },
    ref
  ) => {
    const dotColorClass = dotColor || {
      default: 'bg-primary-500',
      secondary: 'bg-secondary-500',
      success: 'bg-success-500',
      warning: 'bg-warning-500',
      danger: 'bg-danger-500',
      info: 'bg-info-500',
      outline: 'bg-neutral-500',
    }[variant || 'default'];

    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      >
        {dot && (
          <span
            className={cn(
              'mr-1.5 h-1.5 w-1.5 rounded-full',
              typeof dotColorClass === 'string' ? dotColorClass : ''
            )}
            aria-hidden="true"
          />
        )}
        {icon && <span className="mr-1" aria-hidden="true">{icon}</span>}
        {children}
        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="ml-1.5 -mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 focus:outline-none focus:ring-1 focus:ring-current dark:hover:bg-white/10"
            aria-label="Remove"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </span>
    );
  }
);
Badge.displayName = 'Badge';

/* -----------------------------------------------------------------------------
 * Status Badge - For transaction/system status
 * -------------------------------------------------------------------------- */

export type StatusType = 
  | 'pending' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled'
  | 'active'
  | 'inactive'
  | 'verified'
  | 'unverified';

const statusConfig: Record<StatusType, { variant: BadgeProps['variant']; label: string; dot?: boolean }> = {
  pending: { variant: 'warning', label: 'Pending', dot: true },
  processing: { variant: 'info', label: 'Processing', dot: true },
  completed: { variant: 'success', label: 'Completed' },
  failed: { variant: 'danger', label: 'Failed' },
  cancelled: { variant: 'outline', label: 'Cancelled' },
  active: { variant: 'success', label: 'Active', dot: true },
  inactive: { variant: 'outline', label: 'Inactive' },
  verified: { variant: 'success', label: 'Verified' },
  unverified: { variant: 'warning', label: 'Unverified' },
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant' | 'dot'> {
  status: StatusType;
  /** Override the default label */
  label?: string;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, label, className, ...props }, ref) => {
    const config = statusConfig[status];
    
    return (
      <Badge
        ref={ref}
        variant={config.variant}
        dot={config.dot}
        className={className}
        {...props}
      >
        {label || config.label}
      </Badge>
    );
  }
);
StatusBadge.displayName = 'StatusBadge';

/* -----------------------------------------------------------------------------
 * Count Badge - For notification counts
 * -------------------------------------------------------------------------- */

export interface CountBadgeProps extends Omit<BadgeProps, 'children'> {
  count: number;
  /** Maximum count to display (shows 99+ for higher) */
  max?: number;
  /** Show zero count */
  showZero?: boolean;
}

const CountBadge = React.forwardRef<HTMLSpanElement, CountBadgeProps>(
  ({ count, max = 99, showZero = false, className, ...props }, ref) => {
    if (count === 0 && !showZero) return null;

    const displayCount = count > max ? `${max}+` : count.toString();

    return (
      <Badge
        ref={ref}
        className={cn('min-w-[1.25rem] justify-center px-1.5', className)}
        {...props}
      >
        {displayCount}
      </Badge>
    );
  }
);
CountBadge.displayName = 'CountBadge';

export { Badge, StatusBadge, CountBadge, badgeVariants };

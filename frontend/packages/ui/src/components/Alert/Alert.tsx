'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4',
  {
    variants: {
      variant: {
        default: 'bg-white text-neutral-950 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-50 dark:border-neutral-700',
        info: 'bg-info-50 text-info-900 border-info-200 dark:bg-info-950 dark:text-info-100 dark:border-info-800',
        success: 'bg-success-50 text-success-900 border-success-200 dark:bg-success-950 dark:text-success-100 dark:border-success-800',
        warning: 'bg-warning-50 text-warning-900 border-warning-200 dark:bg-warning-950 dark:text-warning-100 dark:border-warning-800',
        danger: 'bg-danger-50 text-danger-900 border-danger-200 dark:bg-danger-950 dark:text-danger-100 dark:border-danger-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const alertIconMap = {
  default: Info,
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Alert title */
  title?: string;
  /** Show icon */
  icon?: boolean;
  /** Custom icon */
  customIcon?: React.ReactNode;
  /** Dismissible */
  dismissible?: boolean;
  /** On dismiss callback */
  onDismiss?: () => void;
  /** Actions (buttons) */
  actions?: React.ReactNode;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant = 'default',
      title,
      icon = true,
      customIcon,
      dismissible = false,
      onDismiss,
      actions,
      children,
      ...props
    },
    ref
  ) => {
    const IconComponent = alertIconMap[variant || 'default'];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        <div className="flex">
          {/* Icon */}
          {icon && (
            <div className="shrink-0">
              {customIcon || <IconComponent className="h-5 w-5" />}
            </div>
          )}

          {/* Content */}
          <div className={cn('flex-1', icon && 'ml-3')}>
            {title && (
              <h5 className="mb-1 font-medium leading-none tracking-tight">
                {title}
              </h5>
            )}
            <div className="text-sm [&_p]:leading-relaxed">{children}</div>
            
            {/* Actions */}
            {actions && (
              <div className="mt-3 flex gap-2">{actions}</div>
            )}
          </div>

          {/* Dismiss button */}
          {dismissible && (
            <button
              type="button"
              onClick={onDismiss}
              className="ml-3 inline-flex shrink-0 rounded-md p-1.5 transition-colors hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-ring dark:hover:bg-white/5"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  }
);
Alert.displayName = 'Alert';

/* -----------------------------------------------------------------------------
 * Alert Title (for composition)
 * -------------------------------------------------------------------------- */

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

/* -----------------------------------------------------------------------------
 * Alert Description (for composition)
 * -------------------------------------------------------------------------- */

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

/* -----------------------------------------------------------------------------
 * Inline Alert (compact version)
 * -------------------------------------------------------------------------- */

export interface InlineAlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Icon to show */
  icon?: React.ReactNode;
}

const InlineAlert = React.forwardRef<HTMLDivElement, InlineAlertProps>(
  ({ className, variant = 'default', icon, children, ...props }, ref) => {
    const IconComponent = alertIconMap[variant || 'default'];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm',
          variant === 'default' && 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
          variant === 'info' && 'bg-info-100 text-info-700 dark:bg-info-900 dark:text-info-300',
          variant === 'success' && 'bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-300',
          variant === 'warning' && 'bg-warning-100 text-warning-700 dark:bg-warning-900 dark:text-warning-300',
          variant === 'danger' && 'bg-danger-100 text-danger-700 dark:bg-danger-900 dark:text-danger-300',
          className
        )}
        {...props}
      >
        {icon || <IconComponent className="h-4 w-4 shrink-0" />}
        {children}
      </div>
    );
  }
);
InlineAlert.displayName = 'InlineAlert';

export { Alert, AlertTitle, AlertDescription, InlineAlert, alertVariants };

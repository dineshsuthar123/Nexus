import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Toast/Notification Component
 *
 * An accessible toast notification system built on Radix UI Toast primitive.
 * Provides visual feedback for user actions with auto-dismiss and manual close.
 *
 * @example
 * // Using the toast hook
 * const { toast } = useToast();
 *
 * toast({
 *   variant: 'success',
 *   title: 'Payment Successful',
 *   description: 'Your payment of $1,000 was sent successfully.',
 * });
 */

const ToastProvider = ToastPrimitives.Provider;

/**
 * Toast viewport - container for all toasts
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed top-0 z-toast flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = 'ToastViewport';

const toastVariants = cva(
  [
    'group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg border p-4 shadow-lg',
    'transition-all',
    'data-[state=open]:animate-slide-in-from-right',
    'data-[state=closed]:animate-fade-out',
    'data-[swipe=cancel]:translate-x-0',
    'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
    'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
    'data-[swipe=move]:transition-none',
  ],
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        success: 'border-success-600 bg-success-50 text-success-700',
        warning: 'border-warning-600 bg-warning-50 text-warning-700',
        danger: 'border-danger-600 bg-danger-50 text-danger-700',
        info: 'border-info-600 bg-info-50 text-info-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const toastIcons = {
  default: null,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
};

export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root>,
    VariantProps<typeof toastVariants> {}

/**
 * Toast root component
 */
const Toast = React.forwardRef<React.ElementRef<typeof ToastPrimitives.Root>, ToastProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const Icon = variant ? toastIcons[variant] : null;

    return (
      <ToastPrimitives.Root
        ref={ref}
        className={cn(toastVariants({ variant }), className)}
        {...props}
      >
        {Icon && (
          <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        )}
        <div className="flex-1">{children}</div>
      </ToastPrimitives.Root>
    );
  }
);
Toast.displayName = 'Toast';

/**
 * Toast action button
 */
const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3',
      'text-sm font-medium',
      'transition-colors hover:bg-neutral-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      'group-[.variant-danger]:border-danger/30 group-[.variant-danger]:hover:border-danger/30 group-[.variant-danger]:hover:bg-danger group-[.variant-danger]:hover:text-danger-foreground',
      className
    )}
    {...props}
  />
));
ToastAction.displayName = 'ToastAction';

/**
 * Toast close button
 */
const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2 top-2 rounded-md p-1',
      'opacity-0 transition-opacity hover:opacity-100 focus:opacity-100',
      'group-hover:opacity-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      className
    )}
    toast-close=""
    aria-label="Close notification"
    {...props}
  >
    <X className="h-4 w-4" aria-hidden="true" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = 'ToastClose';

/**
 * Toast title
 */
const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-sm font-semibold', className)}
    {...props}
  />
));
ToastTitle.displayName = 'ToastTitle';

/**
 * Toast description
 */
const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm opacity-90', className)}
    {...props}
  />
));
ToastDescription.displayName = 'ToastDescription';

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
  type ToastActionElement,
};

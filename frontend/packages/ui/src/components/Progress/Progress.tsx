'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Linear Progress
 * -------------------------------------------------------------------------- */

const progressVariants = cva(
  'relative w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800',
  {
    variants: {
      size: {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3',
        xl: 'h-4',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

const progressIndicatorVariants = cva(
  'h-full transition-all duration-300 ease-out',
  {
    variants: {
      variant: {
        default: 'bg-primary-500',
        success: 'bg-success-500',
        warning: 'bg-warning-500',
        danger: 'bg-danger-500',
        info: 'bg-info-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants>,
    VariantProps<typeof progressIndicatorVariants> {
  /** Current value (0-100) */
  value?: number;
  /** Maximum value */
  max?: number;
  /** Show indeterminate animation */
  indeterminate?: boolean;
  /** Accessible label */
  label?: string;
  /** Show value text */
  showValue?: boolean;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value = 0,
      max = 100,
      size,
      variant,
      indeterminate = false,
      label,
      showValue = false,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div className="w-full">
        {(label || showValue) && (
          <div className="mb-1 flex justify-between text-sm">
            {label && <span className="text-neutral-600 dark:text-neutral-400">{label}</span>}
            {showValue && (
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        )}
        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
          className={cn(progressVariants({ size }), className)}
          {...props}
        >
          <div
            className={cn(
              progressIndicatorVariants({ variant }),
              indeterminate && 'animate-indeterminate-progress'
            )}
            style={{
              width: indeterminate ? '50%' : `${percentage}%`,
            }}
          />
        </div>
      </div>
    );
  }
);
Progress.displayName = 'Progress';

/* -----------------------------------------------------------------------------
 * Circular Progress
 * -------------------------------------------------------------------------- */

export interface CircularProgressProps
  extends React.SVGAttributes<SVGSVGElement>,
    VariantProps<typeof progressIndicatorVariants> {
  /** Current value (0-100) */
  value?: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Show indeterminate animation */
  indeterminate?: boolean;
  /** Show value in center */
  showValue?: boolean;
  /** Accessible label */
  label?: string;
}

const CircularProgress = React.forwardRef<SVGSVGElement, CircularProgressProps>(
  (
    {
      value = 0,
      size = 48,
      strokeWidth = 4,
      variant = 'default',
      indeterminate = false,
      showValue = false,
      label,
      className,
      ...props
    },
    ref
  ) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const percentage = Math.min(Math.max(value, 0), 100);
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    const strokeColorClass = {
      default: 'stroke-primary-500',
      success: 'stroke-success-500',
      warning: 'stroke-warning-500',
      danger: 'stroke-danger-500',
      info: 'stroke-info-500',
    }[variant || 'default'];

    return (
      <div className="relative inline-flex items-center justify-center">
        <svg
          ref={ref}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
          className={cn(
            indeterminate && 'animate-spin',
            className
          )}
          {...props}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-neutral-200 dark:stroke-neutral-800"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={cn(
              strokeColorClass,
              'transition-all duration-300 ease-out'
            )}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: indeterminate ? circumference * 0.75 : strokeDashoffset,
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>
        {showValue && !indeterminate && (
          <span className="absolute text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {Math.round(percentage)}%
          </span>
        )}
      </div>
    );
  }
);
CircularProgress.displayName = 'CircularProgress';

/* -----------------------------------------------------------------------------
 * Step Progress
 * -------------------------------------------------------------------------- */

export interface StepProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Total number of steps */
  steps: number;
  /** Current step (1-based) */
  currentStep: number;
  /** Step labels */
  labels?: string[];
  /** Variant */
  variant?: 'default' | 'success' | 'primary';
}

const StepProgress = React.forwardRef<HTMLDivElement, StepProgressProps>(
  ({ steps, currentStep, labels, variant = 'default', className, ...props }, ref) => {
    const variantColors = {
      default: 'bg-primary-500',
      success: 'bg-success-500',
      primary: 'bg-primary-500',
    };

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        <div className="flex items-center">
          {Array.from({ length: steps }).map((_, index) => {
            const stepNumber = index + 1;
            const isCompleted = stepNumber < currentStep;
            const isCurrent = stepNumber === currentStep;

            return (
              <React.Fragment key={index}>
                {/* Step circle */}
                <div
                  className={cn(
                    'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    isCompleted && cn(variantColors[variant], 'text-white'),
                    isCurrent && 'border-2 border-primary-500 bg-white text-primary-500 dark:bg-neutral-900',
                    !isCompleted && !isCurrent && 'border-2 border-neutral-300 bg-white text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900'
                  )}
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </div>

                {/* Connector line */}
                {index < steps - 1 && (
                  <div
                    className={cn(
                      'mx-2 h-0.5 flex-1 transition-colors',
                      stepNumber < currentStep
                        ? variantColors[variant]
                        : 'bg-neutral-300 dark:bg-neutral-600'
                    )}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Labels */}
        {labels && labels.length > 0 && (
          <div className="mt-2 flex">
            {labels.map((label, index) => {
              const stepNumber = index + 1;
              const isCompleted = stepNumber < currentStep;
              const isCurrent = stepNumber === currentStep;

              return (
                <div
                  key={index}
                  className={cn(
                    'flex-1 text-center text-xs',
                    index === 0 && 'text-left',
                    index === labels.length - 1 && 'text-right',
                    (isCompleted || isCurrent)
                      ? 'font-medium text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-400 dark:text-neutral-500'
                  )}
                >
                  {label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);
StepProgress.displayName = 'StepProgress';

export { Progress, CircularProgress, StepProgress, progressVariants, progressIndicatorVariants };

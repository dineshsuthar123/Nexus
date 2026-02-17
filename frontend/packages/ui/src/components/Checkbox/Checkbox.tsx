'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const checkboxVariants = cva(
  [
    'peer shrink-0 rounded border',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:text-white data-[state=indeterminate]:text-white',
    'transition-colors',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-neutral-300 dark:border-neutral-600',
          'data-[state=checked]:bg-primary-500 data-[state=checked]:border-primary-500',
          'data-[state=indeterminate]:bg-primary-500 data-[state=indeterminate]:border-primary-500',
        ],
        success: [
          'border-neutral-300 dark:border-neutral-600',
          'data-[state=checked]:bg-success-500 data-[state=checked]:border-success-500',
          'data-[state=indeterminate]:bg-success-500 data-[state=indeterminate]:border-success-500',
        ],
        danger: [
          'border-neutral-300 dark:border-neutral-600',
          'data-[state=checked]:bg-danger-500 data-[state=checked]:border-danger-500',
          'data-[state=indeterminate]:bg-danger-500 data-[state=indeterminate]:border-danger-500',
        ],
      },
      size: {
        sm: 'h-4 w-4',
        md: 'h-5 w-5',
        lg: 'h-6 w-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'checked'>,
    VariantProps<typeof checkboxVariants> {
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Error message */
  error?: string;
  /** Checked state - can be boolean or 'indeterminate' */
  checked?: boolean | 'indeterminate';
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(
  (
    {
      className,
      variant,
      size,
      label,
      description,
      error,
      checked,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;

    const iconSize = {
      sm: 'h-3 w-3',
      md: 'h-3.5 w-3.5',
      lg: 'h-4 w-4',
    }[size || 'md'];

    const checkboxElement = (
      <CheckboxPrimitive.Root
        id={checkboxId}
        ref={ref}
        checked={checked}
        className={cn(checkboxVariants({ variant, size }), className)}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
          {checked === 'indeterminate' ? (
            <Minus className={iconSize} strokeWidth={3} />
          ) : (
            <Check className={iconSize} strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );

    if (!label && !description) {
      return checkboxElement;
    }

    return (
      <div className="flex items-start gap-3">
        {checkboxElement}
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={checkboxId}
              className="text-sm font-medium leading-none text-neutral-900 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-neutral-100"
            >
              {label}
            </label>
          )}
          {description && (
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          )}
          {error && (
            <p className="mt-1 text-sm text-danger-500">{error}</p>
          )}
        </div>
      </div>
    );
  }
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

/* -----------------------------------------------------------------------------
 * Checkbox Group
 * -------------------------------------------------------------------------- */

export interface CheckboxGroupProps {
  /** Group label */
  label?: string;
  /** Group description */
  description?: string;
  /** Error message */
  error?: string;
  /** Direction of checkboxes */
  direction?: 'horizontal' | 'vertical';
  /** Children (Checkbox components) */
  children: React.ReactNode;
  /** Additional class */
  className?: string;
}

const CheckboxGroup = React.forwardRef<HTMLFieldSetElement, CheckboxGroupProps>(
  ({ label, description, error, direction = 'vertical', children, className }, ref) => (
    <fieldset ref={ref} className={cn('space-y-2', className)}>
      {label && (
        <legend className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </legend>
      )}
      {description && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
      )}
      <div
        className={cn(
          direction === 'horizontal' ? 'flex flex-wrap gap-4' : 'space-y-3'
        )}
      >
        {children}
      </div>
      {error && <p className="text-sm text-danger-500">{error}</p>}
    </fieldset>
  )
);
CheckboxGroup.displayName = 'CheckboxGroup';

export { Checkbox, CheckboxGroup, checkboxVariants };

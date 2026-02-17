import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Input Component
 *
 * A fully accessible input component with label, helper text, error states,
 * and various input types support.
 *
 * @example
 * <Input
 *   label="Email Address"
 *   type="email"
 *   placeholder="you@example.com"
 *   helperText="We'll never share your email"
 * />
 *
 * @example
 * <Input
 *   label="Amount"
 *   type="number"
 *   error="Amount must be positive"
 *   leftAddon="$"
 * />
 */

const inputVariants = cva(
  [
    'flex w-full rounded-md border bg-neutral-0 text-neutral-900',
    'placeholder:text-neutral-400',
    'transition-colors duration-normal',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-100',
    // Minimum touch target
    'min-h-[44px]',
  ],
  {
    variants: {
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-base',
        lg: 'h-12 px-4 text-lg',
      },
      state: {
        default: 'border-input focus-visible:border-primary',
        error: 'border-danger focus-visible:ring-danger',
        success: 'border-success focus-visible:ring-success',
      },
    },
    defaultVariants: {
      size: 'md',
      state: 'default',
    },
  }
);

const labelVariants = cva('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', {
  variants: {
    required: {
      true: "after:content-['*'] after:ml-0.5 after:text-danger",
    },
  },
});

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /**
   * Label text displayed above the input.
   */
  label?: string;
  /**
   * Helper text displayed below the input.
   */
  helperText?: string;
  /**
   * Error message - when provided, input shows error state.
   */
  error?: string;
  /**
   * Success state - input shows success styling.
   */
  success?: boolean;
  /**
   * Content to display on the left side of the input (e.g., currency symbol).
   */
  leftAddon?: React.ReactNode;
  /**
   * Content to display on the right side of the input (e.g., icon).
   */
  rightAddon?: React.ReactNode;
  /**
   * ID for the input - auto-generated if not provided.
   */
  id?: string;
}

/**
 * Input component with label, helper text, and validation states.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      size,
      label,
      helperText,
      error,
      success,
      required,
      disabled,
      leftAddon,
      rightAddon,
      id: providedId,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const id = providedId || generatedId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;

    // Determine the current state for styling
    const state = error ? 'error' : success ? 'success' : 'default';

    // Build aria-describedby string
    const describedBy = [
      ariaDescribedBy,
      error && errorId,
      helperText && helperId,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <LabelPrimitive.Root
            htmlFor={id}
            className={cn(labelVariants({ required }))}
          >
            {label}
          </LabelPrimitive.Root>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 flex items-center text-neutral-500" aria-hidden="true">
              {leftAddon}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={cn(
              inputVariants({ size, state }),
              leftAddon && 'pl-10',
              rightAddon && 'pr-10',
              className
            )}
            {...props}
          />

          {rightAddon && (
            <div className="absolute right-3 flex items-center text-neutral-500" aria-hidden="true">
              {rightAddon}
            </div>
          )}
        </div>

        {(error || helperText) && (
          <p
            id={error ? errorId : helperId}
            className={cn(
              'text-sm',
              error ? 'text-danger' : 'text-neutral-500'
            )}
            role={error ? 'alert' : undefined}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input, inputVariants };

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Button Component
 *
 * A fully accessible button component with multiple variants, sizes, and states.
 * Supports keyboard navigation, focus management, and loading states.
 *
 * @example
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Submit Payment
 * </Button>
 *
 * @example
 * <Button variant="danger" loading>
 *   Deleting...
 * </Button>
 *
 * @example
 * <Button asChild>
 *   <a href="/dashboard">Go to Dashboard</a>
 * </Button>
 */

const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium text-sm',
    'rounded-md',
    'transition-colors duration-normal',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    // Ensure minimum touch target for accessibility
    'min-h-[44px] min-w-[44px]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary text-neutral-0',
          'hover:bg-primary-600',
          'active:bg-primary-700',
        ],
        secondary: [
          'bg-secondary text-neutral-0',
          'hover:bg-secondary-600',
          'active:bg-secondary-700',
        ],
        outline: [
          'border-2 border-primary bg-transparent text-primary',
          'hover:bg-primary-50',
          'active:bg-primary-100',
        ],
        ghost: [
          'bg-transparent text-neutral-700',
          'hover:bg-neutral-100',
          'active:bg-neutral-200',
        ],
        danger: [
          'bg-danger text-neutral-0',
          'hover:bg-danger-600',
          'active:bg-danger-700',
        ],
        success: [
          'bg-success text-neutral-0',
          'hover:bg-success-600',
          'active:bg-success-700',
        ],
        link: [
          'text-primary underline-offset-4',
          'hover:underline',
          'h-auto min-h-0 p-0',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-xs min-h-[36px]',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
        icon: 'h-10 w-10 p-0',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * If true, the button will render its children inside a Slot,
   * allowing composition with other elements (e.g., links).
   */
  asChild?: boolean;
  /**
   * If true, shows a loading spinner and disables the button.
   */
  loading?: boolean;
  /**
   * Icon to display before the button text.
   */
  leftIcon?: React.ReactNode;
  /**
   * Icon to display after the button text.
   */
  rightIcon?: React.ReactNode;
}

/**
 * Button component with variants, loading state, and accessibility features.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading</span>
            {children}
          </>
        ) : (
          <>
            {leftIcon && <span aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </Comp>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };

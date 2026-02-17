'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Radio Group
 * -------------------------------------------------------------------------- */

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /** Group label */
  label?: string;
  /** Group description */
  description?: string;
  /** Error message */
  error?: string;
}

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ className, label, description, error, children, ...props }, ref) => (
  <div className="space-y-2">
    {label && (
      <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {label}
      </label>
    )}
    {description && (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
    )}
    <RadioGroupPrimitive.Root
      ref={ref}
      className={cn('grid gap-3', className)}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Root>
    {error && <p className="text-sm text-danger-500">{error}</p>}
  </div>
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

/* -----------------------------------------------------------------------------
 * Radio Group Item
 * -------------------------------------------------------------------------- */

const radioVariants = cva(
  [
    'aspect-square rounded-full border',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'transition-colors',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-neutral-300 dark:border-neutral-600',
          'text-primary-500',
          'data-[state=checked]:border-primary-500',
        ],
        success: [
          'border-neutral-300 dark:border-neutral-600',
          'text-success-500',
          'data-[state=checked]:border-success-500',
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

export interface RadioGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioVariants> {
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
}

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, variant, size, label, description, id, ...props }, ref) => {
  const generatedId = React.useId();
  const radioId = id || generatedId;

  const indicatorSize = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
  }[size || 'md'];

  const radioElement = (
    <RadioGroupPrimitive.Item
      id={radioId}
      ref={ref}
      className={cn(radioVariants({ variant, size }), className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className={cn(indicatorSize, 'fill-current')} />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );

  if (!label && !description) {
    return radioElement;
  }

  return (
    <div className="flex items-start gap-3">
      {radioElement}
      <div className="flex flex-col">
        {label && (
          <label
            htmlFor={radioId}
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
      </div>
    </div>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

/* -----------------------------------------------------------------------------
 * Radio Card (for larger radio options with cards)
 * -------------------------------------------------------------------------- */

export interface RadioCardProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  /** Card title */
  title: string;
  /** Card description */
  description?: string;
  /** Icon to display */
  icon?: React.ReactNode;
}

const RadioCard = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioCardProps
>(({ className, title, description, icon, id, ...props }, ref) => {
  const generatedId = React.useId();
  const radioId = id || generatedId;

  return (
    <RadioGroupPrimitive.Item
      id={radioId}
      ref={ref}
      className={cn(
        'relative flex cursor-pointer rounded-lg border border-neutral-200 bg-white p-4 transition-all',
        'hover:border-primary-300 hover:bg-primary-50/50',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'data-[state=checked]:border-primary-500 data-[state=checked]:bg-primary-50 data-[state=checked]:ring-1 data-[state=checked]:ring-primary-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-primary-600 dark:hover:bg-primary-950/50',
        'dark:data-[state=checked]:border-primary-500 dark:data-[state=checked]:bg-primary-950',
        className
      )}
      {...props}
    >
      <div className="flex w-full items-start gap-3">
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <label
            htmlFor={radioId}
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
          >
            {title}
          </label>
          {description && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {description}
            </p>
          )}
        </div>
        <RadioGroupPrimitive.Indicator className="flex items-center">
          <div className="h-4 w-4 rounded-full border-4 border-primary-500" />
        </RadioGroupPrimitive.Indicator>
      </div>
    </RadioGroupPrimitive.Item>
  );
});
RadioCard.displayName = 'RadioCard';

export { RadioGroup, RadioGroupItem, RadioCard, radioVariants };

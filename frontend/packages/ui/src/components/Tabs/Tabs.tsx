'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Tabs Root
 * -------------------------------------------------------------------------- */

const Tabs = TabsPrimitive.Root;

/* -----------------------------------------------------------------------------
 * Tabs List
 * -------------------------------------------------------------------------- */

const tabsListVariants = cva(
  'inline-flex items-center justify-center',
  {
    variants: {
      variant: {
        default: 'rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800',
        underline: 'border-b border-neutral-200 dark:border-neutral-700',
        pills: 'gap-2',
        cards: 'gap-2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/* -----------------------------------------------------------------------------
 * Tabs Trigger
 * -------------------------------------------------------------------------- */

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: [
          'rounded-md px-3 py-1.5 text-sm',
          'text-neutral-600 dark:text-neutral-400',
          'data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm',
          'dark:data-[state=active]:bg-neutral-950 dark:data-[state=active]:text-neutral-50',
        ],
        underline: [
          '-mb-px px-4 py-2 text-sm',
          'border-b-2 border-transparent',
          'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50',
          'data-[state=active]:border-primary-500 data-[state=active]:text-primary-600',
          'dark:data-[state=active]:border-primary-400 dark:data-[state=active]:text-primary-400',
        ],
        pills: [
          'rounded-full px-4 py-2 text-sm',
          'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800',
          'data-[state=active]:bg-primary-500 data-[state=active]:text-white',
          'dark:data-[state=active]:bg-primary-600',
        ],
        cards: [
          'rounded-lg border border-neutral-200 px-4 py-2 text-sm',
          'text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800',
          'data-[state=active]:border-primary-500 data-[state=active]:bg-primary-50 data-[state=active]:text-primary-700',
          'dark:data-[state=active]:border-primary-400 dark:data-[state=active]:bg-primary-950 dark:data-[state=active]:text-primary-400',
        ],
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {
  /** Icon to display before the label */
  icon?: React.ReactNode;
  /** Badge/count to display after the label */
  badge?: React.ReactNode;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, size, icon, badge, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabsTriggerVariants({ variant, size }), className)}
    {...props}
  >
    {icon && <span className="mr-2" aria-hidden="true">{icon}</span>}
    {children}
    {badge && <span className="ml-2">{badge}</span>}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

/* -----------------------------------------------------------------------------
 * Tabs Content
 * -------------------------------------------------------------------------- */

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/* -----------------------------------------------------------------------------
 * Controlled Tabs Hook
 * -------------------------------------------------------------------------- */

export interface UseTabsOptions {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function useTabs(options: UseTabsOptions = {}) {
  const { defaultValue, value: controlledValue, onValueChange } = options;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue || '');

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [isControlled, onValueChange]
  );

  return {
    value,
    onValueChange: handleValueChange,
    isControlled,
  };
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants };

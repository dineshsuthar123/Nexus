'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b border-neutral-200 dark:border-neutral-700', className)}
    {...props}
  />
));
AccordionItem.displayName = 'AccordionItem';

export interface AccordionTriggerProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> {
  /** Icon to show before the trigger text */
  icon?: React.ReactNode;
  /** Badge/tag to show after the trigger text */
  badge?: React.ReactNode;
}

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({ className, children, icon, badge, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all',
        'hover:underline',
        '[&[data-state=open]>svg]:rotate-180',
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        {icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
        {children}
        {badge && <span className="ml-2">{badge}</span>}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('pb-4 pt-0', className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

/* -----------------------------------------------------------------------------
 * Card Accordion - Accordion styled as cards
 * -------------------------------------------------------------------------- */

const CardAccordion = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Root
    ref={ref}
    className={cn('space-y-2', className)}
    {...props}
  />
));
CardAccordion.displayName = 'CardAccordion';

const CardAccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      'rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
      'data-[state=open]:ring-1 data-[state=open]:ring-primary-500',
      className
    )}
    {...props}
  />
));
CardAccordionItem.displayName = 'CardAccordionItem';

const CardAccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  AccordionTriggerProps
>(({ className, children, icon, badge, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between px-4 py-3 text-sm font-medium transition-all',
        'hover:bg-neutral-50 dark:hover:bg-neutral-800',
        'rounded-lg data-[state=open]:rounded-b-none',
        '[&[data-state=open]>svg]:rotate-180',
        className
      )}
      {...props}
    >
      <span className="flex items-center gap-2">
        {icon && <span className="shrink-0" aria-hidden="true">{icon}</span>}
        {children}
        {badge && <span className="ml-2">{badge}</span>}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
CardAccordionTrigger.displayName = 'CardAccordionTrigger';

const CardAccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn('border-t border-neutral-200 px-4 py-3 dark:border-neutral-700', className)}>
      {children}
    </div>
  </AccordionPrimitive.Content>
));
CardAccordionContent.displayName = 'CardAccordionContent';

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  CardAccordion,
  CardAccordionItem,
  CardAccordionTrigger,
  CardAccordionContent,
};

'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipArrow = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>
>(({ className, ...props }, ref) => (
  <TooltipPrimitive.Arrow
    ref={ref}
    className={cn('fill-neutral-900 dark:fill-neutral-50', className)}
    {...props}
  />
));
TooltipArrow.displayName = TooltipPrimitive.Arrow.displayName;

export interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  /** Show arrow */
  arrow?: boolean;
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, arrow = false, children, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-neutral-50',
      'animate-in fade-in-0 zoom-in-95',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
      'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      'dark:bg-neutral-50 dark:text-neutral-900',
      className
    )}
    {...props}
  >
    {children}
    {arrow && <TooltipArrow />}
  </TooltipPrimitive.Content>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/* -----------------------------------------------------------------------------
 * Simple Tooltip Wrapper
 * -------------------------------------------------------------------------- */

export interface SimpleTooltipProps {
  /** Content to show in tooltip */
  content: React.ReactNode;
  /** Trigger element */
  children: React.ReactNode;
  /** Side of the trigger to show tooltip */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Alignment of the tooltip */
  align?: 'start' | 'center' | 'end';
  /** Delay before showing (ms) */
  delayDuration?: number;
  /** Skip delay when moving between tooltips */
  skipDelayDuration?: number;
  /** Whether tooltip is disabled */
  disabled?: boolean;
  /** Show arrow */
  arrow?: boolean;
  /** Additional class for content */
  contentClassName?: string;
}

const SimpleTooltip: React.FC<SimpleTooltipProps> = ({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 200,
  skipDelayDuration = 300,
  disabled = false,
  arrow = false,
  contentClassName,
}) => {
  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align} arrow={arrow} className={contentClassName}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
SimpleTooltip.displayName = 'SimpleTooltip';

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TooltipArrow,
  SimpleTooltip,
};

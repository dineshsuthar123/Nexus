'use client';

import * as React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Breadcrumb Root
 * -------------------------------------------------------------------------- */

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  /** Custom separator element */
  separator?: React.ReactNode;
}

const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label="Breadcrumb"
      className={className}
      {...props}
    />
  )
);
Breadcrumb.displayName = 'Breadcrumb';

/* -----------------------------------------------------------------------------
 * Breadcrumb List
 * -------------------------------------------------------------------------- */

const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.OlHTMLAttributes<HTMLOListElement>
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn(
      'flex flex-wrap items-center gap-1.5 break-words text-sm text-neutral-500 sm:gap-2.5 dark:text-neutral-400',
      className
    )}
    {...props}
  />
));
BreadcrumbList.displayName = 'BreadcrumbList';

/* -----------------------------------------------------------------------------
 * Breadcrumb Item
 * -------------------------------------------------------------------------- */

const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.LiHTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    className={cn('inline-flex items-center gap-1.5', className)}
    {...props}
  />
));
BreadcrumbItem.displayName = 'BreadcrumbItem';

/* -----------------------------------------------------------------------------
 * Breadcrumb Link
 * -------------------------------------------------------------------------- */

export interface BreadcrumbLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  asChild?: boolean;
}

const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ asChild, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'a';

    return (
      <Comp
        ref={ref}
        className={cn(
          'transition-colors hover:text-neutral-900 dark:hover:text-neutral-50',
          className
        )}
        {...props}
      />
    );
  }
);
BreadcrumbLink.displayName = 'BreadcrumbLink';

/* -----------------------------------------------------------------------------
 * Breadcrumb Page (current page, not a link)
 * -------------------------------------------------------------------------- */

const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn('font-medium text-neutral-900 dark:text-neutral-50', className)}
    {...props}
  />
));
BreadcrumbPage.displayName = 'BreadcrumbPage';

/* -----------------------------------------------------------------------------
 * Breadcrumb Separator
 * -------------------------------------------------------------------------- */

const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.LiHTMLAttributes<HTMLLIElement>) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn('[&>svg]:size-3.5', className)}
    {...props}
  >
    {children ?? <ChevronRight />}
  </li>
);
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

/* -----------------------------------------------------------------------------
 * Breadcrumb Ellipsis (for collapsed items)
 * -------------------------------------------------------------------------- */

const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn('flex h-9 w-9 items-center justify-center', className)}
    {...props}
  >
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
    </svg>
    <span className="sr-only">More</span>
  </span>
);
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

/* -----------------------------------------------------------------------------
 * Simple Breadcrumb (convenience wrapper)
 * -------------------------------------------------------------------------- */

export interface BreadcrumbItemData {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface SimpleBreadcrumbProps {
  items: BreadcrumbItemData[];
  /** Show home icon for first item */
  homeIcon?: boolean;
  /** Custom separator */
  separator?: React.ReactNode;
  /** Additional class */
  className?: string;
}

const SimpleBreadcrumb: React.FC<SimpleBreadcrumbProps> = ({
  items,
  homeIcon = false,
  separator,
  className,
}) => {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isFirst = index === 0;

          return (
            <React.Fragment key={index}>
              <BreadcrumbItem>
                {item.icon && (
                  <span className="mr-1.5" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                {isFirst && homeIcon && !item.icon && (
                  <Home className="mr-1.5 h-4 w-4" aria-hidden="true" />
                )}
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator>{separator}</BreadcrumbSeparator>
              )}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
SimpleBreadcrumb.displayName = 'SimpleBreadcrumb';

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  SimpleBreadcrumb,
};

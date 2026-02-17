'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden rounded-full',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-xs',
        sm: 'h-8 w-8 text-sm',
        md: 'h-10 w-10 text-base',
        lg: 'h-12 w-12 text-lg',
        xl: 'h-16 w-16 text-xl',
        '2xl': 'h-20 w-20 text-2xl',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, size, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(avatarVariants({ size }), className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn('aspect-square h-full w-full object-cover', className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-neutral-100 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

/* -----------------------------------------------------------------------------
 * Avatar with Status Indicator
 * -------------------------------------------------------------------------- */

export type AvatarStatus = 'online' | 'offline' | 'away' | 'busy' | 'dnd';

const statusColors: Record<AvatarStatus, string> = {
  online: 'bg-success-500',
  offline: 'bg-neutral-400',
  away: 'bg-warning-500',
  busy: 'bg-danger-500',
  dnd: 'bg-danger-500',
};

export interface AvatarWithStatusProps extends AvatarProps {
  /** Image source */
  src?: string;
  /** Alt text for image */
  alt?: string;
  /** Fallback text (usually initials) */
  fallback: string;
  /** Status indicator */
  status?: AvatarStatus;
}

const AvatarWithStatus = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarWithStatusProps
>(({ src, alt, fallback, status, size, className, ...props }, ref) => (
  <div className="relative inline-flex">
    <Avatar ref={ref} size={size} className={className} {...props}>
      {src && <AvatarImage src={src} alt={alt || fallback} />}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
    {status && (
      <span
        className={cn(
          'absolute bottom-0 right-0 block rounded-full ring-2 ring-white dark:ring-neutral-900',
          statusColors[status],
          size === 'xs' && 'h-1.5 w-1.5',
          size === 'sm' && 'h-2 w-2',
          (size === 'md' || !size) && 'h-2.5 w-2.5',
          size === 'lg' && 'h-3 w-3',
          size === 'xl' && 'h-3.5 w-3.5',
          size === '2xl' && 'h-4 w-4'
        )}
        aria-label={status}
      />
    )}
  </div>
));
AvatarWithStatus.displayName = 'AvatarWithStatus';

/* -----------------------------------------------------------------------------
 * Avatar Group
 * -------------------------------------------------------------------------- */

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum number of avatars to show */
  max?: number;
  /** Size of avatars */
  size?: VariantProps<typeof avatarVariants>['size'];
  /** Avatar elements */
  children: React.ReactNode;
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, max = 3, size = 'md', ...props }, ref) => {
    const childrenArray = React.Children.toArray(children);
    const visibleAvatars = childrenArray.slice(0, max);
    const remainingCount = childrenArray.length - max;

    return (
      <div
        ref={ref}
        className={cn('flex -space-x-2', className)}
        {...props}
      >
        {visibleAvatars.map((child, index) => (
          <div
            key={index}
            className="ring-2 ring-white dark:ring-neutral-900 rounded-full"
          >
            {React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ size?: VariantProps<typeof avatarVariants>['size'] }>, { size })
              : child}
          </div>
        ))}
        {remainingCount > 0 && (
          <Avatar size={size} className="ring-2 ring-white dark:ring-neutral-900">
            <AvatarFallback className="bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
              +{remainingCount}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
  }
);
AvatarGroup.displayName = 'AvatarGroup';

export { Avatar, AvatarImage, AvatarFallback, AvatarWithStatus, AvatarGroup, avatarVariants };

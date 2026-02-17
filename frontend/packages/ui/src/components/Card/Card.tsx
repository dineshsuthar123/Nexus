import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Card Component
 *
 * A versatile card component for displaying content in a contained box.
 * Used as the base for dashboard cards, data cards, and content containers.
 *
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Total Revenue</CardTitle>
 *     <CardDescription>Monthly revenue summary</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <p className="text-3xl font-bold">$125,432.00</p>
 *   </CardContent>
 * </Card>
 */

const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground shadow-sm',
  {
    variants: {
      variant: {
        default: 'border-border',
        elevated: 'border-transparent shadow-md',
        outlined: 'border-2 border-primary/20 shadow-none',
        ghost: 'border-transparent bg-transparent shadow-none',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'none',
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

// ============================================================================
// Dashboard Card - Specialized card for metrics display
// ============================================================================

export interface DashboardCardProps extends Omit<CardProps, 'children'> {
  /**
   * Title of the metric (e.g., "Total Volume")
   */
  title: string;
  /**
   * Main value to display (e.g., "$1,234,567")
   */
  value: string | number;
  /**
   * Optional subtitle or description
   */
  subtitle?: string;
  /**
   * Change percentage from previous period
   */
  change?: number;
  /**
   * Period for the change (e.g., "vs last month")
   */
  changePeriod?: string;
  /**
   * Trend direction (auto-detected from change if not provided)
   */
  trend?: 'up' | 'down' | 'neutral';
  /**
   * Icon to display in the header
   */
  icon?: React.ReactNode;
  /**
   * Whether the card is in a loading state
   */
  loading?: boolean;
  /**
   * Footer content (e.g., a link or action)
   */
  footer?: React.ReactNode;
}

/**
 * Dashboard Card for displaying key metrics
 *
 * @example
 * <DashboardCard
 *   title="Total Payments"
 *   value="$1,234,567"
 *   change={12.5}
 *   changePeriod="vs last month"
 *   icon={<DollarSign />}
 * />
 */
const DashboardCard = React.forwardRef<HTMLDivElement, DashboardCardProps>(
  (
    {
      className,
      title,
      value,
      subtitle,
      change,
      changePeriod = 'vs last period',
      trend: providedTrend,
      icon,
      loading = false,
      footer,
      ...props
    },
    ref
  ) => {
    // Auto-detect trend from change value
    const trend =
      providedTrend ??
      (change !== undefined
        ? change > 0
          ? 'up'
          : change < 0
          ? 'down'
          : 'neutral'
        : undefined);

    const TrendIcon =
      trend === 'up'
        ? TrendingUp
        : trend === 'down'
        ? TrendingDown
        : Minus;

    const trendColor =
      trend === 'up'
        ? 'text-success'
        : trend === 'down'
        ? 'text-danger'
        : 'text-neutral-500';

    return (
      <Card ref={ref} className={cn('relative', className)} {...props}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {icon && (
            <div className="text-muted-foreground" aria-hidden="true">
              {icon}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <div className="h-8 w-24 animate-pulse rounded bg-neutral-200" />
              <div className="h-4 w-16 animate-pulse rounded bg-neutral-200" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold">{value}</div>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
              {change !== undefined && (
                <div className={cn('mt-2 flex items-center gap-1 text-xs', trendColor)}>
                  <TrendIcon className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {change > 0 ? '+' : ''}
                    {change.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">{changePeriod}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
        {footer && <CardFooter>{footer}</CardFooter>}
      </Card>
    );
  }
);
DashboardCard.displayName = 'DashboardCard';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  DashboardCard,
  cardVariants,
};

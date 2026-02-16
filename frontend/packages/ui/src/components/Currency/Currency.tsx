'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { TrendingUp, TrendingDown, Minus, DollarSign, Euro, PoundSterling } from 'lucide-react';
import { cn, formatCurrency, formatCompactNumber } from '../../lib/utils';

/* -----------------------------------------------------------------------------
 * Currency Display - Formatted currency with proper styling
 * -------------------------------------------------------------------------- */

const currencyVariants = cva(
  'inline-flex items-baseline font-mono',
  {
    variants: {
      size: {
        xs: 'text-xs',
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
        '2xl': 'text-2xl',
        '3xl': 'text-3xl',
        '4xl': 'text-4xl',
      },
      weight: {
        normal: 'font-normal',
        medium: 'font-medium',
        semibold: 'font-semibold',
        bold: 'font-bold',
      },
      color: {
        default: 'text-neutral-900 dark:text-neutral-100',
        muted: 'text-neutral-500 dark:text-neutral-400',
        success: 'text-success-600 dark:text-success-400',
        danger: 'text-danger-600 dark:text-danger-400',
      },
    },
    defaultVariants: {
      size: 'md',
      weight: 'medium',
      color: 'default',
    },
  }
);

export interface CurrencyDisplayProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof currencyVariants> {
  /** Amount to display */
  amount: number;
  /** Currency code (USD, EUR, GBP, etc.) */
  currency?: string;
  /** Locale for formatting */
  locale?: string;
  /** Show currency symbol */
  showCurrency?: boolean;
  /** Show +/- sign for positive/negative */
  showSign?: boolean;
  /** Compact format (1K, 1M, etc.) */
  compact?: boolean;
  /** Color based on positive/negative */
  colorBySign?: boolean;
  /** Decimal places */
  decimals?: number;
}

const CurrencyDisplay = React.forwardRef<HTMLSpanElement, CurrencyDisplayProps>(
  (
    {
      className,
      amount,
      currency = 'USD',
      locale = 'en-US',
      showCurrency = true,
      showSign = false,
      compact = false,
      colorBySign = false,
      decimals = 2,
      size,
      weight,
      color,
      ...props
    },
    ref
  ) => {
    const isNegative = amount < 0;
    const isPositive = amount > 0;
    const absoluteAmount = Math.abs(amount);

    // Determine color based on sign if colorBySign is true
    const displayColor = colorBySign
      ? isPositive
        ? 'success'
        : isNegative
        ? 'danger'
        : 'default'
      : color;

    // Format the amount
    const formattedAmount = compact
      ? formatCompactNumber(absoluteAmount)
      : formatCurrency(absoluteAmount, currency, locale);

    // Extract just the number part if we're using custom sign display
    const displayAmount = showSign
      ? formattedAmount
      : formattedAmount;

    const sign = showSign ? (isPositive ? '+' : isNegative ? '−' : '') : '';

    return (
      <span
        ref={ref}
        className={cn(currencyVariants({ size, weight, color: displayColor as 'default' | 'muted' | 'success' | 'danger' | null | undefined }), className)}
        {...props}
      >
        {sign && <span className="mr-0.5">{sign}</span>}
        <span className="tabular-nums">{displayAmount}</span>
      </span>
    );
  }
);
CurrencyDisplay.displayName = 'CurrencyDisplay';

/* -----------------------------------------------------------------------------
 * Percentage Display - Formatted percentage with trend indicator
 * -------------------------------------------------------------------------- */

export interface PercentageDisplayProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof currencyVariants> {
  /** Value as decimal (0.05 = 5%) or percentage (5) */
  value: number;
  /** Whether value is already in percentage form */
  isPercentage?: boolean;
  /** Show trend icon */
  showTrend?: boolean;
  /** Decimal places */
  decimals?: number;
  /** Color based on positive/negative */
  colorBySign?: boolean;
  /** Invert color (negative = good, like expenses down) */
  invertColor?: boolean;
}

const PercentageDisplay = React.forwardRef<HTMLSpanElement, PercentageDisplayProps>(
  (
    {
      className,
      value,
      isPercentage = false,
      showTrend = true,
      decimals = 2,
      colorBySign = true,
      invertColor = false,
      size,
      weight,
      color,
      ...props
    },
    ref
  ) => {
    const percentValue = isPercentage ? value : value * 100;
    const isPositive = percentValue > 0;
    const isNegative = percentValue < 0;
    const isZero = percentValue === 0;

    // Determine color
    let displayColor = color;
    if (colorBySign) {
      if (invertColor) {
        displayColor = isNegative ? 'success' : isPositive ? 'danger' : 'default';
      } else {
        displayColor = isPositive ? 'success' : isNegative ? 'danger' : 'default';
      }
    }

    // Get trend icon
    const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

    return (
      <span
        ref={ref}
        className={cn(
          currencyVariants({ size, weight, color: displayColor as 'default' | 'muted' | 'success' | 'danger' | null | undefined }),
          'inline-flex items-center gap-1',
          className
        )}
        {...props}
      >
        {showTrend && !isZero && (
          <TrendIcon className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="tabular-nums">
          {isPositive && '+'}
          {percentValue.toFixed(decimals)}%
        </span>
      </span>
    );
  }
);
PercentageDisplay.displayName = 'PercentageDisplay';

/* -----------------------------------------------------------------------------
 * Account Balance - Complete balance display with account info
 * -------------------------------------------------------------------------- */

export interface AccountBalanceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Account name */
  accountName: string;
  /** Account type */
  accountType?: string;
  /** Current balance */
  balance: number;
  /** Currency */
  currency?: string;
  /** Available balance (if different from balance) */
  availableBalance?: number;
  /** Pending amount */
  pendingAmount?: number;
  /** Account number (masked) */
  accountNumber?: string;
  /** Show full account details */
  expanded?: boolean;
}

const AccountBalance = React.forwardRef<HTMLDivElement, AccountBalanceProps>(
  (
    {
      className,
      accountName,
      accountType,
      balance,
      currency = 'USD',
      availableBalance,
      pendingAmount,
      accountNumber,
      expanded = false,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900',
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
              {accountName}
            </h3>
            {accountType && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {accountType}
                {accountNumber && ` • ${accountNumber}`}
              </p>
            )}
          </div>
          <CurrencyDisplay
            amount={balance}
            currency={currency}
            size="xl"
            weight="bold"
          />
        </div>

        {expanded && (availableBalance !== undefined || pendingAmount) && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            {availableBalance !== undefined && (
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Available
                </p>
                <CurrencyDisplay
                  amount={availableBalance}
                  currency={currency}
                  size="sm"
                  color="muted"
                />
              </div>
            )}
            {pendingAmount !== undefined && pendingAmount !== 0 && (
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Pending
                </p>
                <CurrencyDisplay
                  amount={pendingAmount}
                  currency={currency}
                  size="sm"
                  color="muted"
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);
AccountBalance.displayName = 'AccountBalance';

/* -----------------------------------------------------------------------------
 * Currency Icon
 * -------------------------------------------------------------------------- */

const currencyIcons: Record<string, React.ElementType> = {
  USD: DollarSign,
  EUR: Euro,
  GBP: PoundSterling,
};

export interface CurrencyIconProps extends React.SVGAttributes<SVGSVGElement> {
  currency: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

const CurrencyIcon = React.forwardRef<SVGSVGElement, CurrencyIconProps>(
  ({ currency, size = 'md', className, ...props }, ref) => {
    const Icon = currencyIcons[currency] || DollarSign;

    return (
      <Icon
        ref={ref}
        className={cn(sizeClasses[size], className)}
        {...props}
      />
    );
  }
);
CurrencyIcon.displayName = 'CurrencyIcon';

export { CurrencyDisplay, PercentageDisplay, AccountBalance, CurrencyIcon, currencyVariants };

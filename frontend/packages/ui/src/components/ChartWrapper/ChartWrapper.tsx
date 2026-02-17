'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

// =============================================================================
// Types
// =============================================================================

export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'donut';

export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
  color?: string;
}

export interface ChartWrapperProps {
  title?: string;
  description?: string;
  series: ChartSeries[];
  type?: ChartType;
  height?: number;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  className?: string;
  /** Show legend */
  showLegend?: boolean;
  /** Formatter for values */
  valueFormatter?: (value: number) => string;
  children?: React.ReactNode;
}

// =============================================================================
// Default Formatters
// =============================================================================

const defaultValueFormatter = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
};

const CHART_COLORS = [
  'hsl(221, 83%, 53%)', // blue
  'hsl(142, 71%, 45%)', // green
  'hsl(0, 84%, 60%)',   // red
  'hsl(38, 92%, 50%)',  // amber
  'hsl(262, 83%, 58%)', // purple
  'hsl(173, 80%, 40%)', // teal
];

// =============================================================================
// ChartWrapper
// =============================================================================

export const ChartWrapper = React.forwardRef<HTMLDivElement, ChartWrapperProps>(
  (
    {
      title,
      description,
      series,
      type: _type = 'bar',
      height = 300,
      loading = false,
      error,
      emptyMessage = 'No data available',
      className,
      showLegend = true,
      valueFormatter = defaultValueFormatter,
      children,
    },
    ref
  ) => {
    const isEmpty = series.length === 0 || series.every((s) => s.data.length === 0);

    return (
      <div
        ref={ref}
        className={cn('rounded-lg border bg-card p-6', className)}
        role="figure"
        aria-label={title || 'Chart'}
      >
        {/* Header */}
        {(title || description) && (
          <div className="mb-4">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        )}

        {/* Chart area */}
        <div style={{ height }} className="relative">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="space-y-3 w-full">
                <div className="flex items-end gap-2 justify-center h-full pb-8">
                  {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
                    <div
                      key={i}
                      className="w-8 animate-pulse rounded-t bg-muted"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-destructive">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Please try refreshing or contact support
              </p>
            </div>
          ) : isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <svg className="mb-2 h-12 w-12 text-muted-foreground/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13L6 9L10 13L14 7L21 14" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17H21" />
              </svg>
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            </div>
          ) : children ? (
            children
          ) : (
            <MiniBarChart
              series={series}
              height={height}
              valueFormatter={valueFormatter}
            />
          )}
        </div>

        {/* Legend */}
        {showLegend && !loading && !error && !isEmpty && series.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {series.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: s.color || CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="text-xs text-muted-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

ChartWrapper.displayName = 'ChartWrapper';

// =============================================================================
// MiniBarChart (simple SVG-based fallback)
// =============================================================================

interface MiniBarChartProps {
  series: ChartSeries[];
  height: number;
  valueFormatter: (value: number) => string;
}

function MiniBarChart({ series, height, valueFormatter }: MiniBarChartProps) {
  const firstSeries = series[0];
  if (!firstSeries || firstSeries.data.length === 0) return null;

  const maxValue = Math.max(...firstSeries.data.map((d) => d.value), 1);
  const barWidth = Math.max(20, Math.min(60, 500 / firstSeries.data.length));
  void barWidth; // reserved for dynamic layout
  const chartHeight = height - 40;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-end gap-1 px-2">
        {firstSeries.data.map((point, _i) => {
          const barHeight = (point.value / maxValue) * chartHeight;
          const color = point.color || firstSeries.color || CHART_COLORS[0];

          return (
            <div
              key={point.label}
              className="group relative flex flex-1 flex-col items-center"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden rounded bg-popover px-2 py-1 text-xs shadow-md group-hover:block z-10">
                <p className="font-medium">{point.label}</p>
                <p className="text-muted-foreground">{valueFormatter(point.value)}</p>
              </div>

              {/* Bar */}
              <div
                className="w-full max-w-[60px] rounded-t transition-all duration-300 hover:opacity-80"
                style={{
                  height: `${barHeight}px`,
                  backgroundColor: color,
                  minHeight: point.value > 0 ? '4px' : '0',
                }}
                role="img"
                aria-label={`${point.label}: ${valueFormatter(point.value)}`}
              />
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="mt-2 flex gap-1 px-2">
        {firstSeries.data.map((point) => (
          <div key={point.label} className="flex-1 text-center">
            <span className="text-[10px] text-muted-foreground truncate block">
              {point.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { CHART_COLORS, defaultValueFormatter };
export default ChartWrapper;

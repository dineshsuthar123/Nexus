'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Sparkline Component
 *
 * A lightweight inline SVG sparkline chart for embedding in metric cards.
 * No external chart library dependency — pure SVG path rendering.
 */

export interface SparklineProps {
  /** Data points to render */
  data: number[];
  /** Width of the SVG */
  width?: number;
  /** Height of the SVG */
  height?: number;
  /** Stroke color (CSS color string or Tailwind-compatible) */
  color?: string;
  /** Whether to show the gradient fill under the line */
  showFill?: boolean;
  /** Stroke width */
  strokeWidth?: number;
  /** Whether to animate on mount */
  animated?: boolean;
  /** Additional class names */
  className?: string;
}

function buildPath(data: number[], width: number, height: number, padding = 2): string {
  if (data.length < 2) return '';

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * usableWidth;
    const y = padding + usableHeight - ((value - min) / range) * usableHeight;
    return { x, y };
  });

  // Create smooth curve using quadratic bezier
  let path = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    if (i === 0) {
      path += ` Q ${current.x},${current.y} ${midX},${midY}`;
    } else {
      path += ` Q ${current.x},${current.y} ${midX},${midY}`;
    }
  }

  // Connect to the last point
  const last = points[points.length - 1];
  path += ` T ${last.x},${last.y}`;

  return path;
}

function buildFillPath(data: number[], width: number, height: number, padding = 2): string {
  const linePath = buildPath(data, width, height, padding);
  if (!linePath) return '';

  const usableWidth = width - padding * 2;

  return `${linePath} L ${padding + usableWidth},${height} L ${padding},${height} Z`;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'currentColor',
  showFill = true,
  strokeWidth = 1.5,
  animated = true,
  className,
}: SparklineProps) {
  const id = React.useId();
  const gradientId = `sparkline-gradient-${id}`;

  if (!data || data.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }

  const linePath = buildPath(data, width, height);
  const fillPath = buildFillPath(data, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={cn('overflow-visible', animated && 'animate-count-up', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Fill area */}
      {showFill && fillPath && (
        <path
          d={fillPath}
          fill={`url(#${gradientId})`}
        />
      )}

      {/* Line */}
      <path
        d={linePath}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* End dot */}
      {data.length > 0 && (() => {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        const lastValue = data[data.length - 1];
        const x = 2 + ((data.length - 1) / (data.length - 1)) * (width - 4);
        const y = 2 + (height - 4) - ((lastValue - min) / range) * (height - 4);
        return (
          <circle
            cx={x}
            cy={y}
            r={2}
            fill={color}
            className={animated ? 'animate-pulse-dot' : ''}
          />
        );
      })()}
    </svg>
  );
}

/**
 * Pre-configured Sparkline variants for common metric card use cases
 */
export function TrendSparkline({
  data,
  positive,
  className,
  ...props
}: Omit<SparklineProps, 'color'> & { positive?: boolean }) {
  const isPositive = positive ?? (data.length >= 2 && data[data.length - 1] >= data[0]);
  const color = isPositive
    ? 'rgb(34, 197, 94)' // success-500
    : 'rgb(239, 68, 68)'; // danger-500

  return <Sparkline data={data} color={color} className={className} {...props} />;
}

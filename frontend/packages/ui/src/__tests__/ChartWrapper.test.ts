/**
 * ChartWrapper Component Tests
 */

import { describe, it, expect } from 'vitest';

describe('ChartWrapper', () => {
  it('should export the component', async () => {
    const mod = await import('../../components/ChartWrapper/ChartWrapper');
    expect(mod.ChartWrapper).toBeDefined();
    expect(mod.ChartWrapper.displayName).toBe('ChartWrapper');
  });

  it('should export chart utilities', async () => {
    const mod = await import('../../components/ChartWrapper/ChartWrapper');
    expect(mod.CHART_COLORS).toBeDefined();
    expect(mod.defaultValueFormatter).toBeDefined();
    expect(Array.isArray(mod.CHART_COLORS)).toBe(true);
    expect(mod.CHART_COLORS.length).toBeGreaterThan(0);
  });

  it('should format values correctly', async () => {
    const mod = await import('../../components/ChartWrapper/ChartWrapper');
    const fmt = mod.defaultValueFormatter;

    expect(fmt(500)).toBe('500');
    expect(fmt(1500)).toBe('1.5K');
    expect(fmt(1500000)).toBe('1.5M');
  });
});

/**
 * Nexus RTP Platform - React Query Hooks for Analytics/Dashboard
 * 
 * Custom hooks for fetching dashboard analytics data.
 */

import { useQuery } from '@tanstack/react-query';

import { get, ANALYTICS_ENDPOINTS } from '@/lib/api';
import type { 
  DashboardSummary, 
  VolumeData, 
  PerformanceMetrics,
  SystemHealth,
} from '@/lib/api/types';

// =============================================================================
// Query Keys
// =============================================================================

export const analyticsKeys = {
  all: ['analytics'] as const,
  summary: () => [...analyticsKeys.all, 'summary'] as const,
  volume: (period: string) => [...analyticsKeys.all, 'volume', period] as const,
  performance: () => [...analyticsKeys.all, 'performance'] as const,
  trends: (period: string) => [...analyticsKeys.all, 'trends', period] as const,
  health: () => [...analyticsKeys.all, 'health'] as const,
};

// =============================================================================
// Types
// =============================================================================

interface TrendData {
  date: string;
  volume: number;
  value: number;
  successRate: number;
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch dashboard summary data
 */
export function useDashboardSummary(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: analyticsKeys.summary(),
    queryFn: async () => {
      const response = await get<DashboardSummary>(ANALYTICS_ENDPOINTS.SUMMARY);
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Fetch volume analytics data
 */
export function useVolumeAnalytics(
  period: '24h' | '7d' | '30d' | '90d' = '7d',
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: analyticsKeys.volume(period),
    queryFn: async () => {
      const response = await get<VolumeData[]>(ANALYTICS_ENDPOINTS.VOLUME, {
        params: { period },
      });
      return response.data;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch performance metrics
 */
export function usePerformanceMetrics(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: analyticsKeys.performance(),
    queryFn: async () => {
      const response = await get<PerformanceMetrics>(ANALYTICS_ENDPOINTS.PERFORMANCE);
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Fetch trend data for charts
 */
export function useTrendData(
  period: '24h' | '7d' | '30d' | '90d' = '7d',
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: analyticsKeys.trends(period),
    queryFn: async () => {
      const response = await get<TrendData[]>(ANALYTICS_ENDPOINTS.TRENDS, {
        params: { period },
      });
      return response.data;
    },
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch system health status
 */
export function useSystemHealth(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: analyticsKeys.health(),
    queryFn: async () => {
      const response = await get<SystemHealth>(ANALYTICS_ENDPOINTS.HEALTH);
      return response.data;
    },
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: options?.refetchInterval || 30 * 1000, // Default: every 30 seconds
  });
}

// =============================================================================
// Combined Dashboard Data Hook
// =============================================================================

/**
 * Combined hook for all dashboard data
 * Fetches summary, volume, and performance in parallel
 */
export function useDashboardData(options?: { refetchInterval?: number }) {
  const summary = useDashboardSummary({ refetchInterval: options?.refetchInterval });
  const volume = useVolumeAnalytics('7d');
  const performance = usePerformanceMetrics({ refetchInterval: options?.refetchInterval });
  const health = useSystemHealth({ refetchInterval: options?.refetchInterval });

  return {
    summary,
    volume,
    performance,
    health,
    isLoading: summary.isLoading || volume.isLoading || performance.isLoading || health.isLoading,
    isError: summary.isError || volume.isError || performance.isError || health.isError,
    error: summary.error || volume.error || performance.error || health.error,
    refetch: () => {
      summary.refetch();
      volume.refetch();
      performance.refetch();
      health.refetch();
    },
  };
}

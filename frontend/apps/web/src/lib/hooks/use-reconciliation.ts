/**
 * Nexus RTP Platform - React Query Hooks for Reconciliation
 * 
 * Custom hooks for reconciliation operations using React Query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { get, post, RECONCILIATION_ENDPOINTS, buildQueryParams } from '@/lib/api';
import type { 
  ReconciliationCycle, 
  Discrepancy,
  PaginatedResponse,
  ReconciliationFilters,
  Pagination,
} from '@/lib/api/types';

// =============================================================================
// Query Keys
// =============================================================================

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  cycles: () => [...reconciliationKeys.all, 'cycles'] as const,
  cycleList: (filters: ReconciliationFilters, pagination?: Pagination) => 
    [...reconciliationKeys.cycles(), { filters, pagination }] as const,
  cycle: (id: string) => [...reconciliationKeys.cycles(), id] as const,
  discrepancies: (cycleId: string) => [...reconciliationKeys.cycle(cycleId), 'discrepancies'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch list of reconciliation cycles
 */
export function useReconciliationCycles(
  filters: ReconciliationFilters = {},
  pagination: Pagination = { page: 1, pageSize: 20 }
) {
  return useQuery({
    queryKey: reconciliationKeys.cycleList(filters, pagination),
    queryFn: async () => {
      const params = buildQueryParams(filters, pagination);
      const response = await get<PaginatedResponse<ReconciliationCycle>>(
        RECONCILIATION_ENDPOINTS.LIST_CYCLES,
        { params }
      );
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch a single reconciliation cycle
 */
export function useReconciliationCycle(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: reconciliationKeys.cycle(id),
    queryFn: async () => {
      const response = await get<ReconciliationCycle>(RECONCILIATION_ENDPOINTS.GET_CYCLE(id));
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch discrepancies for a reconciliation cycle
 */
export function useDiscrepancies(
  cycleId: string,
  pagination: Pagination = { page: 1, pageSize: 50 },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [...reconciliationKeys.discrepancies(cycleId), pagination],
    queryFn: async () => {
      const params = buildQueryParams({}, pagination);
      const response = await get<PaginatedResponse<Discrepancy>>(
        RECONCILIATION_ENDPOINTS.GET_DISCREPANCIES(cycleId),
        { params }
      );
      return response.data;
    },
    enabled: options?.enabled !== false && !!cycleId,
    staleTime: 30 * 1000,
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Run a new reconciliation cycle
 */
export function useRunReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      startDate: string;
      endDate: string;
      accountIds?: string[];
      includeSettled?: boolean;
      autoResolve?: boolean;
    }) => {
      const response = await post<ReconciliationCycle>(RECONCILIATION_ENDPOINTS.RUN, data);
      return response.data;
    },
    onSuccess: (newCycle) => {
      // Add to cache
      queryClient.setQueryData(reconciliationKeys.cycle(newCycle.id), newCycle);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.cycles() });
    },
  });
}

/**
 * Resolve a discrepancy
 */
export function useResolveDiscrepancy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      resolution, 
      notes,
      adjustmentAmount,
    }: {
      id: string;
      resolution: 'ACCEPT_SOURCE' | 'ACCEPT_TARGET' | 'MANUAL' | 'IGNORE';
      notes: string;
      adjustmentAmount?: number;
    }) => {
      const response = await post<Discrepancy>(
        RECONCILIATION_ENDPOINTS.RESOLVE_DISCREPANCY(id),
        { resolution, notes, adjustmentAmount }
      );
      return response.data;
    },
    onSuccess: (resolvedDiscrepancy) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ 
        queryKey: reconciliationKeys.cycle(resolvedDiscrepancy.cycleId) 
      });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook to prefetch a reconciliation cycle
 */
export function usePrefetchReconciliationCycle() {
  const queryClient = useQueryClient();

  return useCallback(
    (id: string) => {
      return queryClient.prefetchQuery({
        queryKey: reconciliationKeys.cycle(id),
        queryFn: async () => {
          const response = await get<ReconciliationCycle>(RECONCILIATION_ENDPOINTS.GET_CYCLE(id));
          return response.data;
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}

/**
 * Hook to invalidate reconciliation queries
 */
export function useInvalidateReconciliation() {
  const queryClient = useQueryClient();

  return useCallback(
    (cycleId?: string) => {
      if (cycleId) {
        queryClient.invalidateQueries({ queryKey: reconciliationKeys.cycle(cycleId) });
      }
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.cycles() });
    },
    [queryClient]
  );
}

// =============================================================================
// Polling Hook for Active Reconciliation
// =============================================================================

/**
 * Poll for reconciliation cycle updates while in progress
 */
export function useReconciliationCyclePolling(
  id: string,
  options?: { 
    enabled?: boolean;
    onComplete?: (cycle: ReconciliationCycle) => void;
  }
) {
  return useQuery({
    queryKey: [...reconciliationKeys.cycle(id), 'polling'],
    queryFn: async () => {
      const response = await get<ReconciliationCycle>(RECONCILIATION_ENDPOINTS.GET_CYCLE(id));
      
      // Call onComplete callback when reconciliation finishes
      if (
        options?.onComplete && 
        (response.data.status === 'COMPLETED' || response.data.status === 'FAILED')
      ) {
        options.onComplete(response.data);
      }
      
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    refetchInterval: (data) => {
      // Stop polling when completed or failed
      if (data?.state?.data?.status === 'COMPLETED' || data?.state?.data?.status === 'FAILED') {
        return false;
      }
      return 5000; // Poll every 5 seconds while in progress
    },
    staleTime: 0,
  });
}

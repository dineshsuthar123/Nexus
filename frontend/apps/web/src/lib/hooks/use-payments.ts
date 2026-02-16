/**
 * Nexus RTP Platform - React Query Hooks for Payments
 *
 * Custom hooks for payment operations using React Query.
 */

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { get, postIdempotent, put, PAYMENT_ENDPOINTS, buildQueryParams } from '@/lib/api';
import type {
  Payment,
  CreatePaymentRequest,
  PaginatedResponse,
  PaymentFilters,
  Pagination,
} from '@/lib/api/types';

// =============================================================================
// Query Keys
// =============================================================================

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (filters: PaymentFilters, pagination?: Pagination) =>
    [...paymentKeys.lists(), { filters, pagination }] as const,
  details: () => [...paymentKeys.all, 'detail'] as const,
  detail: (uetr: string) => [...paymentKeys.details(), uetr] as const,
  status: (uetr: string) => [...paymentKeys.detail(uetr), 'status'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch paginated list of payments
 */
export function usePayments(
  filters: PaymentFilters = {},
  pagination: Pagination = { page: 1, pageSize: 20 }
) {
  return useQuery({
    queryKey: paymentKeys.list(filters, pagination),
    queryFn: async () => {
      const params = buildQueryParams(filters, pagination);
      const response = await get<PaginatedResponse<Payment>>(
        PAYMENT_ENDPOINTS.BASE,
        { params }
      );
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch infinite scrolling list of payments
 */
export function useInfinitePayments(
  filters: PaymentFilters = {},
  pageSize: number = 20
) {
  return useInfiniteQuery({
    queryKey: [...paymentKeys.lists(), 'infinite', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const params = buildQueryParams(filters, { page: pageParam, pageSize });
      const response = await get<PaginatedResponse<Payment>>(
        PAYMENT_ENDPOINTS.BASE,
        { params }
      );
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const page = lastPage.pagination?.page ?? 1;
      const totalPages = lastPage.pagination?.totalPages ?? 1;
      if (page < totalPages) {
        return page + 1;
      }
      return undefined;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single payment by UETR
 */
export function usePayment(uetr: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: paymentKeys.detail(uetr),
    queryFn: async () => {
      const response = await get<Payment>(PAYMENT_ENDPOINTS.GET_BY_UETR(uetr));
      return response.data;
    },
    enabled: options?.enabled !== false && !!uetr,
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Fetch payment status
 */
export function usePaymentStatus(uetr: string, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: paymentKeys.status(uetr),
    queryFn: async () => {
      const response = await get<{ status: string; updatedAt: string }>(
        PAYMENT_ENDPOINTS.GET_STATUS(uetr)
      );
      return response.data;
    },
    enabled: options?.enabled !== false && !!uetr,
    refetchInterval: options?.refetchInterval,
    staleTime: 5 * 1000, // 5 seconds
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new payment
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePaymentRequest) => {
      const response = await postIdempotent<Payment>(
        PAYMENT_ENDPOINTS.CREATE,
        data
      );
      return response.data;
    },
    onSuccess: (newPayment) => {
      // Add to cache
      queryClient.setQueryData(paymentKeys.detail(newPayment.uetr), newPayment);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    },
  });
}

/**
 * Settle a payment
 */
export function useSettlePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uetr: string) => {
      const response = await put<Payment>(PAYMENT_ENDPOINTS.SETTLE(uetr), {});
      return response.data;
    },
    onSuccess: (updatedPayment) => {
      // Update cache
      queryClient.setQueryData(paymentKeys.detail(updatedPayment.uetr), updatedPayment);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    },
  });
}

/**
 * Return a payment
 */
export function useReturnPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uetr, reason }: { uetr: string; reason: string }) => {
      const response = await put<Payment>(PAYMENT_ENDPOINTS.RETURN(uetr), { reason });
      return response.data;
    },
    onSuccess: (updatedPayment) => {
      queryClient.setQueryData(paymentKeys.detail(updatedPayment.uetr), updatedPayment);
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    },
  });
}

/**
 * Cancel a payment
 */
export function useCancelPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uetr, reason }: { uetr: string; reason: string }) => {
      const response = await put<Payment>(PAYMENT_ENDPOINTS.CANCEL(uetr), { reason });
      return response.data;
    },
    onSuccess: (updatedPayment) => {
      queryClient.setQueryData(paymentKeys.detail(updatedPayment.uetr), updatedPayment);
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook to prefetch a payment
 */
export function usePrefetchPayment() {
  const queryClient = useQueryClient();

  return useCallback(
    (uetr: string) => {
      return queryClient.prefetchQuery({
        queryKey: paymentKeys.detail(uetr),
        queryFn: async () => {
          const response = await get<Payment>(PAYMENT_ENDPOINTS.GET_BY_UETR(uetr));
          return response.data;
        },
        staleTime: 10 * 1000,
      });
    },
    [queryClient]
  );
}

/**
 * Hook to invalidate payment queries
 */
export function useInvalidatePayments() {
  const queryClient = useQueryClient();

  return useCallback(
    (uetr?: string) => {
      if (uetr) {
        queryClient.invalidateQueries({ queryKey: paymentKeys.detail(uetr) });
      }
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    },
    [queryClient]
  );
}

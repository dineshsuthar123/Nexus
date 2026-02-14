/**
 * Nexus RTP Platform - React Query Hooks for Accounts
 * 
 * Custom hooks for account operations using React Query.
 */

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { get, post, put, ACCOUNT_ENDPOINTS, buildQueryParams } from '@/lib/api';
import type { 
  Account, 
  CreateAccountRequest, 
  UpdateAccountRequest,
  Balance,
  PaginatedResponse,
  AccountFilters,
  Pagination,
} from '@/lib/api/types';

// =============================================================================
// Query Keys
// =============================================================================

export const accountKeys = {
  all: ['accounts'] as const,
  lists: () => [...accountKeys.all, 'list'] as const,
  list: (filters: AccountFilters, pagination?: Pagination) => 
    [...accountKeys.lists(), { filters, pagination }] as const,
  details: () => [...accountKeys.all, 'detail'] as const,
  detail: (id: string) => [...accountKeys.details(), id] as const,
  balance: (id: string) => [...accountKeys.detail(id), 'balance'] as const,
  transactions: (id: string) => [...accountKeys.detail(id), 'transactions'] as const,
  audit: (id: string) => [...accountKeys.detail(id), 'audit'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch paginated list of accounts
 */
export function useAccounts(
  filters: AccountFilters = {},
  pagination: Pagination = { page: 1, pageSize: 20 }
) {
  return useQuery({
    queryKey: accountKeys.list(filters, pagination),
    queryFn: async () => {
      const params = buildQueryParams(filters, pagination);
      const response = await get<PaginatedResponse<Account>>(
        ACCOUNT_ENDPOINTS.BASE,
        { params }
      );
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch infinite scrolling list of accounts
 */
export function useInfiniteAccounts(
  filters: AccountFilters = {},
  pageSize: number = 20
) {
  return useInfiniteQuery({
    queryKey: [...accountKeys.lists(), 'infinite', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const params = buildQueryParams(filters, { page: pageParam, pageSize });
      const response = await get<PaginatedResponse<Account>>(
        ACCOUNT_ENDPOINTS.BASE,
        { params }
      );
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch a single account by ID
 */
export function useAccount(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: async () => {
      const response = await get<Account>(ACCOUNT_ENDPOINTS.GET_BY_ID(id));
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch account balance
 */
export function useAccountBalance(id: string, options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: accountKeys.balance(id),
    queryFn: async () => {
      const response = await get<Balance>(ACCOUNT_ENDPOINTS.GET_BALANCE(id));
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    refetchInterval: options?.refetchInterval,
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Fetch account transactions
 */
export function useAccountTransactions(
  id: string,
  pagination: Pagination = { page: 1, pageSize: 50 },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: [...accountKeys.transactions(id), pagination],
    queryFn: async () => {
      const params = buildQueryParams({}, pagination);
      const response = await get<PaginatedResponse<{
        id: string;
        type: 'CREDIT' | 'DEBIT';
        amount: number;
        currency: string;
        description: string;
        reference: string;
        createdAt: string;
      }>>(ACCOUNT_ENDPOINTS.GET_TRANSACTIONS(id), { params });
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch account audit trail
 */
export function useAccountAudit(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: accountKeys.audit(id),
    queryFn: async () => {
      const response = await get<{
        entries: Array<{
          id: string;
          action: string;
          actor: string;
          timestamp: string;
          changes: Record<string, { old: unknown; new: unknown }>;
        }>;
      }>(ACCOUNT_ENDPOINTS.GET_AUDIT(id));
      return response.data;
    },
    enabled: options?.enabled !== false && !!id,
    staleTime: 60 * 1000,
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new account
 */
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAccountRequest) => {
      const response = await post<Account>(ACCOUNT_ENDPOINTS.CREATE, data);
      return response.data;
    },
    onSuccess: (newAccount) => {
      // Add to cache
      queryClient.setQueryData(accountKeys.detail(newAccount.id), newAccount);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}

/**
 * Update an account
 */
export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccountRequest }) => {
      const response = await put<Account>(ACCOUNT_ENDPOINTS.GET_BY_ID(id), data);
      return response.data;
    },
    onSuccess: (updatedAccount) => {
      queryClient.setQueryData(accountKeys.detail(updatedAccount.id), updatedAccount);
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}

/**
 * Update account status (activate/suspend/close)
 */
export function useUpdateAccountStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const response = await put<Account>(ACCOUNT_ENDPOINTS.UPDATE_STATUS(id), { status, reason });
      return response.data;
    },
    onSuccess: (updatedAccount) => {
      queryClient.setQueryData(accountKeys.detail(updatedAccount.id), updatedAccount);
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}

/**
 * Update account KYC status
 */
export function useUpdateAccountKyc() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, kycData }: { 
      id: string; 
      kycData: {
        status: 'PENDING' | 'VERIFIED' | 'REJECTED';
        verifiedAt?: string;
        documents?: string[];
        notes?: string;
      };
    }) => {
      const response = await put<Account>(ACCOUNT_ENDPOINTS.UPDATE_KYC(id), kycData);
      return response.data;
    },
    onSuccess: (updatedAccount) => {
      queryClient.setQueryData(accountKeys.detail(updatedAccount.id), updatedAccount);
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook to prefetch an account
 */
export function usePrefetchAccount() {
  const queryClient = useQueryClient();

  return useCallback(
    (id: string) => {
      return queryClient.prefetchQuery({
        queryKey: accountKeys.detail(id),
        queryFn: async () => {
          const response = await get<Account>(ACCOUNT_ENDPOINTS.GET_BY_ID(id));
          return response.data;
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient]
  );
}

/**
 * Hook to invalidate account queries
 */
export function useInvalidateAccounts() {
  const queryClient = useQueryClient();

  return useCallback(
    (id?: string) => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: accountKeys.detail(id) });
      }
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    },
    [queryClient]
  );
}

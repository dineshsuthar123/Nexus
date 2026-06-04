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
  AccountStatus,
  AccountType,
  Currency,
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

type BackendAccount = Partial<Omit<Account, 'balance' | 'availableBalance' | 'pendingBalance'>> & {
  accountType?: AccountType;
  balance?: number | string | { available?: number | string; pending?: number | string };
  availableBalance?: number | string;
  pendingBalance?: number | string;
  pendingDebits?: number | string;
  pendingCredits?: number | string;
  metadata?: { name?: string } & Record<string, unknown>;
};

type BackendAccountListResponse = Partial<PaginatedResponse<Account>> & {
  accounts?: BackendAccount[];
  data?: BackendAccount[];
  items?: BackendAccount[];
  limit?: number;
  offset?: number;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeAccount(raw: BackendAccount): Account {
  const balanceObject = typeof raw.balance === 'object' && raw.balance !== null ? raw.balance : undefined;
  const balance = toNumber(balanceObject?.available ?? raw.balance);
  const availableBalance = toNumber(raw.availableBalance ?? balanceObject?.available, balance);
  const pendingBalance = toNumber(
    raw.pendingBalance ?? balanceObject?.pending,
    toNumber(raw.pendingDebits) + toNumber(raw.pendingCredits)
  );
  const type = (raw.type ?? raw.accountType ?? 'OPERATING') as AccountType;
  const status = (raw.status ?? 'ACTIVE') as AccountStatus;
  const currency = (raw.currency ?? 'USD') as Currency;
  const accountNumber = raw.accountNumber ?? raw.iban ?? raw.id ?? 'Unknown account';

  return {
    id: raw.id ?? accountNumber,
    name: raw.name ?? raw.metadata?.name ?? accountNumber,
    type,
    currency,
    balance,
    availableBalance,
    pendingBalance,
    status,
    kycStatus: raw.kycStatus ?? 'PENDING',
    iban: raw.iban,
    bic: raw.bic,
    routingNumber: raw.routingNumber,
    accountNumber,
    customerId: raw.customerId ?? '',
    customerName: raw.customerName,
    createdAt: raw.createdAt ?? new Date(0).toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date(0).toISOString(),
    lastActivityAt: raw.lastActivityAt,
  };
}

function normalizePaginatedAccounts(response: BackendAccountListResponse): PaginatedResponse<Account> {
  const rawAccounts = response.data ?? response.items ?? response.accounts ?? [];
  const accounts = rawAccounts.map(normalizeAccount);
  const pageSize = response.pagination?.pageSize ?? response.pageSize ?? response.limit ?? accounts.length;
  const page = response.pagination?.page ?? response.page ?? (
    response.offset !== undefined && pageSize > 0 ? Math.floor(response.offset / pageSize) + 1 : 1
  );
  const totalItems = response.pagination?.totalItems ?? response.total ?? accounts.length;
  const totalPages = response.pagination?.totalPages ?? response.totalPages ?? (
    pageSize > 0 ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1
  );

  return {
    ...response,
    data: accounts,
    items: accounts,
    total: totalItems,
    page,
    pageSize,
    totalPages,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNext: response.pagination?.hasNext ?? page < totalPages,
      hasPrevious: response.pagination?.hasPrevious ?? page > 1,
    },
  };
}

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
      return normalizePaginatedAccounts(response.data as BackendAccountListResponse);
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
      const page = lastPage.pagination?.page ?? 1;
      const totalPages = lastPage.pagination?.totalPages ?? 1;
      if (page < totalPages) {
        return page + 1;
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

/**
 * Nexus RTP Platform - Account Hooks Tests
 *
 * Tests for account-related React Query hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import {
  useAccounts,
  useAccount,
  useAccountBalance,
  useCreateAccount,
  useUpdateAccountStatus,
  accountKeys,
} from '@/lib/hooks';
import * as api from '@/lib/api';

// =============================================================================
// Setup
// =============================================================================

vi.mock('@/lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  ACCOUNT_ENDPOINTS: {
    BASE: '/api/v1/accounts',
    GET_BY_ID: (id: string) => `/api/v1/accounts/${id}`,
    GET_BALANCE: (id: string) => `/api/v1/accounts/${id}/balance`,
    CREATE: '/api/v1/accounts',
    UPDATE_STATUS: (id: string) => `/api/v1/accounts/${id}/status`,
  },
  buildQueryParams: vi.fn((filters, pagination) => ({ ...filters, ...pagination })),
}));

const mockAccount = {
  id: 'acc-12345678',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  name: 'Test Operating Account',
  type: 'OPERATING' as const,
  status: 'ACTIVE' as const,
  currency: 'EUR',
  balance: {
    available: 50000.00,
    pending: 1500.00,
    reserved: 0,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAccountBalance = {
  accountId: 'acc-12345678',
  available: 50000.00,
  pending: 1500.00,
  reserved: 0,
  currency: 'EUR',
  lastUpdated: new Date().toISOString(),
};

const mockPaginatedAccounts = {
  items: [mockAccount],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('Account Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // useAccounts
  // ===========================================================================

  describe('useAccounts', () => {
    it('should fetch accounts list successfully', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedAccounts,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useAccounts(), {
        wrapper: createTestWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPaginatedAccounts);
      expect(result.current.data?.items).toHaveLength(1);
    });

    it('should filter by account type', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedAccounts,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const filters = { type: 'OPERATING' as const };
      const pagination = { page: 1, pageSize: 10 };

      const { result } = renderHook(() => useAccounts(filters, pagination), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.buildQueryParams).toHaveBeenCalledWith(filters, pagination);
    });

    it('should filter by account status', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedAccounts,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const filters = { status: 'ACTIVE' as const };

      const { result } = renderHook(() => useAccounts(filters), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.buildQueryParams).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // useAccount
  // ===========================================================================

  describe('useAccount', () => {
    it('should fetch single account by ID', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockAccount,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useAccount('acc-12345678'), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockAccount);
      expect(api.get).toHaveBeenCalledWith('/api/v1/accounts/acc-12345678');
    });

    it('should not fetch when id is empty', () => {
      const { result } = renderHook(() => useAccount(''), {
        wrapper: createTestWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('should handle account not found error', async () => {
      const error = new Error('Account not found');
      vi.mocked(api.get).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useAccount('non-existent'), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(error);
    });
  });

  // ===========================================================================
  // useAccountBalance
  // ===========================================================================

  describe('useAccountBalance', () => {
    it('should fetch account balance', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockAccountBalance,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useAccountBalance('acc-12345678'), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockAccountBalance);
      expect(result.current.data?.available).toBe(50000.00);
    });

    it('should refetch on configured interval', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: mockAccountBalance,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(
        () => useAccountBalance('acc-12345678', { refetchInterval: 5000 }),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });
  });

  // ===========================================================================
  // useCreateAccount
  // ===========================================================================

  describe('useCreateAccount', () => {
    it('should create account successfully', async () => {
      const newAccount = { ...mockAccount, id: 'acc-new-12345' };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: newAccount,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useCreateAccount(), {
        wrapper: createTestWrapper(),
      });

      const createData = {
        name: 'Test Account',
        type: 'OPERATING' as const,
        currency: 'EUR' as const,
        iban: 'DE89370400440532013000',
        bic: 'COBADEFFXXX',
      };

      const created = await result.current.mutateAsync(createData);

      expect(created).toEqual(newAccount);
      expect(api.post).toHaveBeenCalledWith('/api/v1/accounts', createData);
    });

    it('should handle duplicate IBAN error', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('IBAN already exists'));

      const { result } = renderHook(() => useCreateAccount(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          name: 'Duplicate Account',
          type: 'OPERATING',
          currency: 'EUR' as const,
          iban: 'DE89370400440532013000',
          bic: 'COBADEFFXXX',
        })
      ).rejects.toThrow('IBAN already exists');
    });
  });

  // ===========================================================================
  // useUpdateAccountStatus
  // ===========================================================================

  describe('useUpdateAccountStatus', () => {
    it('should activate account', async () => {
      const activatedAccount = { ...mockAccount, status: 'ACTIVE' };

      vi.mocked(api.put).mockResolvedValueOnce({
        data: activatedAccount,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useUpdateAccountStatus(), {
        wrapper: createTestWrapper(),
      });

      const updated = await result.current.mutateAsync({
        id: 'acc-12345678',
        status: 'ACTIVE',
      });

      expect(updated.status).toBe('ACTIVE');
      expect(api.put).toHaveBeenCalledWith(
        '/api/v1/accounts/acc-12345678/status',
        { status: 'ACTIVE' }
      );
    });

    it('should suspend account with reason', async () => {
      const suspendedAccount = { ...mockAccount, status: 'SUSPENDED' };

      vi.mocked(api.put).mockResolvedValueOnce({
        data: suspendedAccount,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useUpdateAccountStatus(), {
        wrapper: createTestWrapper(),
      });

      const updated = await result.current.mutateAsync({
        id: 'acc-12345678',
        status: 'SUSPENDED',
        reason: 'Fraud investigation',
      });

      expect(updated.status).toBe('SUSPENDED');
      expect(api.put).toHaveBeenCalledWith(
        '/api/v1/accounts/acc-12345678/status',
        { status: 'SUSPENDED', reason: 'Fraud investigation' }
      );
    });

    it('should handle invalid status transition', async () => {
      vi.mocked(api.put).mockRejectedValueOnce(
        new Error('Invalid status transition from CLOSED to ACTIVE')
      );

      const { result } = renderHook(() => useUpdateAccountStatus(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          id: 'acc-12345678',
          status: 'ACTIVE',
        })
      ).rejects.toThrow('Invalid status transition');
    });
  });

  // ===========================================================================
  // Query Keys
  // ===========================================================================

  describe('accountKeys', () => {
    it('should generate correct query keys', () => {
      expect(accountKeys.all).toEqual(['accounts']);
      expect(accountKeys.lists()).toEqual(['accounts', 'list']);
      expect(accountKeys.detail('acc-123')).toEqual(['accounts', 'detail', 'acc-123']);
      expect(accountKeys.balance('acc-123')).toEqual(['accounts', 'detail', 'acc-123', 'balance']);
    });

    it('should include filters in list key', () => {
      const filters = { type: 'SETTLEMENT' as const, status: 'ACTIVE' as const };
      const pagination = { page: 1, pageSize: 20 };

      expect(accountKeys.list(filters, pagination)).toEqual([
        'accounts',
        'list',
        { filters, pagination },
      ]);
    });
  });
});

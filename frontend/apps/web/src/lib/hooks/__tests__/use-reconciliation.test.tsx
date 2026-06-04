/**
 * Nexus RTP Platform - Reconciliation Hooks Tests
 *
 * Tests for reconciliation-related React Query hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import {
  useReconciliationCycles,
  useReconciliationCycle,
  useDiscrepancies,
  useRunReconciliation,
  useResolveDiscrepancy,
  reconciliationKeys,
} from '@/lib/hooks';
import * as api from '@/lib/api';

// =============================================================================
// Setup
// =============================================================================

vi.mock('@/lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  RECONCILIATION_ENDPOINTS: {
    LIST_CYCLES: '/api/v1/reconciliation/cycles',
    GET_CYCLE: (id: string) => `/api/v1/reconciliation/cycles/${id}`,
    GET_DISCREPANCIES: (cycleId: string) => `/api/v1/reconciliation/cycles/${cycleId}/discrepancies`,
    RUN: '/api/v1/reconciliation/run',
    RESOLVE_DISCREPANCY: (id: string) => `/api/v1/reconciliation/discrepancies/${id}/resolve`,
  },
  buildQueryParams: vi.fn((filters, pagination) => ({ ...filters, ...pagination })),
}));

const mockReconciliationCycle = {
  id: 'recon-12345678',
  status: 'COMPLETED' as const,
  accountIds: ['acc-1', 'acc-2'],
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  transactionsProcessed: 1500,
  discrepanciesFound: 3,
  discrepanciesResolved: 2,
  completedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockDiscrepancy = {
  id: 'disc-12345',
  cycleId: 'recon-12345678',
  type: 'AMOUNT_MISMATCH' as const,
  status: 'PENDING' as const,
  sourceTransactionId: 'txn-source-123',
  targetTransactionId: 'txn-target-456',
  sourceAmount: { value: 1000.00, currency: 'EUR' },
  targetAmount: { value: 1100.00, currency: 'EUR' },
  difference: { value: 100.00, currency: 'EUR' },
  description: 'Amount mismatch of €100.00',
  createdAt: new Date().toISOString(),
};

const mockPaginatedCycles = {
  items: [mockReconciliationCycle],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const mockPaginatedDiscrepancies = {
  items: [mockDiscrepancy],
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

// =============================================================================
// Tests
// =============================================================================

describe('Reconciliation Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // useReconciliationCycles
  // ===========================================================================

  describe('useReconciliationCycles', () => {
    it('should fetch reconciliation cycles', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedCycles,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useReconciliationCycles(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data[0]).toMatchObject({
        id: 'recon-12345678',
        status: 'COMPLETED',
        accounts: ['acc-1', 'acc-2'],
        date: '2024-01-01',
        totalTransactions: 1500,
        discrepancyCount: 3,
      });
      expect(result.current.data?.items).toHaveLength(1);
    });

    it('should normalize live reconciliation-service cycle responses', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          cycles: [
            {
              id: 'cycle-live',
              status: 'RUNNING',
              startTime: '2026-06-04T00:00:00.000Z',
              accountIds: ['acc-live'],
              transactionsProcessed: 42,
              matchedCount: 40,
              discrepanciesFound: 2,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useReconciliationCycles(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.data[0]).toMatchObject({
        id: 'cycle-live',
        status: 'RUNNING',
        accounts: ['acc-live'],
        totalTransactions: 42,
        matchedTransactions: 40,
        discrepancyCount: 2,
      });
      expect(result.current.data?.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      });
    });

    it('should filter by status', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedCycles,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const filters = { status: 'COMPLETED' as const };

      const { result } = renderHook(
        () => useReconciliationCycles(filters),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.buildQueryParams).toHaveBeenCalledWith(
        filters,
        { page: 1, pageSize: 20 }
      );
    });

    it('should handle pagination', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { ...mockPaginatedCycles, page: 2, total: 50 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const pagination = { page: 2, pageSize: 20 };

      const { result } = renderHook(
        () => useReconciliationCycles({}, pagination),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.page).toBe(2);
    });
  });

  // ===========================================================================
  // useReconciliationCycle
  // ===========================================================================

  describe('useReconciliationCycle', () => {
    it('should fetch a single reconciliation cycle', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockReconciliationCycle,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(
        () => useReconciliationCycle('recon-12345678'),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockReconciliationCycle);
      expect(result.current.data?.transactionsProcessed).toBe(1500);
    });

    it('should handle not found error', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(
        new Error('Reconciliation cycle not found')
      );

      const { result } = renderHook(
        () => useReconciliationCycle('invalid-id'),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toContain('not found');
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useReconciliationCycle('recon-12345678', { enabled: false }),
        { wrapper: createTestWrapper() }
      );

      expect(result.current.isFetching).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // useDiscrepancies
  // ===========================================================================

  describe('useDiscrepancies', () => {
    it('should fetch discrepancies for a cycle', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedDiscrepancies,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(
        () => useDiscrepancies('recon-12345678'),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPaginatedDiscrepancies);
      expect(result.current.data?.items[0].type).toBe('AMOUNT_MISMATCH');
    });

    it('should handle pagination', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedDiscrepancies,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const pagination = { page: 2, pageSize: 50 };

      const { result } = renderHook(
        () => useDiscrepancies('recon-12345678', pagination),
        { wrapper: createTestWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.buildQueryParams).toHaveBeenCalledWith({}, pagination);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useDiscrepancies('recon-12345678', { page: 1, pageSize: 50 }, { enabled: false }),
        { wrapper: createTestWrapper() }
      );

      expect(result.current.isFetching).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // useRunReconciliation
  // ===========================================================================

  describe('useRunReconciliation', () => {
    it('should start a new reconciliation cycle', async () => {
      const newCycle = { ...mockReconciliationCycle, id: 'recon-new-123', status: 'RUNNING' };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: newCycle,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useRunReconciliation(), {
        wrapper: createTestWrapper(),
      });

      const runParams = {
        accountIds: ['acc-1', 'acc-2'],
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        autoResolve: false,
      };

      const cycle = await result.current.mutateAsync(runParams);

      expect(cycle.status).toBe('RUNNING');
      expect(api.post).toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(
        new Error('Start date cannot be after end date')
      );

      const { result } = renderHook(() => useRunReconciliation(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          startDate: '2024-02-01',
          endDate: '2024-01-01', // Invalid: end before start
        })
      ).rejects.toThrow('Start date cannot be after end date');
    });

    it('should handle concurrent cycle error', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(
        new Error('A reconciliation cycle is already running for these accounts')
      );

      const { result } = renderHook(() => useRunReconciliation(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        })
      ).rejects.toThrow('already running');
    });
  });

  // ===========================================================================
  // useResolveDiscrepancy
  // ===========================================================================

  describe('useResolveDiscrepancy', () => {
    it('should resolve discrepancy with ACCEPT_SOURCE action', async () => {
      const resolved = { ...mockDiscrepancy, status: 'RESOLVED', resolution: 'ACCEPT_SOURCE' };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: resolved,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useResolveDiscrepancy(), {
        wrapper: createTestWrapper(),
      });

      const updated = await result.current.mutateAsync({
        id: 'disc-12345',
        resolution: 'ACCEPT_SOURCE',
        notes: 'Approved by manager',
      });

      expect(updated.status).toBe('RESOLVED');
      expect(api.post).toHaveBeenCalled();
    });

    it('should resolve discrepancy with MANUAL action and adjustment', async () => {
      const resolved = { ...mockDiscrepancy, status: 'RESOLVED', resolution: 'MANUAL' };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: resolved,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useResolveDiscrepancy(), {
        wrapper: createTestWrapper(),
      });

      const updated = await result.current.mutateAsync({
        id: 'disc-12345',
        resolution: 'MANUAL',
        adjustmentAmount: 1050.00,
        notes: 'Split the difference',
      });

      expect(updated.status).toBe('RESOLVED');
    });

    it('should handle already resolved error', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(
        new Error('Discrepancy has already been resolved')
      );

      const { result } = renderHook(() => useResolveDiscrepancy(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          id: 'disc-12345',
          resolution: 'ACCEPT_SOURCE',
          notes: 'Trying again',
        })
      ).rejects.toThrow('already been resolved');
    });
  });

  // ===========================================================================
  // Query Keys
  // ===========================================================================

  describe('reconciliationKeys', () => {
    it('should generate correct query keys', () => {
      expect(reconciliationKeys.all).toEqual(['reconciliation']);
      expect(reconciliationKeys.cycles()).toEqual(['reconciliation', 'cycles']);
      // cycle key includes 'cycles' prefix based on implementation
      expect(reconciliationKeys.cycle('recon-123')).toEqual(['reconciliation', 'cycles', 'recon-123']);
    });

    it('should include filters in cycleList key', () => {
      const filters = { status: 'COMPLETED' as const };
      const pagination = { page: 1, pageSize: 20 };

      expect(reconciliationKeys.cycleList(filters, pagination)).toEqual([
        'reconciliation',
        'cycles',
        { filters, pagination },
      ]);
    });
  });
});

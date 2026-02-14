/**
 * Nexus RTP Platform - Payment Hooks Tests
 * 
 * Tests for payment-related React Query hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import { 
  usePayments, 
  usePayment, 
  useCreatePayment,
  useSettlePayment,
  useReturnPayment,
  paymentKeys,
} from '@/lib/hooks';
import * as api from '@/lib/api';

// =============================================================================
// Setup
// =============================================================================

vi.mock('@/lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  postIdempotent: vi.fn(),
  put: vi.fn(),
  PAYMENT_ENDPOINTS: {
    BASE: '/api/v1/payments',
    GET_BY_UETR: (uetr: string) => `/api/v1/payments/${uetr}`,
    GET_STATUS: (uetr: string) => `/api/v1/payments/${uetr}/status`,
    CREATE: '/api/v1/payments',
    SETTLE: (uetr: string) => `/api/v1/payments/${uetr}/settle`,
    RETURN: (uetr: string) => `/api/v1/payments/${uetr}/return`,
    CANCEL: (uetr: string) => `/api/v1/payments/${uetr}/cancel`,
  },
  buildQueryParams: vi.fn((filters, pagination) => ({ ...filters, ...pagination })),
}));

const mockPayment = {
  uetr: 'test-payment-uetr-12345678',
  status: 'PENDING',
  type: 'INSTANT',
  amount: { value: 1500.50, currency: 'EUR' },
  debtorName: 'Test Debtor',
  debtorAccount: 'DE89370400440532013000',
  debtorBic: 'COBADEFFXXX',
  creditorName: 'Test Creditor',
  creditorAccount: 'FR7630006000011234567890189',
  creditorBic: 'BNPAFRPPXXX',
  remittanceInfo: 'Test payment',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPaginatedPayments = {
  items: [mockPayment],
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

describe('Payment Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // usePayments
  // ===========================================================================

  describe('usePayments', () => {
    it('should fetch payments list successfully', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedPayments,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => usePayments(), {
        wrapper: createTestWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPaginatedPayments);
      expect(result.current.data?.items).toHaveLength(1);
    });

    it('should apply filters correctly', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPaginatedPayments,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const filters = { status: 'PENDING' as const, search: 'test' };
      const pagination = { page: 1, pageSize: 10 };

      const { result } = renderHook(() => usePayments(filters, pagination), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(api.buildQueryParams).toHaveBeenCalledWith(filters, pagination);
    });
  });

  // ===========================================================================
  // usePayment
  // ===========================================================================

  describe('usePayment', () => {
    it('should fetch single payment by UETR', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockPayment,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => usePayment('test-payment-uetr-12345678'), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockPayment);
      expect(api.get).toHaveBeenCalledWith('/api/v1/payments/test-payment-uetr-12345678');
    });

    it('should not fetch when uetr is empty', () => {
      const { result } = renderHook(() => usePayment(''), {
        wrapper: createTestWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('should respect enabled option', () => {
      const { result } = renderHook(
        () => usePayment('test-uetr', { enabled: false }),
        { wrapper: createTestWrapper() }
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(api.get).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // useCreatePayment
  // ===========================================================================

  describe('useCreatePayment', () => {
    it('should create payment successfully', async () => {
      const newPayment = { ...mockPayment, uetr: 'new-payment-uetr' };
      
      vi.mocked(api.postIdempotent).mockResolvedValueOnce({
        data: newPayment,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useCreatePayment(), {
        wrapper: createTestWrapper(),
      });

      const createData = {
        amount: { value: 1500.50, currency: 'EUR' },
        debtorName: 'Test Debtor',
        debtorAccount: 'DE89370400440532013000',
        debtorBic: 'COBADEFFXXX',
        creditorName: 'Test Creditor',
        creditorAccount: 'FR7630006000011234567890189',
        creditorBic: 'BNPAFRPPXXX',
        type: 'INSTANT' as const,
      };

      const createdPayment = await result.current.mutateAsync(createData);

      expect(createdPayment).toEqual(newPayment);
      expect(api.postIdempotent).toHaveBeenCalledWith('/api/v1/payments', createData);
    });

    it('should handle validation errors', async () => {
      vi.mocked(api.postIdempotent).mockRejectedValueOnce(new Error('Invalid IBAN format'));

      const { result } = renderHook(() => useCreatePayment(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          amount: { value: 100, currency: 'EUR' },
          debtorName: 'Test',
          debtorAccount: 'invalid-iban',
          debtorBic: 'COBADEFFXXX',
          creditorName: 'Test',
          creditorAccount: 'FR7630006000011234567890189',
          creditorBic: 'BNPAFRPPXXX',
          type: 'INSTANT',
        })
      ).rejects.toThrow('Invalid IBAN format');
    });
  });

  // ===========================================================================
  // useSettlePayment
  // ===========================================================================

  describe('useSettlePayment', () => {
    it('should settle payment successfully', async () => {
      const settledPayment = { ...mockPayment, status: 'SETTLED' };
      
      vi.mocked(api.put).mockResolvedValueOnce({
        data: settledPayment,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useSettlePayment(), {
        wrapper: createTestWrapper(),
      });

      const updated = await result.current.mutateAsync('test-payment-uetr-12345678');

      expect(updated.status).toBe('SETTLED');
      expect(api.put).toHaveBeenCalledWith(
        '/api/v1/payments/test-payment-uetr-12345678/settle',
        {}
      );
    });
  });

  // ===========================================================================
  // useReturnPayment
  // ===========================================================================

  describe('useReturnPayment', () => {
    it('should return payment with reason', async () => {
      const returnedPayment = { ...mockPayment, status: 'RETURNED' };
      
      vi.mocked(api.put).mockResolvedValueOnce({
        data: returnedPayment,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useReturnPayment(), {
        wrapper: createTestWrapper(),
      });

      const updated = await result.current.mutateAsync({
        uetr: 'test-payment-uetr-12345678',
        reason: 'Customer requested return',
      });

      expect(updated.status).toBe('RETURNED');
      expect(api.put).toHaveBeenCalledWith(
        '/api/v1/payments/test-payment-uetr-12345678/return',
        { reason: 'Customer requested return' }
      );
    });
  });

  // ===========================================================================
  // Query Keys
  // ===========================================================================

  describe('paymentKeys', () => {
    it('should generate correct query keys', () => {
      expect(paymentKeys.all).toEqual(['payments']);
      expect(paymentKeys.lists()).toEqual(['payments', 'list']);
      expect(paymentKeys.detail('test-uetr')).toEqual(['payments', 'detail', 'test-uetr']);
      expect(paymentKeys.status('test-uetr')).toEqual(['payments', 'detail', 'test-uetr', 'status']);
    });

    it('should include filters and pagination in list key', () => {
      const filters = { status: 'PENDING' as const };
      const pagination = { page: 1, pageSize: 20 };
      
      expect(paymentKeys.list(filters, pagination)).toEqual([
        'payments',
        'list',
        { filters, pagination },
      ]);
    });
  });
});

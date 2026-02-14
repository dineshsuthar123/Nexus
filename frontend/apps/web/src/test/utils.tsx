/**
 * Nexus RTP Platform - Test Utilities
 * 
 * Common test utilities and wrappers for React Testing Library.
 */

import { ReactElement, ReactNode } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

// =============================================================================
// Create Test Query Client
// =============================================================================

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// =============================================================================
// Test Wrapper with Providers
// =============================================================================

interface WrapperProps {
  children: ReactNode;
}

function createTestWrapper() {
  const queryClient = createTestQueryClient();

  return function TestWrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

// =============================================================================
// Custom Render with Providers
// =============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.queryClient || createTestQueryClient();

  const Wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

// =============================================================================
// Mock API Responses
// =============================================================================

export const mockPayment = {
  uetr: 'test-payment-uetr-12345678',
  status: 'PENDING' as const,
  type: 'INSTANT' as const,
  amount: {
    value: 1500.50,
    currency: 'EUR',
  },
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

export const mockAccount = {
  id: 'test-account-id-12345678',
  name: 'Test Settlement Account',
  type: 'SETTLEMENT' as const,
  status: 'ACTIVE' as const,
  currency: 'EUR',
  accountNumber: 'ACC001234567890',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  balance: {
    available: 150000.00,
    pending: 5000.00,
    reserved: 10000.00,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  role: 'ADMIN',
  permissions: ['payments:read', 'payments:write', 'accounts:read'],
};

export const mockPaginatedResponse = <T>(items: T[], total?: number) => ({
  items,
  total: total ?? items.length,
  page: 1,
  pageSize: 20,
  totalPages: Math.ceil((total ?? items.length) / 20),
});

// =============================================================================
// Wait Utilities
// =============================================================================

export const waitForLoadingToFinish = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

// =============================================================================
// Mock Functions
// =============================================================================

export const createMockFn = <T extends (...args: any[]) => any>(
  implementation?: T
) => {
  return vi.fn(implementation);
};

// =============================================================================
// API Mock Helpers
// =============================================================================

export function mockApiResponse<T>(data: T, status = 200) {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  };
}

export function mockApiError(message: string, status = 400) {
  const error = new Error(message) as any;
  error.response = {
    data: { message },
    status,
    statusText: 'Bad Request',
  };
  error.isAxiosError = true;
  return error;
}

// =============================================================================
// Re-export testing-library
// =============================================================================

export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

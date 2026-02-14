/**
 * Nexus RTP Platform - Auth Hooks Tests
 * 
 * Tests for authentication React Query hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import { 
  useCurrentUser, 
  useRegister, 
  useForgotPassword,
  useResetPassword,
} from '@/lib/hooks';
import * as api from '@/lib/api';

// =============================================================================
// Setup
// =============================================================================

// Mock the API module
vi.mock('@/lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  AUTH_ENDPOINTS: {
    ME: '/api/v1/auth/me',
    REGISTER: '/api/v1/auth/register',
    FORGOT_PASSWORD: '/api/v1/auth/forgot-password',
    RESET_PASSWORD: '/api/v1/auth/reset-password',
  },
}));

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

describe('Auth Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // useCurrentUser
  // ===========================================================================

  describe('useCurrentUser', () => {
    it('should fetch current user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
      };

      vi.mocked(api.get).mockResolvedValueOnce({
        data: mockUser,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createTestWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockUser);
      expect(api.get).toHaveBeenCalledWith('/api/v1/auth/me');
    });

    it('should handle error when fetching user fails', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Unauthorized'));

      const { result } = renderHook(() => useCurrentUser(), {
        wrapper: createTestWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  // ===========================================================================
  // useRegister
  // ===========================================================================

  describe('useRegister', () => {
    it('should register user successfully', async () => {
      const mockResponse = {
        message: 'Registration successful',
        userId: 'new-user-123',
      };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: mockResponse,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useRegister(), {
        wrapper: createTestWrapper(),
      });

      await result.current.mutateAsync({
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User',
      });

      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/register', {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User',
      });
    });

    it('should handle registration error', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Email already exists'));

      const { result } = renderHook(() => useRegister(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          email: 'existing@example.com',
          password: 'SecurePass123!',
          name: 'Test',
        })
      ).rejects.toThrow('Email already exists');
    });
  });

  // ===========================================================================
  // useForgotPassword
  // ===========================================================================

  describe('useForgotPassword', () => {
    it('should send forgot password request successfully', async () => {
      const mockResponse = {
        message: 'Password reset email sent',
      };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useForgotPassword(), {
        wrapper: createTestWrapper(),
      });

      await result.current.mutateAsync('user@example.com');

      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/forgot-password', {
        email: 'user@example.com',
      });
    });
  });

  // ===========================================================================
  // useResetPassword
  // ===========================================================================

  describe('useResetPassword', () => {
    it('should reset password successfully', async () => {
      const mockResponse = {
        message: 'Password reset successful',
      };

      vi.mocked(api.post).mockResolvedValueOnce({
        data: mockResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const { result } = renderHook(() => useResetPassword(), {
        wrapper: createTestWrapper(),
      });

      await result.current.mutateAsync({
        token: 'reset-token-123',
        password: 'NewSecurePass123!',
      });

      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/reset-password', {
        token: 'reset-token-123',
        password: 'NewSecurePass123!',
      });
    });

    it('should handle invalid token error', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Invalid or expired token'));

      const { result } = renderHook(() => useResetPassword(), {
        wrapper: createTestWrapper(),
      });

      await expect(
        result.current.mutateAsync({
          token: 'expired-token',
          password: 'NewPassword123!',
        })
      ).rejects.toThrow('Invalid or expired token');
    });
  });
});

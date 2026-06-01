/**
 * Nexus RTP Platform - React Query Hooks for Auth
 *
 * Custom hooks for authentication operations using React Query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { get, post, AUTH_ENDPOINTS } from '@/lib/api';
import type {
  User,
  MfaSetupResponse,
  MfaVerifyRequest
} from '@/lib/api/types';

// =============================================================================
// Query Keys
// =============================================================================

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
  mfa: () => [...authKeys.all, 'mfa'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch current user profile
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const response = await get<User>(AUTH_ENDPOINTS.ME);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Register a new user
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      organization?: string;
    }) => {
      const response = await post<{ message: string }>(AUTH_ENDPOINTS.REGISTER, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.all });
    },
  });
}

/**
 * Request password reset
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await post<{ message: string }>(AUTH_ENDPOINTS.FORGOT_PASSWORD, { email });
      return response.data;
    },
  });
}

/**
 * Reset password with token
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (data: { token: string; password: string }) => {
      const response = await post<{ message: string }>(AUTH_ENDPOINTS.RESET_PASSWORD, data);
      return response.data;
    },
  });
}

/**
 * Setup MFA (get QR code)
 */
export function useMfaSetup() {
  return useMutation({
    mutationFn: async () => {
      const response = await post<MfaSetupResponse>(AUTH_ENDPOINTS.MFA_SETUP, {});
      return response.data;
    },
  });
}

/**
 * Verify and enable MFA
 */
export function useMfaVerify() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MfaVerifyRequest) => {
      const response = await post<{ message: string; backupCodes: string[] }>(
        AUTH_ENDPOINTS.MFA_VERIFY,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

/**
 * Disable MFA
 */
export function useMfaDisable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (password: string) => {
      const response = await post<{ message: string }>(AUTH_ENDPOINTS.MFA_DISABLE, { password });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.me() });
    },
  });
}

/**
 * Verify email address
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await post<{ message: string }>(AUTH_ENDPOINTS.VERIFY_EMAIL, { token });
      return response.data;
    },
  });
}

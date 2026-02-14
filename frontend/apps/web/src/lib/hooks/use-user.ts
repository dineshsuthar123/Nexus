import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { USER_ENDPOINTS } from '../api/endpoints';

// ─── Types ──────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organization?: string;
  role: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  organization?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface APIKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  revoked: boolean;
  createdAt: string;
}

export interface CreateAPIKeyRequest {
  name: string;
  permissions?: string[];
  expiresIn?: number; // days
}

export interface CreateAPIKeyResponse {
  id: string;
  name: string;
  key: string; // plaintext, shown only once
  keyPrefix: string;
  permissions: string[];
  expiresAt?: string;
  createdAt: string;
}

// ─── Query Keys ─────────────────────────────────────────────────────

export const userKeys = {
  all: ['users'] as const,
  profile: () => [...userKeys.all, 'profile'] as const,
  apiKeys: () => [...userKeys.all, 'api-keys'] as const,
};

// ─── Profile Hooks ──────────────────────────────────────────────────

export function useUserProfile() {
  return useQuery({
    queryKey: userKeys.profile(),
    queryFn: async (): Promise<UserProfile> => {
      const res = await apiClient.get(USER_ENDPOINTS.PROFILE);
      return res.data.user;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateProfileRequest): Promise<UserProfile> => {
      const res = await apiClient.put(USER_ENDPOINTS.UPDATE_PROFILE, data);
      return res.data.user;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(userKeys.profile(), updatedUser);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: ChangePasswordRequest): Promise<{ message: string }> => {
      const res = await apiClient.post(USER_ENDPOINTS.CHANGE_PASSWORD, data);
      return res.data;
    },
  });
}

// ─── API Key Hooks ──────────────────────────────────────────────────

export function useAPIKeys() {
  return useQuery({
    queryKey: userKeys.apiKeys(),
    queryFn: async (): Promise<APIKey[]> => {
      const res = await apiClient.get(USER_ENDPOINTS.API_KEYS);
      return res.data.apiKeys;
    },
  });
}

export function useCreateAPIKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAPIKeyRequest): Promise<CreateAPIKeyResponse> => {
      const res = await apiClient.post(USER_ENDPOINTS.CREATE_API_KEY, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.apiKeys() });
    },
  });
}

export function useRevokeAPIKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyId: string): Promise<{ message: string }> => {
      const res = await apiClient.delete(USER_ENDPOINTS.REVOKE_API_KEY(keyId));
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.apiKeys() });
    },
  });
}

export function useInvalidateUserData() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: userKeys.all });
}

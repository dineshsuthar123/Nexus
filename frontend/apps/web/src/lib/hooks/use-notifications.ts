/**
 * Nexus RTP Platform - React Query Hooks for Notifications
 *
 * Custom hooks for notification operations using React Query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { get, post, put, NOTIFICATION_ENDPOINTS, buildQueryParams } from '@/lib/api';
import type { Pagination } from '@/lib/api/types';

// =============================================================================
// Types
// =============================================================================

export interface Notification {
  id: string;
  userId: string;
  type: 'PAYMENT' | 'ACCOUNT' | 'RECONCILIATION' | 'SECURITY' | 'SYSTEM' | 'FRAUD';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
  referenceId?: string;
  metadata?: Record<string, string>;
  read: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedNotifications {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  type: string;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationRequest {
  userId: string;
  type: string;
  priority?: string;
  title: string;
  message: string;
  channel?: string;
  referenceId?: string;
  metadata?: Record<string, string>;
}

export interface UpdatePreferenceRequest {
  type: string;
  inApp?: boolean;
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}

// =============================================================================
// Query Keys
// =============================================================================

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters?: { read?: boolean; type?: string }, pagination?: Pagination) =>
    [...notificationKeys.lists(), { filters, pagination }] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread'] as const,
};

// =============================================================================
// Queries
// =============================================================================

/**
 * Fetch paginated list of notifications
 */
export function useNotificationList(
  filters: { read?: boolean; type?: string } = {},
  pagination: Pagination = { page: 1, pageSize: 20 }
) {
  return useQuery({
    queryKey: notificationKeys.list(filters, pagination),
    queryFn: async () => {
      const params = buildQueryParams(filters as Record<string, unknown>, pagination);
      const response = await get<PaginatedNotifications>(
        NOTIFICATION_ENDPOINTS.LIST,
        { params }
      );
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch notification preferences
 */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: async () => {
      const response = await get<{ preferences: NotificationPreference[] }>(
        NOTIFICATION_ENDPOINTS.PREFERENCES
      );
      return response.data.preferences;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a notification (admin/internal use)
 */
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateNotificationRequest) => {
      const response = await post<Notification>(NOTIFICATION_ENDPOINTS.LIST, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
}

/**
 * Mark a single notification as read
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await post<{ message: string }>(
        NOTIFICATION_ENDPOINTS.MARK_READ(id),
        {}
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
}

/**
 * Mark all notifications as read
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await post<{ message: string; updatedCount: number }>(
        NOTIFICATION_ENDPOINTS.MARK_ALL_READ,
        {}
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    },
  });
}

/**
 * Update notification preferences
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: UpdatePreferenceRequest[]) => {
      const response = await put<{ preferences: NotificationPreference[] }>(
        NOTIFICATION_ENDPOINTS.PREFERENCES,
        { preferences }
      );
      return response.data.preferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Hook to invalidate notification queries
 */
export function useInvalidateNotifications() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.lists() });
    queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
  }, [queryClient]);
}

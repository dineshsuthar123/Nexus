/**
 * Nexus RTP Platform - Audit Hooks
 *
 * React Query hooks for audit bundle management.
 * Consumes the audit-service API endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, AUDIT_ENDPOINTS } from '@/lib/api';
import type { AuditBundle, AuditBundleListItem, VerificationResult } from '@/lib/api/types';

// ────────────────────────────────────────────
// Query Keys
// ────────────────────────────────────────────

export const auditKeys = {
  all: ['audit'] as const,
  bundles: () => [...auditKeys.all, 'bundles'] as const,
  bundleList: (filters?: Record<string, unknown>) =>
    [...auditKeys.bundles(), 'list', filters ?? {}] as const,
  bundle: (id: string) => [...auditKeys.bundles(), 'detail', id] as const,
  verification: (id: string) =>
    [...auditKeys.bundles(), 'verify', id] as const,
  reference: (type: string, refId: string) =>
    [...auditKeys.bundles(), 'reference', type, refId] as const,
};

// ────────────────────────────────────────────
// List Bundles
// ────────────────────────────────────────────

interface BundlesListParams {
  limit?: number;
  offset?: number;
  enabled?: boolean;
}

interface BundlesListResponse {
  data: AuditBundleListItem[];
  total: number;
  limit: number;
  offset: number;
}

export function useAuditBundles(params?: BundlesListParams) {
  const { limit = 20, offset = 0, enabled = true } = params ?? {};

  return useQuery({
    queryKey: auditKeys.bundleList({ limit, offset }),
    queryFn: async () => {
      const response = await get<BundlesListResponse>(AUDIT_ENDPOINTS.LIST_BUNDLES, {
        params: { limit, offset },
      });
      return response.data;
    },
    enabled,
    staleTime: 60_000,
  });
}

// ────────────────────────────────────────────
// Get Single Bundle
// ────────────────────────────────────────────

export function useAuditBundle(bundleId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: auditKeys.bundle(bundleId),
    queryFn: async () => {
      const response = await get<{ data: AuditBundle }>(
        AUDIT_ENDPOINTS.GET_BUNDLE(bundleId)
      );
      return response.data;
    },
    enabled: !!bundleId && (options?.enabled !== false),
    staleTime: 300_000,
  });
}

// ────────────────────────────────────────────
// Verify Bundle Integrity
// ────────────────────────────────────────────

export function useVerifyBundle(bundleId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: auditKeys.verification(bundleId),
    queryFn: async () => {
      const response = await get<{ data: VerificationResult }>(
        AUDIT_ENDPOINTS.VERIFY_BUNDLE(bundleId)
      );
      return response.data;
    },
    enabled: !!bundleId && (options?.enabled !== false),
    staleTime: 0, // Always re-verify
  });
}

// ────────────────────────────────────────────
// Get Bundle by Reference
// ────────────────────────────────────────────

export function useAuditBundleByReference(
  type: string,
  refId: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: auditKeys.reference(type, refId),
    queryFn: async () => {
      const response = await get<{ data: AuditBundle }>(
        AUDIT_ENDPOINTS.GET_BY_REFERENCE(type, refId)
      );
      return response.data;
    },
    enabled: !!type && !!refId && (options?.enabled !== false),
    staleTime: 300_000,
  });
}

// ────────────────────────────────────────────
// Create Audit Bundle
// ────────────────────────────────────────────

interface CreateBundleRequest {
  request_id: string;
  request_type: string;
  requester: {
    name: string;
    organization: string;
    jurisdiction: string;
    contact_email?: string;
  };
  scope: {
    period_start: string;
    period_end: string;
    account_ids?: string[];
    transaction_ids?: string[];
    currencies?: string[];
  };
}

export function useCreateAuditBundle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateBundleRequest) => {
      const response = await post<{ data: AuditBundle }>(
        AUDIT_ENDPOINTS.LIST_BUNDLES,
        request
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: auditKeys.bundles() });
    },
  });
}

// ────────────────────────────────────────────
// Download Bundle
// ────────────────────────────────────────────

export function useDownloadBundle() {
  return useMutation({
    mutationFn: async (bundleId: string) => {
      const response = await get<Blob>(AUDIT_ENDPOINTS.DOWNLOAD_BUNDLE(bundleId), {
        responseType: 'blob',
      });

      // Trigger download
      const url = window.URL.createObjectURL(new Blob([response.data as unknown as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-bundle-${bundleId}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  });
}

// ────────────────────────────────────────────
// Prefetch & Invalidate helpers
// ────────────────────────────────────────────

export function usePrefetchAuditBundle() {
  const queryClient = useQueryClient();

  return (bundleId: string) => {
    queryClient.prefetchQuery({
      queryKey: auditKeys.bundle(bundleId),
      queryFn: async () => {
        const response = await get<{ data: AuditBundle }>(
          AUDIT_ENDPOINTS.GET_BUNDLE(bundleId)
        );
        return response.data;
      },
      staleTime: 300_000,
    });
  };
}

export function useInvalidateAuditBundles() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: auditKeys.bundles() });
}

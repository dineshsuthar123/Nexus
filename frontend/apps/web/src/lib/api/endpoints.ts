/**
 * Nexus RTP Platform - API Endpoints Configuration
 * 
 * Centralized endpoint definitions for all backend API calls.
 * Endpoints are organized by service domain.
 */

// =============================================================================
// Base URL Configuration
// =============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = 'v1';

export const getBaseUrl = () => `${API_BASE_URL}/api/${API_VERSION}`;

// =============================================================================
// Auth Endpoints
// =============================================================================

export const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  VERIFY_EMAIL: '/auth/verify-email',
  MFA_SETUP: '/auth/mfa/setup',
  MFA_VERIFY: '/auth/mfa/verify',
  MFA_DISABLE: '/auth/mfa/disable',
  ME: '/auth/me',
} as const;

// =============================================================================
// Payment Endpoints
// =============================================================================

export const PAYMENT_ENDPOINTS = {
  BASE: '/payments',
  CREATE: '/payments',
  GET_BY_UETR: (uetr: string) => `/payments/${uetr}`,
  GET_STATUS: (uetr: string) => `/payments/${uetr}/status`,
  SETTLE: (uetr: string) => `/payments/${uetr}/settle`,
  RETURN: (uetr: string) => `/payments/${uetr}/return`,
  CANCEL: (uetr: string) => `/payments/${uetr}/cancel`,
  
  // ISO 20022 endpoints
  PACS_008: '/messages/pacs.008',
  PACS_004: '/messages/pacs.004',
} as const;

// =============================================================================
// Account Endpoints
// =============================================================================

export const ACCOUNT_ENDPOINTS = {
  BASE: '/accounts',
  CREATE: '/accounts',
  LIST: '/accounts',
  GET_BY_ID: (id: string) => `/accounts/${id}`,
  GET_BALANCE: (id: string) => `/accounts/${id}/balance`,
  UPDATE_STATUS: (id: string) => `/accounts/${id}/status`,
  UPDATE_KYC: (id: string) => `/accounts/${id}/kyc`,
  GET_AUDIT: (id: string) => `/accounts/${id}/audit`,
  GET_TRANSACTIONS: (id: string) => `/accounts/${id}/transactions`,
  
  // Customer accounts
  GET_BY_CUSTOMER: (customerId: string) => `/customers/${customerId}/accounts`,
} as const;

// =============================================================================
// Reconciliation Endpoints
// =============================================================================

export const RECONCILIATION_ENDPOINTS = {
  RUN: '/reconciliation/run',
  LIST_CYCLES: '/reconciliation/cycles',
  GET_CYCLE: (id: string) => `/reconciliation/cycles/${id}`,
  GET_DISCREPANCIES: (cycleId: string) => `/reconciliation/cycles/${cycleId}/discrepancies`,
  RESOLVE_DISCREPANCY: (id: string) => `/reconciliation/discrepancies/${id}/resolve`,
} as const;

// =============================================================================
// Audit Endpoints
// =============================================================================

export const AUDIT_ENDPOINTS = {
  LIST_BUNDLES: '/audit/bundles',
  GET_BUNDLE: (id: string) => `/audit/bundles/${id}`,
  VERIFY_BUNDLE: (id: string) => `/audit/bundles/${id}/verify`,
  DOWNLOAD_BUNDLE: (id: string) => `/audit/bundles/${id}/download`,
  GET_BY_REFERENCE: (type: string, refId: string) => `/audit/bundles/reference/${type}/${refId}`,
} as const;

// =============================================================================
// Analytics Endpoints
// =============================================================================

export const ANALYTICS_ENDPOINTS = {
  SUMMARY: '/analytics/summary',
  VOLUME: '/analytics/volume',
  PERFORMANCE: '/analytics/performance',
  TRENDS: '/analytics/trends',
} as const;

// =============================================================================
// Notification Endpoints
// =============================================================================

export const NOTIFICATION_ENDPOINTS = {
  LIST: '/notifications',
  MARK_READ: (id: string) => `/notifications/${id}/read`,
  MARK_ALL_READ: '/notifications/read-all',
  PREFERENCES: '/notifications/preferences',
} as const;

// =============================================================================
// User & Settings Endpoints
// =============================================================================

export const USER_ENDPOINTS = {
  PROFILE: '/users/profile',
  UPDATE_PROFILE: '/users/profile',
  CHANGE_PASSWORD: '/users/password',
  API_KEYS: '/users/api-keys',
  CREATE_API_KEY: '/users/api-keys',
  REVOKE_API_KEY: (id: string) => `/users/api-keys/${id}`,
} as const;

// =============================================================================
// System & Health Endpoints
// =============================================================================

export const SYSTEM_ENDPOINTS = {
  HEALTH: '/health',
  READY: '/ready',
  METRICS: '/metrics',
  OPENAPI: '/openapi.json',
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build full URL for an endpoint
 */
export function buildUrl(endpoint: string, params?: Record<string, string | number>): string {
  let url = `${getBaseUrl()}${endpoint}`;
  
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  return url;
}

/**
 * Build query string from filters and pagination
 */
export function buildQueryParams(
  filters?: Record<string, unknown>,
  pagination?: { page?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }
): Record<string, string> {
  const params: Record<string, string> = {};
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          params[key] = value.join(',');
        } else if (value instanceof Date) {
          params[key] = value.toISOString();
        } else {
          params[key] = String(value);
        }
      }
    });
  }
  
  if (pagination) {
    if (pagination.page !== undefined) params.page = String(pagination.page);
    if (pagination.pageSize !== undefined) params.pageSize = String(pagination.pageSize);
    if (pagination.sortBy) params.sortBy = pagination.sortBy;
    if (pagination.sortOrder) params.sortOrder = pagination.sortOrder;
  }
  
  return params;
}

// =============================================================================
// Idempotency Key Generator
// =============================================================================

/**
 * Generate a unique idempotency key for payment requests
 * Format: nexus-{timestamp}-{random}
 */
export function generateIdempotencyKey(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `nexus-${timestamp}-${random}`;
}

/**
 * Validate idempotency key format
 */
export function isValidIdempotencyKey(key: string): boolean {
  return /^nexus-[a-z0-9]+-[a-z0-9]+$/.test(key);
}

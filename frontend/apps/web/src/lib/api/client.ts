/**
 * Nexus RTP Platform - API Client
 *
 * Axios-based API client with:
 * - Automatic auth header injection
 * - Token refresh on 401
 * - Request/response interceptors
 * - Retry logic for idempotent requests
 * - Request deduplication
 * - Error transformation
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { getSession, signOut } from 'next-auth/react';

import { getBaseUrl, generateIdempotencyKey } from './endpoints';
import type { ApiError, ApiResponse } from './types';

// =============================================================================
// Types
// =============================================================================

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableStatuses: number[];
}

interface RequestMetadata {
  startTime: number;
  retryCount: number;
  idempotencyKey?: string;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    metadata?: RequestMetadata;
    skipAuthRefresh?: boolean;
  }
  interface InternalAxiosRequestConfig {
    metadata?: RequestMetadata;
    skipAuthRefresh?: boolean;
  }
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

// Methods that are safe to retry (idempotent)
const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];

// Headers that require special handling
const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'cookie'];

// =============================================================================
// API Client Class
// =============================================================================

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];
  private pendingRequests = new Map<string, Promise<AxiosResponse>>();

  constructor() {
    this.client = axios.create({
      baseURL: getBaseUrl(),
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  // ===========================================================================
  // Interceptors
  // ===========================================================================

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Add request metadata
        config.metadata = {
          startTime: Date.now(),
          retryCount: config.metadata?.retryCount || 0,
          idempotencyKey: config.metadata?.idempotencyKey,
        };

        // Add auth header
        await this.injectAuthHeader(config);

        // Add idempotency key for payment mutations
        if (this.shouldAddIdempotencyKey(config)) {
          const key = config.metadata.idempotencyKey || generateIdempotencyKey();
          config.headers['Idempotency-Key'] = key;
          config.metadata.idempotencyKey = key;
        }

        // Add correlation ID for request tracing
        config.headers['X-Request-ID'] = this.generateRequestId();

        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
            headers: this.sanitizeHeaders(config.headers),
          });
        }

        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(this.transformError(error));
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log response timing in development
        if (process.env.NODE_ENV === 'development') {
          const duration = Date.now() - (response.config.metadata?.startTime || 0);
          console.log(
            `[API] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`
          );
        }

        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config;

        if (!originalRequest) {
          return Promise.reject(this.transformError(error));
        }

        // Handle 401 - Token expired
        if (error.response?.status === 401 && !originalRequest.skipAuthRefresh) {
          return this.handle401Error(error, originalRequest);
        }

        // Handle retryable errors
        if (this.shouldRetry(error, originalRequest)) {
          return this.retryRequest(originalRequest);
        }

        return Promise.reject(this.transformError(error));
      }
    );
  }

  // ===========================================================================
  // Auth Header Injection
  // ===========================================================================

  private async injectAuthHeader(config: InternalAxiosRequestConfig): Promise<void> {
    try {
      const session = await getSession();
      if (session?.accessToken) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }
    } catch (error) {
      console.warn('[API] Failed to get session for auth header:', error);
    }
  }

  // ===========================================================================
  // 401 Error Handling
  // ===========================================================================

  private async handle401Error(
    error: AxiosError,
    originalRequest: InternalAxiosRequestConfig
  ): Promise<AxiosResponse> {
    if (this.isRefreshing) {
      // Wait for the refresh to complete
      return new Promise((resolve, reject) => {
        this.refreshSubscribers.push((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(this.client.request(originalRequest));
        });
      });
    }

    this.isRefreshing = true;
    originalRequest.skipAuthRefresh = true;

    try {
      // Try to refresh the token using NextAuth's session refresh
      const session = await getSession();

      if (session?.accessToken) {
        // Token was refreshed
        const newToken = session.accessToken;

        // Notify all waiting requests
        this.refreshSubscribers.forEach((callback) => callback(newToken));
        this.refreshSubscribers = [];

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return this.client.request(originalRequest);
      } else {
        // No valid session, sign out
        await signOut({ redirect: true, callbackUrl: '/auth/login' });
        throw new Error('Session expired. Please log in again.');
      }
    } catch (refreshError) {
      // Refresh failed, clear everything and redirect to login
      this.refreshSubscribers = [];
      await signOut({ redirect: true, callbackUrl: '/auth/login' });
      throw refreshError;
    } finally {
      this.isRefreshing = false;
    }
  }

  // ===========================================================================
  // Retry Logic
  // ===========================================================================

  private shouldRetry(error: AxiosError, config: InternalAxiosRequestConfig): boolean {
    const retryCount = config.metadata?.retryCount || 0;
    const method = config.method?.toUpperCase() || 'GET';

    // Check if we've exceeded max retries
    if (retryCount >= MAX_RETRIES) {
      return false;
    }

    // Check if the method is idempotent
    const hasIdempotencyKey = !!config.metadata?.idempotencyKey;
    const isIdempotent = IDEMPOTENT_METHODS.includes(method) || hasIdempotencyKey;

    if (!isIdempotent) {
      return false;
    }

    // Check if the status is retryable
    const status = error.response?.status;
    if (status && RETRYABLE_STATUSES.includes(status)) {
      return true;
    }

    // Retry on network errors
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || !error.response) {
      return true;
    }

    return false;
  }

  private async retryRequest(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
    const retryCount = (config.metadata?.retryCount || 0) + 1;
    const delay = RETRY_DELAY * Math.pow(2, retryCount - 1); // Exponential backoff

    console.log(`[API] Retrying request (attempt ${retryCount}/${MAX_RETRIES}) after ${delay}ms`);

    await this.sleep(delay);

    return this.client.request({
      ...config,
      metadata: {
        ...config.metadata,
        retryCount,
        startTime: Date.now(),
      },
    });
  }

  // ===========================================================================
  // Idempotency
  // ===========================================================================

  private shouldAddIdempotencyKey(config: InternalAxiosRequestConfig): boolean {
    const method = config.method?.toUpperCase() || 'GET';
    const url = config.url || '';

    // Add idempotency key for payment-related POST requests
    if (method === 'POST') {
      const paymentPaths = ['/payments', '/messages/pacs'];
      return paymentPaths.some((path) => url.includes(path));
    }

    return false;
  }

  // ===========================================================================
  // Request Deduplication
  // ===========================================================================

  private getRequestKey(config: AxiosRequestConfig): string {
    const { method, url, params, data } = config;
    return JSON.stringify({ method, url, params, data });
  }

  // ===========================================================================
  // Error Transformation
  // ===========================================================================

  private transformError(error: AxiosError): ApiError {
    const response = error.response;

    if (!response) {
      // Network error or timeout
      return {
        code: 'NETWORK_ERROR',
        message: error.message || 'Network error occurred',
        details: error.code ? `Network error code: ${error.code}` : undefined,
        timestamp: new Date().toISOString(),
      };
    }

    const data = response.data as Record<string, unknown>;

    return {
      code: (data?.code as string) || `HTTP_${response.status}`,
      message: (data?.message as string) || this.getDefaultErrorMessage(response.status),
      details: typeof data?.details === 'string' ? data.details : JSON.stringify(data?.details),
      timestamp: new Date().toISOString(),
    };
  }

  private getDefaultErrorMessage(status: number): string {
    const messages: Record<number, string> = {
      400: 'Invalid request. Please check your input.',
      401: 'Authentication required. Please log in.',
      403: 'You do not have permission to perform this action.',
      404: 'The requested resource was not found.',
      408: 'Request timeout. Please try again.',
      409: 'A conflict occurred. The resource may have been modified.',
      422: 'Validation failed. Please check your input.',
      429: 'Too many requests. Please wait and try again.',
      500: 'An unexpected error occurred. Please try again later.',
      502: 'Service temporarily unavailable. Please try again.',
      503: 'Service temporarily unavailable. Please try again.',
      504: 'Request timeout. Please try again.',
    };

    return messages[status] || 'An unexpected error occurred.';
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  private generateRequestId(): string {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    Object.entries(headers).forEach(([key, value]) => {
      if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    });

    return sanitized;
  }

  // ===========================================================================
  // Public API Methods
  // ===========================================================================

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.get<T>(url, config);
    return { data: response.data, status: response.status };
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.post<T>(url, data, config);
    return { data: response.data, status: response.status };
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.put<T>(url, data, config);
    return { data: response.data, status: response.status };
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.patch<T>(url, data, config);
    return { data: response.data, status: response.status };
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.delete<T>(url, config);
    return { data: response.data, status: response.status };
  }

  /**
   * Make a request with an idempotency key
   */
  async postIdempotent<T = unknown>(
    url: string,
    data?: unknown,
    idempotencyKey?: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const key = idempotencyKey || generateIdempotencyKey();
    const response = await this.client.post<T>(url, data, {
      ...config,
      headers: {
        ...config?.headers,
        'Idempotency-Key': key,
      },
      metadata: {
        startTime: Date.now(),
        retryCount: 0,
        idempotencyKey: key,
      },
    });
    return { data: response.data, status: response.status };
  }

  /**
   * Upload a file
   */
  async upload<T = unknown>(
    url: string,
    file: File,
    onProgress?: (percent: number) => void,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post<T>(url, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });

    return { data: response.data, status: response.status };
  }

  /**
   * Download a file
   */
  async download(url: string, filename: string, config?: AxiosRequestConfig): Promise<void> {
    const response = await this.client.get(url, {
      ...config,
      responseType: 'blob',
    });

    // Create download link
    const blob = new Blob([response.data]);
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(link.href);
  }

  /**
   * Get raw axios instance for advanced use cases
   */
  getInstance(): AxiosInstance {
    return this.client;
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const apiClient = new ApiClient();

// Convenience exports
export const { get, post, put, patch, delete: del, postIdempotent, upload, download } = {
  get: apiClient.get.bind(apiClient),
  post: apiClient.post.bind(apiClient),
  put: apiClient.put.bind(apiClient),
  patch: apiClient.patch.bind(apiClient),
  delete: apiClient.delete.bind(apiClient),
  postIdempotent: apiClient.postIdempotent.bind(apiClient),
  upload: apiClient.upload.bind(apiClient),
  download: apiClient.download.bind(apiClient),
};

export default apiClient;

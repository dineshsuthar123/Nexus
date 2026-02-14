/**
 * Nexus RTP Platform - API Module Index
 * 
 * Exports all API-related utilities, types, and services.
 */

// Client
export { apiClient, get, post, put, patch, del, postIdempotent, upload, download } from './client';

// Endpoints
export {
  getBaseUrl,
  AUTH_ENDPOINTS,
  PAYMENT_ENDPOINTS,
  ACCOUNT_ENDPOINTS,
  RECONCILIATION_ENDPOINTS,
  AUDIT_ENDPOINTS,
  ANALYTICS_ENDPOINTS,
  NOTIFICATION_ENDPOINTS,
  USER_ENDPOINTS,
  SYSTEM_ENDPOINTS,
  buildUrl,
  buildQueryParams,
  generateIdempotencyKey,
  isValidIdempotencyKey,
} from './endpoints';

// Types
export type {
  // Auth
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
  MfaSetupResponse,
  MfaVerifyRequest,
  User,
  UserRole,
  UserSession,
  
  // Payment
  Payment,
  PaymentStatus,
  PaymentType,
  CreatePaymentRequest,
  UpdatePaymentStatusRequest,
  MoneyAmount,
  
  // Account
  Account,
  AccountStatus,
  AccountType,
  CreateAccountRequest,
  UpdateAccountRequest,
  Balance,
  KycInfo,
  
  // Reconciliation
  ReconciliationCycle,
  ReconciliationStatus,
  Discrepancy,
  DiscrepancyType,
  
  // Audit
  AuditBundle,
  AuditLogEntry,
  
  // WebSocket
  WebSocketMessage,
  WebSocketEventType,
  PaymentUpdate,
  AccountUpdate,
  ReconciliationUpdate,
  SystemNotification,
  
  // Analytics
  DashboardSummary,
  VolumeData,
  PerformanceMetrics,
  SystemHealth,
  
  // Common
  PaginatedResponse,
  Pagination,
  ApiResponse,
  ApiError,
  FilterBase,
  PaymentFilters,
  AccountFilters,
  ReconciliationFilters,
} from './types';

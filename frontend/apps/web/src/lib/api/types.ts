/**
 * Nexus RTP Platform - API Type Definitions
 * 
 * TypeScript interfaces for all backend API responses and requests.
 * These types are derived from the backend Go services' API contracts.
 */

// =============================================================================
// Common Types
// =============================================================================

export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CHF' | 'CAD' | 'AUD' | 'CNY' | 'INR';

export type PaymentStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'SETTLED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RETURNED';

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'FROZEN' | 'CLOSED' | 'SUSPENDED';

export type AccountType = 'CHECKING' | 'SAVINGS' | 'TREASURY' | 'SETTLEMENT' | 'NOSTRO' | 'VOSTRO' | 'INTERNAL';

export type KYCStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export type TransactionType = 'CREDIT' | 'DEBIT' | 'TRANSFER' | 'REFUND' | 'FEE' | 'INTEREST' | 'ADJUSTMENT';

export type ReconciliationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';

export type DiscrepancyType = 'AMOUNT_MISMATCH' | 'MISSING_TRANSACTION' | 'DUPLICATE' | 'STATUS_MISMATCH';

// =============================================================================
// API Response Wrappers
// =============================================================================

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  traceId?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// =============================================================================
// Authentication Types
// =============================================================================

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  user: User;
  requiresMfa?: boolean;
  mfaToken?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string;
  acceptTerms: boolean;
}

export interface RegisterResponse {
  user: User;
  message: string;
  requiresEmailVerification: boolean;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface MfaVerifyRequest {
  mfaToken: string;
  code: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'API_USER';
  organizationId: string;
  organizationName: string;
  avatar?: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

// =============================================================================
// Payment Types
// =============================================================================

export interface Payment {
  id: string;
  uetr: string; // Unique End-to-End Transaction Reference (UUID)
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  fromAccountId: string;
  fromAccountName?: string;
  toAccountId: string;
  toAccountName?: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  settledAt?: string;
  failureReason?: string;
  sanctionsScreeningResult?: SanctionsScreeningResult;
  auditBundleId?: string;
}

export interface CreatePaymentRequest {
  amount: number;
  currency: Currency;
  fromAccountId: string;
  toAccountId: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
  idempotencyKey: string;
}

export interface CreatePaymentResponse {
  uetr: string;
  status: PaymentStatus;
  message: string;
  payment: Payment;
}

export interface SettlePaymentRequest {
  settlementDate?: string;
  notes?: string;
}

export interface SettlePaymentResponse {
  uetr: string;
  status: PaymentStatus;
  settledAt: string;
  auditBundleId: string;
}

export interface PaymentStatusResponse {
  uetr: string;
  status: PaymentStatus;
  statusHistory: PaymentStatusHistoryEntry[];
  currentStep: string;
  estimatedCompletion?: string;
}

export interface PaymentStatusHistoryEntry {
  status: PaymentStatus;
  timestamp: string;
  actor?: string;
  reason?: string;
}

export interface SanctionsScreeningResult {
  screened: boolean;
  passed: boolean;
  score: number;
  matches: SanctionsMatch[];
  screenedAt: string;
}

export interface SanctionsMatch {
  name: string;
  listType: string;
  matchScore: number;
  sanctionProgram?: string;
}

// =============================================================================
// Account Types
// =============================================================================

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  status: AccountStatus;
  kycStatus: KYCStatus;
  iban?: string;
  bic?: string;
  routingNumber?: string;
  accountNumber?: string;
  customerId: string;
  customerName?: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
}

export interface CreateAccountRequest {
  name: string;
  type: Account['type'];
  currency: Currency;
  customerId: string;
  initialBalance?: number;
  metadata?: Record<string, string>;
}

export interface CreateAccountResponse {
  account: Account;
  message: string;
}

export interface AccountBalance {
  accountId: string;
  currency: Currency;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  asOf: string;
}

export interface AccountTransaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  balance: number; // Balance after transaction
  description: string;
  reference?: string;
  counterpartyAccountId?: string;
  counterpartyName?: string;
  paymentUetr?: string;
  createdAt: string;
}

// =============================================================================
// Reconciliation Types
// =============================================================================

export interface ReconciliationCycle {
  id: string;
  date: string;
  status: ReconciliationStatus;
  startedAt: string;
  completedAt?: string;
  totalTransactions: number;
  matchedTransactions: number;
  discrepancyCount: number;
  matchRate: number;
  auditBundleId?: string;
  runBy?: string;
}

export interface RunReconciliationRequest {
  date: string; // Format: YYYY-MM-DD
}

export interface RunReconciliationResponse {
  cycleId: string;
  status: ReconciliationStatus;
  message: string;
}

export interface Discrepancy {
  id: string;
  cycleId: string;
  type: DiscrepancyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  sourceTransactionId?: string;
  targetTransactionId?: string;
  expectedAmount?: number;
  actualAmount?: number;
  currency?: Currency;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'IGNORED';
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ResolveDiscrepancyRequest {
  resolution: string;
  resolvedBy: string;
}

// =============================================================================
// Audit Bundle Types
// =============================================================================

export interface AuditBundle {
  id: string;
  version: string;
  createdAt: string;
  expiresAt?: string;
  
  // Bundle metadata
  bundleType: 'PAYMENT' | 'RECONCILIATION' | 'ACCOUNT_CHANGE' | 'SYSTEM';
  referenceId: string; // UETR for payments, cycleId for reconciliation
  
  // Cryptographic proof
  merkleRoot: string;
  previousBundleHash?: string;
  signature: string;
  signatureAlgorithm: 'Ed25519';
  signerPublicKey: string;
  
  // Audit entries
  entries: AuditEntry[];
  
  // Verification
  verified?: boolean;
  verifiedAt?: string;
}

export interface AuditEntry {
  id: string;
  sequence: number;
  timestamp: string;
  eventType: string;
  actor: string;
  actorType: 'USER' | 'SYSTEM' | 'API';
  ipAddress?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, string>;
  hash: string;
}

// Summary view for bundle list endpoints
export interface AuditBundleListItem {
  id: string;
  bundle_id: string;
  request_type: string;
  requester: string;
  scope: Record<string, unknown>;
  status: string;
  created_at: string;
}

// Result of bundle integrity verification
export interface VerificationResult {
  bundle_id: string;
  valid: boolean;
  evidence_hash_valid: boolean;
  signature_valid: boolean;
  message?: string;
  errors?: string[];
  timestamp: string;
}

// JSON Schema for audit bundle validation
export const AUDIT_BUNDLE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['id', 'version', 'createdAt', 'bundleType', 'referenceId', 'merkleRoot', 'signature', 'signatureAlgorithm', 'signerPublicKey', 'entries'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    bundleType: { type: 'string', enum: ['PAYMENT', 'RECONCILIATION', 'ACCOUNT_CHANGE', 'SYSTEM'] },
    referenceId: { type: 'string' },
    merkleRoot: { type: 'string', minLength: 64, maxLength: 64 },
    previousBundleHash: { type: 'string', minLength: 64, maxLength: 64 },
    signature: { type: 'string', minLength: 128, maxLength: 128 },
    signatureAlgorithm: { type: 'string', const: 'Ed25519' },
    signerPublicKey: { type: 'string', minLength: 64, maxLength: 64 },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'sequence', 'timestamp', 'eventType', 'actor', 'actorType', 'action', 'resourceType', 'resourceId', 'hash'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          sequence: { type: 'integer', minimum: 0 },
          timestamp: { type: 'string', format: 'date-time' },
          eventType: { type: 'string' },
          actor: { type: 'string' },
          actorType: { type: 'string', enum: ['USER', 'SYSTEM', 'API'] },
          ipAddress: { type: 'string', format: 'ipv4' },
          action: { type: 'string' },
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          previousState: { type: 'object' },
          newState: { type: 'object' },
          metadata: { type: 'object' },
          hash: { type: 'string', minLength: 64, maxLength: 64 },
        },
      },
    },
  },
} as const;

// =============================================================================
// Analytics Types
// =============================================================================

export interface AnalyticsSummary {
  period: {
    start: string;
    end: string;
  };
  totalVolume: number;
  totalTransactions: number;
  successRate: number;
  averageProcessingTime: number;
  volumeByDay: { date: string; volume: number; count: number }[];
  volumeByCurrency: { currency: Currency; volume: number; count: number }[];
  statusBreakdown: { status: PaymentStatus; count: number; percentage: number }[];
}

export interface PerformanceMetrics {
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
  uptimePercentage: number;
}

// =============================================================================
// WebSocket Message Types
// =============================================================================

export interface WebSocketMessage<T = unknown> {
  type: 'PAYMENT_UPDATE' | 'BALANCE_UPDATE' | 'ALERT' | 'SYSTEM' | 'HEARTBEAT';
  id: string;
  timestamp: string;
  payload: T;
}

export interface PaymentUpdatePayload {
  uetr: string;
  previousStatus: PaymentStatus;
  newStatus: PaymentStatus;
  payment: Payment;
}

export interface BalanceUpdatePayload {
  accountId: string;
  previousBalance: number;
  newBalance: number;
  change: number;
  transactionId: string;
}

export interface AlertPayload {
  alertId: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  message: string;
  category: 'FRAUD' | 'COMPLIANCE' | 'SYSTEM' | 'SECURITY';
  actionRequired: boolean;
  relatedResourceType?: string;
  relatedResourceId?: string;
}

// =============================================================================
// Filter & Query Types
// =============================================================================

export interface PaymentFilters {
  status?: PaymentStatus[];
  currency?: Currency[];
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
  fromAccountId?: string;
  toAccountId?: string;
  search?: string;
}

export interface AccountFilters {
  status?: AccountStatus[];
  type?: Account['type'][];
  currency?: Currency[];
  search?: string;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Alias for backwards compatibility
export type Pagination = PaginationParams;

// =============================================================================
// Utility Types
// =============================================================================

export type WithId<T> = T & { id: string };

export type CreateRequest<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateRequest<T> = Partial<Omit<T, 'id' | 'createdAt'>>;

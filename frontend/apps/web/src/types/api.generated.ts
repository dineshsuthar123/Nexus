// =============================================================================
// Auto-generated from docs/openapi.yaml
// Do NOT edit manually. Run: pnpm run generate:types
// Generated: 2026-02-16T17:35:33.373Z
// OpenAPI: 3.1.0 — Nexus RTP Platform API v1.0.0
// =============================================================================

/* eslint-disable */
/* tslint:disable */

// =============================================================================
// Schema Types (from components/schemas)
// =============================================================================

export interface ErrorResponse {
  code: string;
  message: string;
  details?: string;
  traceId?: string;
  timestamp: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organization?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token?: string;
  refreshToken?: string;
  expiresAt?: string;
  mfaRequired?: boolean;
  user?: UserProfile;
}

export interface UserProfile {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  organization?: string;
  role?: 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'COMPLIANCE';
  mfaEnabled?: boolean;
  status?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface CreatePaymentRequest {
  /** Unique End-to-End Transaction Reference */
  uetr: string;
  amount: number;
  currency: string;
  debtorAccount: string;
  creditorAccount: string;
  debtorName?: string;
  creditorName?: string;
  paymentType?: 'INSTANT' | 'WIRE' | 'ACH' | 'SEPA';
  remittanceInfo?: string;
}

export interface PaymentResponse {
  uetr?: string;
  status?: 'INITIATED' | 'ACCEPTED' | 'REJECTED' | 'SETTLED' | 'RETURNED';
  amount?: number;
  currency?: string;
  createdAt?: string;
}

export interface CreateAccountRequest {
  accountNumber: string;
  accountName: string;
  accountType?: 'SETTLEMENT' | 'NOSTRO' | 'VOSTRO' | 'INTERNAL';
  currency: string;
  holderName?: string;
  holderType?: 'INDIVIDUAL' | 'CORPORATE';
}

export interface Account {
  id?: string;
  accountNumber?: string;
  accountName?: string;
  accountType?: string;
  currency?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'FROZEN';
  balance?: number;
  availableBalance?: number;
  kycStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  createdAt?: string;
}

export interface AccountBalance {
  accountId?: string;
  balance?: number;
  availableBalance?: number;
  pendingBalance?: number;
  currency?: string;
  asOf?: string;
}

export interface RunReconciliationRequest {
  date: string;
}

export interface ReconciliationCycle {
  id?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  totalTransactions?: number;
  matchedCount?: number;
  discrepancyCount?: number;
  matchRate?: number;
}

export interface Discrepancy {
  id?: string;
  cycleId?: string;
  discrepancyType?: string;
  expectedValue?: string;
  actualValue?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status?: 'OPEN' | 'RESOLVED' | 'ESCALATED';
}

export interface ResolveDiscrepancyRequest {
  resolution: string;
  resolvedBy: string;
}


// =============================================================================
// API Endpoint Type Map
// =============================================================================

export interface ApiEndpoints {
  /** Register a new user (registerUser) */
  'POST /api/v1/auth/register': { req: RegisterRequest; res: UserProfile };
  /** Login with email and password (loginUser) */
  'POST /api/v1/auth/login': { req: LoginRequest; res: LoginResponse };
  /** Refresh access token (refreshToken) */
  'POST /api/v1/auth/refresh': { req: RefreshRequest; res: LoginResponse };
  /** Get current user profile (getCurrentUser) */
  'GET /api/v1/auth/me': { req: void; res: UserProfile };
  /** Logout (revoke refresh token) (logoutUser) */
  'POST /api/v1/auth/logout': { req: void; res: void };
  /** Setup MFA (generate TOTP secret) (setupMFA) */
  'POST /api/v1/auth/mfa/setup': { req: void; res: void };
  /** Verify MFA code during login (verifyMFA) */
  'POST /api/v1/auth/mfa/verify': { req: {
      userId: string;
      code: string;
    }; res: LoginResponse };
  /** Create a new payment (createPayment) */
  'POST /api/v1/payments': { req: CreatePaymentRequest; res: PaymentResponse };
  /** Get payment status (getPaymentStatus) */
  'GET /api/v1/payments/:uetr': { req: void; res: PaymentResponse };
  /** Settle a payment (settlePayment) */
  'POST /api/v1/payments/:uetr/settle': { req: void; res: void };
  /** Return a payment (returnPayment) */
  'POST /api/v1/payments/:uetr/return': { req: {
      reasonCode: string;
      reasonText?: string;
      returnAmount?: string;
    }; res: void };
  /** Create a new account (createAccount) */
  'POST /api/v1/accounts': { req: CreateAccountRequest; res: Account };
  /** List accounts (listAccounts) */
  'GET /api/v1/accounts': { req: void; res: {
      accounts?: Account[];
      total?: number;
      limit?: number;
      offset?: number;
    } };
  /** Get account by ID (getAccount) */
  'GET /api/v1/accounts/:id': { req: void; res: Account };
  /** Get account balance (getAccountBalance) */
  'GET /api/v1/accounts/:id/balance': { req: void; res: AccountBalance };
  /** Update account status (updateAccountStatus) */
  'PATCH /api/v1/accounts/:id/status': { req: {
      status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'FROZEN';
    }; res: void };
  /** Update KYC status (updateKYCStatus) */
  'PATCH /api/v1/accounts/:id/kyc': { req: {
      kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
    }; res: void };
  /** Trigger reconciliation run (runReconciliation) */
  'POST /api/v1/reconciliation/run': { req: RunReconciliationRequest; res: ReconciliationCycle };
  /** List reconciliation cycles (listReconciliationCycles) */
  'GET /api/v1/reconciliation/cycles': { req: void; res: {
      cycles?: ReconciliationCycle[];
    } };
  /** Get reconciliation cycle (getReconciliationCycle) */
  'GET /api/v1/reconciliation/cycles/:id': { req: void; res: ReconciliationCycle };
  /** Get cycle discrepancies (getCycleDiscrepancies) */
  'GET /api/v1/reconciliation/cycles/:id/discrepancies': { req: void; res: {
      discrepancies?: Discrepancy[];
    } };
  /** Resolve a discrepancy (resolveDiscrepancy) */
  'POST /api/v1/reconciliation/discrepancies/:id/resolve': { req: ResolveDiscrepancyRequest; res: void };
}

// =============================================================================
// Path Constants (operationId → path)
// =============================================================================

export const API_PATHS = {
  registerUser: '/api/v1/auth/register',
  loginUser: '/api/v1/auth/login',
  refreshToken: '/api/v1/auth/refresh',
  getCurrentUser: '/api/v1/auth/me',
  logoutUser: '/api/v1/auth/logout',
  setupMFA: '/api/v1/auth/mfa/setup',
  verifyMFA: '/api/v1/auth/mfa/verify',
  createPayment: '/api/v1/payments',
  getPaymentStatus: '/api/v1/payments/{uetr}',
  settlePayment: '/api/v1/payments/{uetr}/settle',
  returnPayment: '/api/v1/payments/{uetr}/return',
  createAccount: '/api/v1/accounts',
  listAccounts: '/api/v1/accounts',
  getAccount: '/api/v1/accounts/{id}',
  getAccountBalance: '/api/v1/accounts/{id}/balance',
  updateAccountStatus: '/api/v1/accounts/{id}/status',
  updateKYCStatus: '/api/v1/accounts/{id}/kyc',
  runReconciliation: '/api/v1/reconciliation/run',
  listReconciliationCycles: '/api/v1/reconciliation/cycles',
  getReconciliationCycle: '/api/v1/reconciliation/cycles/{id}',
  getCycleDiscrepancies: '/api/v1/reconciliation/cycles/{id}/discrepancies',
  resolveDiscrepancy: '/api/v1/reconciliation/discrepancies/{id}/resolve',
} as const;

// =============================================================================
// Enum Values (for runtime validation)
// =============================================================================

// Extracted enum values for runtime validation
export const API_ENUMS = {
  UserProfile_role: ['ADMIN', 'OPERATOR', 'VIEWER', 'COMPLIANCE'] as const,
  CreatePaymentRequest_paymentType: ['INSTANT', 'WIRE', 'ACH', 'SEPA'] as const,
  PaymentResponse_status: ['INITIATED', 'ACCEPTED', 'REJECTED', 'SETTLED', 'RETURNED'] as const,
  CreateAccountRequest_accountType: ['SETTLEMENT', 'NOSTRO', 'VOSTRO', 'INTERNAL'] as const,
  CreateAccountRequest_holderType: ['INDIVIDUAL', 'CORPORATE'] as const,
  Account_status: ['ACTIVE', 'SUSPENDED', 'CLOSED', 'FROZEN'] as const,
  Account_kycStatus: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] as const,
  Discrepancy_severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const,
  Discrepancy_status: ['OPEN', 'RESOLVED', 'ESCALATED'] as const,
} as const;

// =============================================================================
// Security Schemes
// =============================================================================

export const SECURITY_SCHEMES = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  },
  apiKeyAuth: {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
  },
} as const;

// =============================================================================
// Helper Types
// =============================================================================

/** Extract request type for an endpoint */
export type EndpointRequest<K extends keyof ApiEndpoints> = ApiEndpoints[K]['req'];

/** Extract response type for an endpoint */
export type EndpointResponse<K extends keyof ApiEndpoints> = ApiEndpoints[K]['res'];

/** All API endpoint keys */
export type ApiEndpointKey = keyof ApiEndpoints;

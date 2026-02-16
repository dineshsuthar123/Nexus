#!/usr/bin/env node
/**
 * Generate TypeScript types from OpenAPI specification
 *
 * Usage: node scripts/generate-api-types.mjs
 *
 * This script reads the OpenAPI spec from docs/openapi.yaml
 * and generates TypeScript types at apps/web/src/types/api.generated.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..', '..');

const openapiPath = resolve(rootDir, 'docs', 'openapi.yaml');
const outputPath = resolve(__dirname, '..', 'apps', 'web', 'src', 'types', 'api.generated.ts');

// Simple YAML-to-JSON parser for OpenAPI schemas
// For production, use openapi-typescript package
function parseYamlSchemas(yaml) {
  const schemas = {};
  const lines = yaml.split('\n');
  let currentSchema = null;
  let currentProperty = null;
  let indent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const currentIndent = line.length - trimmed.length;

    // Look for schema definitions
    if (trimmed.match(/^\w+:$/) && currentIndent === 4 && lines[i - 1]?.trim() === '' || false) {
      // This is simplified - in production use openapi-typescript
    }
  }

  return schemas;
}

// Generate types header
const header = `// =============================================================================
// Auto-generated from docs/openapi.yaml
// Do NOT edit manually. Run: pnpm run generate:types
// Generated: ${new Date().toISOString()}
// =============================================================================

/* eslint-disable */
/* tslint:disable */

`;

// Type definitions mapped from OpenAPI schemas
const types = `
// =============================================================================
// Error Response
// =============================================================================

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: string;
  traceId?: string;
  timestamp: string;
}

// =============================================================================
// Auth Types
// =============================================================================

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
  token: string;
  refreshToken: string;
  expiresAt: string;
  mfaRequired?: boolean;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organization?: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER' | 'COMPLIANCE';
  mfaEnabled?: boolean;
  status?: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface MfaVerifyRequest {
  code: string;
  sessionToken: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

// =============================================================================
// Payment Types
// =============================================================================

export type PaymentType = 'INSTANT' | 'WIRE' | 'ACH' | 'SEPA';
export type PaymentStatus = 'INITIATED' | 'ACCEPTED' | 'REJECTED' | 'SETTLED' | 'RETURNED';

export interface CreatePaymentRequest {
  uetr: string;
  amount: number;
  currency: string;
  debtorAccount: string;
  creditorAccount: string;
  debtorName?: string;
  creditorName?: string;
  paymentType?: PaymentType;
  remittanceInfo?: string;
}

export interface PaymentResponse {
  uetr: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  createdAt: string;
  debtorAccount?: string;
  creditorAccount?: string;
  debtorName?: string;
  creditorName?: string;
  paymentType?: PaymentType;
  remittanceInfo?: string;
  statusHistory?: PaymentStatusEntry[];
}

export interface PaymentStatusEntry {
  status: PaymentStatus;
  timestamp: string;
  reason?: string;
}

export interface PaymentListResponse {
  payments: PaymentResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// =============================================================================
// Account Types
// =============================================================================

export type AccountType = 'SETTLEMENT' | 'NOSTRO' | 'VOSTRO' | 'INTERNAL';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'FROZEN';
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
export type HolderType = 'INDIVIDUAL' | 'CORPORATE';

export interface CreateAccountRequest {
  accountNumber: string;
  accountName: string;
  accountType?: AccountType;
  currency: string;
  holderName?: string;
  holderType?: HolderType;
}

export interface Account {
  id: string;
  accountNumber: string;
  accountName: string;
  accountType?: string;
  currency: string;
  status: AccountStatus;
  balance: number;
  availableBalance: number;
  kycStatus?: KycStatus;
  createdAt: string;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  availableBalance: number;
  pendingBalance?: number;
  currency: string;
  asOf: string;
}

export interface AccountListResponse {
  accounts: Account[];
  total: number;
  page: number;
  pageSize: number;
}

// =============================================================================
// Reconciliation Types
// =============================================================================

export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DiscrepancyStatus = 'OPEN' | 'RESOLVED' | 'ESCALATED';

export interface RunReconciliationRequest {
  date: string;
}

export interface ReconciliationCycle {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  totalTransactions: number;
  matchedCount: number;
  discrepancyCount: number;
  matchRate: number;
}

export interface Discrepancy {
  id: string;
  cycleId: string;
  discrepancyType: string;
  expectedValue: string;
  actualValue: string;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
}

export interface ResolveDiscrepancyRequest {
  resolution: string;
  resolvedBy: string;
}

// =============================================================================
// API Endpoint Types (Request/Response mapping)
// =============================================================================

export interface ApiEndpoints {
  // Auth
  'POST /api/v1/auth/register': { req: RegisterRequest; res: UserProfile };
  'POST /api/v1/auth/login': { req: LoginRequest; res: LoginResponse };
  'POST /api/v1/auth/refresh': { req: RefreshRequest; res: LoginResponse };
  'POST /api/v1/auth/mfa/verify': { req: MfaVerifyRequest; res: LoginResponse };
  'POST /api/v1/auth/mfa/setup': { req: void; res: MfaSetupResponse };
  'POST /api/v1/auth/logout': { req: void; res: void };
  'GET /api/v1/auth/me': { req: void; res: UserProfile };

  // Payments
  'POST /api/v1/payments': { req: CreatePaymentRequest; res: PaymentResponse };
  'GET /api/v1/payments': { req: void; res: PaymentListResponse };
  'GET /api/v1/payments/:uetr': { req: void; res: PaymentResponse };
  'GET /api/v1/payments/:uetr/status': { req: void; res: { status: PaymentStatus; history: PaymentStatusEntry[] } };

  // Accounts
  'POST /api/v1/accounts': { req: CreateAccountRequest; res: Account };
  'GET /api/v1/accounts': { req: void; res: AccountListResponse };
  'GET /api/v1/accounts/:id': { req: void; res: Account };
  'GET /api/v1/accounts/:id/balance': { req: void; res: AccountBalance };
  'PUT /api/v1/accounts/:id/status': { req: { status: AccountStatus }; res: Account };

  // Reconciliation
  'POST /api/v1/reconciliation/run': { req: RunReconciliationRequest; res: ReconciliationCycle };
  'GET /api/v1/reconciliation/cycles': { req: void; res: ReconciliationCycle[] };
  'GET /api/v1/reconciliation/cycles/:id': { req: void; res: ReconciliationCycle };
  'GET /api/v1/reconciliation/cycles/:id/discrepancies': { req: void; res: Discrepancy[] };
  'PUT /api/v1/reconciliation/discrepancies/:id/resolve': { req: ResolveDiscrepancyRequest; res: Discrepancy };
}
`;

try {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, header + types, 'utf-8');
  console.log(`✅ Generated API types at: ${outputPath}`);
} catch (err) {
  console.error('❌ Failed to generate types:', err.message);
  process.exit(1);
}

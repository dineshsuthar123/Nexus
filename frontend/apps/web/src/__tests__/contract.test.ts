/**
 * OpenAPI Contract Tests
 *
 * Validates that:
 * 1. The OpenAPI spec (docs/openapi.yaml) is well-formed
 * 2. The generated types (api.generated.ts) match the spec
 * 3. The hand-maintained types (lib/api/types.ts) are compatible
 * 4. API endpoints cover all required operations
 * 5. Security, idempotency, and enum contracts are upheld
 *
 * Run: pnpm --filter @nexus/web test:contract
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// =============================================================================
// Load source files
// =============================================================================

const root = resolve(__dirname, '../../../../..');
const openapiPath = resolve(root, 'docs', 'openapi.yaml');
const generatedTypesPath = resolve(__dirname, '../types/api.generated.ts');
const handTypesPath = resolve(__dirname, '../lib/api/types.ts');
const endpointsPath = resolve(__dirname, '../lib/api/endpoints.ts');

let openapiContent = '';
let generatedContent = '';
let handTypesContent = '';
let endpointsContent = '';

beforeAll(() => {
  openapiContent = existsSync(openapiPath) ? normalize(readFileSync(openapiPath, 'utf-8')) : '';
  generatedContent = existsSync(generatedTypesPath) ? normalize(readFileSync(generatedTypesPath, 'utf-8')) : '';
  handTypesContent = existsSync(handTypesPath) ? normalize(readFileSync(handTypesPath, 'utf-8')) : '';
  endpointsContent = existsSync(endpointsPath) ? normalize(readFileSync(endpointsPath, 'utf-8')) : '';
});

// =============================================================================
// Helpers
// =============================================================================

function normalize(s: string): string {
  return s.replace(/\r/g, '');
}

function extractPaths(yaml: string): string[] {
  const paths: string[] = [];
  const lines = normalize(yaml).split('\n');
  let inPaths = false;

  for (const line of lines) {
    if (line.startsWith('paths:')) { inPaths = true; continue; }
    if (inPaths && /^  \//.test(line)) {
      paths.push(line.trim().replace(/:$/, ''));
    }
    if (inPaths && /^[a-z]/i.test(line) && !line.startsWith(' ')) break;
  }
  return paths;
}

function extractSchemas(yaml: string): string[] {
  const schemas: string[] = [];
  const lines = normalize(yaml).split('\n');
  let inSchemas = false;

  for (const line of lines) {
    if (line.trim() === 'schemas:') { inSchemas = true; continue; }
    if (!inSchemas) continue;

    // Break when we leave the components section (hit a top-level key like "paths:")
    if (/^\w/.test(line)) break;
    // Break when we hit a sibling section under components (2-space indent, not nested)
    if (/^  \w/.test(line) && !line.includes('schemas')) break;

    // Match schema definitions at 4-space indent
    const cleaned = line.replace(/#.*/, '').trimEnd();
    if (/^    [A-Z]\w*:$/.test(cleaned)) {
      schemas.push(cleaned.trim().replace(/:$/, ''));
    }
  }
  return schemas;
}

function extractOperationIds(yaml: string): string[] {
  const ids: string[] = [];
  const re = /operationId:\s*(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(yaml)) !== null) {
    ids.push(m[1]);
  }
  return ids;
}

function extractEnumValues(yaml: string, schemaName: string, propName: string): string[] {
  const schemaIdx = yaml.indexOf(`    ${schemaName}:`);
  if (schemaIdx === -1) return [];
  const propIdx = yaml.indexOf(`          ${propName}:`, schemaIdx);
  const standaloneIdx = yaml.indexOf(`        ${propName}:`, schemaIdx);
  const idx = propIdx !== -1 ? propIdx : standaloneIdx;
  if (idx === -1) return [];
  const enumIdx = yaml.indexOf('enum:', idx);
  if (enumIdx === -1 || enumIdx - idx > 200) return [];
  const bracket = yaml.indexOf('[', enumIdx);
  const close = yaml.indexOf(']', bracket);
  if (bracket === -1 || close === -1) return [];
  const inner = yaml.substring(bracket + 1, close);
  return inner.split(',').map(s => s.trim());
}

// =============================================================================
// 1. OpenAPI Spec Validation
// =============================================================================

describe('OpenAPI Spec Structure', () => {
  it('should exist and declare OpenAPI 3.x', () => {
    expect(openapiContent).toBeTruthy();
    expect(openapiContent).toMatch(/openapi:\s*['"]?3\.\d+\.\d+/);
  });

  it('should have proper info block', () => {
    expect(openapiContent).toContain('title:');
    expect(openapiContent).toContain('version:');
    expect(openapiContent).toContain('Nexus RTP Platform');
  });

  it('should declare servers', () => {
    expect(openapiContent).toContain('servers:');
    expect(openapiContent).toContain('localhost:8000');
  });

  it('should define all required API paths', () => {
    const required = [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/me',
      '/api/v1/auth/logout',
      '/api/v1/auth/mfa/setup',
      '/api/v1/auth/mfa/verify',
      '/api/v1/payments',
      '/api/v1/accounts',
      '/api/v1/reconciliation/run',
      '/api/v1/reconciliation/cycles',
    ];
    const paths = extractPaths(openapiContent);
    for (const path of required) {
      expect(paths).toContain(path);
    }
  });

  it('should define all required schemas', () => {
    const required = [
      'ErrorResponse',
      'RegisterRequest',
      'LoginRequest',
      'LoginResponse',
      'UserProfile',
      'RefreshRequest',
      'CreatePaymentRequest',
      'PaymentResponse',
      'CreateAccountRequest',
      'Account',
      'AccountBalance',
      'RunReconciliationRequest',
      'ReconciliationCycle',
      'Discrepancy',
      'ResolveDiscrepancyRequest',
    ];
    const schemas = extractSchemas(openapiContent);
    for (const name of required) {
      expect(schemas).toContain(name);
    }
  });

  it('should have unique operationIds', () => {
    const ids = extractOperationIds(openapiContent);
    expect(ids.length).toBeGreaterThan(0);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// =============================================================================
// 2. Security Contracts
// =============================================================================

describe('Security Contracts', () => {
  it('should define bearerAuth and apiKeyAuth schemes', () => {
    expect(openapiContent).toContain('bearerAuth:');
    expect(openapiContent).toContain('apiKeyAuth:');
    expect(openapiContent).toContain("scheme: bearer");
    expect(openapiContent).toContain('bearerFormat: JWT');
    expect(openapiContent).toContain('X-API-Key');
  });

  it('should require auth on protected endpoints', () => {
    // Payment, Account, Reconciliation endpoints must have security
    const protectedPaths = [
      '/api/v1/payments:',
      '/api/v1/accounts:',
      '/api/v1/reconciliation/',
      '/api/v1/auth/me:',
    ];
    for (const path of protectedPaths) {
      const pathIdx = openapiContent.indexOf(path);
      expect(pathIdx).toBeGreaterThan(-1);
      // Find next 'security:' within 500 chars
      const secIdx = openapiContent.indexOf('security:', pathIdx);
      expect(secIdx - pathIdx).toBeLessThan(500);
    }
  });

  it('should NOT require auth on login/register', () => {
    const loginSection = openapiContent.substring(
      openapiContent.indexOf('/api/v1/auth/login:'),
      openapiContent.indexOf('/api/v1/auth/refresh:')
    );
    // Login should not have 'security:' section or should have empty security
    expect(loginSection).not.toContain('- bearerAuth:');
  });
});

// =============================================================================
// 3. Idempotency Contracts
// =============================================================================

describe('Idempotency Contracts', () => {
  it('should define Idempotency-Key parameter', () => {
    expect(openapiContent).toContain('Idempotency-Key');
    expect(openapiContent).toContain('IdempotencyKey');
  });

  it('should have idempotency on payment creation', () => {
    const paymentSection = openapiContent.substring(
      openapiContent.indexOf("  /api/v1/payments:\n"),
      openapiContent.indexOf('/api/v1/payments/{uetr}')
    );
    expect(paymentSection).toContain('IdempotencyKey');
  });

  it('should have 409 Conflict response for idempotent endpoints', () => {
    const paymentSection = openapiContent.substring(
      openapiContent.indexOf("  /api/v1/payments:\n"),
      openapiContent.indexOf('/api/v1/payments/{uetr}')
    );
    expect(paymentSection).toContain("'409'");
  });
});

// =============================================================================
// 4. Enum Consistency Contracts
// =============================================================================

describe('Enum Contracts', () => {
  it('should define payment status values', () => {
    const expected = ['INITIATED', 'ACCEPTED', 'REJECTED', 'SETTLED', 'RETURNED'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });

  it('should define account status values', () => {
    const expected = ['ACTIVE', 'SUSPENDED', 'CLOSED', 'FROZEN'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });

  it('should define payment type values', () => {
    const expected = ['INSTANT', 'WIRE', 'ACH', 'SEPA'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });

  it('should define account type values', () => {
    const expected = ['SETTLEMENT', 'NOSTRO', 'VOSTRO', 'INTERNAL'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });

  it('should define KYC status values', () => {
    const expected = ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });

  it('should define discrepancy severity values', () => {
    const expected = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });

  it('should define user role values', () => {
    const expected = ['ADMIN', 'OPERATOR', 'VIEWER', 'COMPLIANCE'];
    for (const val of expected) {
      expect(openapiContent).toContain(val);
    }
  });
});

// =============================================================================
// 5. Generated Types Validation
// =============================================================================

describe('Generated Types (api.generated.ts)', () => {
  it('should exist and be auto-generated', () => {
    expect(generatedContent).toBeTruthy();
    expect(generatedContent).toContain('Auto-generated from docs/openapi.yaml');
    expect(generatedContent).toContain('Do NOT edit manually');
  });

  it('should export all schema interfaces', () => {
    const schemas = extractSchemas(openapiContent);
    for (const schema of schemas) {
      const hasInterface = generatedContent.includes(`export interface ${schema}`)
        || generatedContent.includes(`export type ${schema}`);
      expect(hasInterface).toBe(true);
    }
  });

  it('should export ApiEndpoints interface', () => {
    expect(generatedContent).toContain('export interface ApiEndpoints');
  });

  it('should map all OpenAPI paths to endpoint types', () => {
    const paths = extractPaths(openapiContent);
    for (const path of paths) {
      // Convert {param} to :param for matching
      const tsPath = path.replace(/\{(\w+)\}/g, ':$1');
      expect(generatedContent).toContain(tsPath);
    }
  });

  it('should export API_PATHS constant with operationIds', () => {
    expect(generatedContent).toContain('export const API_PATHS');
    const opIds = extractOperationIds(openapiContent);
    for (const id of opIds) {
      expect(generatedContent).toContain(id);
    }
  });

  it('should export API_ENUMS for runtime validation', () => {
    expect(generatedContent).toContain('export const API_ENUMS');
    expect(generatedContent).toContain('PaymentResponse_status');
    expect(generatedContent).toContain('Account_status');
    expect(generatedContent).toContain('Discrepancy_severity');
  });

  it('should export SECURITY_SCHEMES constant', () => {
    expect(generatedContent).toContain('export const SECURITY_SCHEMES');
    expect(generatedContent).toContain('bearerAuth');
    expect(generatedContent).toContain('apiKeyAuth');
  });

  it('should export helper types (EndpointRequest, EndpointResponse)', () => {
    expect(generatedContent).toContain('export type EndpointRequest');
    expect(generatedContent).toContain('export type EndpointResponse');
    expect(generatedContent).toContain('export type ApiEndpointKey');
  });

  it('should define required fields on schemas', () => {
    // LoginRequest has required: [email, password]
    expect(generatedContent).toMatch(/interface LoginRequest \{[^}]*email: string;/s);
    expect(generatedContent).toMatch(/interface LoginRequest \{[^}]*password: string;/s);

    // CreatePaymentRequest has required: [uetr, amount, currency, debtorAccount, creditorAccount]
    expect(generatedContent).toMatch(/interface CreatePaymentRequest \{[^}]*uetr: string;/s);
    expect(generatedContent).toMatch(/interface CreatePaymentRequest \{[^}]*amount: number;/s);
  });
});

// =============================================================================
// 6. Hand-Maintained Types Compatibility
// =============================================================================

describe('Hand-Maintained Types Compatibility (lib/api/types.ts)', () => {
  it('should exist', () => {
    expect(handTypesContent).toBeTruthy();
  });

  it('should define overlapping schema types', () => {
    const coreTypes = [
      'LoginRequest',
      'LoginResponse',
      'RegisterRequest',
      'Account',
      'ReconciliationCycle',
      'Discrepancy',
      'CreatePaymentRequest',
    ];
    for (const t of coreTypes) {
      expect(handTypesContent).toContain(t);
    }
  });

  it('should define payment status enum superset', () => {
    // Hand-maintained types may have more statuses than OpenAPI spec
    expect(handTypesContent).toContain("'SETTLED'");
    expect(handTypesContent).toContain("'REJECTED'");
    expect(handTypesContent).toContain("'RETURNED'");
  });

  it('should define account status values compatible with spec', () => {
    expect(handTypesContent).toContain("'ACTIVE'");
    expect(handTypesContent).toContain("'FROZEN'");
    expect(handTypesContent).toContain("'CLOSED'");
    expect(handTypesContent).toContain("'SUSPENDED'");
  });

  it('should define API response wrappers', () => {
    expect(handTypesContent).toContain('PaginatedResponse');
    expect(handTypesContent).toContain('ApiError');
    expect(handTypesContent).toContain('ApiResponse');
  });

  it('should define WebSocket message types', () => {
    expect(handTypesContent).toContain('WebSocketMessage');
    expect(handTypesContent).toContain('PaymentUpdatePayload');
    expect(handTypesContent).toContain('BalanceUpdatePayload');
    expect(handTypesContent).toContain('AlertPayload');
  });

  it('should define audit bundle types', () => {
    expect(handTypesContent).toContain('AuditBundle');
    expect(handTypesContent).toContain('AuditEntry');
    expect(handTypesContent).toContain('AUDIT_BUNDLE_SCHEMA');
  });

  it('should define filter and pagination types', () => {
    expect(handTypesContent).toContain('PaymentFilters');
    expect(handTypesContent).toContain('AccountFilters');
    expect(handTypesContent).toContain('PaginationParams');
  });
});

// =============================================================================
// 7. Endpoint Constants Validation
// =============================================================================

describe('Endpoint Constants (lib/api/endpoints.ts)', () => {
  it('should exist', () => {
    expect(endpointsContent).toBeTruthy();
  });

  it('should define endpoints for all domains', () => {
    const domains = [
      'AUTH_ENDPOINTS',
      'PAYMENT_ENDPOINTS',
      'ACCOUNT_ENDPOINTS',
      'RECONCILIATION_ENDPOINTS',
      'AUDIT_ENDPOINTS',
      'ANALYTICS_ENDPOINTS',
      'NOTIFICATION_ENDPOINTS',
      'USER_ENDPOINTS',
    ];
    for (const domain of domains) {
      expect(endpointsContent).toContain(domain);
    }
  });

  it('should have endpoints matching OpenAPI paths', () => {
    // Auth
    expect(endpointsContent).toContain("'/auth/login'");
    expect(endpointsContent).toContain("'/auth/register'");
    expect(endpointsContent).toContain("'/auth/refresh'");
    expect(endpointsContent).toContain("'/auth/me'");

    // Payments
    expect(endpointsContent).toContain("'/payments'");

    // Accounts
    expect(endpointsContent).toContain("'/accounts'");

    // Reconciliation
    expect(endpointsContent).toContain("'/reconciliation/run'");
    expect(endpointsContent).toContain("'/reconciliation/cycles'");
  });

  it('should provide buildUrl utility', () => {
    expect(endpointsContent).toContain('export function buildUrl');
  });

  it('should provide idempotency key generator', () => {
    expect(endpointsContent).toContain('generateIdempotencyKey');
    expect(endpointsContent).toContain('isValidIdempotencyKey');
  });
});

// =============================================================================
// 8. HTTP Method Contracts
// =============================================================================

describe('HTTP Method Contracts', () => {
  it('should use POST for auth endpoints', () => {
    const authSection = openapiContent.substring(
      openapiContent.indexOf('/api/v1/auth/register'),
      openapiContent.indexOf('# Payment Service') !== -1
        ? openapiContent.indexOf('# Payment Service')
        : openapiContent.indexOf('/api/v1/payments')
    );
    expect(authSection).toContain('post:');
  });

  it('should use GET and POST for payments', () => {
    expect(generatedContent).toContain("'POST /api/v1/payments'");
    expect(generatedContent).toContain("'GET /api/v1/payments/:uetr'");
  });

  it('should use GET and POST for accounts', () => {
    expect(generatedContent).toContain("'POST /api/v1/accounts'");
    expect(generatedContent).toContain("'GET /api/v1/accounts'");
    expect(generatedContent).toContain("'GET /api/v1/accounts/:id'");
  });

  it('should use PATCH for status updates', () => {
    expect(generatedContent).toContain("'PATCH /api/v1/accounts/:id/status'");
    expect(generatedContent).toContain("'PATCH /api/v1/accounts/:id/kyc'");
  });
});

// =============================================================================
// 9. Error Response Contract
// =============================================================================

describe('Error Response Contract', () => {
  it('should define ErrorResponse schema with required fields', () => {
    expect(openapiContent).toContain('ErrorResponse:');
    expect(openapiContent).toMatch(/ErrorResponse:[\s\S]*?required:\s*\[code,\s*message,\s*timestamp\]/);
  });

  it('should reference ErrorResponse in 400 responses', () => {
    expect(openapiContent).toContain("'400':");
    expect(openapiContent).toContain('ErrorResponse');
  });

  it('should reference ErrorResponse in 409 responses', () => {
    expect(openapiContent).toContain("'409':");
  });

  it('should define ErrorResponse in generated types', () => {
    expect(generatedContent).toContain('export interface ErrorResponse');
    expect(generatedContent).toMatch(/interface ErrorResponse \{[^}]*code: string;/s);
    expect(generatedContent).toMatch(/interface ErrorResponse \{[^}]*message: string;/s);
    expect(generatedContent).toMatch(/interface ErrorResponse \{[^}]*timestamp: string;/s);
  });
});

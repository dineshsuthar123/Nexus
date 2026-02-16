/**
 * OpenAPI Contract Tests
 *
 * Validates that the frontend API client types and endpoint definitions
 * match the OpenAPI specification. This ensures the frontend stays in
 * sync with backend API contracts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load OpenAPI spec
const openapiPath = resolve(__dirname, '../../../../docs/openapi.yaml');
let openapiContent: string;

try {
  openapiContent = readFileSync(openapiPath, 'utf-8');
} catch {
  openapiContent = '';
}

// Simple YAML path extractor
function extractPaths(yaml: string): string[] {
  const paths: string[] = [];
  const lines = yaml.split('\n');
  let inPaths = false;

  for (const line of lines) {
    if (line.startsWith('paths:')) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^  \//.test(line)) {
      const path = line.trim().replace(':', '');
      paths.push(path);
    }
    if (inPaths && /^[a-z]/.test(line) && !line.startsWith(' ')) {
      break;
    }
  }
  return paths;
}

// Simple schema name extractor
function extractSchemas(yaml: string): string[] {
  const schemas: string[] = [];
  const lines = yaml.split('\n');
  let inSchemas = false;

  for (const line of lines) {
    if (line.trim() === 'schemas:') {
      inSchemas = true;
      continue;
    }
    if (inSchemas && /^    \w+:$/.test(line)) {
      schemas.push(line.trim().replace(':', ''));
    }
    if (inSchemas && /^  \w/.test(line) && !line.startsWith('    ')) {
      if (!line.includes('schemas')) break;
    }
  }
  return schemas;
}

describe('OpenAPI Contract Tests', () => {
  it('should have a valid OpenAPI spec file', () => {
    expect(openapiContent).toBeTruthy();
    expect(openapiContent).toContain('openapi: 3.1.0');
    expect(openapiContent).toContain('Nexus RTP Platform API');
  });

  it('should define all required API paths', () => {
    const requiredPaths = [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/payments',
      '/api/v1/accounts',
      '/api/v1/reconciliation',
    ];

    for (const path of requiredPaths) {
      expect(openapiContent).toContain(path);
    }
  });

  it('should define required schemas', () => {
    const requiredSchemas = [
      'LoginRequest',
      'LoginResponse',
      'RegisterRequest',
      'UserProfile',
      'CreatePaymentRequest',
      'PaymentResponse',
      'Account',
      'CreateAccountRequest',
      'ReconciliationCycle',
      'Discrepancy',
      'ErrorResponse',
    ];

    const schemas = extractSchemas(openapiContent);
    for (const schema of requiredSchemas) {
      expect(schemas).toContain(schema);
    }
  });

  it('should require authentication on protected endpoints', () => {
    // Payment and Account endpoints should reference security
    expect(openapiContent).toContain('bearerAuth');
    expect(openapiContent).toContain('apiKeyAuth');
  });

  it('should support idempotency keys on POST endpoints', () => {
    expect(openapiContent).toContain('Idempotency-Key');
    expect(openapiContent).toContain('IdempotencyKey');
  });

  it('should define proper HTTP methods for each endpoint', () => {
    // Auth endpoints use POST
    const authSection = openapiContent.substring(
      openapiContent.indexOf('/api/v1/auth/register'),
      openapiContent.indexOf('/api/v1/payments')
    );
    expect(authSection).toContain('post:');

    // Payments should support GET and POST
    const paymentsSection = openapiContent.substring(
      openapiContent.indexOf('/api/v1/payments'),
      openapiContent.indexOf('/api/v1/accounts')
    );
    expect(paymentsSection).toContain('post:');
    expect(paymentsSection).toContain('get:');
  });

  it('should define error response schemas', () => {
    expect(openapiContent).toContain("'400':");
    expect(openapiContent).toContain("'401':");
    expect(openapiContent).toContain('ErrorResponse');
  });

  it('should define payment status enum values', () => {
    expect(openapiContent).toContain('INITIATED');
    expect(openapiContent).toContain('ACCEPTED');
    expect(openapiContent).toContain('REJECTED');
    expect(openapiContent).toContain('SETTLED');
    expect(openapiContent).toContain('RETURNED');
  });

  it('should define account status enum values', () => {
    expect(openapiContent).toContain('ACTIVE');
    expect(openapiContent).toContain('SUSPENDED');
    expect(openapiContent).toContain('CLOSED');
    expect(openapiContent).toContain('FROZEN');
  });

  it('should define account type enum values', () => {
    expect(openapiContent).toContain('SETTLEMENT');
    expect(openapiContent).toContain('NOSTRO');
    expect(openapiContent).toContain('VOSTRO');
    expect(openapiContent).toContain('INTERNAL');
  });
});

describe('Generated Types Contract', () => {
  it('should have generated types file', async () => {
    const typesPath = resolve(__dirname, '../types/api.generated.ts');
    const typesContent = readFileSync(typesPath, 'utf-8');

    expect(typesContent).toContain('Auto-generated from docs/openapi.yaml');
    expect(typesContent).toContain('LoginRequest');
    expect(typesContent).toContain('PaymentResponse');
    expect(typesContent).toContain('Account');
    expect(typesContent).toContain('ReconciliationCycle');
  });

  it('should define all API endpoint types', async () => {
    const typesPath = resolve(__dirname, '../types/api.generated.ts');
    const typesContent = readFileSync(typesPath, 'utf-8');

    const requiredEndpoints = [
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'POST /api/v1/payments',
      'GET /api/v1/payments',
      'GET /api/v1/accounts',
      'POST /api/v1/reconciliation/run',
    ];

    for (const endpoint of requiredEndpoints) {
      expect(typesContent).toContain(endpoint);
    }
  });
});

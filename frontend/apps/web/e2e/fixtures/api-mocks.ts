/**
 * Nexus RTP Platform - E2E API Mock Fixtures
 *
 * Provides Playwright route handlers that intercept API calls
 * and return realistic mock data, enabling E2E tests to run
 * without a live backend.
 */

import { Page, Route } from '@playwright/test';

const API_BASE = '**/api/v1';

// =============================================================================
// Mock Data
// =============================================================================

export const MOCK_USER = {
  id: 'usr-001',
  email: 'test@nexusrtp.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'ADMIN',
  organizationId: 'org-001',
  organizationName: 'Nexus Test Org',
  mfaEnabled: false,
  emailVerified: true,
  createdAt: '2025-01-01T00:00:00Z',
  lastLoginAt: '2025-06-01T10:00:00Z',
};

export const MOCK_LOGIN_RESPONSE = {
  accessToken: 'mock-access-token-jwt',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
  tokenType: 'Bearer',
  user: MOCK_USER,
};

export const MOCK_PAYMENTS = [
  {
    id: 'pay-001',
    uetr: 'uetr-001-abc-def',
    amount: 50000,
    currency: 'USD',
    status: 'SETTLED',
    type: 'INSTANT',
    debtorName: 'Acme Corp',
    debtorAccount: 'ACC-001',
    creditorName: 'Beta Inc',
    creditorAccount: 'ACC-002',
    remittanceInfo: 'Invoice INV-2025-001',
    createdAt: '2025-06-01T10:00:00Z',
    updatedAt: '2025-06-01T10:05:00Z',
    settledAt: '2025-06-01T10:05:00Z',
  },
  {
    id: 'pay-002',
    uetr: 'uetr-002-ghi-jkl',
    amount: 25000,
    currency: 'EUR',
    status: 'INITIATED',
    type: 'STANDARD',
    debtorName: 'Gamma Ltd',
    debtorAccount: 'ACC-003',
    creditorName: 'Delta SA',
    creditorAccount: 'ACC-004',
    remittanceInfo: 'Payment for services',
    createdAt: '2025-06-02T14:30:00Z',
    updatedAt: '2025-06-02T14:30:00Z',
  },
  {
    id: 'pay-003',
    uetr: 'uetr-003-mno-pqr',
    amount: 100000,
    currency: 'GBP',
    status: 'PROCESSING',
    type: 'INSTANT',
    debtorName: 'Epsilon PLC',
    debtorAccount: 'ACC-005',
    creditorName: 'Zeta GmbH',
    creditorAccount: 'ACC-006',
    createdAt: '2025-06-03T09:15:00Z',
    updatedAt: '2025-06-03T09:16:00Z',
  },
];

export const MOCK_ACCOUNTS = [
  {
    id: 'acc-001',
    name: 'Main Settlement',
    type: 'SETTLEMENT',
    currency: 'USD',
    balance: 1500000,
    availableBalance: 1450000,
    pendingBalance: 50000,
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    accountNumber: '1234567890',
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'acc-002',
    name: 'EUR Nostro',
    type: 'NOSTRO',
    currency: 'EUR',
    balance: 750000,
    availableBalance: 750000,
    pendingBalance: 0,
    status: 'ACTIVE',
    kycStatus: 'VERIFIED',
    accountNumber: '0987654321',
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'acc-003',
    name: 'GBP Vostro',
    type: 'VOSTRO',
    currency: 'GBP',
    balance: 250000,
    availableBalance: 230000,
    pendingBalance: 20000,
    status: 'ACTIVE',
    kycStatus: 'PENDING',
    accountNumber: '1122334455',
    createdAt: '2025-03-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
  },
];

export const MOCK_RECONCILIATION_CYCLES = [
  {
    id: 'rec-001',
    date: '2025-06-01',
    status: 'COMPLETED',
    startedAt: '2025-06-01T23:00:00Z',
    completedAt: '2025-06-01T23:15:00Z',
    startTime: '2025-06-01T23:00:00Z',
    endTime: '2025-06-01T23:15:00Z',
    totalTransactions: 1250,
    matchedTransactions: 1230,
    matchedCount: 1230,
    discrepancyCount: 20,
    matchRate: 98.4,
  },
  {
    id: 'rec-002',
    date: '2025-06-02',
    status: 'COMPLETED',
    startedAt: '2025-06-02T23:00:00Z',
    completedAt: '2025-06-02T23:12:00Z',
    startTime: '2025-06-02T23:00:00Z',
    endTime: '2025-06-02T23:12:00Z',
    totalTransactions: 980,
    matchedTransactions: 975,
    matchedCount: 975,
    discrepancyCount: 5,
    matchRate: 99.49,
  },
];

export const MOCK_DASHBOARD_SUMMARY = {
  totalVolume: 175000,
  totalTransactions: 3,
  activeUsers: 12,
  globalReach: 5,
  volumeChange: 12.5,
  transactionChange: 8.3,
  userChange: 2,
  newCountries: 1,
  topCategories: [
    { name: 'Wire Transfer', volume: 100000, percentage: 57 },
    { name: 'Instant Payment', volume: 50000, percentage: 29 },
    { name: 'ACH', volume: 25000, percentage: 14 },
  ],
  transactionTypes: [
    { name: 'Instant', percentage: 60, color: '#3B82F6' },
    { name: 'Standard', percentage: 30, color: '#10B981' },
    { name: 'Scheduled', percentage: 10, color: '#F59E0B' },
  ],
  regions: [
    { name: 'North America', volume: 100000, percentage: 57 },
    { name: 'Europe', volume: 50000, percentage: 29 },
    { name: 'Asia Pacific', volume: 25000, percentage: 14 },
  ],
};

export const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-001',
    title: 'Payment Settled',
    message: 'Payment uetr-001-abc-def has been settled successfully',
    severity: 'INFO',
    read: false,
    createdAt: '2025-06-01T10:05:00Z',
  },
  {
    id: 'notif-002',
    title: 'KYC Review Required',
    message: 'Account acc-003 requires KYC review',
    severity: 'WARNING',
    read: false,
    createdAt: '2025-06-01T09:00:00Z',
  },
];

// =============================================================================
// Route Handlers
// =============================================================================

export async function setupApiMocks(page: Page) {
  // Auth endpoints
  await page.route(`${API_BASE}/auth/login`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LOGIN_RESPONSE),
    });
  });

  await page.route(`${API_BASE}/auth/register`, async (route: Route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ user: MOCK_USER, message: 'Registration successful', requiresEmailVerification: true }),
    });
  });

  await page.route(`${API_BASE}/auth/me`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });

  await page.route(`${API_BASE}/auth/refresh`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'new-token', refreshToken: 'new-refresh', expiresIn: 3600 }),
    });
  });

  await page.route(`${API_BASE}/auth/logout`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.route(`${API_BASE}/auth/forgot-password`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Password reset email sent' }),
    });
  });

  // Payment endpoints
  await page.route(`${API_BASE}/payments`, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: MOCK_PAYMENTS,
          pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1, hasNext: false, hasPrevious: false },
        }),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      const newPayment = {
        id: 'pay-new',
        uetr: `uetr-${Date.now()}`,
        ...body,
        status: 'INITIATED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ uetr: newPayment.uetr, status: 'INITIATED', message: 'Payment created', payment: newPayment }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route(`${API_BASE}/payments/*`, async (route: Route) => {
    const url = route.request().url();
    const uetr = url.split('/payments/')[1]?.split('/')[0]?.split('?')[0];
    const payment = MOCK_PAYMENTS.find(p => p.uetr === uetr);

    if (url.includes('/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uetr,
          status: payment?.status || 'INITIATED',
          statusHistory: [
            { status: 'INITIATED', timestamp: payment?.createdAt || new Date().toISOString() },
            ...(payment?.status === 'SETTLED' ? [{ status: 'SETTLED', timestamp: payment.settledAt }] : []),
          ],
        }),
      });
    } else if (payment) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payment),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'NOT_FOUND', message: 'Payment not found', timestamp: new Date().toISOString() }),
      });
    }
  });

  // Account endpoints
  await page.route(`${API_BASE}/accounts`, async (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: MOCK_ACCOUNTS,
          pagination: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1, hasNext: false, hasPrevious: false },
        }),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      const newAccount = { id: 'acc-new', ...body, status: 'ACTIVE', kycStatus: 'PENDING', balance: 0, availableBalance: 0, pendingBalance: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ account: newAccount, message: 'Account created' }) });
    } else {
      await route.continue();
    }
  });

  await page.route(`${API_BASE}/accounts/*`, async (route: Route) => {
    const url = route.request().url();
    const id = url.split('/accounts/')[1]?.split('/')[0]?.split('?')[0];
    const account = MOCK_ACCOUNTS.find(a => a.id === id);

    if (url.includes('/balance')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accountId: id, balance: account?.balance || 0, availableBalance: account?.availableBalance || 0, pendingBalance: account?.pendingBalance || 0, currency: account?.currency || 'USD', asOf: new Date().toISOString() }),
      });
    } else if (account) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(account) });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND', message: 'Account not found', timestamp: new Date().toISOString() }) });
    }
  });

  // Reconciliation endpoints
  await page.route(`${API_BASE}/reconciliation/cycles`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: MOCK_RECONCILIATION_CYCLES,
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1, hasNext: false, hasPrevious: false },
      }),
    });
  });

  await page.route(`${API_BASE}/reconciliation/run`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cycleId: 'rec-new', status: 'RUNNING', message: 'Reconciliation started' }),
    });
  });

  await page.route(`${API_BASE}/reconciliation/cycles/*`, async (route: Route) => {
    const url = route.request().url();
    const id = url.split('/cycles/')[1]?.split('/')[0]?.split('?')[0];
    const cycle = MOCK_RECONCILIATION_CYCLES.find(c => c.id === id);

    if (url.includes('/discrepancies')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'disc-001', cycleId: id, type: 'AMOUNT_MISMATCH', severity: 'MEDIUM', description: 'Amount differs by $50', status: 'OPEN', expectedAmount: 50000, actualAmount: 49950, createdAt: new Date().toISOString() },
          ],
        }),
      });
    } else if (cycle) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cycle) });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND', message: 'Cycle not found', timestamp: new Date().toISOString() }) });
    }
  });

  // Analytics endpoints
  await page.route(`${API_BASE}/analytics/**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DASHBOARD_SUMMARY),
    });
  });

  // Notifications
  await page.route(`${API_BASE}/notifications`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_NOTIFICATIONS, pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1, hasNext: false, hasPrevious: false } }),
    });
  });

  // Audit
  await page.route(`${API_BASE}/audit/**`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrevious: false } }),
    });
  });

  // Health
  await page.route(`${API_BASE}/health`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) });
  });

  // User profile / settings
  await page.route(`${API_BASE}/users/**`, async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) });
  });

  // NextAuth session (critical for protected routes)
  await page.route('**/api/auth/session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { ...MOCK_USER, name: `${MOCK_USER.firstName} ${MOCK_USER.lastName}`, image: null },
        expires: new Date(Date.now() + 86400000).toISOString(),
        accessToken: 'mock-access-token-jwt',
      }),
    });
  });

  // NextAuth CSRF token
  await page.route('**/api/auth/csrf', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
    });
  });

  // NextAuth providers
  await page.route('**/api/auth/providers', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ credentials: { id: 'credentials', name: 'Credentials', type: 'credentials' } }),
    });
  });
}

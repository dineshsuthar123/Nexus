/**
 * Nexus RTP Platform - Mock Backend Server
 *
 * A lightweight Express server for frontend development when the
 * real backend is not available.
 *
 * Usage:
 *   cd frontend/dev-mock
 *   npm install express cors
 *   node server.js
 *
 * Or from root:
 *   node frontend/dev-mock/server.js
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_USERS = {
  'dev@nexusrtp.com': {
    id: 'usr_mock_001',
    email: 'dev@nexusrtp.com',
    firstName: 'Dev',
    lastName: 'User',
    role: 'admin',
    permissions: ['payments:read', 'payments:write', 'accounts:read', 'accounts:write', 'admin:read'],
    mfaEnabled: false,
    emailVerified: true,
    avatar: null,
    organization: 'Nexus Platform',
  },
  'test@nexusrtp.com': {
    id: 'usr_mock_002',
    email: 'test@nexusrtp.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    permissions: ['payments:read', 'accounts:read'],
    mfaEnabled: false,
    emailVerified: true,
    avatar: null,
    organization: 'Test Org',
  },
};

const MOCK_ACCOUNTS = [
  { id: 'acc_001', name: 'Operating Account', balance: 1250000.00, currency: 'USD', type: 'operational', status: 'active' },
  { id: 'acc_002', name: 'Settlement Account', balance: 850000.00, currency: 'USD', type: 'settlement', status: 'active' },
  { id: 'acc_003', name: 'Reserve Account', balance: 500000.00, currency: 'USD', type: 'reserve', status: 'active' },
  { id: 'acc_004', name: 'EUR Operations', balance: 320000.00, currency: 'EUR', type: 'operational', status: 'active' },
];

const MOCK_PAYMENTS = [
  { id: 'pmt_001', amount: 15000.00, currency: 'USD', status: 'completed', from: 'acc_001', to: 'acc_002', createdAt: new Date().toISOString() },
  { id: 'pmt_002', amount: 8500.00, currency: 'USD', status: 'pending', from: 'acc_001', to: 'acc_003', createdAt: new Date().toISOString() },
  { id: 'pmt_003', amount: 25000.00, currency: 'USD', status: 'completed', from: 'acc_002', to: 'acc_001', createdAt: new Date().toISOString() },
];

// Token generation
function generateToken() {
  return 'mock_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// =============================================================================
// Health Check
// =============================================================================

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'nexus-mock-backend', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// =============================================================================
// Auth Endpoints
// =============================================================================

// Login
app.post('/api/v1/auth/login', (req, res) => {
  const { email, password, mfaCode } = req.body;
  console.log('[Mock Auth] Login attempt:', { email });

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = MOCK_USERS[email];
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  // Mock server: accept any non-empty password for development
  if (!password) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Simulate MFA requirement
  if (user.mfaEnabled && !mfaCode) {
    return res.status(403).json({ code: 'MFA_REQUIRED', message: 'MFA verification required' });
  }

  const accessToken = generateToken();
  const refreshToken = generateToken();

  res.json({
    accessToken,
    refreshToken,
    expiresIn: 3600, // 1 hour
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: user.permissions,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      avatar: user.avatar,
      organization: user.organization,
    },
  });
});

// Register
app.post('/api/v1/auth/register', (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  console.log('[Mock Auth] Register:', { email, firstName, lastName });

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (MOCK_USERS[email]) {
    return res.status(409).json({ message: 'User already exists' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    email,
    firstName,
    lastName,
    role: 'user',
    permissions: ['payments:read', 'accounts:read'],
    mfaEnabled: false,
    emailVerified: false,
  };

  res.status(201).json({
    message: 'Registration successful. Please check your email to verify your account.',
    user: newUser,
  });
});

// Refresh token
app.post('/api/v1/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  console.log('[Mock Auth] Token refresh');

  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }

  res.json({
    accessToken: generateToken(),
    refreshToken: generateToken(),
    expiresIn: 3600,
  });
});

// Forgot password
app.post('/api/v1/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  console.log('[Mock Auth] Forgot password:', { email });

  res.json({ message: 'If an account exists, a reset link has been sent.' });
});

// Reset password
app.post('/api/v1/auth/reset-password', (req, res) => {
  console.log('[Mock Auth] Reset password');
  res.json({ message: 'Password has been reset successfully.' });
});

// Get current user
app.get('/api/v1/auth/me', (req, res) => {
  // In a real app, validate the JWT token
  res.json({
    id: 'usr_mock_001',
    email: 'dev@nexusrtp.com',
    firstName: 'Dev',
    lastName: 'User',
    role: 'admin',
    permissions: ['payments:read', 'payments:write', 'accounts:read', 'accounts:write'],
    mfaEnabled: false,
    emailVerified: true,
  });
});

// =============================================================================
// Accounts Endpoints
// =============================================================================

app.get('/api/v1/accounts', (req, res) => {
  console.log('[Mock API] Get accounts');
  res.json({
    data: MOCK_ACCOUNTS,
    meta: { total: MOCK_ACCOUNTS.length, page: 1, limit: 10 },
  });
});

app.get('/api/v1/accounts/:id', (req, res) => {
  const account = MOCK_ACCOUNTS.find(a => a.id === req.params.id);
  if (!account) {
    return res.status(404).json({ message: 'Account not found' });
  }
  res.json(account);
});

app.post('/api/v1/accounts', (req, res) => {
  console.log('[Mock API] Create account:', req.body);
  const newAccount = {
    id: 'acc_' + Date.now(),
    ...req.body,
    balance: 0,
    status: 'active',
  };
  res.status(201).json(newAccount);
});

// =============================================================================
// Payments Endpoints
// =============================================================================

app.get('/api/v1/payments', (req, res) => {
  console.log('[Mock API] Get payments');
  res.json({
    data: MOCK_PAYMENTS,
    meta: { total: MOCK_PAYMENTS.length, page: 1, limit: 10 },
  });
});

app.get('/api/v1/payments/:id', (req, res) => {
  const payment = MOCK_PAYMENTS.find(p => p.id === req.params.id);
  if (!payment) {
    return res.status(404).json({ message: 'Payment not found' });
  }
  res.json(payment);
});

app.post('/api/v1/payments', (req, res) => {
  console.log('[Mock API] Create payment:', req.body);
  const newPayment = {
    id: 'pmt_' + Date.now(),
    ...req.body,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  res.status(201).json(newPayment);
});

// =============================================================================
// Dashboard Stats
// =============================================================================

app.get('/api/v1/dashboard/stats', (req, res) => {
  res.json({
    totalBalance: 2920000.00,
    totalTransactions: 15234,
    pendingPayments: 23,
    completedToday: 145,
    successRate: 99.7,
  });
});

// =============================================================================
// 404 Handler
// =============================================================================

app.use((req, res) => {
  console.log('[Mock API] 404:', req.method, req.path);
  res.status(404).json({ message: 'Endpoint not found' });
});

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                 NEXUS RTP Mock Backend                       ║
╠══════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                    ║
║                                                              ║
║  Test credentials:                                           ║
║    Email:    dev@nexusrtp.com                                ║
║    Password: (any non-empty value)                           ║
║                                                              ║
║  Endpoints:                                                  ║
║    POST /api/v1/auth/login                                   ║
║    POST /api/v1/auth/register                                ║
║    POST /api/v1/auth/refresh                                 ║
║    GET  /api/v1/accounts                                     ║
║    GET  /api/v1/payments                                     ║
║    GET  /api/v1/dashboard/stats                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

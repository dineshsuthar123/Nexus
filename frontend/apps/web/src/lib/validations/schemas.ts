/**
 * Nexus RTP Platform - Form Validation Schemas
 * 
 * Zod schemas for validating all form inputs across the application.
 * These schemas provide:
 * - Type-safe validation
 * - Automatic TypeScript type inference
 * - Clear error messages
 * - Reusable validation patterns
 */

import { z } from 'zod';

// =============================================================================
// Common Patterns
// =============================================================================

// Email validation
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .max(255, 'Email must be less than 255 characters');

// Password validation with strength requirements
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Simple password (for login - no strength check)
export const loginPasswordSchema = z
  .string()
  .min(1, 'Password is required')
  .max(128, 'Password must be less than 128 characters');

// Phone number validation (E.164 format)
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number in international format (e.g., +1234567890)')
  .optional()
  .or(z.literal(''));

// Amount validation for payments
export const amountSchema = z
  .number()
  .positive('Amount must be greater than 0')
  .max(999999999999.99, 'Amount exceeds maximum limit')
  .multipleOf(0.01, 'Amount can have at most 2 decimal places');

// Currency code validation (ISO 4217)
export const currencySchema = z
  .string()
  .length(3, 'Currency code must be exactly 3 characters')
  .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase letters (e.g., USD, EUR)');

// IBAN validation
export const ibanSchema = z
  .string()
  .min(15, 'IBAN must be at least 15 characters')
  .max(34, 'IBAN must be at most 34 characters')
  .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, 'Please enter a valid IBAN');

// BIC/SWIFT code validation
export const bicSchema = z
  .string()
  .regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Please enter a valid BIC/SWIFT code');

// UUID validation
export const uuidSchema = z.string().uuid('Please enter a valid UUID');

// UETR validation (Unique End-to-End Transaction Reference)
export const uetrSchema = z
  .string()
  .uuid('UETR must be a valid UUID format');

// Date validation
export const dateSchema = z.coerce.date();

// Future date validation
export const futureDateSchema = z.coerce.date().refine(
  (date) => date > new Date(),
  'Date must be in the future'
);

// Past date validation
export const pastDateSchema = z.coerce.date().refine(
  (date) => date < new Date(),
  'Date must be in the past'
);

// =============================================================================
// Auth Schemas
// =============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
  rememberMe: z.boolean().optional().default(false),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
  organization: z
    .string()
    .max(255, 'Organization name must be less than 255 characters')
    .optional(),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: loginPasswordSchema,
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .length(6, 'Verification code must be 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain only numbers'),
});

// =============================================================================
// Payment Schemas
// =============================================================================

export const createPaymentSchema = z.object({
  // Amount and currency
  amount: amountSchema,
  currency: currencySchema,

  // Debtor (sender) information
  debtorName: z
    .string()
    .min(1, 'Debtor name is required')
    .max(140, 'Debtor name must be less than 140 characters'),
  debtorAccount: ibanSchema,
  debtorBic: bicSchema,

  // Creditor (recipient) information
  creditorName: z
    .string()
    .min(1, 'Creditor name is required')
    .max(140, 'Creditor name must be less than 140 characters'),
  creditorAccount: ibanSchema,
  creditorBic: bicSchema,

  // Payment details
  paymentType: z.enum(['INSTANT', 'STANDARD', 'SCHEDULED'], {
    errorMap: () => ({ message: 'Please select a valid payment type' }),
  }),
  
  endToEndId: z
    .string()
    .max(35, 'End-to-end ID must be less than 35 characters')
    .optional(),

  remittanceInfo: z
    .string()
    .max(140, 'Remittance information must be less than 140 characters')
    .optional(),

  scheduledDate: z.coerce.date().optional(),
  
  purpose: z
    .string()
    .max(4, 'Purpose code must be 4 characters or less')
    .optional(),

  // Priority
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
}).refine(
  (data) => {
    if (data.paymentType === 'SCHEDULED') {
      return data.scheduledDate && data.scheduledDate > new Date();
    }
    return true;
  },
  {
    message: 'Scheduled payments require a future date',
    path: ['scheduledDate'],
  }
);

export const paymentFilterSchema = z.object({
  status: z.array(z.string()).optional(),
  type: z.array(z.string()).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  currency: currencySchema.optional(),
  debtorName: z.string().optional(),
  creditorName: z.string().optional(),
  search: z.string().optional(),
});

// =============================================================================
// Account Schemas
// =============================================================================

export const createAccountSchema = z.object({
  // Account holder information
  holderName: z
    .string()
    .min(1, 'Account holder name is required')
    .max(140, 'Account holder name must be less than 140 characters'),
  
  holderType: z.enum(['INDIVIDUAL', 'CORPORATE'], {
    errorMap: () => ({ message: 'Please select account holder type' }),
  }),

  // Account details
  accountType: z.enum(['CHECKING', 'SAVINGS', 'MERCHANT', 'SETTLEMENT'], {
    errorMap: () => ({ message: 'Please select account type' }),
  }),

  currency: currencySchema,

  // Optional IBAN (auto-generated if not provided)
  iban: ibanSchema.optional(),

  // Initial deposit
  initialDeposit: z
    .number()
    .nonnegative('Initial deposit cannot be negative')
    .optional()
    .default(0),

  // Contact information
  email: emailSchema,
  phone: phoneSchema,

  // Address
  addressLine1: z.string().max(100, 'Address line 1 must be less than 100 characters').optional(),
  addressLine2: z.string().max(100, 'Address line 2 must be less than 100 characters').optional(),
  city: z.string().max(50, 'City must be less than 50 characters').optional(),
  postalCode: z.string().max(20, 'Postal code must be less than 20 characters').optional(),
  country: z.string().length(2, 'Country must be a 2-letter ISO code').optional(),

  // KYC
  taxId: z.string().max(50, 'Tax ID must be less than 50 characters').optional(),
});

export const accountFilterSchema = z.object({
  status: z.array(z.string()).optional(),
  type: z.array(z.string()).optional(),
  currency: currencySchema.optional(),
  minBalance: z.number().optional(),
  maxBalance: z.number().optional(),
  holderName: z.string().optional(),
  search: z.string().optional(),
});

// =============================================================================
// Reconciliation Schemas
// =============================================================================

export const runReconciliationSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  accountIds: z.array(uuidSchema).min(1, 'Select at least one account'),
  includeSettled: z.boolean().default(true),
  autoResolve: z.boolean().default(false),
}).refine(
  (data) => data.endDate >= data.startDate,
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export const resolveDiscrepancySchema = z.object({
  discrepancyId: uuidSchema,
  resolution: z.enum(['ACCEPT_SOURCE', 'ACCEPT_TARGET', 'MANUAL', 'IGNORE'], {
    errorMap: () => ({ message: 'Please select a resolution method' }),
  }),
  notes: z
    .string()
    .min(10, 'Please provide at least 10 characters explaining the resolution')
    .max(500, 'Notes must be less than 500 characters'),
  adjustmentAmount: amountSchema.optional(),
});

// =============================================================================
// User Profile Schemas
// =============================================================================

export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters'),
  phone: phoneSchema,
  timezone: z.string().optional(),
  language: z.string().length(2, 'Language must be a 2-letter code').default('en'),
  notificationPreferences: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(true),
    sms: z.boolean().default(false),
  }).optional(),
});

// =============================================================================
// Search and Filter Schemas
// =============================================================================

export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(255),
  type: z.enum(['all', 'payments', 'accounts', 'reconciliation']).default('all'),
});

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(10).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// =============================================================================
// Type Exports
// =============================================================================

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type MfaCodeFormData = z.infer<typeof mfaCodeSchema>;
export type CreatePaymentFormData = z.infer<typeof createPaymentSchema>;
export type PaymentFilterFormData = z.infer<typeof paymentFilterSchema>;
export type CreateAccountFormData = z.infer<typeof createAccountSchema>;
export type AccountFilterFormData = z.infer<typeof accountFilterSchema>;
export type RunReconciliationFormData = z.infer<typeof runReconciliationSchema>;
export type ResolveDiscrepancyFormData = z.infer<typeof resolveDiscrepancySchema>;
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;
export type SearchFormData = z.infer<typeof searchSchema>;
export type PaginationFormData = z.infer<typeof paginationSchema>;

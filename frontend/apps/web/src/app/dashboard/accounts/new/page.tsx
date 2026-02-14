/**
 * Nexus RTP Platform - Create Account Page
 * 
 * Account creation form with:
 * - Account type selection
 * - IBAN/BIC generation or manual entry
 * - Currency selection
 * - Validation
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  Button,
  Input,
  Badge,
} from '@nexus/ui';
import { 
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Wallet,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

import { useCreateAccount } from '@/lib/hooks';
import type { AccountType, Currency } from '@/lib/api/types';

// =============================================================================
// Form Schema
// =============================================================================

const createAccountFormSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(140, 'Name must be less than 140 characters'),
  type: z.enum(['CHECKING', 'SAVINGS', 'TREASURY', 'SETTLEMENT', 'NOSTRO', 'VOSTRO', 'INTERNAL'] as const),
  currency: z.enum(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'INR'] as const),
  accountNumber: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

type CreateAccountFormData = z.infer<typeof createAccountFormSchema>;

// =============================================================================
// Account Type Selector
// =============================================================================

const ACCOUNT_TYPES: Array<{
  value: AccountType;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'SETTLEMENT',
    label: 'Settlement',
    description: 'Main settlement account for payment processing',
    icon: <Wallet className="h-6 w-6" />,
  },
  {
    value: 'NOSTRO',
    label: 'Nostro',
    description: 'Our account held at another bank',
    icon: <TrendingUp className="h-6 w-6" />,
  },
  {
    value: 'VOSTRO',
    label: 'Vostro',
    description: 'Another bank\'s account held by us',
    icon: <TrendingDown className="h-6 w-6" />,
  },
  {
    value: 'INTERNAL',
    label: 'Internal',
    description: 'Internal ledger account',
    icon: <Building2 className="h-6 w-6" />,
  },
];

function AccountTypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: AccountType;
  onChange: (value: AccountType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {ACCOUNT_TYPES.map((type) => (
        <button
          key={type.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(type.value)}
          className={`
            relative flex flex-col items-start p-4 rounded-lg border-2 transition-all text-left
            ${value === type.value 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-primary/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className={`mb-3 ${value === type.value ? 'text-primary' : 'text-muted-foreground'}`}>
            {type.icon}
          </div>
          <span className="font-medium">{type.label}</span>
          <span className="text-xs text-muted-foreground mt-1">
            {type.description}
          </span>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Currency Selector
// =============================================================================

const CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
];

// =============================================================================
// Main Component
// =============================================================================

export default function CreateAccountPage() {
  const router = useRouter();
  const createAccount = useCreateAccount();
  
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateAccountFormData>({
    resolver: zodResolver(createAccountFormSchema),
    defaultValues: {
      name: '',
      type: 'SETTLEMENT',
      currency: 'EUR',
      accountNumber: '',
      iban: '',
      bic: '',
      description: '',
    },
  });

  const accountType = watch('type');
  const currency = watch('currency');

  const onSubmit = async (data: CreateAccountFormData) => {
    setSubmitError(null);

    try {
      const account = await createAccount.mutateAsync({
        name: data.name,
        type: data.type,
        currency: data.currency,
        customerId: 'default', // TODO: Allow customer selection in form
        metadata: data.description ? { description: data.description } : undefined,
      });

      // Redirect to account detail page
      router.push(`/dashboard/accounts/${account.id}?created=true`);
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to create account. Please try again.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Accounts
        </Link>
        <h1 className="page-title">Create Account</h1>
        <p className="page-description">
          Set up a new settlement, nostro, or vostro account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Account Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Type</CardTitle>
            <CardDescription>
              Select the type of account you want to create
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountTypeSelector
              value={accountType as AccountType}
              onChange={(value) => setValue('type', value)}
              disabled={isSubmitting || createAccount.isPending}
            />
            {errors.type && (
              <p className="text-sm text-destructive mt-2">{errors.type.message}</p>
            )}
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Information</CardTitle>
            <CardDescription>
              Enter the basic account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Account Name *
              </label>
              <Input
                id="name"
                placeholder="e.g., Main Settlement Account"
                {...register('name')}
                aria-invalid={!!errors.name}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="currency" className="text-sm font-medium">
                  Currency *
                </label>
                <select
                  id="currency"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...register('currency')}
                >
                  {CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} - {curr.name}
                    </option>
                  ))}
                </select>
                {errors.currency && (
                  <p className="text-sm text-destructive">{errors.currency.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="accountNumber" className="text-sm font-medium">
                  Account Number
                </label>
                <Input
                  id="accountNumber"
                  placeholder="Auto-generated if empty"
                  {...register('accountNumber')}
                  className="font-mono"
                />
                {errors.accountNumber && (
                  <p className="text-sm text-destructive">{errors.accountNumber.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                placeholder="Optional description for this account..."
                {...register('description')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bank Details</CardTitle>
            <CardDescription>
              Optional IBAN and BIC for external settlement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="iban" className="text-sm font-medium">
                IBAN
              </label>
              <Input
                id="iban"
                placeholder="DE89370400440532013000"
                {...register('iban')}
                aria-invalid={!!errors.iban}
                className={`font-mono ${errors.iban ? 'border-destructive' : ''}`}
              />
              {errors.iban && (
                <p className="text-sm text-destructive">{errors.iban.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                International Bank Account Number for SEPA payments
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="bic" className="text-sm font-medium">
                BIC/SWIFT
              </label>
              <Input
                id="bic"
                placeholder="COBADEFFXXX"
                {...register('bic')}
                aria-invalid={!!errors.bic}
                className={`font-mono ${errors.bic ? 'border-destructive' : ''}`}
              />
              {errors.bic && (
                <p className="text-sm text-destructive">{errors.bic.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Bank Identifier Code for international transfers
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {submitError && (
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{submitError}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting || createAccount.isPending}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting || createAccount.isPending}
          >
            {(isSubmitting || createAccount.isPending) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Create Account
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

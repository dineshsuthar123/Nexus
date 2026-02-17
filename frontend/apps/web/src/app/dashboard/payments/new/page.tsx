/**
 * Nexus RTP Platform - Create Payment Page
 *
 * Payment creation form with:
 * - Multi-step wizard
 * - IBAN/BIC validation
 * - Amount formatting
 * - Confirmation step
 * - Real-time validation with Zod
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Badge,
  CurrencyDisplay,
} from '@nexus/ui';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  User,
  CreditCard,
  FileText,
  Zap,
  Clock,
  Calendar,
} from 'lucide-react';

import { useCreatePayment } from '@/lib/hooks';
import { createPaymentSchema, type CreatePaymentFormData } from '@/lib/validations/schemas';
import type { Currency } from '@/lib/api/types';

// =============================================================================
// Types
// =============================================================================

type Step = 'debtor' | 'creditor' | 'details' | 'review';

const STEPS: { id: Step; title: string; icon: React.ReactNode }[] = [
  { id: 'debtor', title: 'Sender', icon: <User className="h-4 w-4" /> },
  { id: 'creditor', title: 'Recipient', icon: <Building2 className="h-4 w-4" /> },
  { id: 'details', title: 'Details', icon: <FileText className="h-4 w-4" /> },
  { id: 'review', title: 'Review', icon: <CheckCircle2 className="h-4 w-4" /> },
];

// =============================================================================
// Payment Type Selector
// =============================================================================

function PaymentTypeSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const types = [
    {
      value: 'INSTANT',
      label: 'Instant',
      description: 'Immediate transfer (24/7)',
      icon: <Zap className="h-5 w-5" />,
      badge: 'Fastest',
    },
    {
      value: 'STANDARD',
      label: 'Standard',
      description: 'Next business day',
      icon: <Clock className="h-5 w-5" />,
    },
    {
      value: 'SCHEDULED',
      label: 'Scheduled',
      description: 'Choose a future date',
      icon: <Calendar className="h-5 w-5" />,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {types.map((type) => (
        <button
          key={type.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(type.value)}
          className={`
            relative flex flex-col items-center p-4 rounded-lg border-2 transition-all
            ${value === type.value
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {type.badge && (
            <Badge
              variant="default"
              className="absolute -top-2 -right-2 text-xs"
            >
              {type.badge}
            </Badge>
          )}
          <div className={`mb-2 ${value === type.value ? 'text-primary' : 'text-muted-foreground'}`}>
            {type.icon}
          </div>
          <span className="font-medium text-sm">{type.label}</span>
          <span className="text-xs text-muted-foreground text-center mt-1">
            {type.description}
          </span>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Step Progress
// =============================================================================

function StepProgress({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step.id === currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors
                  ${isCompleted
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isCurrent
                      ? 'border-primary text-primary'
                      : 'border-muted text-muted-foreground'
                  }
                `}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  step.icon
                )}
              </div>
              <span className={`mt-2 text-xs font-medium ${
                isCurrent ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {step.title}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`h-0.5 w-16 mx-2 ${
                isCompleted ? 'bg-primary' : 'bg-muted'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function CreatePaymentPage() {
  const router = useRouter();
  const createPayment = useCreatePayment();

  const [currentStep, setCurrentStep] = useState<Step>('debtor');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<CreatePaymentFormData>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      amount: 0,
      currency: 'EUR',
      debtorName: '',
      debtorAccount: '',
      debtorBic: '',
      creditorName: '',
      creditorAccount: '',
      creditorBic: '',
      paymentType: 'INSTANT',
      priority: 'NORMAL',
      remittanceInfo: '',
    },
  });

  const paymentType = watch('paymentType');
  const amount = watch('amount');
  const currency = watch('currency');
  const formValues = watch();

  // Step validation
  const validateStep = async (step: Step): Promise<boolean> => {
    switch (step) {
      case 'debtor':
        return trigger(['debtorName', 'debtorAccount', 'debtorBic']);
      case 'creditor':
        return trigger(['creditorName', 'creditorAccount', 'creditorBic']);
      case 'details':
        return trigger(['amount', 'currency', 'paymentType', 'remittanceInfo']);
      default:
        return true;
    }
  };

  const goToNextStep = async () => {
    const isValid = await validateStep(currentStep);
    if (!isValid) return;

    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const goToPrevStep = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  const onSubmit = async (data: CreatePaymentFormData) => {
    setSubmitError(null);

    try {
      const payment = await createPayment.mutateAsync({
        amount: data.amount,
        currency: data.currency as Currency,
        debtorName: data.debtorName,
        debtorAccount: data.debtorAccount,
        debtorBic: data.debtorBic,
        creditorName: data.creditorName,
        creditorAccount: data.creditorAccount,
        creditorBic: data.creditorBic,
        type: data.paymentType as 'INSTANT' | 'STANDARD' | 'SCHEDULED',
        remittanceInfo: data.remittanceInfo,
        endToEndId: data.endToEndId,
      });

      // Redirect to payment detail page
      router.push(`/dashboard/payments/${payment.uetr}?created=true`);
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to create payment. Please try again.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/payments"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Payments
        </Link>
        <h1 className="page-title">Create Payment</h1>
        <p className="page-description">
          Initiate a new payment transfer
        </p>
      </div>

      {/* Step Progress */}
      <StepProgress currentStep={currentStep} />

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {currentStep === 'debtor' && 'Sender Information'}
            {currentStep === 'creditor' && 'Recipient Information'}
            {currentStep === 'details' && 'Payment Details'}
            {currentStep === 'review' && 'Review & Confirm'}
          </CardTitle>
          <CardDescription>
            {currentStep === 'debtor' && 'Enter the sender account details'}
            {currentStep === 'creditor' && 'Enter the recipient account details'}
            {currentStep === 'details' && 'Specify the payment amount and type'}
            {currentStep === 'review' && 'Review all details before submitting'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step: Debtor */}
            {currentStep === 'debtor' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="debtorName" className="text-sm font-medium">
                    Account Holder Name *
                  </label>
                  <Input
                    id="debtorName"
                    placeholder="Acme Corporation"
                    {...register('debtorName')}
                    aria-invalid={!!errors.debtorName}
                    className={errors.debtorName ? 'border-destructive' : ''}
                  />
                  {errors.debtorName && (
                    <p className="text-sm text-destructive">{errors.debtorName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="debtorAccount" className="text-sm font-medium">
                    IBAN *
                  </label>
                  <Input
                    id="debtorAccount"
                    placeholder="DE89370400440532013000"
                    {...register('debtorAccount')}
                    aria-invalid={!!errors.debtorAccount}
                    className={`font-mono ${errors.debtorAccount ? 'border-destructive' : ''}`}
                  />
                  {errors.debtorAccount && (
                    <p className="text-sm text-destructive">{errors.debtorAccount.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="debtorBic" className="text-sm font-medium">
                    BIC/SWIFT *
                  </label>
                  <Input
                    id="debtorBic"
                    placeholder="COBADEFFXXX"
                    {...register('debtorBic')}
                    aria-invalid={!!errors.debtorBic}
                    className={`font-mono ${errors.debtorBic ? 'border-destructive' : ''}`}
                  />
                  {errors.debtorBic && (
                    <p className="text-sm text-destructive">{errors.debtorBic.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* Step: Creditor */}
            {currentStep === 'creditor' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="creditorName" className="text-sm font-medium">
                    Recipient Name *
                  </label>
                  <Input
                    id="creditorName"
                    placeholder="Global Partners Ltd"
                    {...register('creditorName')}
                    aria-invalid={!!errors.creditorName}
                    className={errors.creditorName ? 'border-destructive' : ''}
                  />
                  {errors.creditorName && (
                    <p className="text-sm text-destructive">{errors.creditorName.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="creditorAccount" className="text-sm font-medium">
                    IBAN *
                  </label>
                  <Input
                    id="creditorAccount"
                    placeholder="FR7630006000011234567890189"
                    {...register('creditorAccount')}
                    aria-invalid={!!errors.creditorAccount}
                    className={`font-mono ${errors.creditorAccount ? 'border-destructive' : ''}`}
                  />
                  {errors.creditorAccount && (
                    <p className="text-sm text-destructive">{errors.creditorAccount.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="creditorBic" className="text-sm font-medium">
                    BIC/SWIFT *
                  </label>
                  <Input
                    id="creditorBic"
                    placeholder="BNPAFRPPXXX"
                    {...register('creditorBic')}
                    aria-invalid={!!errors.creditorBic}
                    className={`font-mono ${errors.creditorBic ? 'border-destructive' : ''}`}
                  />
                  {errors.creditorBic && (
                    <p className="text-sm text-destructive">{errors.creditorBic.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* Step: Details */}
            {currentStep === 'details' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Payment Type *</label>
                  <PaymentTypeSelector
                    value={paymentType}
                    onChange={(value) => setValue('paymentType', value as any)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="amount" className="text-sm font-medium">
                      Amount *
                    </label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      {...register('amount', { valueAsNumber: true })}
                      aria-invalid={!!errors.amount}
                      className={errors.amount ? 'border-destructive' : ''}
                    />
                    {errors.amount && (
                      <p className="text-sm text-destructive">{errors.amount.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="currency" className="text-sm font-medium">
                      Currency *
                    </label>
                    <select
                      id="currency"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...register('currency')}
                    >
                      <option value="EUR">EUR - Euro</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="CHF">CHF - Swiss Franc</option>
                    </select>
                    {errors.currency && (
                      <p className="text-sm text-destructive">{errors.currency.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="remittanceInfo" className="text-sm font-medium">
                    Reference / Description
                  </label>
                  <Input
                    id="remittanceInfo"
                    placeholder="Invoice #12345"
                    {...register('remittanceInfo')}
                    aria-invalid={!!errors.remittanceInfo}
                  />
                  {errors.remittanceInfo && (
                    <p className="text-sm text-destructive">{errors.remittanceInfo.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Optional reference visible to the recipient
                  </p>
                </div>
              </div>
            )}

            {/* Step: Review */}
            {currentStep === 'review' && (
              <div className="space-y-6">
                {submitError && (
                  <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-destructive">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">{submitError}</p>
                  </div>
                )}

                {/* Amount Summary */}
                <div className="text-center py-6 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">You are sending</p>
                  <CurrencyDisplay
                    amount={amount || 0}
                    currency={currency}
                    size="xl"
                    showSign
                  />
                  <Badge className="mt-2">{paymentType}</Badge>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-6">
                  {/* From */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">From</h4>
                    <div className="p-4 rounded-lg border">
                      <p className="font-medium">{formValues.debtorName}</p>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {formValues.debtorAccount}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        BIC: {formValues.debtorBic}
                      </p>
                    </div>
                  </div>

                  {/* To */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">To</h4>
                    <div className="p-4 rounded-lg border">
                      <p className="font-medium">{formValues.creditorName}</p>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {formValues.creditorAccount}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        BIC: {formValues.creditorBic}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Reference */}
                {formValues.remittanceInfo && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Reference</h4>
                    <p className="p-4 rounded-lg border">{formValues.remittanceInfo}</p>
                  </div>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-6 border-t">
              {currentStep !== 'debtor' ? (
                <Button type="button" variant="outline" onClick={goToPrevStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : (
                <div />
              )}

              {currentStep !== 'review' ? (
                <Button type="button" onClick={goToNextStep}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isSubmitting || createPayment.isPending}
                >
                  {(isSubmitting || createPayment.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Confirm Payment
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Nexus RTP Platform - Run Reconciliation Page
 *
 * Wizard for running a new reconciliation cycle:
 * - Select accounts to reconcile
 * - Choose date range
 * - Configure options
 * - Start reconciliation
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
  Checkbox,
  Skeleton,
} from '@nexus/ui';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Building2,
  Play,
  Settings,
} from 'lucide-react';

import { useAccounts, useRunReconciliation } from '@/lib/hooks';
import { runReconciliationSchema, type RunReconciliationFormData } from '@/lib/validations/schemas';
import type { Account } from '@/lib/api/types';

// =============================================================================
// Types
// =============================================================================

type Step = 'accounts' | 'dateRange' | 'options' | 'review';

const STEPS: { id: Step; title: string; icon: React.ReactNode }[] = [
  { id: 'accounts', title: 'Select Accounts', icon: <Building2 className="h-4 w-4" /> },
  { id: 'dateRange', title: 'Date Range', icon: <Calendar className="h-4 w-4" /> },
  { id: 'options', title: 'Options', icon: <Settings className="h-4 w-4" /> },
  { id: 'review', title: 'Review', icon: <CheckCircle2 className="h-4 w-4" /> },
];

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
// Account Selector
// =============================================================================

function AccountSelector({
  accounts,
  selectedIds,
  onToggle,
  onSelectAll,
  disabled,
}: {
  accounts: Account[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  disabled?: boolean;
}) {
  const allSelected = accounts.length > 0 && selectedIds.length === accounts.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedIds.length} of {accounts.length} accounts selected
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          disabled={disabled}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
        {accounts.map((account) => (
          <button
            key={account.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(account.id)}
            className={`
              flex items-center gap-3 p-3 rounded-lg border transition-all text-left
              ${selectedIds.includes(account.id)
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className={`
              flex h-5 w-5 items-center justify-center rounded border-2
              ${selectedIds.includes(account.id)
                ? 'border-primary bg-primary'
                : 'border-muted'
              }
            `}>
              {selectedIds.includes(account.id) && (
                <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{account.name}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {account.accountNumber}
              </p>
            </div>
            <Badge variant="secondary" size="sm">{account.type}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function RunReconciliationPage() {
  const router = useRouter();
  const runReconciliation = useRunReconciliation();

  const [currentStep, setCurrentStep] = useState<Step>('accounts');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [includeSubAccounts, setIncludeSubAccounts] = useState(true);
  const [autoResolve, setAutoResolve] = useState(false);

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useAccounts({ status: ['ACTIVE'] });
  const accounts = accountsData?.data || [];

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RunReconciliationFormData>({
    resolver: zodResolver(runReconciliationSchema),
    defaultValues: {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
    },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');

  const toggleAccount = (id: string) => {
    setSelectedAccountIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const selectAllAccounts = () => {
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map(a => a.id));
    }
  };

  const goToNextStep = () => {
    const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

    // Validate current step
    if (currentStep === 'accounts' && selectedAccountIds.length === 0) {
      setSubmitError('Please select at least one account');
      return;
    }

    setSubmitError(null);

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

  const onSubmit = async (data: RunReconciliationFormData) => {
    setSubmitError(null);

    if (selectedAccountIds.length === 0) {
      setSubmitError('Please select at least one account');
      return;
    }

    try {
      const cycle = await runReconciliation.mutateAsync({
        accountIds: selectedAccountIds,
        startDate: data.startDate instanceof Date ? data.startDate.toISOString().split('T')[0] : String(data.startDate),
        endDate: data.endDate instanceof Date ? data.endDate.toISOString().split('T')[0] : String(data.endDate),
        includeSettled: includeSubAccounts,
        autoResolve: autoResolve,
      });

      // Redirect to cycle detail page
      router.push(`/dashboard/reconciliation/${cycle.id}`);
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to start reconciliation. Please try again.');
    }
  };

  const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/reconciliation"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reconciliation
        </Link>
        <h1 className="page-title">Run Reconciliation</h1>
        <p className="page-description">
          Start a new reconciliation cycle for selected accounts
        </p>
      </div>

      {/* Step Progress */}
      <StepProgress currentStep={currentStep} />

      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {currentStep === 'accounts' && 'Select Accounts'}
            {currentStep === 'dateRange' && 'Date Range'}
            {currentStep === 'options' && 'Reconciliation Options'}
            {currentStep === 'review' && 'Review & Start'}
          </CardTitle>
          <CardDescription>
            {currentStep === 'accounts' && 'Choose which accounts to include in reconciliation'}
            {currentStep === 'dateRange' && 'Specify the date range for transaction matching'}
            {currentStep === 'options' && 'Configure reconciliation behavior'}
            {currentStep === 'review' && 'Review your selections before starting'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step: Accounts */}
            {currentStep === 'accounts' && (
              accountsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No active accounts found</p>
                </div>
              ) : (
                <AccountSelector
                  accounts={accounts}
                  selectedIds={selectedAccountIds}
                  onToggle={toggleAccount}
                  onSelectAll={selectAllAccounts}
                />
              )
            )}

            {/* Step: Date Range */}
            {currentStep === 'dateRange' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="startDate" className="text-sm font-medium">
                      Start Date *
                    </label>
                    <Input
                      id="startDate"
                      type="date"
                      {...register('startDate')}
                      aria-invalid={!!errors.startDate}
                      className={errors.startDate ? 'border-destructive' : ''}
                    />
                    {errors.startDate && (
                      <p className="text-sm text-destructive">{errors.startDate.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="endDate" className="text-sm font-medium">
                      End Date *
                    </label>
                    <Input
                      id="endDate"
                      type="date"
                      {...register('endDate')}
                      aria-invalid={!!errors.endDate}
                      className={errors.endDate ? 'border-destructive' : ''}
                    />
                    {errors.endDate && (
                      <p className="text-sm text-destructive">{errors.endDate.message}</p>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm">
                    <span className="font-medium">Transaction Range:</span>{' '}
                    {startDate && endDate ? (
                      <>
                        {new Date(startDate).toLocaleDateString()} to{' '}
                        {new Date(endDate).toLocaleDateString()}
                      </>
                    ) : (
                      'Select dates'
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Step: Options */}
            {currentStep === 'options' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Checkbox
                    id="includeSubAccounts"
                    checked={includeSubAccounts}
                    onCheckedChange={(checked) => setIncludeSubAccounts(checked as boolean)}
                  />
                  <div>
                    <label htmlFor="includeSubAccounts" className="font-medium text-sm cursor-pointer">
                      Include Sub-Accounts
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Also reconcile any linked sub-accounts
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <Checkbox
                    id="autoResolve"
                    checked={autoResolve}
                    onCheckedChange={(checked) => setAutoResolve(checked as boolean)}
                  />
                  <div>
                    <label htmlFor="autoResolve" className="font-medium text-sm cursor-pointer">
                      Auto-Resolve Exact Matches
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automatically mark transactions that match exactly as resolved
                    </p>
                  </div>
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

                {/* Summary */}
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border">
                    <h4 className="font-medium mb-3">Selected Accounts ({selectedAccountIds.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedAccounts.map((account) => (
                        <Badge key={account.id} variant="secondary">
                          {account.name}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border">
                    <h4 className="font-medium mb-3">Date Range</h4>
                    <p className="text-sm text-muted-foreground">
                      {startDate && new Date(startDate).toLocaleDateString()} to{' '}
                      {endDate && new Date(endDate).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border">
                    <h4 className="font-medium mb-3">Options</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        {includeSubAccounts ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2" />
                        )}
                        Include sub-accounts
                      </li>
                      <li className="flex items-center gap-2">
                        {autoResolve ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2" />
                        )}
                        Auto-resolve exact matches
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8 pt-6 border-t">
              {currentStep !== 'accounts' ? (
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
                  disabled={isSubmitting || runReconciliation.isPending}
                >
                  {(isSubmitting || runReconciliation.isPending) ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Reconciliation
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

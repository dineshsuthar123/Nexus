'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  optional?: boolean;
  validate?: () => boolean | Promise<boolean>;
}

export interface PaymentWizardProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
  children: React.ReactNode;
  className?: string;
  /** Whether the wizard is submitting */
  submitting?: boolean;
  /** Custom labels */
  labels?: {
    next?: string;
    previous?: string;
    submit?: string;
    skip?: string;
  };
}

// =============================================================================
// Step Indicator
// =============================================================================

interface StepIndicatorProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Payment wizard progress" className="mb-8">
      <ol className="flex items-center" role="list">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = isCompleted && onStepClick;

          return (
            <li
              key={step.id}
              className={cn('flex items-center', index < steps.length - 1 && 'flex-1')}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors',
                    isCompleted && 'border-primary bg-primary text-white',
                    isCurrent && 'border-primary bg-primary/10 text-primary',
                    !isCompleted && !isCurrent && 'border-border text-muted-foreground',
                    isClickable && 'cursor-pointer hover:bg-primary/20'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.title}${isCompleted ? ' (completed)' : ''}`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>
                <div className="hidden sm:block">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  )}
                </div>
              </div>

              {/* Connector */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-4 hidden h-0.5 flex-1 sm:block',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// =============================================================================
// PaymentWizard
// =============================================================================

export const PaymentWizard = React.forwardRef<HTMLDivElement, PaymentWizardProps>(
  (
    {
      steps,
      currentStep,
      onStepChange,
      onComplete,
      children,
      className,
      submitting = false,
      labels = {},
    },
    ref
  ) => {
    const {
      next = 'Continue',
      previous = 'Back',
      submit = 'Submit Payment',
      skip = 'Skip',
    } = labels;

    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === steps.length - 1;
    const currentStepConfig = steps[currentStep];

    const handleNext = async () => {
      if (currentStepConfig?.validate) {
        const isValid = await currentStepConfig.validate();
        if (!isValid) return;
      }

      if (isLastStep) {
        onComplete();
      } else {
        onStepChange(currentStep + 1);
      }
    };

    const handlePrevious = () => {
      if (!isFirstStep) {
        onStepChange(currentStep - 1);
      }
    };

    const handleSkip = () => {
      if (currentStepConfig?.optional && !isLastStep) {
        onStepChange(currentStep + 1);
      }
    };

    return (
      <div ref={ref} className={cn('payment-wizard', className)}>
        <StepIndicator
          steps={steps}
          currentStep={currentStep}
          onStepClick={onStepChange}
        />

        {/* Step Content */}
        <div className="min-h-[300px] rounded-lg border bg-card p-6" role="region" aria-label={currentStepConfig?.title}>
          {children}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={isFirstStep || submitting}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'border border-border bg-background hover:bg-accent',
              'disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            {previous}
          </button>

          <div className="flex items-center gap-3">
            {currentStepConfig?.optional && !isLastStep && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={submitting}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                {skip}
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              disabled={submitting}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors',
                'bg-primary hover:bg-primary/90',
                'disabled:pointer-events-none disabled:opacity-50'
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {isLastStep ? submit : next}
                  {!isLastStep && <ChevronRight className="h-4 w-4" />}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
);

PaymentWizard.displayName = 'PaymentWizard';

export default PaymentWizard;

import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { PaymentWizard } from '../components/PaymentWizard/PaymentWizard';
import type { WizardStep } from '../components/PaymentWizard/PaymentWizard';

const meta: Meta<typeof PaymentWizard> = {
  title: 'Fintech/PaymentWizard',
  component: PaymentWizard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PaymentWizard>;

const steps: WizardStep[] = [
  { id: 'debtor', title: 'Sender', description: 'Select debtor account' },
  { id: 'creditor', title: 'Recipient', description: 'Enter beneficiary details' },
  { id: 'amount', title: 'Amount', description: 'Payment amount & currency' },
  { id: 'review', title: 'Review', description: 'Confirm payment details' },
];

const StepContent = ({ step }: { step: number }) => {
  const contents = [
    <div key="debtor" className="space-y-4">
      <h3 className="text-lg font-medium">Select Sender Account</h3>
      <div className="rounded border p-4">
        <p className="font-medium">Operating Account</p>
        <p className="text-sm text-muted-foreground">IBAN: DE89 3704 0044 0532 0130 00</p>
        <p className="text-sm text-muted-foreground">Balance: €1,234,567.89</p>
      </div>
    </div>,
    <div key="creditor" className="space-y-4">
      <h3 className="text-lg font-medium">Recipient Details</h3>
      <div className="space-y-2">
        <input className="w-full rounded border p-2" placeholder="Beneficiary Name" value="Acme Corp" readOnly />
        <input className="w-full rounded border p-2" placeholder="IBAN" value="GB29 NWBK 6016 1331 9268 19" readOnly />
        <input className="w-full rounded border p-2" placeholder="BIC/SWIFT" value="NWBKGB2L" readOnly />
      </div>
    </div>,
    <div key="amount" className="space-y-4">
      <h3 className="text-lg font-medium">Payment Amount</h3>
      <div className="flex gap-2">
        <select className="rounded border p-2"><option>EUR</option><option>USD</option><option>GBP</option></select>
        <input className="flex-1 rounded border p-2 text-right font-mono text-xl" type="number" value="50000" readOnly />
      </div>
      <p className="text-sm text-muted-foreground">Reference: INV-2024-0042</p>
    </div>,
    <div key="review" className="space-y-4">
      <h3 className="text-lg font-medium">Review Payment</h3>
      <div className="rounded border divide-y">
        <div className="flex justify-between p-3"><span className="text-muted-foreground">From</span><span>Operating Account (DE89...0130 00)</span></div>
        <div className="flex justify-between p-3"><span className="text-muted-foreground">To</span><span>Acme Corp (GB29...9268 19)</span></div>
        <div className="flex justify-between p-3"><span className="text-muted-foreground">Amount</span><span className="font-mono font-bold">€50,000.00</span></div>
        <div className="flex justify-between p-3"><span className="text-muted-foreground">Fee</span><span className="font-mono">€2.50</span></div>
        <div className="flex justify-between p-3 bg-accent/30"><span className="font-medium">Total</span><span className="font-mono font-bold">€50,002.50</span></div>
      </div>
    </div>,
  ];
  return contents[step] || null;
};

export const Default: Story = {
  render: () => {
    const [step, setStep] = useState(0);
    return (
      <PaymentWizard
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        onComplete={() => alert('Payment submitted!')}
      >
        <StepContent step={step} />
      </PaymentWizard>
    );
  },
};

export const AtReviewStep: Story = {
  render: () => {
    const [step, setStep] = useState(3);
    return (
      <PaymentWizard
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        onComplete={() => alert('Payment submitted!')}
      >
        <StepContent step={step} />
      </PaymentWizard>
    );
  },
};

export const Submitting: Story = {
  render: () => (
    <PaymentWizard
      steps={steps}
      currentStep={3}
      onStepChange={() => {}}
      onComplete={() => {}}
      submitting
    >
      <StepContent step={3} />
    </PaymentWizard>
  ),
};

const optionalSteps: WizardStep[] = [
  { id: 'sender', title: 'Sender' },
  { id: 'recipient', title: 'Recipient' },
  { id: 'memo', title: 'Memo', optional: true },
  { id: 'review', title: 'Review' },
];

export const WithOptionalStep: Story = {
  render: () => {
    const [step, setStep] = useState(2);
    return (
      <PaymentWizard
        steps={optionalSteps}
        currentStep={step}
        onStepChange={setStep}
        onComplete={() => alert('Done!')}
      >
        <div className="p-4 text-center">
          <h3 className="text-lg font-medium">Add a Memo (Optional)</h3>
          <textarea className="mt-2 w-full rounded border p-2" placeholder="Payment reference or notes..." rows={3} />
        </div>
      </PaymentWizard>
    );
  },
};

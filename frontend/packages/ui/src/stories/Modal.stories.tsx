import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ModalClose,
} from '../components/Modal/Modal';

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <button className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
          Create Payment
        </button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>New Payment</ModalTitle>
          <ModalDescription>
            Fill in the details below to initiate a new payment.
          </ModalDescription>
        </ModalHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Recipient</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter recipient name or IBAN"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Amount</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="0.00"
                type="number"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Currency</label>
              <select className="w-full rounded-md border px-3 py-2 text-sm">
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </div>
          </div>
        </div>
        <ModalFooter>
          <ModalClose asChild>
            <button className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
              Cancel
            </button>
          </ModalClose>
          <button className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
            Submit Payment
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <button className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          Confirm
        </button>
      </ModalTrigger>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>Confirm Action</ModalTitle>
          <ModalDescription>This cannot be undone.</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose asChild>
            <button className="rounded-md border px-4 py-2 text-sm">No</button>
          </ModalClose>
          <button className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white">Yes</button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const LargeSize: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
          View Audit Log
        </button>
      </ModalTrigger>
      <ModalContent size="xl">
        <ModalHeader>
          <ModalTitle>Audit Trail — PAY-2024-001234</ModalTitle>
          <ModalDescription>
            Complete audit history for this payment transaction.
          </ModalDescription>
        </ModalHeader>
        <div className="max-h-64 space-y-3 overflow-y-auto py-4">
          {[
            { time: '14:32:01', actor: 'system', action: 'Payment initiated', detail: '$15,000.00 USD' },
            { time: '14:32:02', actor: 'fraud-engine', action: 'Fraud check passed', detail: 'Score: 0.12' },
            { time: '14:32:03', actor: 'compliance', action: 'AML screening passed', detail: 'No matches' },
            { time: '14:32:04', actor: 'gateway', action: 'Sent to payment network', detail: 'ACH batch' },
            { time: '14:32:45', actor: 'gateway', action: 'Acknowledgment received', detail: 'Ref: ACH-98765' },
            { time: '15:00:00', actor: 'reconciliation', action: 'Settlement confirmed', detail: 'Match rate: 100%' },
          ].map((entry, i) => (
            <div key={i} className="flex items-start gap-3 rounded border p-3 text-sm">
              <span className="font-mono text-xs text-neutral-400">{entry.time}</span>
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium">{entry.actor}</span>
              <span className="flex-1">{entry.action}</span>
              <span className="text-neutral-500">{entry.detail}</span>
            </div>
          ))}
        </div>
        <ModalFooter>
          <ModalClose asChild>
            <button className="rounded-md border px-4 py-2 text-sm">Close</button>
          </ModalClose>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            Export PDF
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const NoCloseButton: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <button className="rounded-md bg-danger-600 px-4 py-2 text-sm text-white">
          Critical Alert
        </button>
      </ModalTrigger>
      <ModalContent showCloseButton={false} size="sm">
        <ModalHeader>
          <ModalTitle>Security Alert</ModalTitle>
          <ModalDescription>
            Unusual activity detected. You must acknowledge this alert.
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose asChild>
            <button className="w-full rounded-md bg-danger-600 px-4 py-2 text-sm text-white">
              I Acknowledge
            </button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

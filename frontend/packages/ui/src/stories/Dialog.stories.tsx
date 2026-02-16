import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/Dialog/Dialog';

const meta: Meta<typeof Dialog> = {
  title: 'Components/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger>
          <button className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
            Open Dialog
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Review the payment details below before proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Recipient</span>
              <span className="font-medium">Acme Corp</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Amount</span>
              <span className="font-medium">$15,000.00 USD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Reference</span>
              <span className="font-mono text-xs">PAY-2024-001234</span>
            </div>
          </div>
          <DialogFooter>
            <button
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
              onClick={() => setOpen(false)}
            >
              Confirm Payment
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
};

export const OpenByDefault: Story = {
  render: () => (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Session Expired</DialogTitle>
          <DialogDescription>
            Your session has expired. Please log in again to continue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button className="rounded-md bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700">
            Log In
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const DestructiveAction: Story = {
  render: () => (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete API Key</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The key &quot;prod-payments-v2&quot; will be permanently revoked.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
          All services using this key will lose access immediately.
        </div>
        <DialogFooter>
          <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
            Keep Key
          </button>
          <button className="rounded-md bg-danger-600 px-4 py-2 text-sm text-white hover:bg-danger-700">
            Delete Key
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

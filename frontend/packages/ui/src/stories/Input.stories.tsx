import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '../components/Input/Input';
import { Search, Mail, Eye, DollarSign } from 'lucide-react';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    label: { control: 'text' },
    helperText: { control: 'text' },
    error: { control: 'text' },
    success: { control: 'boolean' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { label: 'Email', placeholder: 'Enter your email', type: 'email' },
};

export const WithHelperText: Story = {
  args: {
    label: 'Password',
    type: 'password',
    helperText: 'Must be at least 8 characters',
  },
};

export const WithError: Story = {
  args: {
    label: 'Account Number',
    value: 'abc',
    error: 'Account number must be numeric',
  },
};

export const WithSuccess: Story = {
  args: {
    label: 'IBAN',
    value: 'DE89370400440532013000',
    success: true,
    helperText: 'Valid IBAN format',
  },
};

export const Required: Story = {
  args: { label: 'Amount', required: true, placeholder: '0.00' },
};

export const WithLeftAddon: Story = {
  args: {
    label: 'Amount',
    leftAddon: <DollarSign className="h-4 w-4" />,
    placeholder: '0.00',
    type: 'number',
  },
};

export const WithRightAddon: Story = {
  args: {
    label: 'Search Payments',
    rightAddon: <Search className="h-4 w-4" />,
    placeholder: 'Search by UETR...',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Read-only Field',
    value: 'Cannot edit',
    disabled: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <Input size="sm" label="Small" placeholder="Small input" />
      <Input size="md" label="Medium" placeholder="Medium input" />
      <Input size="lg" label="Large" placeholder="Large input" />
    </div>
  ),
};

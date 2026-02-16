import type { Meta, StoryObj } from '@storybook/react';
import { Badge, StatusBadge, CountBadge } from '../components/Badge/Badge';
import { CheckCircle } from 'lucide-react';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'success', 'warning', 'danger', 'info', 'outline'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    dot: { control: 'boolean' },
    removable: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: 'Badge', variant: 'default' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="success">Success</Badge>
      <Badge variant="warning">Warning</Badge>
      <Badge variant="danger">Danger</Badge>
      <Badge variant="info">Info</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const WithDot: Story = {
  args: { children: 'Live', variant: 'success', dot: true },
};

export const WithIcon: Story = {
  args: { children: 'Verified', variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
};

export const Removable: Story = {
  args: { children: 'Filter: Active', variant: 'default', removable: true },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge size="sm">Small</Badge>
      <Badge size="md">Medium</Badge>
      <Badge size="lg">Large</Badge>
    </div>
  ),
};

// Status Badge
export const PaymentStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="pending" />
      <StatusBadge status="processing" />
      <StatusBadge status="completed" />
      <StatusBadge status="failed" />
      <StatusBadge status="cancelled" />
      <StatusBadge status="active" />
      <StatusBadge status="inactive" />
      <StatusBadge status="verified" />
      <StatusBadge status="unverified" />
    </div>
  ),
};

// Count Badge
export const NotificationCount: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <CountBadge count={3} variant="danger" />
      <CountBadge count={42} variant="danger" />
      <CountBadge count={100} variant="danger" />
      <CountBadge count={0} showZero variant="default" />
    </div>
  ),
};

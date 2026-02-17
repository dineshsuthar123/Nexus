import type { Meta, StoryObj } from '@storybook/react';
import { DashboardCard } from '../components/Card/Card';
import { DollarSign, CreditCard, TrendingUp, Activity } from 'lucide-react';

const meta: Meta<typeof DashboardCard> = {
  title: 'Fintech/DashboardCard',
  component: DashboardCard,
  tags: ['autodocs'],
  argTypes: {
    trend: { control: 'select', options: ['up', 'down', 'neutral'] },
    loading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof DashboardCard>;

export const Revenue: Story = {
  args: {
    title: 'Total Revenue',
    value: '$1,234,567',
    change: 12.5,
    changePeriod: 'vs last month',
    icon: <DollarSign className="h-4 w-4" />,
  },
};

export const Payments: Story = {
  args: {
    title: 'Payments Processed',
    value: '3,456',
    change: -2.3,
    changePeriod: 'vs last week',
    icon: <CreditCard className="h-4 w-4" />,
  },
};

export const Loading: Story = {
  args: {
    title: 'Settlement Rate',
    value: '99.4%',
    loading: true,
    icon: <Activity className="h-4 w-4" />,
  },
};

export const NeutralTrend: Story = {
  args: {
    title: 'Active Accounts',
    value: '1,234',
    change: 0,
    icon: <TrendingUp className="h-4 w-4" />,
  },
};

export const WithSubtitle: Story = {
  args: {
    title: 'Total Volume',
    value: '$45.2M',
    subtitle: 'Across 12 tenants',
    change: 8.1,
    icon: <DollarSign className="h-4 w-4" />,
  },
};

export const DashboardGrid: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DashboardCard
        title="Total Revenue"
        value="$1.2M"
        change={12.5}
        icon={<DollarSign className="h-4 w-4" />}
      />
      <DashboardCard
        title="Payments"
        value="3,456"
        change={-2.3}
        icon={<CreditCard className="h-4 w-4" />}
      />
      <DashboardCard
        title="Success Rate"
        value="99.4%"
        change={0.1}
        icon={<Activity className="h-4 w-4" />}
      />
      <DashboardCard
        title="Avg Latency"
        value="145ms"
        change={-5.2}
        trend="up"
        icon={<TrendingUp className="h-4 w-4" />}
      />
    </div>
  ),
};

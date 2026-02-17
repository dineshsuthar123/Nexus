import type { Meta, StoryObj } from '@storybook/react';
import { ChartWrapper } from '../components/ChartWrapper/ChartWrapper';
import type { ChartSeries } from '../components/ChartWrapper/ChartWrapper';

const meta: Meta<typeof ChartWrapper> = {
  title: 'Fintech/ChartWrapper',
  component: ChartWrapper,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ChartWrapper>;

const paymentVolumeSeries: ChartSeries[] = [
  {
    name: 'Payment Volume',
    color: 'hsl(221, 83%, 53%)',
    data: [
      { label: 'Jan', value: 4200000 },
      { label: 'Feb', value: 3800000 },
      { label: 'Mar', value: 5100000 },
      { label: 'Apr', value: 4700000 },
      { label: 'May', value: 6200000 },
      { label: 'Jun', value: 5800000 },
      { label: 'Jul', value: 6500000 },
    ],
  },
];

export const PaymentVolume: Story = {
  args: {
    title: 'Payment Volume',
    description: 'Monthly payment processing volume',
    series: paymentVolumeSeries,
    valueFormatter: (v: number) => `$${(v / 1000000).toFixed(1)}M`,
  },
};

const multiSeries: ChartSeries[] = [
  {
    name: 'Successful',
    color: 'hsl(142, 71%, 45%)',
    data: [
      { label: 'Mon', value: 1200 },
      { label: 'Tue', value: 1400 },
      { label: 'Wed', value: 1100 },
      { label: 'Thu', value: 1600 },
      { label: 'Fri', value: 1300 },
    ],
  },
  {
    name: 'Failed',
    color: 'hsl(0, 84%, 60%)',
    data: [
      { label: 'Mon', value: 45 },
      { label: 'Tue', value: 32 },
      { label: 'Wed', value: 67 },
      { label: 'Thu', value: 28 },
      { label: 'Fri', value: 41 },
    ],
  },
];

export const MultiSeries: Story = {
  args: {
    title: 'Transaction Outcomes',
    description: 'Successful vs. failed transactions this week',
    series: multiSeries,
    showLegend: true,
  },
};

export const Loading: Story = {
  args: {
    title: 'Loading Chart',
    series: [],
    loading: true,
  },
};

export const Error: Story = {
  args: {
    title: 'Failed to Load',
    series: [],
    error: 'Unable to fetch analytics data. Please try again later.',
  },
};

export const Empty: Story = {
  args: {
    title: 'No Data Yet',
    series: [{ name: 'empty', data: [] }],
    emptyMessage: 'Start processing payments to see analytics',
  },
};

export const CompactHeight: Story = {
  args: {
    title: 'Settlement Times',
    series: [
      {
        name: 'Avg Settlement (ms)',
        data: Array.from({ length: 24 }, (_, i) => ({
          label: `${i}:00`,
          value: 100 + Math.random() * 200,
        })),
      },
    ],
    height: 200,
    description: 'Average settlement time over 24 hours',
  },
};

import type { Meta, StoryObj } from '@storybook/react';
import {
  CurrencyDisplay,
  PercentageDisplay,
  AccountBalance,
  CurrencyIcon,
} from './Currency';

const meta: Meta<typeof CurrencyDisplay> = {
  title: 'Fintech/Currency',
  component: CurrencyDisplay,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CurrencyDisplay>;

export const BasicCurrency: Story = {
  args: {
    amount: 12500,
    currency: 'USD',
  },
};

export const Compact: Story = {
  args: {
    amount: 1250000,
    currency: 'USD',
    compact: true,
  },
};

export const WithSign: Story = {
  render: () => (
    <div className="space-y-2">
      <CurrencyDisplay amount={5000} showSign={true} />
      <CurrencyDisplay amount={-2500} showSign={true} />
    </div>
  ),
};

export const DifferentCurrencies: Story = {
  render: () => (
    <div className="space-y-2">
      <CurrencyDisplay amount={1250.50} currency="USD" />
      <CurrencyDisplay amount={1250.50} currency="EUR" locale="de-DE" />
      <CurrencyDisplay amount={1250.50} currency="GBP" locale="en-GB" />
      <CurrencyDisplay amount={1250.50} currency="JPY" locale="ja-JP" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-2">
      <CurrencyDisplay amount={9999.99} size="sm" />
      <CurrencyDisplay amount={9999.99} size="md" />
      <CurrencyDisplay amount={9999.99} size="lg" />
    </div>
  ),
};

export const PercentageDisplayStory: Story = {
  name: 'Percentage Display',
  render: () => (
    <div className="space-y-2">
      <PercentageDisplay value={12.5} />
      <PercentageDisplay value={-8.3} />
      <PercentageDisplay value={0} />
    </div>
  ),
};

export const PercentageSizes: Story = {
  name: 'Percentage Sizes',
  render: () => (
    <div className="flex items-center gap-4">
      <PercentageDisplay value={5.2} size="sm" />
      <PercentageDisplay value={5.2} size="md" />
      <PercentageDisplay value={5.2} size="lg" />
    </div>
  ),
};

export const AccountBalanceStory: Story = {
  name: 'Account Balance',
  render: () => (
    <div className="w-64">
      <AccountBalance
        label="Available Balance"
        balance={125000}
        change={2.4}
      />
    </div>
  ),
};

export const AccountBalanceNegative: Story = {
  name: 'Account Balance (Negative Change)',
  render: () => (
    <div className="w-64">
      <AccountBalance
        label="Total Liabilities"
        balance={45000}
        change={-1.8}
      />
    </div>
  ),
};

export const CurrencyIcons: Story = {
  name: 'Currency Icons',
  render: () => (
    <div className="flex items-center gap-4">
      <CurrencyIcon currency="USD" />
      <CurrencyIcon currency="EUR" />
      <CurrencyIcon currency="GBP" />
      <CurrencyIcon currency="JPY" />
      <CurrencyIcon currency="BTC" />
      <CurrencyIcon currency="ETH" />
    </div>
  ),
};

export const CurrencyIconSizes: Story = {
  name: 'Currency Icon Sizes',
  render: () => (
    <div className="flex items-center gap-4">
      <CurrencyIcon currency="USD" size="sm" />
      <CurrencyIcon currency="USD" size="md" />
      <CurrencyIcon currency="USD" size="lg" />
    </div>
  ),
};

export const RealWorldDashboard: Story = {
  name: 'Real World: Dashboard Stats',
  render: () => (
    <div className="grid w-full max-w-4xl grid-cols-2 gap-6">
      <AccountBalance
        label="Total Assets"
        balance={2450000}
        change={5.2}
      />
      <AccountBalance
        label="Available Cash"
        balance={890000}
        change={-1.2}
      />
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">Today's Volume</p>
        <div className="mt-2 flex items-center gap-2">
          <CurrencyDisplay amount={125000} size="lg" compact />
          <PercentageDisplay value={12.5} size="sm" />
        </div>
      </div>
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">Failed Transactions</p>
        <div className="mt-2 flex items-center gap-2">
          <CurrencyDisplay amount={2500} size="lg" />
          <PercentageDisplay value={-8.3} size="sm" invertColor />
        </div>
      </div>
    </div>
  ),
};

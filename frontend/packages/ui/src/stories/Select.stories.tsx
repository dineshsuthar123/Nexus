import type { Meta, StoryObj } from '@storybook/react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from '../components/Select/Select';
import { DollarSign, Euro, PoundSterling, Bitcoin } from 'lucide-react';

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <div className="w-64">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select currency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="usd">US Dollar (USD)</SelectItem>
          <SelectItem value="eur">Euro (EUR)</SelectItem>
          <SelectItem value="gbp">British Pound (GBP)</SelectItem>
          <SelectItem value="jpy">Japanese Yen (JPY)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="w-72">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Payment currency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="usd" icon={<DollarSign className="h-4 w-4" />} description="United States Dollar">
            USD
          </SelectItem>
          <SelectItem value="eur" icon={<Euro className="h-4 w-4" />} description="European Union Euro">
            EUR
          </SelectItem>
          <SelectItem value="gbp" icon={<PoundSterling className="h-4 w-4" />} description="British Pound Sterling">
            GBP
          </SelectItem>
          <SelectItem value="btc" icon={<Bitcoin className="h-4 w-4" />} description="Bitcoin (Cryptocurrency)">
            BTC
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Grouped: Story = {
  render: () => (
    <div className="w-72">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Operating Accounts</SelectLabel>
            <SelectItem value="checking">Main Checking ••4521</SelectItem>
            <SelectItem value="savings">Reserve Savings ••8832</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Settlement Accounts</SelectLabel>
            <SelectItem value="settlement-usd">USD Settlement ••1100</SelectItem>
            <SelectItem value="settlement-eur">EUR Settlement ••2200</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Escrow</SelectLabel>
            <SelectItem value="escrow" disabled>Escrow ••9900 (Frozen)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-64">
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Small" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger size="md">
          <SelectValue placeholder="Medium (default)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger size="lg">
          <SelectValue placeholder="Large" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const ErrorVariant: Story = {
  render: () => (
    <div className="w-64">
      <label className="mb-1 block text-sm font-medium text-neutral-700">Payment Method *</label>
      <Select>
        <SelectTrigger variant="error">
          <SelectValue placeholder="Required field" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ach">ACH Transfer</SelectItem>
          <SelectItem value="wire">Wire Transfer</SelectItem>
          <SelectItem value="rtp">Real-Time Payment</SelectItem>
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-danger-500">Please select a payment method</p>
    </div>
  ),
};

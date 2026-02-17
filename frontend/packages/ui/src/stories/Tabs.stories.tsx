import type { Meta, StoryObj } from '@storybook/react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../components/Tabs/Tabs';
import { CreditCard, BarChart3, Shield, Bell, Settings } from 'lucide-react';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="payments" className="w-[500px]">
      <TabsList>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="accounts">Accounts</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="payments">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Recent Payments</h3>
          <p className="mt-1 text-sm text-neutral-500">3 pending, 12 completed today</p>
        </div>
      </TabsContent>
      <TabsContent value="accounts">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Account Overview</h3>
          <p className="mt-1 text-sm text-neutral-500">5 active accounts across 3 currencies</p>
        </div>
      </TabsContent>
      <TabsContent value="analytics">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Analytics Dashboard</h3>
          <p className="mt-1 text-sm text-neutral-500">Volume up 12.5% vs last month</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const Underline: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList variant="underline">
        <TabsTrigger value="overview" variant="underline">Overview</TabsTrigger>
        <TabsTrigger value="transactions" variant="underline">Transactions</TabsTrigger>
        <TabsTrigger value="settlements" variant="underline">Settlements</TabsTrigger>
        <TabsTrigger value="reports" variant="underline">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="mt-2 rounded-lg border p-4">
          <p className="text-sm text-neutral-600">Today&apos;s settlement rate: 99.4%</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const Pills: Story = {
  render: () => (
    <Tabs defaultValue="all" className="w-[500px]">
      <TabsList variant="pills">
        <TabsTrigger value="all" variant="pills">All</TabsTrigger>
        <TabsTrigger value="pending" variant="pills">Pending</TabsTrigger>
        <TabsTrigger value="completed" variant="pills">Completed</TabsTrigger>
        <TabsTrigger value="failed" variant="pills">Failed</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <div className="mt-2 text-sm text-neutral-600">Showing all 156 transactions</div>
      </TabsContent>
    </Tabs>
  ),
};

export const Cards: Story = {
  render: () => (
    <Tabs defaultValue="ach" className="w-[500px]">
      <TabsList variant="cards">
        <TabsTrigger value="ach" variant="cards">ACH</TabsTrigger>
        <TabsTrigger value="wire" variant="cards">Wire</TabsTrigger>
        <TabsTrigger value="rtp" variant="cards">RTP</TabsTrigger>
      </TabsList>
      <TabsContent value="ach">
        <div className="mt-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">ACH Transfers</p>
          <p className="text-neutral-500">1-3 business day settlement</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="payments" className="w-[600px]">
      <TabsList>
        <TabsTrigger value="payments" icon={<CreditCard className="h-4 w-4" />}>
          Payments
        </TabsTrigger>
        <TabsTrigger value="analytics" icon={<BarChart3 className="h-4 w-4" />}>
          Analytics
        </TabsTrigger>
        <TabsTrigger value="security" icon={<Shield className="h-4 w-4" />}>
          Security
        </TabsTrigger>
        <TabsTrigger value="notifications" icon={<Bell className="h-4 w-4" />}>
          Alerts
        </TabsTrigger>
        <TabsTrigger value="settings" icon={<Settings className="h-4 w-4" />}>
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="payments">
        <div className="rounded-lg border p-4 text-sm">
          <p>Manage payment processing and reconciliation</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <Tabs defaultValue="inbox" className="w-[500px]">
      <TabsList variant="underline">
        <TabsTrigger value="inbox" variant="underline" badge={
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger-500 text-xs text-white">3</span>
        }>
          Inbox
        </TabsTrigger>
        <TabsTrigger value="sent" variant="underline">Sent</TabsTrigger>
        <TabsTrigger value="drafts" variant="underline" badge={
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-xs text-neutral-600">1</span>
        }>
          Drafts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="inbox">
        <div className="mt-2 text-sm text-neutral-600">
          3 unread payment confirmations
        </div>
      </TabsContent>
    </Tabs>
  ),
};

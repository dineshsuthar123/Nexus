import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import { Badge } from '../Badge/Badge';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'elevated', 'outlined', 'ghost'],
    },
    interactive: {
      control: 'boolean',
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          This is the card content. You can put any content here.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const Elevated: Story = {
  render: () => (
    <Card variant="elevated" className="w-80">
      <CardHeader>
        <CardTitle>Elevated Card</CardTitle>
        <CardDescription>With shadow effect</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          This card has elevated shadow styling.
        </p>
      </CardContent>
    </Card>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card interactive className="w-80 cursor-pointer">
      <CardHeader>
        <CardTitle>Interactive Card</CardTitle>
        <CardDescription>Click or hover to see effect</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          This card responds to hover and click interactions.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Enter your details to get started</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input label="Name" placeholder="Enter your name" />
        <Input label="Email" type="email" placeholder="Enter your email" />
        <Input label="Password" type="password" placeholder="Create a password" />
      </CardContent>
      <CardFooter className="flex justify-end gap-3">
        <Button variant="ghost">Cancel</Button>
        <Button>Create Account</Button>
      </CardFooter>
    </Card>
  ),
};

export const Stats: Story = {
  name: 'Stats Card',
  render: () => (
    <Card className="w-64">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">Total Revenue</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              $45,231.89
            </p>
            <p className="mt-1 text-xs text-success-600">
              +20.1% from last month
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-950">
            <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Premium Plan</CardTitle>
            <CardDescription>Best for growing teams</CardDescription>
          </div>
          <Badge variant="success">Active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">$29</span>
            <span className="text-neutral-500">/month</span>
          </div>
          <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            <li>✓ Unlimited transactions</li>
            <li>✓ Priority support</li>
            <li>✓ Advanced analytics</li>
          </ul>
        </div>
      </CardContent>
      <CardFooter>
        <Button fullWidth>Upgrade Now</Button>
      </CardFooter>
    </Card>
  ),
};

export const GridLayout: Story = {
  render: () => (
    <div className="grid w-full max-w-4xl grid-cols-3 gap-4">
      {[
        { title: 'Total Users', value: '2,420', change: '+12%' },
        { title: 'Revenue', value: '$45.2K', change: '+8%' },
        { title: 'Orders', value: '1,210', change: '+24%' },
      ].map((stat) => (
        <Card key={stat.title}>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-neutral-500">{stat.title}</p>
            <p className="mt-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-success-600">{stat.change}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};

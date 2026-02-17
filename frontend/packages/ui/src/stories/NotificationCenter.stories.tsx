import type { Meta, StoryObj } from '@storybook/react';
import { NotificationCenter } from '../components/NotificationCenter/NotificationCenter';
import type { Notification } from '../components/NotificationCenter/NotificationCenter';

const meta: Meta<typeof NotificationCenter> = {
  title: 'Fintech/NotificationCenter',
  component: NotificationCenter,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NotificationCenter>;

const sampleNotifications: Notification[] = [
  {
    id: '1',
    type: 'payment',
    priority: 'high',
    title: 'Payment Completed',
    message: 'Wire transfer of $50,000 to Acme Corp has been settled successfully.',
    timestamp: new Date().toISOString(),
    read: false,
    actionUrl: '/dashboard/payments/uetr-001',
    actionLabel: 'View Payment',
  },
  {
    id: '2',
    type: 'security',
    priority: 'critical',
    title: 'Suspicious Login Detected',
    message: 'A login attempt from an unrecognized device was detected for admin@company.com.',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    read: false,
  },
  {
    id: '3',
    type: 'account',
    priority: 'medium',
    title: 'Balance Low',
    message: 'Operating account balance has fallen below the configured threshold of $10,000.',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    read: false,
    actionUrl: '/dashboard/accounts/acc-001',
    actionLabel: 'View Account',
  },
  {
    id: '4',
    type: 'system',
    priority: 'low',
    title: 'Scheduled Maintenance',
    message: 'System maintenance window scheduled for Saturday 2:00 AM - 4:00 AM UTC.',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    read: true,
  },
  {
    id: '5',
    type: 'alert',
    priority: 'high',
    title: 'Reconciliation Discrepancy',
    message: '3 unmatched transactions found in daily reconciliation cycle RC-2024-0142.',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    read: true,
    actionUrl: '/dashboard/reconciliation/rc-0142',
    actionLabel: 'View Discrepancies',
  },
];

export const Default: Story = {
  args: {
    notifications: sampleNotifications,
    unreadCount: 3,
    onMarkRead: (id) => console.log('Mark read:', id),
    onMarkAllRead: () => console.log('Mark all read'),
    onDismiss: (id) => console.log('Dismiss:', id),
    onClearAll: () => console.log('Clear all'),
    onSettingsClick: () => console.log('Settings'),
  },
};

export const Empty: Story = {
  args: {
    notifications: [],
    unreadCount: 0,
    onMarkRead: () => {},
    onMarkAllRead: () => {},
    onDismiss: () => {},
    onClearAll: () => {},
  },
};

export const AllRead: Story = {
  args: {
    notifications: sampleNotifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0,
    onMarkRead: () => {},
    onMarkAllRead: () => {},
    onDismiss: () => {},
    onClearAll: () => {},
  },
};

export const CriticalAlerts: Story = {
  args: {
    notifications: sampleNotifications.filter((n) => n.priority === 'critical' || n.priority === 'high'),
    unreadCount: 2,
    onMarkRead: () => {},
    onMarkAllRead: () => {},
    onDismiss: () => {},
    onClearAll: () => {},
  },
};

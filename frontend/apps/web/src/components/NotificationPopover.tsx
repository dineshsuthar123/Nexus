'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { NotificationCenter, type Notification, cn } from '@nexus/ui';

// ---------------------------------------------------------------------------
// useNotifications — Local state for notification management
// ---------------------------------------------------------------------------

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'payment',
    priority: 'high',
    title: 'Payment Completed',
    message: 'Wire transfer of $25,000.00 to Acme Corp has been settled successfully.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: '/dashboard/transactions',
    actionLabel: 'View Transaction',
  },
  {
    id: '2',
    type: 'security',
    priority: 'critical',
    title: 'New Login Detected',
    message: 'A new sign-in was detected from Chrome on Windows. Was this you?',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: '/dashboard/settings',
    actionLabel: 'Review Activity',
  },
  {
    id: '3',
    type: 'system',
    priority: 'medium',
    title: 'Reconciliation Complete',
    message: 'Daily reconciliation for 2025-01-15 completed. 3 exceptions found.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
    actionUrl: '/dashboard/reconciliation',
    actionLabel: 'View Report',
  },
  {
    id: '4',
    type: 'account',
    priority: 'low',
    title: 'Account Verified',
    message: 'Global Trading Ltd has been verified and is now active.',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: '5',
    type: 'alert',
    priority: 'high',
    title: 'Payment Latency Alert',
    message: 'P95 payment latency exceeded SLO threshold (>500ms) for the past 5 minutes.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: '/dashboard/analytics',
    actionLabel: 'View Metrics',
  },
];

function useNotifications() {
  const [notifications, setNotifications] = React.useState<Notification[]>(SAMPLE_NOTIFICATIONS);

  const unreadCount = React.useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markRead = React.useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = React.useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = React.useCallback(() => {
    setNotifications([]);
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll };
}

// ---------------------------------------------------------------------------
// NotificationPopover — Bell icon + dropdown notification center
// ---------------------------------------------------------------------------

interface NotificationPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPopover({ open, onOpenChange }: NotificationPopoverProps) {
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll } =
    useNotifications();
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="relative rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-danger-500" />
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 animate-in slide-in-from-top-2">
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            onDismiss={dismiss}
            onClearAll={clearAll}
            onAction={(notification) => {
              if (notification.actionUrl) {
                window.location.href = notification.actionUrl;
              }
              onOpenChange(false);
            }}
            onSettingsClick={() => {
              window.location.href = '/dashboard/settings';
              onOpenChange(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default NotificationPopover;

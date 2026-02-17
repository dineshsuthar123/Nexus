'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Bell, X, Trash2, MailOpen, Settings } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export type NotificationType = 'payment' | 'account' | 'security' | 'system' | 'alert';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationCenterProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onAction?: (notification: Notification) => void;
  onSettingsClick?: () => void;
  className?: string;
  maxVisible?: number;
}

// =============================================================================
// Type & Priority Config
// =============================================================================

const TYPE_STYLES: Record<NotificationType, { color: string; bg: string; label: string }> = {
  payment: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'Payment' },
  account: { color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Account' },
  security: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Security' },
  system: { color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30', label: 'System' },
  alert: { color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30', label: 'Alert' },
};

const PRIORITY_STYLES: Record<NotificationPriority, string> = {
  low: 'border-l-gray-300',
  medium: 'border-l-blue-400',
  high: 'border-l-orange-400',
  critical: 'border-l-red-500',
};

// =============================================================================
// NotificationItem
// =============================================================================

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onAction?: (notification: Notification) => void;
}

function NotificationItem({ notification, onMarkRead, onDismiss, onAction }: NotificationItemProps) {
  const typeStyle = TYPE_STYLES[notification.type];

  return (
    <div
      className={cn(
        'group relative border-b border-l-4 p-4 transition-colors',
        PRIORITY_STYLES[notification.priority],
        notification.read
          ? 'bg-background opacity-75'
          : 'bg-accent/30'
      )}
      role="article"
      aria-label={`${notification.read ? '' : 'Unread '}notification: ${notification.title}`}
    >
      <div className="flex items-start gap-3">
        {/* Type indicator */}
        <div className={cn('mt-0.5 rounded-full p-1.5', typeStyle.bg)}>
          <Bell className={cn('h-3.5 w-3.5', typeStyle.color)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className={cn('text-sm font-medium truncate', !notification.read && 'font-semibold')}>
              {notification.title}
            </h4>
            {!notification.read && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {new Date(notification.timestamp).toLocaleString()}
            </span>
            <span className={cn('text-xs font-medium', typeStyle.color)}>
              {typeStyle.label}
            </span>
          </div>
          {notification.actionUrl && notification.actionLabel && (
            <button
              type="button"
              onClick={() => onAction?.(notification)}
              className="mt-2 text-xs font-medium text-primary hover:underline"
            >
              {notification.actionLabel}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!notification.read && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className="rounded p-1 hover:bg-accent"
              aria-label="Mark as read"
            >
              <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            className="rounded p-1 hover:bg-destructive/10"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// NotificationCenter
// =============================================================================

export const NotificationCenter = React.forwardRef<HTMLDivElement, NotificationCenterProps>(
  (
    {
      notifications,
      unreadCount,
      onMarkRead,
      onMarkAllRead,
      onDismiss,
      onClearAll,
      onAction,
      onSettingsClick,
      className,
      maxVisible = 50,
    },
    ref
  ) => {
    const visibleNotifications = notifications.slice(0, maxVisible);

    return (
      <div
        ref={ref}
        className={cn(
          'flex w-full max-w-md flex-col overflow-hidden rounded-lg border bg-card shadow-lg',
          className
        )}
        role="region"
        aria-label="Notification center"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Mark all read
              </button>
            )}
            {onSettingsClick && (
              <button
                type="button"
                onClick={onSettingsClick}
                className="rounded p-1 hover:bg-accent"
                aria-label="Notification settings"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications list */}
        <div className="max-h-[400px] overflow-y-auto" role="feed" aria-label="Notifications feed">
          {visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            visibleNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={onMarkRead}
                onDismiss={onDismiss}
                onAction={onAction}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <button
              type="button"
              onClick={onClearAll}
              className="flex w-full items-center justify-center gap-1 rounded py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              <Trash2 className="h-3 w-3" />
              Clear all
            </button>
          </div>
        )}
      </div>
    );
  }
);

NotificationCenter.displayName = 'NotificationCenter';

export default NotificationCenter;

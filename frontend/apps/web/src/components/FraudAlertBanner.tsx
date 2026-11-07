'use client';

import * as React from 'react';
import { AlertTriangle, ShieldAlert, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useNotifications } from '@/lib/websocket/hooks';
import type { SystemNotification } from '@/lib/api/types';

type Alert = SystemNotification & { dismissedAt?: number };

const SEVERITY_STYLES: Record<NonNullable<Alert['severity']>, string> = {
  CRITICAL:
    'bg-red-600 text-white border-red-700 dark:bg-red-700',
  ERROR:
    'bg-orange-500 text-white border-orange-600 dark:bg-orange-600',
  WARNING:
    'bg-yellow-400 text-yellow-900 border-yellow-500 dark:bg-yellow-500 dark:text-yellow-950',
  INFO:
    'bg-blue-500 text-white border-blue-600 dark:bg-blue-600',
};

const CATEGORY_ICON: Record<NonNullable<Alert['category']>, React.ReactNode> = {
  FRAUD:      <ShieldAlert className="h-4 w-4 shrink-0" />,
  COMPLIANCE: <AlertTriangle className="h-4 w-4 shrink-0" />,
  SECURITY:   <ShieldAlert className="h-4 w-4 shrink-0" />,
  SYSTEM:     <AlertTriangle className="h-4 w-4 shrink-0" />,
};

/**
 * FraudAlertBanner
 * Subscribes to real-time WebSocket notifications and surfaces FRAUD / SECURITY /
 * CRITICAL alerts as dismissible top banners, stacked newest-first.
 *
 * Only shows alerts in categories that require immediate operator attention.
 * Alerts auto-dismiss after 60 s unless `actionRequired` is true.
 */
export function FraudAlertBanner() {
  const [alerts, setAlerts] = React.useState<Alert[]>([]);

  // Subscribe to all system notifications; filter for high-priority ones.
  useNotifications(React.useCallback((notification: SystemNotification) => {
    const isHighPriority =
      notification.category === 'FRAUD' ||
      notification.category === 'SECURITY' ||
      notification.severity === 'CRITICAL' ||
      notification.severity === 'ERROR';

    if (!isHighPriority) return;

    setAlerts((prev) => {
      // Deduplicate by alertId.
      if (prev.some((a) => a.alertId === notification.alertId)) return prev;
      return [notification, ...prev].slice(0, 5); // show at most 5 stacked
    });

    // Auto-dismiss non-actionRequired alerts after 60 s.
    if (!notification.actionRequired) {
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.alertId !== notification.alertId));
      }, 60_000);
    }
  }, []));

  const dismiss = (alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.alertId !== alertId));
  };

  if (alerts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      aria-label="Security alerts"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-1 px-4 pt-2"
    >
      {alerts.map((alert) => {
        const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.WARNING;
        const icon  = CATEGORY_ICON[alert.category]  ?? CATEGORY_ICON.SYSTEM;

        return (
          <div
            key={alert.alertId}
            role="alert"
            className={`pointer-events-auto flex w-full max-w-3xl items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${style}`}
          >
            {icon}

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-sm font-semibold leading-snug">
                {alert.title}
              </p>
              {alert.message && (
                <p className="text-xs leading-relaxed opacity-90">
                  {alert.message}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {alert.actionRequired && alert.relatedResourceId && (
                <Link
                  href={`/dashboard/payments/${alert.relatedResourceId}`}
                  className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
                >
                  Review <ExternalLink className="h-3 w-3" />
                </Link>
              )}
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() => dismiss(alert.alertId)}
                className="rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

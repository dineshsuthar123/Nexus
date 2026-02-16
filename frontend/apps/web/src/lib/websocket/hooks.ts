/**
 * Nexus RTP Platform - WebSocket React Hooks
 *
 * Custom hooks for WebSocket integration with React components.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { wsClient } from './client';
import { paymentKeys, accountKeys, reconciliationKeys } from '@/lib/hooks';
import type {
  PaymentUpdate,
  AccountUpdate,
  ReconciliationUpdate,
  SystemNotification,
} from '@/lib/api/types';

// =============================================================================
// Types
// =============================================================================

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

// =============================================================================
// Main WebSocket Hook
// =============================================================================

/**
 * Main hook to manage WebSocket connection lifecycle
 * Should be used once at the app level
 */
export function useWebSocket() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isConnected, setIsConnected] = useState(false);

  // Connect/disconnect based on session
  useEffect(() => {
    if (session?.accessToken) {
      wsClient.connect(session.accessToken);
    }

    return () => {
      // Don't disconnect on cleanup if we still have a session
      // This prevents disconnection on re-renders
    };
  }, [session?.accessToken]);

  // Track connection state
  useEffect(() => {
    const unsubscribe = wsClient.onConnectionStateChange((state) => {
      setConnectionState(state);
      setIsConnected(state === 'connected');
    });

    return unsubscribe;
  }, []);

  // Set up React Query cache invalidation on WebSocket updates
  useEffect(() => {
    const unsubPayment = wsClient.onPayment((data) => {
      // Invalidate payment queries
      queryClient.invalidateQueries({ queryKey: paymentKeys.detail(data.uetr) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    });

    const unsubAccount = wsClient.onAccount((data) => {
      // Invalidate account queries
      queryClient.invalidateQueries({ queryKey: accountKeys.detail(data.id || data.accountId) });
      queryClient.invalidateQueries({ queryKey: accountKeys.lists() });
    });

    const unsubReconciliation = wsClient.onReconciliation((data) => {
      // Invalidate reconciliation queries
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.cycle(data.cycleId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.cycles() });
    });

    return () => {
      unsubPayment();
      unsubAccount();
      unsubReconciliation();
    };
  }, [queryClient]);

  const disconnect = useCallback(() => {
    wsClient.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    if (session?.accessToken) {
      wsClient.disconnect();
      wsClient.connect(session.accessToken);
    }
  }, [session?.accessToken]);

  return {
    connectionState,
    isConnected,
    disconnect,
    reconnect,
  };
}

// =============================================================================
// Subscription Hooks
// =============================================================================

/**
 * Subscribe to payment updates
 */
export function usePaymentUpdates(
  onUpdate: (data: PaymentUpdate) => void,
  options?: { uetr?: string }
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    // Subscribe to specific payment if UETR provided
    if (options?.uetr) {
      wsClient.subscribe('payment', options.uetr);
    }

    const unsubscribe = wsClient.onPayment((data) => {
      // Filter by UETR if specified
      if (!options?.uetr || data.uetr === options.uetr) {
        callbackRef.current(data);
      }
    });

    return () => {
      if (options?.uetr) {
        wsClient.unsubscribe('payment', options.uetr);
      }
      unsubscribe();
    };
  }, [options?.uetr]);
}

/**
 * Subscribe to account updates
 */
export function useAccountUpdates(
  onUpdate: (data: AccountUpdate) => void,
  options?: { accountId?: string }
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (options?.accountId) {
      wsClient.subscribe('account', options.accountId);
    }

    const unsubscribe = wsClient.onAccount((data) => {
      if (!options?.accountId || data.id === options.accountId) {
        callbackRef.current(data);
      }
    });

    return () => {
      if (options?.accountId) {
        wsClient.unsubscribe('account', options.accountId);
      }
      unsubscribe();
    };
  }, [options?.accountId]);
}

/**
 * Subscribe to reconciliation updates
 */
export function useReconciliationUpdates(
  onUpdate: (data: ReconciliationUpdate) => void,
  options?: { cycleId?: string }
) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    if (options?.cycleId) {
      wsClient.subscribe('reconciliation', options.cycleId);
    }

    const unsubscribe = wsClient.onReconciliation((data) => {
      if (!options?.cycleId || data.cycleId === options.cycleId) {
        callbackRef.current(data);
      }
    });

    return () => {
      if (options?.cycleId) {
        wsClient.unsubscribe('reconciliation', options.cycleId);
      }
      unsubscribe();
    };
  }, [options?.cycleId]);
}

/**
 * Subscribe to system notifications
 */
export function useNotifications(
  onNotification: (data: SystemNotification) => void
) {
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;

  useEffect(() => {
    const unsubscribe = wsClient.onNotification((data) => {
      callbackRef.current(data);
    });

    return unsubscribe;
  }, []);
}

/**
 * Subscribe to WebSocket errors
 */
export function useWebSocketErrors(
  onError: (error: { code: string; message: string }) => void
) {
  const callbackRef = useRef(onError);
  callbackRef.current = onError;

  useEffect(() => {
    const unsubscribe = wsClient.onError((error) => {
      callbackRef.current(error);
    });

    return unsubscribe;
  }, []);
}

// =============================================================================
// State Hooks
// =============================================================================

/**
 * Get latest payment update for a specific UETR
 */
export function useLatestPaymentUpdate(uetr: string) {
  const [update, setUpdate] = useState<PaymentUpdate | null>(null);

  usePaymentUpdates(setUpdate, { uetr });

  return update;
}

/**
 * Get latest account update for a specific account
 */
export function useLatestAccountUpdate(accountId: string) {
  const [update, setUpdate] = useState<AccountUpdate | null>(null);

  useAccountUpdates(setUpdate, { accountId });

  return update;
}

/**
 * Get all notifications
 */
export function useNotificationList(maxItems: number = 50) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  useNotifications((notification) => {
    setNotifications((prev) => {
      const updated = [notification, ...prev];
      return updated.slice(0, maxItems);
    });
  });

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    notifications,
    clearNotifications,
    dismissNotification,
    unreadCount: notifications.filter((n) => !n.read).length,
  };
}

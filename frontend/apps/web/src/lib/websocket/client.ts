/**
 * Nexus RTP Platform - WebSocket Client
 * 
 * Real-time WebSocket connection manager with:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat/ping-pong
 * - Message type routing
 * - Connection state management
 * - Event-based subscription
 */

import type { 
  WebSocketMessage, 
  WebSocketEventType,
  PaymentUpdate,
  AccountUpdate,
  ReconciliationUpdate,
  SystemNotification,
} from '@/lib/api/types';

// =============================================================================
// Types
// =============================================================================

type MessageHandler<T = unknown> = (data: T) => void;

interface SubscriptionMap {
  payment: Set<MessageHandler<PaymentUpdate>>;
  account: Set<MessageHandler<AccountUpdate>>;
  reconciliation: Set<MessageHandler<ReconciliationUpdate>>;
  notification: Set<MessageHandler<SystemNotification>>;
  error: Set<MessageHandler<{ code: string; message: string }>>;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface ConnectionStateHandler {
  (state: ConnectionState): void;
}

// =============================================================================
// Configuration
// =============================================================================

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
const RECONNECT_DELAY_BASE = 1000; // 1 second
const RECONNECT_DELAY_MAX = 30000; // 30 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds

// =============================================================================
// WebSocket Client Class
// =============================================================================

class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private accessToken: string | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private connectionStateHandlers = new Set<ConnectionStateHandler>();

  private subscriptions: SubscriptionMap = {
    payment: new Set(),
    account: new Set(),
    reconciliation: new Set(),
    notification: new Set(),
    error: new Set(),
  };

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to WebSocket server
   */
  connect(accessToken?: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    if (accessToken) {
      this.accessToken = accessToken;
    }

    this.updateConnectionState('connecting');

    try {
      const url = this.accessToken 
        ? `${WS_URL}?token=${encodeURIComponent(this.accessToken)}`
        : WS_URL;

      this.socket = new WebSocket(url);

      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('[WS] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.clearTimers();
    
    if (this.socket) {
      this.socket.onclose = null; // Prevent reconnection
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.reconnectAttempts = 0;
    this.updateConnectionState('disconnected');
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private handleOpen(): void {
    console.log('[WS] Connected');
    this.reconnectAttempts = 0;
    this.updateConnectionState('connected');
    this.startHeartbeat();
  }

  private handleClose(event: CloseEvent): void {
    console.log(`[WS] Closed: ${event.code} ${event.reason}`);
    this.clearTimers();

    if (event.code !== 1000) {
      // Abnormal close - attempt reconnection
      this.scheduleReconnect();
    } else {
      this.updateConnectionState('disconnected');
    }
  }

  private handleError(event: Event): void {
    console.error('[WS] Error:', event);
    this.notifyError({ code: 'WS_ERROR', message: 'WebSocket error occurred' });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;

      // Handle pong response
      if (message.type === 'pong') {
        this.clearHeartbeatTimeout();
        return;
      }

      // Route message to appropriate handlers
      this.routeMessage(message);
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }

  // ===========================================================================
  // Message Routing
  // ===========================================================================

  private routeMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'payment.created':
      case 'payment.updated':
      case 'payment.settled':
      case 'payment.failed':
      case 'payment.returned':
        this.notifyPayment(message.data as PaymentUpdate);
        break;

      case 'account.created':
      case 'account.updated':
      case 'account.balance_changed':
        this.notifyAccount(message.data as AccountUpdate);
        break;

      case 'reconciliation.started':
      case 'reconciliation.completed':
      case 'reconciliation.failed':
        this.notifyReconciliation(message.data as ReconciliationUpdate);
        break;

      case 'notification':
        this.notifyNotification(message.data as SystemNotification);
        break;

      case 'error':
        this.notifyError(message.data as { code: string; message: string });
        break;

      default:
        console.warn('[WS] Unknown message type:', message.type);
    }
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to payment updates
   */
  onPayment(handler: MessageHandler<PaymentUpdate>): () => void {
    this.subscriptions.payment.add(handler);
    return () => this.subscriptions.payment.delete(handler);
  }

  /**
   * Subscribe to account updates
   */
  onAccount(handler: MessageHandler<AccountUpdate>): () => void {
    this.subscriptions.account.add(handler);
    return () => this.subscriptions.account.delete(handler);
  }

  /**
   * Subscribe to reconciliation updates
   */
  onReconciliation(handler: MessageHandler<ReconciliationUpdate>): () => void {
    this.subscriptions.reconciliation.add(handler);
    return () => this.subscriptions.reconciliation.delete(handler);
  }

  /**
   * Subscribe to system notifications
   */
  onNotification(handler: MessageHandler<SystemNotification>): () => void {
    this.subscriptions.notification.add(handler);
    return () => this.subscriptions.notification.delete(handler);
  }

  /**
   * Subscribe to errors
   */
  onError(handler: MessageHandler<{ code: string; message: string }>): () => void {
    this.subscriptions.error.add(handler);
    return () => this.subscriptions.error.delete(handler);
  }

  /**
   * Subscribe to connection state changes
   */
  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    return () => this.connectionStateHandlers.delete(handler);
  }

  // ===========================================================================
  // Notification Methods
  // ===========================================================================

  private notifyPayment(data: PaymentUpdate): void {
    this.subscriptions.payment.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('[WS] Payment handler error:', error);
      }
    });
  }

  private notifyAccount(data: AccountUpdate): void {
    this.subscriptions.account.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('[WS] Account handler error:', error);
      }
    });
  }

  private notifyReconciliation(data: ReconciliationUpdate): void {
    this.subscriptions.reconciliation.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('[WS] Reconciliation handler error:', error);
      }
    });
  }

  private notifyNotification(data: SystemNotification): void {
    this.subscriptions.notification.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('[WS] Notification handler error:', error);
      }
    });
  }

  private notifyError(data: { code: string; message: string }): void {
    this.subscriptions.error.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('[WS] Error handler error:', error);
      }
    });
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.connectionStateHandlers.forEach((handler) => {
      try {
        handler(state);
      } catch (error) {
        console.error('[WS] Connection state handler error:', error);
      }
    });
  }

  // ===========================================================================
  // Heartbeat
  // ===========================================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
        
        // Set timeout for pong response
        this.heartbeatTimeout = setTimeout(() => {
          console.warn('[WS] Heartbeat timeout - reconnecting');
          this.socket?.close(4000, 'Heartbeat timeout');
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  // ===========================================================================
  // Reconnection
  // ===========================================================================

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.updateConnectionState('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_DELAY_MAX
    );

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  private clearTimers(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearHeartbeatTimeout();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Send a message through the WebSocket
   */
  send(message: { type: string; data?: unknown }): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send message - not connected');
    }
  }

  /**
   * Subscribe to specific resource updates
   */
  subscribe(type: 'payment' | 'account' | 'reconciliation', id: string): void {
    this.send({ type: 'subscribe', data: { type, id } });
  }

  /**
   * Unsubscribe from specific resource updates
   */
  unsubscribe(type: 'payment' | 'account' | 'reconciliation', id: string): void {
    this.send({ type: 'unsubscribe', data: { type, id } });
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const wsClient = new WebSocketClient();

export default wsClient;

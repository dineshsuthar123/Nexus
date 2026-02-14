/**
 * Nexus RTP Platform - WebSocket Provider
 * 
 * Wraps the app to manage WebSocket connection lifecycle
 * and integrate with React Query for real-time updates.
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useWebSocket } from '@/lib/websocket';

// =============================================================================
// Context
// =============================================================================

interface WebSocketContextValue {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  isConnected: boolean;
  disconnect: () => void;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const websocket = useWebSocket();

  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  
  return context;
}

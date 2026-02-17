'use client';

import React from 'react';
import { useWebSocket } from '@/lib/websocket/hooks';
import { cn } from '@nexus/ui';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface ConnectionStatusProps {
  className?: string;
  showLabel?: boolean;
}

const stateConfig: Record<ConnectionState, { color: string; bg: string; label: string; pulse: boolean }> = {
  connected: {
    color: 'bg-green-500',
    bg: 'bg-green-500/20',
    label: 'Connected',
    pulse: false,
  },
  connecting: {
    color: 'bg-yellow-500',
    bg: 'bg-yellow-500/20',
    label: 'Connecting...',
    pulse: true,
  },
  disconnected: {
    color: 'bg-red-500',
    bg: 'bg-red-500/20',
    label: 'Disconnected',
    pulse: false,
  },
};

export function ConnectionStatus({ className, showLabel = true }: ConnectionStatusProps) {
  const { isConnected } = useWebSocket();

  // Derive state: in a real app, also check 'connecting' from wsClient state
  const state: ConnectionState = isConnected ? 'connected' : 'disconnected';
  const config = stateConfig[state];

  return (
    <div
      className={cn('inline-flex items-center gap-2', className)}
      role="status"
      aria-live="polite"
      aria-label={`WebSocket ${config.label}`}
    >
      <span className="relative flex h-3 w-3">
        {config.pulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              config.color
            )}
          />
        )}
        <span
          className={cn('relative inline-flex h-3 w-3 rounded-full', config.color)}
        />
      </span>
      {showLabel && (
        <span className="text-xs text-muted-foreground">{config.label}</span>
      )}
    </div>
  );
}

export default ConnectionStatus;

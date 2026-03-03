'use client';

import * as React from 'react';
import { cn } from '@nexus/ui';
import { X, Keyboard } from 'lucide-react';

// ---------------------------------------------------------------------------
// Shortcut definitions
// ---------------------------------------------------------------------------

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open Command Palette' },
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'T'], description: 'Go to Transactions' },
      { keys: ['G', 'P'], description: 'Go to Payments' },
      { keys: ['G', 'A'], description: 'Go to Analytics' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
  {
    label: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'N'], description: 'New Payment' },
      { keys: ['⌘', '⇧', 'N'], description: 'Toggle Notifications' },
      { keys: ['⌘', 'B'], description: 'Toggle Sidebar' },
      { keys: ['⌘', '⇧', 'D'], description: 'Toggle Dark Mode' },
    ],
  },
  {
    label: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show Keyboard Shortcuts' },
      { keys: ['Esc'], description: 'Close dialogs / panels' },
    ],
  },
];

// ---------------------------------------------------------------------------
// useKeyboardShortcuts hook
// ---------------------------------------------------------------------------

interface ShortcutHandlers {
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
  onToggleNotifications?: () => void;
  onShowShortcuts?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const pendingKey = React.useRef<string | null>(null);
  const pendingTimeout = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl + B → Toggle Sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        handlers.onToggleSidebar?.();
        return;
      }

      // Cmd/Ctrl + Shift + D → Toggle Theme
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        handlers.onToggleTheme?.();
        return;
      }

      // Cmd/Ctrl + Shift + N → Toggle Notifications
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        handlers.onToggleNotifications?.();
        return;
      }

      // ? → Show shortcuts (only when no modifier)
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handlers.onShowShortcuts?.();
        return;
      }

      // Vim-style "G then X" navigation sequences
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (pendingKey.current === 'g') {
          clearTimeout(pendingTimeout.current);
          pendingKey.current = null;

          const navigateTo = (path: string) => {
            window.location.href = path;
          };

          switch (e.key.toLowerCase()) {
            case 'd':
              e.preventDefault();
              navigateTo('/dashboard');
              return;
            case 't':
              e.preventDefault();
              navigateTo('/dashboard/transactions');
              return;
            case 'p':
              e.preventDefault();
              navigateTo('/dashboard/payments');
              return;
            case 'a':
              e.preventDefault();
              navigateTo('/dashboard/analytics');
              return;
            case 's':
              e.preventDefault();
              navigateTo('/dashboard/settings');
              return;
          }
        }

        if (e.key.toLowerCase() === 'g') {
          pendingKey.current = 'g';
          clearTimeout(pendingTimeout.current);
          pendingTimeout.current = setTimeout(() => {
            pendingKey.current = null;
          }, 500);
          return;
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(pendingTimeout.current);
    };
  }, [handlers]);
}

// ---------------------------------------------------------------------------
// KeyboardShortcuts Dialog
// ---------------------------------------------------------------------------

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900',
            'animate-in'
          )}
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
            <div className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-neutral-500" />
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                Keyboard Shortcuts
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            <div className="space-y-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.label}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.description}
                        className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                      >
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                          {shortcut.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && (
                                <span className="text-[10px] text-neutral-300 dark:text-neutral-600">
                                  +
                                </span>
                              )}
                              <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-neutral-200 bg-neutral-50 px-1.5 font-mono text-[11px] font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                                {key}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200 px-6 py-3 dark:border-neutral-700">
            <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
              Press <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 py-0.5 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-800">?</kbd> to toggle this dialog
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default KeyboardShortcuts;

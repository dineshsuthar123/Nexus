'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Copy, Eye, EyeOff, Key, Plus, Trash2, RefreshCw, Shield } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface ApiKeyManagerProps {
  keys: ApiKey[];
  onCreateKey: (name: string, permissions: string[]) => void;
  onRevokeKey: (id: string) => void;
  onRotateKey: (id: string) => void;
  availablePermissions: string[];
  className?: string;
  /** Max keys allowed */
  maxKeys?: number;
  /** Newly created key value (shown once) */
  newKeyValue?: string | null;
  onDismissNewKey?: () => void;
}

// =============================================================================
// ApiKeyRow
// =============================================================================

interface ApiKeyRowProps {
  apiKey: ApiKey;
  onRevoke: (id: string) => void;
  onRotate: (id: string) => void;
}

function ApiKeyRow({ apiKey, onRevoke, onRotate }: ApiKeyRowProps) {
  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();
  const isActive = apiKey.status === 'active' && !isExpired;

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border p-4 transition-colors',
        !isActive && 'opacity-60'
      )}
      role="listitem"
    >
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full',
        isActive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'
      )}>
        <Key className={cn('h-5 w-5', isActive ? 'text-green-600' : 'text-gray-400')} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium truncate">{apiKey.name}</h4>
          <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            isActive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : apiKey.status === 'revoked'
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
          )}>
            {isExpired ? 'Expired' : apiKey.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{apiKey.prefix}•••••••</code>
          <span>Created {new Date(apiKey.createdAt).toLocaleDateString()}</span>
          {apiKey.lastUsedAt && (
            <span>Last used {new Date(apiKey.lastUsedAt).toLocaleDateString()}</span>
          )}
        </div>
        {apiKey.permissions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {apiKey.permissions.map((perm) => (
              <span
                key={perm}
                className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                <Shield className="mr-1 h-3 w-3" />
                {perm}
              </span>
            ))}
          </div>
        )}
      </div>

      {isActive && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onRotate(apiKey.id)}
            className="rounded p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Rotate key ${apiKey.name}`}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onRevoke(apiKey.id)}
            className="rounded p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Revoke key ${apiKey.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// NewKeyBanner
// =============================================================================

interface NewKeyBannerProps {
  keyValue: string;
  onDismiss: () => void;
}

function NewKeyBanner({ keyValue, onDismiss }: NewKeyBannerProps) {
  const [visible, setVisible] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for clipboard API
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
      <div className="flex items-start gap-3">
        <Key className="mt-0.5 h-5 w-5 text-green-600" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">
            API Key Created Successfully
          </h4>
          <p className="mt-1 text-xs text-green-700 dark:text-green-300">
            Copy this key now. You won't be able to see it again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm dark:bg-gray-900">
              {visible ? keyValue : '•'.repeat(Math.min(keyValue.length, 40))}
            </code>
            <button
              type="button"
              onClick={() => setVisible(!visible)}
              className="rounded p-2 hover:bg-green-100 dark:hover:bg-green-900"
              aria-label={visible ? 'Hide key' : 'Show key'}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-2 hover:bg-green-100 dark:hover:bg-green-900"
              aria-label="Copy key"
            >
              <Copy className={cn('h-4 w-4', copied && 'text-green-600')} />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// ApiKeyManager
// =============================================================================

export const ApiKeyManager = React.forwardRef<HTMLDivElement, ApiKeyManagerProps>(
  (
    {
      keys,
      onCreateKey,
      onRevokeKey,
      onRotateKey,
      availablePermissions,
      className,
      maxKeys = 10,
      newKeyValue,
      onDismissNewKey,
    },
    ref
  ) => {
    const [showCreateForm, setShowCreateForm] = React.useState(false);
    const [newName, setNewName] = React.useState('');
    const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);

    const canCreate = keys.filter((k) => k.status === 'active').length < maxKeys;

    const handleCreate = () => {
      if (!newName.trim()) return;
      onCreateKey(newName.trim(), selectedPermissions);
      setNewName('');
      setSelectedPermissions([]);
      setShowCreateForm(false);
    };

    const togglePermission = (perm: string) => {
      setSelectedPermissions((prev) =>
        prev.includes(perm)
          ? prev.filter((p) => p !== perm)
          : [...prev, perm]
      );
    };

    return (
      <div ref={ref} className={cn('space-y-4', className)} role="region" aria-label="API Key Management">
        {/* New Key Banner */}
        {newKeyValue && onDismissNewKey && (
          <NewKeyBanner keyValue={newKeyValue} onDismiss={onDismissNewKey} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">API Keys</h3>
            <p className="text-sm text-muted-foreground">
              {keys.filter((k) => k.status === 'active').length} of {maxKeys} keys active
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create Key
            </button>
          )}
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <label htmlFor="key-name" className="text-sm font-medium">
                Key Name <span className="text-destructive">*</span>
              </label>
              <input
                id="key-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Production API Key"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                maxLength={100}
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2">
                {availablePermissions.map((perm) => (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => togglePermission(perm)}
                    className={cn(
                      'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      selectedPermissions.includes(perm)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-accent'
                    )}
                    aria-pressed={selectedPermissions.includes(perm)}
                  >
                    {perm}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Keys List */}
        <div className="space-y-2" role="list" aria-label="API keys list">
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
              <Key className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No API keys created yet</p>
            </div>
          ) : (
            keys.map((key) => (
              <ApiKeyRow
                key={key.id}
                apiKey={key}
                onRevoke={onRevokeKey}
                onRotate={onRotateKey}
              />
            ))
          )}
        </div>
      </div>
    );
  }
);

ApiKeyManager.displayName = 'ApiKeyManager';

export default ApiKeyManager;

import type { Meta, StoryObj } from '@storybook/react';
import { ApiKeyManager } from '../components/ApiKeyManager/ApiKeyManager';
import type { ApiKey } from '../components/ApiKeyManager/ApiKeyManager';

const meta: Meta<typeof ApiKeyManager> = {
  title: 'Fintech/ApiKeyManager',
  component: ApiKeyManager,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ApiKeyManager>;

const sampleKeys: ApiKey[] = [
  {
    id: 'key-1',
    name: 'Production API',
    prefix: 'nxs_prod',
    permissions: ['payments:read', 'payments:write', 'accounts:read'],
    createdAt: '2024-01-01T00:00:00Z',
    lastUsedAt: '2024-01-15T14:30:00Z',
    expiresAt: '2025-01-01T00:00:00Z',
    status: 'active',
  },
  {
    id: 'key-2',
    name: 'Staging API',
    prefix: 'nxs_stg',
    permissions: ['payments:read', 'accounts:read'],
    createdAt: '2024-01-05T00:00:00Z',
    lastUsedAt: '2024-01-14T09:00:00Z',
    status: 'active',
  },
  {
    id: 'key-3',
    name: 'Old Integration',
    prefix: 'nxs_old',
    permissions: ['payments:read'],
    createdAt: '2023-06-15T00:00:00Z',
    status: 'revoked',
  },
];

const permissions = [
  'payments:read',
  'payments:write',
  'accounts:read',
  'accounts:write',
  'reconciliation:read',
  'audit:read',
  'analytics:read',
];

export const Default: Story = {
  args: {
    keys: sampleKeys,
    onCreateKey: (name, perms) => console.log('Create:', name, perms),
    onRevokeKey: (id) => console.log('Revoke:', id),
    onRotateKey: (id) => console.log('Rotate:', id),
    availablePermissions: permissions,
    maxKeys: 10,
  },
};

export const WithNewKey: Story = {
  args: {
    keys: sampleKeys,
    onCreateKey: () => {},
    onRevokeKey: () => {},
    onRotateKey: () => {},
    availablePermissions: permissions,
    newKeyValue: 'nxs_demo_sk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    onDismissNewKey: () => console.log('Dismiss new key'),
  },
};

export const Empty: Story = {
  args: {
    keys: [],
    onCreateKey: () => {},
    onRevokeKey: () => {},
    onRotateKey: () => {},
    availablePermissions: permissions,
  },
};

export const AtLimit: Story = {
  args: {
    keys: Array.from({ length: 3 }, (_, i) => ({
      id: `key-${i}`,
      name: `API Key ${i + 1}`,
      prefix: `nxs_k${i}`,
      permissions: ['payments:read'],
      createdAt: '2024-01-01T00:00:00Z',
      status: 'active' as const,
    })),
    onCreateKey: () => {},
    onRevokeKey: () => {},
    onRotateKey: () => {},
    availablePermissions: permissions,
    maxKeys: 3,
  },
};

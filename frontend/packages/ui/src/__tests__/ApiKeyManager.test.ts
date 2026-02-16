/**
 * ApiKeyManager Component Tests
 */

import { describe, it, expect } from 'vitest';

describe('ApiKeyManager', () => {
  it('should export the component', async () => {
    const mod = await import('../../components/ApiKeyManager/ApiKeyManager');
    expect(mod.ApiKeyManager).toBeDefined();
    expect(mod.ApiKeyManager.displayName).toBe('ApiKeyManager');
  });
});

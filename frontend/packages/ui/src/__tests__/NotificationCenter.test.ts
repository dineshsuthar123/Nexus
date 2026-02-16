/**
 * NotificationCenter Component Tests
 */

import { describe, it, expect } from 'vitest';

describe('NotificationCenter', () => {
  it('should export the component', async () => {
    const mod = await import('../../components/NotificationCenter/NotificationCenter');
    expect(mod.NotificationCenter).toBeDefined();
    expect(mod.NotificationCenter.displayName).toBe('NotificationCenter');
  });
});

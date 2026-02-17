/**
 * PaymentWizard Component Tests
 */

import { describe, it, expect } from 'vitest';

describe('PaymentWizard', () => {
  it('should export the component', async () => {
    const mod = await import('../components/PaymentWizard/PaymentWizard');
    expect(mod.PaymentWizard).toBeDefined();
    expect(mod.PaymentWizard.displayName).toBe('PaymentWizard');
  });
});

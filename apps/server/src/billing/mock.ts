import type { PaymentProvider, CheckoutArgs, CheckoutResult } from './provider.js';

// Dev/testing provider: no real money. Checkout returns no redirect; the client
// immediately calls /api/billing/confirm to fulfill, exercising the full
// pending → paid → credit-grant path so the flow is verifiable end-to-end today.
export class MockProvider implements PaymentProvider {
  readonly id = 'mock' as const;
  readonly enabled = true;

  async createCheckout(_args: CheckoutArgs): Promise<CheckoutResult> {
    // No checkoutUrl → the frontend treats this as auto-confirm.
    return {};
  }

  async handleWebhook(): Promise<{ ref: string } | null> {
    // Mock has no external webhook; fulfillment happens via /confirm.
    return null;
  }
}

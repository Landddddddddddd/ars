import { PAYMENT_PROVIDER } from '../env.js';
import type { CreditPackage } from './packages.js';
import { MockProvider } from './mock.js';
import { StripeProvider } from './stripe.js';
import { AlipayProvider } from './alipay.js';

export interface CheckoutArgs {
  user: { id: string; email: string };
  pkg: CreditPackage;
  ref: string; // pre-generated payment ref (also the pending payment key)
  returnUrl: string; // where the provider sends the user back on success
  cancelUrl: string;
}

export interface CheckoutResult {
  // Redirect the browser here (Stripe/Alipay). Absent for mock (auto-confirm).
  checkoutUrl?: string;
  // For a QR-code flow (e.g. Alipay 扫码). Optional.
  qrCode?: string;
}

export interface PaymentProvider {
  readonly id: 'mock' | 'stripe' | 'alipay';
  /** Whether required credentials are present; disabled providers reject checkout. */
  readonly enabled: boolean;
  createCheckout(args: CheckoutArgs): Promise<CheckoutResult>;
  /**
   * Verify a webhook/notify payload and return the provider_ref to fulfill, or
   * null if it isn't a completed-payment event. Throws on signature failure.
   */
  handleWebhook(raw: string, headers: Record<string, string>): Promise<{ ref: string } | null>;
}

let cached: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (cached) return cached;
  switch (PAYMENT_PROVIDER) {
    case 'stripe':
      cached = new StripeProvider();
      break;
    case 'alipay':
      cached = new AlipayProvider();
      break;
    default:
      cached = new MockProvider();
  }
  return cached;
}

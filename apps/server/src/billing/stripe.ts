import Stripe from 'stripe';
import type { PaymentProvider, CheckoutArgs, CheckoutResult } from './provider.js';

// Real Stripe Checkout + webhook. Disabled (and rejects checkout) until
// STRIPE_SECRET_KEY is set, so a domestic/mock deployment is unaffected.
export class StripeProvider implements PaymentProvider {
  readonly id = 'stripe' as const;
  readonly enabled: boolean;
  private client: Stripe | null = null;
  private webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    this.enabled = !!key;
    if (key) this.client = new Stripe(key);
  }

  async createCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
    if (!this.client) throw new Error('Stripe 未配置（缺少 STRIPE_SECRET_KEY）');
    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      // Our pending-payment ref travels in metadata so the webhook can fulfill it.
      client_reference_id: args.ref,
      metadata: { ref: args.ref, userId: args.user.id },
      customer_email: args.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: args.pkg.currency.toLowerCase(),
            unit_amount: args.pkg.amount,
            product_data: {
              name: args.pkg.label,
              description: `${args.pkg.credits} credits`,
            },
          },
        },
      ],
      success_url: args.returnUrl,
      cancel_url: args.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe 未返回结账链接');
    return { checkoutUrl: session.url };
  }

  async handleWebhook(
    raw: string,
    headers: Record<string, string>,
  ): Promise<{ ref: string } | null> {
    if (!this.client) return null;
    if (!this.webhookSecret) throw new Error('缺少 STRIPE_WEBHOOK_SECRET');
    const sig = headers['stripe-signature'];
    if (!sig) throw new Error('缺少 stripe-signature');

    // Throws if the signature/secret don't match — the route turns that into 400.
    const event = await this.client.webhooks.constructEventAsync(raw, sig, this.webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      // Only fulfill fully-paid sessions.
      if (session.payment_status !== 'paid') return null;
      const ref = session.metadata?.ref ?? session.client_reference_id ?? undefined;
      if (!ref) return null;
      return { ref };
    }
    return null;
  }
}

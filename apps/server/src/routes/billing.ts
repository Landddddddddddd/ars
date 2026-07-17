import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { requireAuth, type AuthVars } from '../auth.js';
import { getBalance } from '../credits.js';
import { activePackages, findPackage } from '../billing/packages.js';
import { paymentProvider } from '../billing/provider.js';
import { createPendingPayment, fulfillPayment } from '../billing/fulfill.js';
import { PUBLIC_BASE_URL, SITE_CURRENCY } from '../env.js';

export const billingRoutes = new Hono<{ Variables: AuthVars }>();

// Public config for the UI: which provider is live + the price list.
billingRoutes.get('/config', (c) => {
  const provider = paymentProvider();
  return c.json({
    provider: provider.id,
    enabled: provider.enabled,
    currency: SITE_CURRENCY,
    packages: activePackages(),
  });
});

billingRoutes.get('/packages', (c) => c.json({ packages: activePackages() }));

// Start a purchase. Creates a pending payment, then asks the provider for a
// checkout URL (redirect flow) or nothing (mock → client auto-confirms).
billingRoutes.post('/checkout', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req
    .json<{ packageId?: string }>()
    .catch(() => ({}) as { packageId?: string });
  const pkg = findPackage(body.packageId ?? '');
  if (!pkg) return c.json({ error: '套餐不存在' }, 400);

  const provider = paymentProvider();
  if (!provider.enabled) {
    return c.json({ error: `支付渠道 ${provider.id} 未配置` }, 503);
  }

  const ref = randomUUID();
  createPendingPayment({ userId: user.id, provider: provider.id, ref, pkg });

  try {
    const result = await provider.createCheckout({
      user: { id: user.id, email: user.email },
      pkg,
      ref,
      returnUrl: `${PUBLIC_BASE_URL}/?paid=1`,
      cancelUrl: `${PUBLIC_BASE_URL}/?canceled=1`,
    });
    return c.json({ provider: provider.id, ref, ...result });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// Mock-only: the client confirms its own pending payment. In production this
// path is unused — real providers fulfill via /webhook. Owner-checked.
billingRoutes.post('/confirm', requireAuth, async (c) => {
  const user = c.get('user');
  const provider = paymentProvider();
  if (provider.id !== 'mock') return c.json({ error: '该渠道不支持客户端确认' }, 400);

  const body = await c.req.json<{ ref?: string }>().catch(() => ({}) as { ref?: string });
  const ref = body.ref ?? '';
  const result = fulfillPayment('mock', ref);
  if (!result) return c.json({ error: '未找到待支付订单' }, 404);
  if (result.userId !== user.id) return c.json({ error: 'not found' }, 404);

  return c.json({ ok: true, credited: result.credits, balance: getBalance(user.id) });
});

// Provider webhook / async notify. Raw body is required for signature checks, so
// this is mounted before the JSON/CORS body handling (see index.ts).
billingRoutes.post('/webhook/:provider', async (c) => {
  const provider = paymentProvider();
  if (c.req.param('provider') !== provider.id) return c.json({ error: 'unknown provider' }, 400);

  const raw = await c.req.text();
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => (headers[k] = v));

  let parsed: { ref: string } | null;
  try {
    parsed = await provider.handleWebhook(raw, headers);
  } catch (err) {
    return c.json({ error: 'invalid signature: ' + (err as Error).message }, 400);
  }
  if (!parsed) return c.json({ ok: true, ignored: true });

  fulfillPayment(provider.id, parsed.ref); // idempotent
  return c.json({ ok: true });
});

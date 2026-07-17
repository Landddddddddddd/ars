import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { grant } from '../credits.js';
import type { CreditPackage } from './packages.js';

// A payment moves pending → paid exactly once. Fulfillment is the single place
// credits are granted for a purchase, shared by every provider (mock webhook,
// Stripe webhook, Alipay notify). Idempotency is enforced by the DB row status.

const insertPending = db.prepare(
  `INSERT INTO payments (id, user_id, provider, provider_ref, package_id, credits, amount, currency, status, created_at)
   VALUES (@id, @user_id, @provider, @provider_ref, @package_id, @credits, @amount, @currency, 'pending', @created_at)
   ON CONFLICT(provider, provider_ref) DO NOTHING`,
);
const selectPayment = db.prepare(`SELECT * FROM payments WHERE provider = ? AND provider_ref = ?`);
const markPaid = db.prepare(`UPDATE payments SET status = 'paid' WHERE id = ?`);

interface PaymentRow {
  id: string;
  user_id: string;
  provider: string;
  provider_ref: string;
  package_id: string;
  credits: number;
  amount: number;
  currency: string;
  status: string;
  created_at: number;
}

export function createPendingPayment(args: {
  userId: string;
  provider: string;
  ref: string;
  pkg: CreditPackage;
}): void {
  insertPending.run({
    id: randomUUID(),
    user_id: args.userId,
    provider: args.provider,
    provider_ref: args.ref,
    package_id: args.pkg.id,
    credits: args.pkg.credits,
    amount: args.pkg.amount,
    currency: args.pkg.currency,
    created_at: Date.now(),
  });
}

export interface FulfillResult {
  userId: string;
  credits: number;
  balance: number;
  alreadyPaid: boolean;
}

// Grant credits for a (provider, ref) exactly once. Returns null if there is no
// matching pending payment (e.g. a webhook for an unknown ref).
export const fulfillPayment = db.transaction(
  (provider: string, ref: string): FulfillResult | null => {
    const p = selectPayment.get(provider, ref) as PaymentRow | undefined;
    if (!p) return null;
    if (p.status === 'paid') {
      return { userId: p.user_id, credits: p.credits, balance: -1, alreadyPaid: true };
    }
    markPaid.run(p.id);
    const balance = grant(p.user_id, p.credits, 'purchase', `${provider}:${ref}`);
    return { userId: p.user_id, credits: p.credits, balance, alreadyPaid: false };
  },
);

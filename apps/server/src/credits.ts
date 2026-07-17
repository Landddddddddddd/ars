import { randomUUID } from 'node:crypto';
import { db, type UserRow } from './db.js';

// All balance changes go through these helpers so users.credits and the ledger
// never diverge. better-sqlite3 is synchronous, so db.transaction gives us real
// atomicity without async races.

const selectCredits = db.prepare(`SELECT credits FROM users WHERE id = ?`);
const updateCredits = db.prepare(`UPDATE users SET credits = credits + ? WHERE id = ?`);
const insertLedger = db.prepare(
  `INSERT INTO ledger (id, user_id, delta, reason, ref, balance_after, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const ledgerByRef = db.prepare(
  `SELECT id FROM ledger WHERE user_id = ? AND reason = ? AND ref = ? LIMIT 1`,
);

export function getBalance(userId: string): number {
  const row = selectCredits.get(userId) as { credits: number } | undefined;
  return row?.credits ?? 0;
}

class InsufficientCreditsError extends Error {
  constructor() {
    super('积分不足');
    this.name = 'InsufficientCreditsError';
  }
}
export function isInsufficient(err: unknown): boolean {
  return err instanceof InsufficientCreditsError;
}

/** Add credits (bonus, purchase, refund). Returns the new balance. */
export const grant = db.transaction(
  (userId: string, amount: number, reason: string, ref: string | null): number => {
    const row = selectCredits.get(userId) as { credits: number } | undefined;
    if (!row) throw new Error('user not found');
    const after = row.credits + amount;
    updateCredits.run(amount, userId);
    insertLedger.run(randomUUID(), userId, amount, reason, ref, after, Date.now());
    return after;
  },
);

/** Deduct `cost` credits atomically; throws InsufficientCreditsError if short. */
export const charge = db.transaction(
  (userId: string, cost: number, reason: string, ref: string): number => {
    const row = selectCredits.get(userId) as { credits: number } | undefined;
    if (!row) throw new Error('user not found');
    if (row.credits < cost) throw new InsufficientCreditsError();
    const after = row.credits - cost;
    updateCredits.run(-cost, userId);
    insertLedger.run(randomUUID(), userId, -cost, reason, ref, after, Date.now());
    return after;
  },
);

/** Refund `amount` credits, idempotent by ref (a run only refunds once). */
export const refund = db.transaction(
  (userId: string, amount: number, ref: string): number | null => {
    if (ledgerByRef.get(userId, 'run.refund', ref)) return null; // already refunded
    const row = selectCredits.get(userId) as { credits: number } | undefined;
    if (!row) return null;
    const after = row.credits + amount;
    updateCredits.run(amount, userId);
    insertLedger.run(randomUUID(), userId, amount, 'run.refund', ref, after, Date.now());
    return after;
  },
);

export interface PublicUser {
  id: string;
  email: string;
  credits: number;
  emailVerified: boolean;
}

export function publicUser(u: UserRow): PublicUser {
  return { id: u.id, email: u.email, credits: u.credits, emailVerified: !!u.email_verified };
}

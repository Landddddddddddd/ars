import type { Context, Next } from 'hono';

export interface RateLimitOptions {
  /** Sliding-ish window length in ms. Default 60_000. */
  windowMs?: number;
  /** Max requests per window per key. Default 20. */
  max?: number;
  /** Key function — defaults to the client IP (x-forwarded-for / x-real-ip). */
  key?: (c: Context) => string;
  /** Message returned on 429. */
  errorMessage?: string;
}

/**
 * Tiny in-memory fixed-window rate limiter (no external store). Good enough for a
 * single-node ARS server; swap for Redis/KV if the server is ever horizontally
 * scaled. Buckets are lazily swept so the map can't grow without bound.
 */
export function rateLimit(opts: RateLimitOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 20;
  const errorMessage = opts.errorMessage ?? '请求过于频繁，请稍后再试';
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return async (c: Context, next: Next) => {
    const id = opts.key ? opts.key(c) : (c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'global');
    const now = Date.now();
    let rec = buckets.get(id);

    if (!rec || now >= rec.resetAt) {
      // New window — sweep expired buckets occasionally to bound memory.
      if (buckets.size > 4000) {
        for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
      }
      rec = { count: 1, resetAt: now + windowMs };
      buckets.set(id, rec);
    } else {
      rec.count++;
    }

    if (rec.count > max) {
      const retryAfter = Math.max(1, Math.ceil((rec.resetAt - now) / 1000));
      return c.json({ error: errorMessage }, 429, { 'Retry-After': String(retryAfter) });
    }

    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - rec.count)));
    await next();
  };
}

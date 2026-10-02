/**
 * Resilient agent execution for the ARS pipeline.
 *
 * One flaky API call (network blip, 429 rate-limit, 503 overload) must not blank
 * out an entire section — so every agent run is wrapped in `withRetry`: transient
 * failures are retried with exponential backoff + jitter, and if all retries fail
 * the agent's optional `fallback` writer fills in a degraded-but-safe result.
 *
 * Pure and zero-dependency so it stays trivially unit-testable.
 */

export interface RetryOptions {
  /**
   * Number of *retries* after the first failure. Total attempts = retries + 1.
   * Default 3 (i.e. up to 4 attempts). The pipeline derives this from each
   * agent's `retry` field (clamped to >= 1).
   */
  retries?: number;
  /** Base backoff in ms for the first retry. Default 600. */
  baseDelayMs?: number;
  /** Upper bound for any single backoff. Default 8000. */
  maxDelayMs?: number;
  /** Backoff multiplier between successive attempts. Default 2. */
  factor?: number;
  /** Jitter fraction 0..1 applied to the capped delay, to avoid thundering herd. Default 0.25. */
  jitter?: number;
  /** Abort signal — when aborted, the next failure is thrown immediately (no retry). */
  signal?: AbortSignal;
  /** Called right before each retry wait. The pipeline uses this to emit an `agent.retry` event. */
  onRetry?: (info: { attempt: number; error: Error; delayMs: number }) => void;
}

// HTTP statuses worth retrying. 4xx client errors (401/403/400/404) are NOT
// retryable — they mean the request itself is bad, not that the server hiccupped.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const RETRYABLE_CODE = /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|ECONNABORTED)$/;

// Provider-agnostic message fragments that signal a transient/retryable failure.
// Kept conservative: a 401 "invalid api key" does NOT match (it contains "key"
// but not these fragments), so auth errors fail fast instead of spinning.
const RETRYABLE_MSG = [
  '429',
  'too many requests',
  'rate limit',
  'rate-limited',
  '500',
  '501',
  '502',
  '503',
  '504',
  'server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'internal server error',
  'upstream',
  'overloaded',
  'capacity',
  'timeout',
  'timed out',
  'etimedout',
  'econnreset',
  'enetreset',
  'socket hang up',
  'connection reset',
  'fetch failed',
  'network error',
  'networkerror',
  'failed to fetch',
  'request failed',
  'temporarily unavailable',
  'try again',
  'load balancer',
  'endpoint is not ready',
  'deadline exceeded',
  'unavailable',
];

/** Classify an error as transient/retryable (network, 429, 5xx, timeouts). */
export function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (typeof e.status === 'number' && RETRYABLE_STATUS.has(e.status)) return true;
  if (typeof e.code === 'string' && RETRYABLE_CODE.test(e.code)) return true;
  const msg = (typeof e.message === 'string' ? e.message : String(err)).toLowerCase();
  return RETRYABLE_MSG.some((p) => msg.includes(p));
}

/**
 * Backoff delay (ms) for a 1-based `attempt`. Grows as base * factor^(attempt-1),
 * capped at `maxDelayMs`, then jittered within ±jitter/2. `jitter = 0` is exact.
 */
export function backoffDelay(
  attempt: number,
  opts: { baseDelayMs: number; maxDelayMs: number; factor: number; jitter: number },
): number {
  const raw = opts.baseDelayMs * Math.pow(opts.factor, attempt - 1);
  const capped = Math.min(raw, opts.maxDelayMs);
  if (opts.jitter <= 0) return capped;
  const spread = capped * opts.jitter;
  return Math.max(0, Math.round(capped - spread / 2 + Math.random() * spread));
}

/**
 * Run `fn`, retrying only on retryable errors, up to `retries` times, with
 * exponential backoff (capped + jittered). Non-retryable errors and exhausted
 * retries rethrow the last error.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 600;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const factor = options.factor ?? 2;
  const jitter = options.jitter ?? 0.25;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (options.signal?.aborted) throw err;
      const canRetry = attempt < retries && isRetryableError(err);
      if (!canRetry) throw err;
      attempt++;
      const delayMs = backoffDelay(attempt, { baseDelayMs, maxDelayMs, factor, jitter });
      options.onRetry?.({ attempt, error: err as Error, delayMs });
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

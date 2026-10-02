import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableError, backoffDelay } from '../src/retry.js';

function err(msg: string, status?: number, code?: string): Error {
  const e: any = new Error(msg);
  if (status !== undefined) e.status = status;
  if (code) e.code = code;
  return e as Error;
}

describe('isRetryableError', () => {
  it('retries 429 / 5xx / 408 / 425', () => {
    expect(isRetryableError(err('rate limited', 429))).toBe(true);
    expect(isRetryableError(err('down', 500))).toBe(true);
    expect(isRetryableError(err('down', 502))).toBe(true);
    expect(isRetryableError(err('down', 503))).toBe(true);
    expect(isRetryableError(err('down', 504))).toBe(true);
    expect(isRetryableError(err('timeout', 408))).toBe(true);
    expect(isRetryableError(err('too early', 425))).toBe(true);
  });

  it('does NOT retry 401 / 403 / 400 / 404', () => {
    expect(isRetryableError(err('invalid api key', 401))).toBe(false);
    expect(isRetryableError(err('forbidden', 403))).toBe(false);
    expect(isRetryableError(err('bad request', 400))).toBe(false);
    expect(isRetryableError(err('not found', 404))).toBe(false);
  });

  it('retries network error codes (ECONNRESET / ENOTFOUND / ETIMEDOUT)', () => {
    expect(isRetryableError(err('boom', undefined, 'ECONNRESET'))).toBe(true);
    expect(isRetryableError(err('boom', undefined, 'ENOTFOUND'))).toBe(true);
    expect(isRetryableError(err('boom', undefined, 'ETIMEDOUT'))).toBe(true);
  });

  it('retries by message heuristic, not by unrelated text', () => {
    expect(isRetryableError(err('Service Unavailable'))).toBe(true);
    expect(isRetryableError(err('socket hang up'))).toBe(true);
    expect(isRetryableError(err('fetch failed'))).toBe(true);
    expect(isRetryableError(err('something unrelated broke'))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially then caps at maxDelayMs', () => {
    const o = { baseDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: 0 };
    expect(backoffDelay(1, o)).toBe(100);
    expect(backoffDelay(2, o)).toBe(200);
    expect(backoffDelay(3, o)).toBe(400);
    expect(backoffDelay(10, o)).toBe(1000); // capped
  });
});

describe('withRetry', () => {
  it('returns on first success without retrying', async () => {
    const onRetry = vi.fn();
    const r = await withRetry(async () => 42, { retries: 3, onRetry });
    expect(r).toBe(42);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries transient failures then succeeds', async () => {
    let n = 0;
    const onRetry = vi.fn();
    const r = await withRetry(
      async () => {
        n++;
        if (n < 3) throw err('timeout', 503);
        return 'ok';
      },
      { retries: 3, baseDelayMs: 0, onRetry },
    );
    expect(r).toBe('ok');
    expect(n).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0].attempt).toBe(1);
  });

  it('throws the last error after exhausting retries', async () => {
    const onRetry = vi.fn();
    await expect(
      withRetry(
        async () => {
          throw err('down', 503);
        },
        { retries: 2, baseDelayMs: 0, onRetry },
      ),
    ).rejects.toThrow('down');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry non-retryable errors', async () => {
    const onRetry = vi.fn();
    await expect(
      withRetry(
        async () => {
          throw err('invalid key', 401);
        },
        { retries: 3, baseDelayMs: 0, onRetry },
      ),
    ).rejects.toThrow('invalid key');
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('aborts immediately when the signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      withRetry(
        async () => {
          throw err('down', 503);
        },
        { retries: 3, baseDelayMs: 0, signal: ctrl.signal },
      ),
    ).rejects.toThrow('down');
  });
});

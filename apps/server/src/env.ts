// Paid-layer configuration, all env-driven so the same code powers two sites
// (domestic Alipay/CNY vs. international Stripe/USD) via different env values.

function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function flag(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return v === '1' || v.toLowerCase() === 'true';
}

export const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-session-secret';
export const SESSION_TTL_MS = int('SESSION_TTL_DAYS', 30) * 24 * 60 * 60 * 1000;

// Credit pricing (per-step + signup bonus) lives in pricing.ts, since it derives
// from the pipeline's step count.
export const REQUIRE_EMAIL_VERIFY = flag('REQUIRE_EMAIL_VERIFY', false);

export const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'mock') as
  | 'mock'
  | 'stripe'
  | 'alipay';
export const SITE_CURRENCY = (process.env.SITE_CURRENCY || 'USD').toUpperCase();

// Base URL of the deployed site, used to build payment return/redirect URLs.
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(
  /\/$/,
  '',
);

// Cookie is Secure only over HTTPS; keep it off for local http dev.
export const COOKIE_SECURE = flag('COOKIE_SECURE', PUBLIC_BASE_URL.startsWith('https://'));

if (SESSION_SECRET === 'dev-insecure-session-secret') {
  console.warn('⚠ SESSION_SECRET 未设置 —— 正在使用不安全的默认值，请在生产环境配置。');
}

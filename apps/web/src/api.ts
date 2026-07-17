export interface TEvent {
  type: string;
  ts: number;
  seq: number;
  [k: string]: any;
}

export type ProviderKind = 'anthropic' | 'openai';
export type OutputLanguage = 'auto' | 'zh' | 'en';

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderKind;
  baseURL?: string;
  models: string[];
  needsKey: boolean;
  note?: string;
}

export interface ProviderOverride {
  provider: ProviderKind;
  model: string;
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
}

export async function fetchProviders(): Promise<{
  presets: ProviderPreset[];
  default: { provider: string; model: string };
}> {
  const r = await fetch('/api/providers');
  return r.json();
}

export interface StageAgent {
  name: string;
  title: string;
  role: string;
}
export interface StageInfo {
  id: string;
  title: string;
  agents: StageAgent[];
}

export async function fetchStages(): Promise<StageInfo[]> {
  const r = await fetch('/api/stages');
  const j = await r.json();
  return (j.stages ?? []) as StageInfo[];
}

export class ApiError extends Error {
  status: number;
  needCredits?: boolean;
  constructor(message: string, status: number, needCredits?: boolean) {
    super(message);
    this.status = status;
    this.needCredits = needCredits;
  }
}

export async function startRun(
  topic: string,
  provider?: ProviderOverride | null,
  language: OutputLanguage = 'auto',
): Promise<string> {
  const r = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ topic, provider: provider ?? null, language }),
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(j.error ?? 'failed to start run', r.status, j.needCredits);
  return j.runId as string;
}

// ---- Auth ------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  credits: number;
  emailVerified: boolean;
}

async function authRequest(path: string, body: unknown): Promise<AuthUser> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(j.error ?? '请求失败', r.status);
  return j.user as AuthUser;
}

export const signup = (email: string, password: string) =>
  authRequest('/api/auth/signup', { email, password });
export const login = (email: string, password: string) =>
  authRequest('/api/auth/login', { email, password });

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

export async function fetchMe(): Promise<AuthUser | null> {
  const r = await fetch('/api/auth/me', { credentials: 'include' });
  if (!r.ok) return null;
  const j = await r.json();
  return j.user as AuthUser;
}

// ---- Billing ---------------------------------------------------------------

export interface CreditPackage {
  id: string;
  credits: number;
  amount: number; // smallest currency unit (分 / cents)
  currency: string;
  label: string;
}

export interface BillingConfig {
  provider: 'mock' | 'stripe' | 'alipay';
  enabled: boolean;
  currency: string;
  packages: CreditPackage[];
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const r = await fetch('/api/billing/config', { credentials: 'include' });
  return r.json();
}

export interface CheckoutResult {
  provider: 'mock' | 'stripe' | 'alipay';
  ref: string;
  checkoutUrl?: string;
  qrCode?: string;
}

export async function createCheckout(packageId: string): Promise<CheckoutResult> {
  const r = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ packageId }),
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(j.error ?? '发起支付失败', r.status);
  return j as CheckoutResult;
}

export async function confirmMockPayment(ref: string): Promise<{ balance: number; credited: number }> {
  const r = await fetch('/api/billing/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ref }),
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(j.error ?? '确认支付失败', r.status);
  return j;
}

/** Format a smallest-unit amount into a display price like ¥9.90 / $1.99. */
export function formatPrice(amount: number, currency: string): string {
  const major = (amount / 100).toFixed(2);
  const sym = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
  return sym ? `${sym}${major}` : `${major} ${currency}`;
}

export function streamRun(runId: string, onEvent: (e: TEvent) => void): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream`);
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as TEvent;
    onEvent(e);
    if (e.type === 'run.done' || e.type === 'run.error') es.close();
  };
  return () => es.close();
}

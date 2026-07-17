import { SITE_CURRENCY } from '../env.js';

export interface CreditPackage {
  id: string;
  credits: number;
  amount: number; // smallest currency unit: 分 for CNY, cents for USD
  currency: string;
  label: string;
}

// Two price lists; the active one is chosen by SITE_CURRENCY so the same code
// powers the domestic (CNY) and international (USD) deployments.
const PACKAGES_BY_CURRENCY: Record<string, CreditPackage[]> = {
  CNY: [
    { id: 'cny-100', credits: 100, amount: 990, currency: 'CNY', label: '100 积分' },
    { id: 'cny-500', credits: 500, amount: 3900, currency: 'CNY', label: '500 积分' },
    { id: 'cny-2000', credits: 2000, amount: 12900, currency: 'CNY', label: '2000 积分' },
  ],
  USD: [
    { id: 'usd-100', credits: 100, amount: 199, currency: 'USD', label: '100 credits' },
    { id: 'usd-500', credits: 500, amount: 799, currency: 'USD', label: '500 credits' },
    { id: 'usd-2000', credits: 2000, amount: 2499, currency: 'USD', label: '2000 credits' },
  ],
};

export function activePackages(): CreditPackage[] {
  return PACKAGES_BY_CURRENCY[SITE_CURRENCY] ?? PACKAGES_BY_CURRENCY.USD;
}

export function findPackage(id: string): CreditPackage | undefined {
  return activePackages().find((p) => p.id === id);
}

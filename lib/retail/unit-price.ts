import type { NetUnit } from '@/types/retail';

/**
 * Unit prices from a product option's size (UX spec §6.3 `var.unitPrice.preview`), as the web's
 * `src/lib/retail/unit-price.ts` works them out: per litre or per kilogram, except where the
 * venue's rules ask for per 10 ml or 10 g for make-up and per 100 ml or 100 g for other cosmetics
 * (the bootstrap's `jurisdiction` 'ni'). Rounded to the penny, and none for items sold by number.
 */

export type Jurisdiction = 'gb' | 'ni' | 'ie';
export type UnitPriceBasis = 'standard' | 'makeup';

export interface UnitPrice {
  pence: number;
  per: 'perLitre' | 'perKg' | 'per100ml' | 'per100g' | 'per10ml' | 'per10g';
}

/** The bootstrap's jurisdiction, or 'gb' for anything else (the web's default). */
export function asJurisdiction(raw: string | null | undefined): Jurisdiction {
  return raw === 'ni' || raw === 'ie' ? raw : 'gb';
}

function baseAmount(quantity: number, unit: NetUnit): { amount: number; volume: boolean } | null {
  switch (unit) {
    case 'ml':
      return { amount: quantity, volume: true };
    case 'l':
      return { amount: quantity * 1000, volume: true };
    case 'g':
      return { amount: quantity, volume: false };
    case 'kg':
      return { amount: quantity * 1000, volume: false };
    default:
      return null;
  }
}

export function unitPrice(
  pricePence: number,
  quantity: number | null | undefined,
  unit: NetUnit | null | undefined,
  jurisdiction: Jurisdiction,
  basis: UnitPriceBasis = 'standard',
): UnitPrice | null {
  if (!quantity || !unit || quantity <= 0 || !Number.isFinite(pricePence)) return null;
  const base = baseAmount(quantity, unit);
  if (!base || base.amount <= 0) return null;
  let per: UnitPrice['per'];
  let divisor: number;
  if (jurisdiction === 'ni') {
    const step = basis === 'makeup' ? 10 : 100;
    divisor = step;
    per = base.volume ? (step === 10 ? 'per10ml' : 'per100ml') : step === 10 ? 'per10g' : 'per100g';
  } else {
    divisor = 1000;
    per = base.volume ? 'perLitre' : 'perKg';
  }
  return { pence: Math.round((pricePence * divisor) / base.amount), per };
}

const PER_WORDS: Record<UnitPrice['per'], string> = {
  perLitre: 'per litre',
  perKg: 'per kg',
  per100ml: 'per 100 ml',
  per100g: 'per 100 g',
  per10ml: 'per 10 ml',
  per10g: 'per 10 g',
};

/** "£11.20 per litre". */
export function formatUnitPrice(u: UnitPrice, formatMoney: (pence: number) => string): string {
  return `${formatMoney(u.pence)} ${PER_WORDS[u.per]}`;
}

/**
 * Shared formatting — the ONE place money/duration strings come from.
 * (Five screens previously carried their own copies.)
 *
 * Locale/currency are read from the i18n layer ({@link getActiveFormatConfig})
 * rather than hard-coded, so a locale change flows through to money/number
 * formatting. The active config defaults to en-GB / GBP, keeping today's
 * EN-only output byte-for-byte identical.
 */

import { getActiveFormatConfig } from '@/lib/i18n';

/** The two currencies a business can trade in (chosen at sign-up, owner 2026-11-05). */
export type VenueCurrencyCode = 'GBP' | 'EUR';

/** `EUR` in any case is euros; anything else (unset included) is pounds. */
export function venueCurrencyCode(code: string | null | undefined): VenueCurrencyCode {
  return String(code ?? '').trim().toUpperCase() === 'EUR' ? 'EUR' : 'GBP';
}

/**
 * The signed-in business's currency, set by VenueProvider from the venue bootstrap. Staff screens
 * format money without naming a currency, so this is what makes a euro business's own screens read
 * euros (QA 2026-11-08 DEVICE-F13). Null for a client (no business) and before the venue loads;
 * client screens pass the booking's or business's currency to {@link formatPence} themselves.
 */
let activeVenueCurrency: VenueCurrencyCode | null = null;

export function setActiveVenueCurrency(code: string | null | undefined): void {
  activeVenueCurrency = code == null || String(code).trim() === '' ? null : venueCurrencyCode(code);
}

export function getActiveVenueCurrency(): VenueCurrencyCode | null {
  return activeVenueCurrency;
}

/** The currency an amount is shown in: the one named, else the signed-in business's, else the locale's. */
function resolveCurrency(currency: string | null | undefined): string {
  if (currency != null && String(currency).trim() !== '') return venueCurrencyCode(currency);
  return activeVenueCurrency ?? getActiveFormatConfig().currency;
}

/** "£" or "€": the symbol for {@link resolveCurrency}, for labels such as "Price (£)". */
export function currencySymbol(currency?: string | null): string {
  return resolveCurrency(currency) === 'EUR' ? '€' : '£';
}

/**
 * "£12.50" (or "€12.50") from pence; null/undefined → null so callers can hide the row.
 * `currency`: the business the money belongs to (`GBP`/`EUR`, any case). Without one, the signed-in
 * business's currency, else the locale's.
 */
export function formatPence(
  pence: number | null | undefined,
  currency?: string | null,
): string | null {
  if (pence == null) return null;
  const { formatLocale } = getActiveFormatConfig();
  const code = resolveCurrency(currency);
  try {
    return new Intl.NumberFormat(formatLocale, { style: 'currency', currency: code }).format(
      pence / 100,
    );
  } catch {
    return `${code === 'EUR' ? '€' : '£'}${(pence / 100).toFixed(2)}`;
  }
}

/** Like {@link formatPence} but treats 0/negative as "no amount". */
export function formatPositivePence(
  pence: number | null | undefined,
  currency?: string | null,
): string | null {
  if (pence == null || pence <= 0) return null;
  return formatPence(pence, currency);
}

/**
 * Parse a user-typed amount ("12.50", "£12.50", "€12.50", "") to pence.
 * Empty → null (clear); invalid → undefined (caller shows a validation error).
 */
export function parsePoundsToPence(value: string): number | null | undefined {
  const trimmed = value.trim().replace(/^[£€]/, '');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

/** Pence → "12.50" for seeding a text input ("" when absent). */
export function penceToPoundsInput(pence: number | null | undefined): string {
  if (pence == null) return '';
  return (pence / 100).toFixed(2);
}

/** "1h 30m" / "45m" from minutes. */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * A card hold service's no-show fee: a fixed amount (`deposit_pence`, at least £1) or a percentage
 * of the price (`card_hold_fee_percent`, a whole number 1 to 100). Web plan
 * `Docs/card-hold-percentage-fee-plan.md` (2026-11-25), and a mirror of the web's `cardHoldFeeFor`
 * in `src/lib/appointments/appointment-service-payment.ts`.
 *
 * A percentage is of what the client books: the option's price (or the person's own price, which
 * the catalogue has already merged into `price_pence`), plus every add-on chosen (PF2). It is
 * rounded to the penny (cent), and a result under {@link CARD_HOLD_PERCENT_MIN_FEE_PENCE} takes no
 * hold, as a fixed fee of 0 does (PF4). In percentage mode no fixed fee is used: not the
 * service's, not an option's, not a person's own (PF5).
 */
import { formatPence } from '@/lib/format';

/** The smallest percentage fee worth holding a card for, in minor units (web `CARD_HOLD_PERCENT_MIN_FEE_MINOR`). */
export const CARD_HOLD_PERCENT_MIN_FEE_PENCE = 50;

/** The fields the fee is worked out from (a catalogue offer, a service row, an option merge). */
export interface CardHoldFeeFields {
  price_pence?: number | null;
  /** The fixed no-show fee; not used when a percentage is set. */
  deposit_pence?: number | null;
  /** Whole percent, 1 to 100; null or absent means a fixed fee. Absent on older servers. */
  card_hold_fee_percent?: number | null;
}

/** A usable percentage (1 to 100), or null for a fixed fee. */
export function cardHoldFeePercentOf(
  svc: { card_hold_fee_percent?: number | null } | null | undefined,
): number | null {
  const p = svc?.card_hold_fee_percent;
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 && p <= 100 ? Math.round(p) : null;
}

/**
 * The no-show fee for one booking, in minor units, or 0 when there is none. Pass the add-ons the
 * client chose: a percentage includes them, a fixed fee leaves them out.
 */
export function cardHoldFeeFor(svc: CardHoldFeeFields, addonsTotalPence = 0): number {
  const percent = cardHoldFeePercentOf(svc);
  if (percent == null) return Math.max(0, svc.deposit_pence ?? 0);
  const base = Math.max(0, svc.price_pence ?? 0) + Math.max(0, addonsTotalPence);
  const fee = Math.round((base * percent) / 100);
  return fee >= CARD_HOLD_PERCENT_MIN_FEE_PENCE ? fee : 0;
}

/** The service editor's line under the percent box. */
export const CARD_HOLD_PERCENT_HELPER =
  'Worked out from the price of the service, or the option chosen, plus any add-ons the client picks.';

/** Where an option's or a person's own fixed fee would be set, in percentage mode. */
export const CARD_HOLD_FEE_NOT_USED = 'Not used with a percentage fee';

/** "50% of the price": how a service list and a fee caption name a percentage fee. */
export function cardHoldPercentLabel(percent: number): string {
  return `${percent}% of the price`;
}

/** The service editor's percent box: a whole number 1 to 100 ("50" or "50%"), else null. */
export function parseCardHoldPercentInput(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 100 ? n : null;
}

/**
 * The editor's live example: "On a £90.00 booking: £45.00". A result too small to hold a card says
 * so rather than showing a fee nobody will be asked for. Null without a price or a usable percent.
 */
export function cardHoldPercentExampleLine(
  percent: number | null,
  pricePence: number | null | undefined,
): string | null {
  if (percent == null || pricePence == null || pricePence <= 0) return null;
  const price = formatPence(pricePence);
  if (!price) return null;
  const fee = cardHoldFeeFor({ price_pence: pricePence, card_hold_fee_percent: percent });
  if (fee <= 0) {
    return `On a ${price} booking: no fee, as it would be under ${formatPence(CARD_HOLD_PERCENT_MIN_FEE_PENCE)}.`;
  }
  return `On a ${price} booking: ${formatPence(fee)}`;
}

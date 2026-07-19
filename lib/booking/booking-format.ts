/**
 * Shared formatting + time math for the multi-model booking flows
 * (Service / Class / Event / Resource). Keeps date/time/price strings and slot
 * arithmetic in one place so every flow renders identically.
 */

import { formatPence } from '@/lib/format';
import type { BookingPaymentRequirement } from '@/types/booking-offerings';

/** "Monday, 16 June 2026" from a YYYY-MM-DD string. */
export function formatBookingDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "9:30am" from an HH:mm[:ss] string. */
export function formatBookingTime(time: string): string {
  const [hours, minutes] = time.slice(0, 5).split(':');
  const hour = Number(hours);
  if (Number.isNaN(hour)) return time;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes}${suffix}`;
}

/** "9:30am – 10:30am" from two HH:mm[:ss] strings. */
export function formatTimeRange(start: string, end: string): string {
  return `${formatBookingTime(start)} – ${formatBookingTime(end)}`;
}

/** HH:mm[:ss] → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** minutes since midnight → "HH:mm" (clamped to a 24h day). */
export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Add minutes to an HH:mm[:ss] start time, returning "HH:mm". */
export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/**
 * Candidate booking lengths (minutes) for a resource: from min to max in
 * `interval` steps. Mirrors the web's resourceDurationCandidatesMinutes.
 */
export function resourceDurationOptions(
  minMinutes: number,
  maxMinutes: number,
  intervalMinutes: number,
): number[] {
  const step = intervalMinutes > 0 ? intervalMinutes : 30;
  const min = Math.max(step, minMinutes || step);
  const max = Math.max(min, maxMinutes || min);
  const out: number[] = [];
  for (let m = min; m <= max; m += step) out.push(m);
  return out;
}

/**
 * Resource price for a booking = price-per-slot × number of slots covered.
 * (ceil so a part-slot still pays for the whole slot, matching the web.)
 */
export function resourceTotalPence(
  pricePerSlotPence: number | null,
  durationMinutes: number,
  slotIntervalMinutes: number,
): number | null {
  if (pricePerSlotPence == null) return null;
  const interval = slotIntervalMinutes > 0 ? slotIntervalMinutes : durationMinutes || 1;
  const slots = Math.max(1, Math.ceil(durationMinutes / interval));
  return pricePerSlotPence * slots;
}

/** "£12.00 / 30 min" style line for a resource list row. */
export function resourcePricePerSlotLabel(
  pricePerSlotPence: number | null,
  slotIntervalMinutes: number,
): string | null {
  const price = formatPence(pricePerSlotPence);
  if (!price) return null;
  return `${price} / ${slotIntervalMinutes || 30} min`;
}

/**
 * "From £15" / "£15 deposit" / "Pay at venue" / "Free" — a one-line price hint
 * for a per-person offering (classes/events). Mirrors the web's price labels.
 */
export function offeringPriceLabel(
  pricePence: number | null,
  paymentRequirement: BookingPaymentRequirement,
  depositPence: number | null,
  options: { fromPrefix?: boolean } = {},
): string {
  const price = formatPence(pricePence);
  if (pricePence == null || pricePence <= 0) {
    // Card holds take no payment at booking: a free card-hold offering is still
    // "Free" (the no-show fee is surfaced by the card-hold toggle/notice).
    return paymentRequirement === 'none' || paymentRequirement === 'card_hold'
      ? 'Free'
      : 'Pay at venue';
  }
  if (paymentRequirement === 'deposit' && depositPence && depositPence > 0) {
    const deposit = formatPence(depositPence);
    return deposit ? `${deposit} deposit` : (price ?? 'Pay at venue');
  }
  if (paymentRequirement === 'none') {
    return options.fromPrefix ? `From ${price}` : (price ?? 'Pay at venue');
  }
  // full_payment
  return options.fromPrefix ? `From ${price}` : (price ?? 'Pay at venue');
}

/** "3 spots left" / "1 spot left" / "Fully booked". */
export function remainingLabel(remaining: number, noun = 'spot'): string {
  if (remaining <= 0) return 'Fully booked';
  return `${remaining} ${noun}${remaining === 1 ? '' : 's'} left`;
}

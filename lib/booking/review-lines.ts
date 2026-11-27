/**
 * Lines of the Review & confirm screens that the visit and group flows build from their parts, so
 * they read like a single booking's Review (web live round 27 Nov 2026).
 */

import { formatBookingDate, formatBookingTime } from '@/lib/booking/booking-format';
import type { BookingQuote } from '@/lib/booking/booking-quote';

/**
 * A visit's service's add-ons, as the single Review's Add-ons block shows them: their names and
 * what they add. The price is the quote's for that service (`price.addons_pence`) when it is here,
 * else the one worked out when the service was added. Null when the service has none.
 */
export function visitSegmentAddonLine(
  seg: { serviceId: string; addonIds?: string[]; addonNames?: string[]; addonTotalPence?: number },
  index: number,
  quote: BookingQuote | null | undefined,
): { label: string; pence: number } | null {
  const names = (seg.addonNames ?? []).filter((n) => n.trim());
  const count = Math.max(names.length, seg.addonIds?.length ?? 0);
  const item = quote?.items.find((it) => it.index === index && it.service_id === seg.serviceId);
  const pence = item ? item.price.addons_pence : (seg.addonTotalPence ?? 0);
  if (count === 0 && pence <= 0) return null;
  const label = names.length > 0 ? names.join(', ') : count === 1 ? 'Add-on' : 'Add-ons';
  return { label, pence };
}

/**
 * The group's Review: a Date row when everyone is on one day (as the single Review has), and each
 * person's start in the single Review's "3:00pm" form, with the day when the group spans days.
 */
export function groupReviewLines(people: readonly { bookingDate: string; bookingTime: string }[]): {
  dateLabel: string | null;
  times: string[];
} {
  const days = new Set(people.map((p) => p.bookingDate));
  const oneDay = days.size === 1;
  return {
    dateLabel: oneDay ? formatBookingDate(people[0]!.bookingDate) : null,
    times: people.map((p) =>
      oneDay ? formatBookingTime(p.bookingTime) : `${shortDay(p.bookingDate)}, ${formatBookingTime(p.bookingTime)}`,
    ),
  };
}

/** "Mon 7 Dec" from a YYYY-MM-DD string. */
function shortDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '');
}

/**
 * The money the group's Review says is taken now. Like the single Review, nothing until staff tick
 * Require deposit: the line read "Deposit £15.00" with the box unticked, from the quote's offered
 * amount. Ticked, the quote's charge when it has one, else what ticking offers.
 */
export function groupChargeNowPence(input: {
  offeredPence: number;
  requireDeposit: boolean;
  showChargeCheckbox: boolean;
  quote: BookingQuote | null | undefined;
}): number {
  if (!input.showChargeCheckbox || !input.requireDeposit) return 0;
  const charged = input.quote?.deposit.required ? input.quote.deposit.amount_pence : 0;
  return charged > 0 ? charged : input.offeredPence;
}

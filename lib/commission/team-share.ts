import type { CommissionItemType, CommissionRate } from '@/types/commission-splits';

/**
 * One person's own rates, from the web's `src/lib/commission/team-share.ts` (and `shareOf` from its
 * `rate-resolver.ts`): what `describe.ts` and the share sheet need. Pure, so it is tested without
 * rendering. A person is a calendar, or a login without one.
 */

/** Whose rates: a calendar, or a login without one. */
export interface RatePersonRef {
  calendar_id: string | null;
  staff_id: string | null;
}

/** `c:<calendar>` or `s:<login>`, the key the share and people routes take (web `calendarKeyOf`). */
export function personKeyOf(person: RatePersonRef): string {
  return person.calendar_id ? `c:${person.calendar_id}` : `s:${person.staff_id ?? ''}`;
}

function isOwnTypeRow(r: CommissionRate, type: CommissionItemType, person: RatePersonRef): boolean {
  if (r.item_type !== type || r.category_id !== null) return false;
  return person.calendar_id ? r.calendar_id === person.calendar_id : r.staff_id !== null && r.staff_id === person.staff_id;
}

/** The person's own rate for a type in force on a date: a number, or null (none, or stopped). */
export function ownRateOn(rates: readonly CommissionRate[], type: CommissionItemType, person: RatePersonRef, date: string): number | null {
  let newest: CommissionRate | null = null;
  for (const r of rates) {
    if (!isOwnTypeRow(r, type, person) || r.effective_from > date) continue;
    if (!newest || r.effective_from > newest.effective_from || (r.effective_from === newest.effective_from && r.created_at > newest.created_at)) {
      newest = r;
    }
  }
  return newest?.rate_bps ?? null;
}

/** A share of an amount in basis points, rounded half up to the penny (negatives mirror). */
export function shareOf(pence: number, bps: number): number {
  const value = (pence * bps) / 10000;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Booked revenue copy that depends on which kinds of booking the report counts.
 * Ported from the web's `src/app/dashboard/reports/booked-revenue-copy.ts` (QA A-3,
 * 2026-09-23): the report now prices classes, events and rooms as well as
 * appointments, so "Appointments counted" and "services have no price" would call
 * a class place or a room booking something it is not.
 */
import type { BookedRevenueCell, BookedRevenueKind } from '@/types/reports';

type ByKind = Partial<Record<BookedRevenueKind, BookedRevenueCell>> | null | undefined;

const OTHER_KINDS: readonly BookedRevenueKind[] = ['class', 'event', 'resource'];

function rowsOf(cell: BookedRevenueCell | undefined): number {
  return cell ? cell.booked_count + cell.no_show_count : 0;
}

/** True when the report counts any class, event or resource booking (so not only appointments). */
export function countsOtherKinds(byKind: ByKind): boolean {
  return OTHER_KINDS.some((kind) => rowsOf(byKind?.[kind]) > 0);
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const KIND_NOUN: Record<BookedRevenueKind, [one: string, many: string]> = {
  appointment: ['service', 'services'],
  class: ['class booking', 'class bookings'],
  event: ['event booking', 'event bookings'],
  resource: ['resource booking', 'resource bookings'],
};

/**
 * The note shown when some bookings carry no price, naming what they are. Only
 * services were ever described before, so a class place or a room booking read as
 * "services have no price". Null when everything is priced.
 */
export function unpricedNote(byKind: ByKind, unpricedTotal: number): string | null {
  if (unpricedTotal <= 0) return null;
  const it = unpricedTotal === 1 ? 'it adds' : 'they add';
  const kinds = (['appointment', ...OTHER_KINDS] as BookedRevenueKind[]).filter(
    (kind) => (byKind?.[kind]?.unpriced_count ?? 0) > 0,
  );
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === 'appointment')) {
    return `${unpricedTotal} ${unpricedTotal === 1 ? 'service has' : 'services have'} no price on the booking or in your service list, so ${it} nothing to these totals.`;
  }
  const parts = kinds.map((kind) => {
    const n = byKind?.[kind]?.unpriced_count ?? 0;
    return `${n} ${KIND_NOUN[kind][n === 1 ? 0 : 1]}`;
  });
  return `${joinAnd(parts)} ${unpricedTotal === 1 ? 'has' : 'have'} no price set, so ${it} nothing to these totals.`;
}

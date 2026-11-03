/**
 * The customer's bookings list, one card per visit (web `Docs/split-staff-visit-plan.md` 6.8, G4).
 *
 * `GET /api/v1/me/bookings` returns one row per service. A two-service visit used to show as two
 * identical lines ("Fri 27, Aura Hair Studio, 13:45") with no service names. Rows sharing a
 * `visit_key` now collapse into one item, placed where the first of them falls in the order given,
 * and represented by the visit's earliest live service: that is the row the card opens and whose
 * start it shows. Every other row passes through exactly as before.
 *
 * Mirrors the web's `buildAccountBookingDisplayList` (`src/lib/account/account-bookings.ts`).
 */
import { customerBookingState } from '@/lib/booking/customer-booking-state';
import type { CustomerBooking } from '@/lib/queries/useCustomerHome';

export type CustomerBookingListItem =
  | { kind: 'single'; booking: CustomerBooking }
  | {
      kind: 'visit';
      visitKey: string;
      /** The earliest live service, else the earliest service: the row the card opens. */
      first: CustomerBooking;
      /** Every listed service of the visit, in time order. */
      rows: CustomerBooking[];
    };

function byDateTime(a: CustomerBooking, b: CustomerBooking): number {
  return `${a.booking_date}T${a.booking_time}`.localeCompare(`${b.booking_date}T${b.booking_time}`);
}

/** Cancelled or missed: no longer part of what the client is coming for. */
export function isCustomerRowLive(row: { status: string }): boolean {
  const state = customerBookingState(row.status);
  return state !== 'cancelled' && state !== 'missed';
}

/** One item per visit, in the order given; rows that are not part of a visit pass through. */
export function groupCustomerBookings(rows: readonly CustomerBooking[]): CustomerBookingListItem[] {
  const byVisit = new Map<string, CustomerBooking[]>();
  for (const row of rows) {
    if (!row.visit_key) continue;
    byVisit.set(row.visit_key, [...(byVisit.get(row.visit_key) ?? []), row]);
  }

  const out: CustomerBookingListItem[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    const members = row.visit_key ? byVisit.get(row.visit_key) : undefined;
    if (!row.visit_key || !members || members.length < 2) {
      out.push({ kind: 'single', booking: row });
      continue;
    }
    if (placed.has(row.visit_key)) continue;
    placed.add(row.visit_key);
    const sorted = [...members].sort(byDateTime);
    const first = sorted.find(isCustomerRowLive) ?? sorted[0]!;
    out.push({ kind: 'visit', visitKey: row.visit_key, first, rows: sorted });
  }
  return out;
}

/** "14:30:00" to "14:30". */
function hm(time: string): string {
  return time.slice(0, 5);
}

/**
 * The visit's start and true end, from its live services (or every service when none is live).
 * The end is the latest end on the start's day, not the end of the service that starts last: a
 * long colour can run past a short service inside it (G14).
 */
export function customerVisitSpan(rows: readonly CustomerBooking[]): {
  date: string;
  start: string;
  end: string | null;
} {
  const sorted = [...rows].sort(byDateTime);
  const live = sorted.filter(isCustomerRowLive);
  const shown = live.length > 0 ? live : sorted;
  const first = shown[0]!;
  const ends = shown
    .filter((r) => r.booking_date === first.booking_date && r.booking_end_time)
    .map((r) => hm(r.booking_end_time as string));
  const end = ends.length > 0 ? ends.reduce((a, b) => (b > a ? b : a)) : null;
  return { date: first.booking_date, start: hm(first.booking_time), end };
}

/** "10:00 Haircut with Aisha", or "(cancelled)" after a service that no longer runs. */
export function customerVisitServiceLine(row: CustomerBooking): string {
  const name = row.service_name?.trim() || 'Appointment';
  const person = row.person_name?.trim() ? ` with ${row.person_name.trim()}` : '';
  const state = customerBookingState(row.status);
  const suffix = state === 'cancelled' ? ' (cancelled)' : state === 'missed' ? ' (missed)' : '';
  return `${hm(row.booking_time)} ${name}${person}${suffix}`;
}

/**
 * Which of the visit's services the whole-visit actions are sent through.
 *
 * Any row opens the visit, but the server refuses cancel and "I'm coming" through a service that
 * is already cancelled (`ALREADY_CANCELLED`: an older app showing it as live must not reach the
 * rest of the visit through it). So the opened service when it is live; else a live service at the
 * same business, whose client record is the one this login owns; else the visit's lead.
 */
export function visitActionBookingId(
  visit: {
    lead_booking_id: string | null;
    services: readonly { booking_id: string; status: string; venue_id: string }[];
  },
  openedId: string,
): string {
  const opened = visit.services.find((s) => s.booking_id === openedId);
  if (!opened || isCustomerRowLive(opened)) return openedId;
  const sameBusiness = visit.services.find((s) => s.venue_id === opened.venue_id && isCustomerRowLive(s));
  return sameBusiness?.booking_id ?? visit.lead_booking_id ?? openedId;
}

/** "2 services". */
export function servicesCountLabel(count: number): string {
  return count === 1 ? '1 service' : `${count} services`;
}

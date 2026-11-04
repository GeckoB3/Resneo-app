/**
 * A collective booking on a calendar guests cannot book (web `AppointmentBookingFlow`
 * `staffCalendarNotice`, 2026-10-28): what staff are told about it, and whether that venue can take
 * card payments at all.
 *
 * The collective's staff catalogue gives each calendar's service a `staff_note` ("Card payments are
 * not set up at Light 3, so take payment in person") and the reason behind it. With `'payments'`,
 * the booking route refuses a deposit or card hold at that venue, so the confirm step offers
 * neither and sends neither.
 */
import type { AppointmentCatalogService } from '@/types/appointment-catalog';

export interface StaffCalendarNotice {
  /** Each note once, in the order the services are booked. */
  notes: string[];
  /** The calendar's venue cannot take card payments for one of these services. */
  noCards: boolean;
  /** A visit across businesses: the businesses that cannot take card payments (web split-visit plan 8.9). */
  noCardVenueIds?: string[];
}

export const NO_STAFF_CALENDAR_NOTICE: StaffCalendarNotice = { notes: [], noCards: false };

export function staffCalendarNotice(
  catalog:
    | { practitioners: { id: string; services: Pick<AppointmentCatalogService, 'id' | 'staff_note' | 'staff_exclusion'>[] }[] }
    | null
    | undefined,
  calendarId: string | null | undefined,
  serviceIds: readonly string[],
): StaffCalendarNotice {
  if (!catalog || !calendarId || serviceIds.length === 0) return NO_STAFF_CALENDAR_NOTICE;
  const services = catalog.practitioners.find((p) => p.id === calendarId)?.services ?? [];
  const entries = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const notes = [...new Set(entries.map((s) => s.staff_note).filter((n): n is string => Boolean(n)))];
  const noCards = entries.some((s) => s.staff_exclusion === 'payments');
  return notes.length === 0 && !noCards ? NO_STAFF_CALENDAR_NOTICE : { notes, noCards };
}

/**
 * The notes for a visit whose services may each be with a different calendar, at a different business
 * (web split-visit plan 8.9): each service's note from its own calendar, once each, and the businesses
 * that cannot take cards. With one calendar this is exactly {@link staffCalendarNotice}.
 */
export function staffVisitNotice(
  catalog:
    | { practitioners: { id: string; services: Pick<AppointmentCatalogService, 'id' | 'staff_note' | 'staff_exclusion'>[] }[] }
    | null
    | undefined,
  segments: readonly { practitionerId: string; serviceId: string; venueId?: string | null }[],
): StaffCalendarNotice {
  if (!catalog || segments.length === 0) return NO_STAFF_CALENDAR_NOTICE;
  const notes: string[] = [];
  const noCardVenueIds: string[] = [];
  let noCards = false;
  for (const seg of segments) {
    const one = staffCalendarNotice(catalog, seg.practitionerId, [seg.serviceId]);
    for (const n of one.notes) if (!notes.includes(n)) notes.push(n);
    if (one.noCards) {
      noCards = true;
      if (seg.venueId && !noCardVenueIds.includes(seg.venueId)) noCardVenueIds.push(seg.venueId);
    }
  }
  if (notes.length === 0 && !noCards) return NO_STAFF_CALENDAR_NOTICE;
  return { notes, noCards, ...(noCardVenueIds.length > 0 ? { noCardVenueIds } : {}) };
}

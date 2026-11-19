import { apiFetch } from '@/lib/api/client';
import type { BookingListRow, BookingsListResponse } from '@/types/booking-list';

/**
 * How long a staff create may take before the app stops waiting. The server
 * does a great deal in line (availability re-checks, the guest record, the
 * collective, compliance) and has taken over 15 seconds on staging, which was
 * the old limit: the app said "Request timed out… try again" while the booking
 * had been made.
 */
export const CREATE_BOOKING_TIMEOUT_MS = 45_000;

export interface JustCreatedBookingQuery {
  accessToken: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  /** The calendar the booking was made on, when known. */
  practitionerId?: string | null;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  /** The business the booking was made at, when it is a linked or collective partner's. */
  ownerVenueId?: string | null;
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/**
 * What staff are told when a timed-out create was not found. For a booking at another business
 * the search could only look at this business's calendar (2026-11-19), so "it is not on the
 * calendar yet" would be a guess: staff are asked to check that business's calendar instead.
 */
export function timedOutCreateNotFoundMessage(atOtherBusiness: boolean, businessName?: string | null): string {
  if (!atOtherBusiness) {
    return 'We could not confirm this booking in time, and it is not on the calendar yet. Check the calendar before trying again, so it is not booked twice.';
  }
  const name = businessName?.trim();
  return name
    ? `We could not confirm this booking in time, and we could not check ${name}'s calendar from here. Check their calendar before trying again, so it is not booked twice.`
    : "We could not confirm this booking in time, and we could not check the other business's calendar from here. Check their calendar before trying again, so it is not booked twice.";
}

/** Same guest: the email, the phone's last nine digits, or failing both the name. */
function sameGuest(row: BookingListRow, q: JustCreatedBookingQuery): boolean {
  const email = q.email?.trim().toLowerCase();
  if (email && row.guest_email?.trim().toLowerCase() === email) return true;
  const phone = digits(q.phone).slice(-9);
  if (phone.length === 9 && digits(row.guest_phone).slice(-9) === phone) return true;
  const name = q.fullName?.trim().toLowerCase();
  return !!name && row.guest_name?.trim().toLowerCase() === name;
}

/**
 * After a create timed out, look for the booking on its day: same start, same
 * calendar when known, same guest, not cancelled. A timeout on our side does
 * not stop the server, so the booking may well exist, and a blind retry would
 * make it twice (a walk-in skips the slot check that refuses the second one).
 * Returns the booking's id, or null when it is not there (yet).
 *
 * A partner's booking (a linked or collective partner's calendar) cannot be found this way yet: the
 * list route reads `owner_venue_id` only for guest history and sessions, so a day's list is always
 * the signed-in business's. See {@link timedOutCreateNotFoundMessage}.
 */
export async function findJustCreatedBooking(q: JustCreatedBookingQuery): Promise<string | null> {
  const params = new URLSearchParams({ date: q.date });
  // A partner's booking is listed only in the partner's scope.
  if (q.ownerVenueId) params.set('owner_venue_id', q.ownerVenueId);
  const res = await apiFetch<BookingsListResponse>(`/api/venue/bookings/list?${params.toString()}`, {
    accessToken: q.accessToken,
  });
  const rows = res.bookings ?? [];
  const match = rows.find(
    (row) =>
      row.status !== 'Cancelled' &&
      (row.booking_time ?? '').slice(0, 5) === q.time.slice(0, 5) &&
      (!q.practitionerId || (row.calendar_id ?? row.practitioner_id ?? q.practitionerId) === q.practitionerId) &&
      sameGuest(row, q),
  );
  return match?.id ?? null;
}

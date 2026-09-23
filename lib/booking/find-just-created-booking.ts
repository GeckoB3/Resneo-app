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
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
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
 */
export async function findJustCreatedBooking(q: JustCreatedBookingQuery): Promise<string | null> {
  const params = new URLSearchParams({ date: q.date });
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

/**
 * A booking sheet opened before a colleague's change must not quietly undo it (web QA 2026-11-08
 * X-F2).
 *
 * The staff edit sheets (Modify, Reschedule, class and resource moves) send the booking's
 * `updated_at` as it was when the sheet opened, as `expected_updated_at` (a visit sends
 * `expected_versions`, by booking id). The web answers 412 `stale_booking` when the booking has
 * been written since; the sheet then says so and offers a refresh. An older server ignores the
 * field, and an older app that sends nothing keeps today's behaviour.
 */
import { ApiError, apiErrorCode } from '@/lib/api/client';

/** What staff read when their sheet is out of date. */
export const STALE_BOOKING_MESSAGE =
  'Someone else changed this booking. Refresh to see their change, then try again.';

/** A usable version string, or null for none. */
export function bookingVersionOf(updatedAt: string | null | undefined): string | null {
  return typeof updatedAt === 'string' && updatedAt.trim() !== '' ? updatedAt : null;
}

/** `{ expected_updated_at }` for a PATCH body when the sheet knows its version, else nothing. */
export function expectedVersionField(
  updatedAt: string | null | undefined,
): { expected_updated_at?: string } {
  const version = bookingVersionOf(updatedAt);
  return version ? { expected_updated_at: version } : {};
}

/** `{ expected_versions }` for a visit write: the opened booking's version, by its id. */
export function expectedVisitVersionsField(
  bookingId: string | null | undefined,
  updatedAt: string | null | undefined,
): { expected_versions?: Record<string, string> } {
  const version = bookingVersionOf(updatedAt);
  return bookingId && version ? { expected_versions: { [bookingId]: version } } : {};
}

/** True for the web's "this booking changed since you opened it" refusal. */
export function isStaleBookingError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 412) return false;
  const code = apiErrorCode(error);
  return code === 'stale_booking' || code === 'stale_visit';
}

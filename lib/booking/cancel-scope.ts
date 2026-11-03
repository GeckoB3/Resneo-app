/**
 * Cancelling one service of a visit, or every service the client has with this business on it
 * (split-visit plan 7.7, G17; web `ExpandedBookingContent` `cancelScope`).
 *
 * `PATCH /api/venue/bookings/{id}` with `{ status: 'Cancelled' }` cancels every live service of the
 * visit at this business, as it always has. With `cancel_scope: 'service'` it cancels that one
 * service only: it refunds that service's share under the policy, sends one notice, offers the time
 * to the waitlist, and stamps a `cancellation_action_id`, so a later Reinstate brings back only what
 * that cancel took. "Book again on the other calendar, then cancel this one" always cancels just
 * the one service.
 */
import type { BookingStatusChange } from '@/lib/queries/useBookingMutations';
import type { BookingStatus } from '@/types/booking-detail';

/** `service`: this service only. `part`: every live service of the visit at this business. */
export type CancelScope = 'service' | 'part';

/** The body of a status change on `PATCH /api/venue/bookings/{id}`. */
export function bookingStatusPatchBody(input: {
  status: BookingStatus;
  acceptUnpaid?: boolean;
  cancelScope?: CancelScope | null;
}): { status: BookingStatus; accept_unpaid?: true; cancel_scope?: 'service' } {
  return {
    status: input.status,
    ...(input.acceptUnpaid ? { accept_unpaid: true as const } : {}),
    // Only a cancel has a scope, and only the narrow one is sent: without it the server cascades.
    ...(input.status === 'Cancelled' && input.cancelScope === 'service'
      ? { cancel_scope: 'service' as const }
      : {}),
  };
}

/**
 * What a host passes to `useUpdateBookingStatus` for a status change from the booking panel: the
 * narrow cancel when it was asked for, the unpaid acknowledgement on its replay, else the bare
 * status.
 */
export function bookingStatusChange(
  status: BookingStatus,
  options: { acceptUnpaid?: boolean; cancelScope?: CancelScope | null } = {},
): BookingStatusChange {
  if (status === 'Cancelled' && options.cancelScope === 'service') {
    return { status: 'Cancelled', cancel_scope: 'service' };
  }
  return options.acceptUnpaid ? { status, accept_unpaid: true } : status;
}

/** Statuses that are no longer the visit's to cancel (web: Cancelled, No-Show and Completed). */
const NOT_CANCELLABLE = new Set(['Cancelled', 'No-Show', 'Completed']);

/** How many services of the visit at this business are still live, so a cancel can ask which. */
export function liveVisitServiceCount(rows: readonly { status?: string | null }[]): number {
  return rows.filter((r) => !NOT_CANCELLABLE.has(String(r.status ?? ''))).length;
}

/** "Cancel just Brow Wax, or every service QA Client has with you on this visit?" */
export function cancelScopeQuestion(serviceName: string | null | undefined, guestName: string | null | undefined): string {
  const service = serviceName?.trim() || 'this service';
  const guest = guestName?.trim() || 'the client';
  return `Cancel just ${service}, or every service ${guest} has with you on this visit?`;
}

export const CANCEL_THIS_SERVICE_LABEL = 'Cancel this service';
export const CANCEL_ALL_WITH_US_LABEL = 'Cancel all with us';

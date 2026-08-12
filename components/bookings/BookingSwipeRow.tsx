import { memo, useCallback } from 'react';

import { BookingRow } from '@/components/bookings/BookingRow';
import { SwipeRow, type SwipeAction } from '@/components/ui/SwipeRow';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { ApiError } from '@/lib/api/client';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';
import { canMarkNoShowForSlot, clampNoShowGraceMinutes } from '@/lib/booking/no-show-grace';
import { useUpdateBookingStatus } from '@/lib/queries/useBookingMutations';
import type { ComplianceBookingFlag } from '@/lib/queries/useCompliance';
import type { BookingListRow } from '@/types/booking-list';
import type { BookingStatus } from '@/types/booking-detail';

type BookingSwipeRowProps = {
  booking: BookingListRow;
  isAppointment: boolean;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  selected?: boolean;
  selectionMode?: boolean;
  complianceFlag?: ComplianceBookingFlag | null;
  /**
   * The list's unpaid-promotion guard (`useAcceptUnpaidGuard().intercept`).
   * Owned by the LIST, not the row: the guard renders a Sheet, and one per row
   * would be a Modal (plus a mutation) for every booking on screen. Returns true
   * when it recognised the error and took over. Omitted → the old toast.
   */
  onUnpaidPromotion?: (bookingId: string, error: unknown, retry: () => void) => boolean;
};

/**
 * BookingRow + iOS swipe quick actions. The status transition is keyed to a
 * single booking id so the optimistic-update wiring in `useUpdateBookingStatus`
 * flips the row instantly. Swipe actions are ADDITIVE — tapping the row still
 * opens the detail sheet, and these same transitions live in the detail toolbar.
 * Gesture feel can only be verified on a device build.
 */
function BookingSwipeRowBase({
  booking,
  isAppointment,
  onPress,
  onLongPress,
  selected,
  selectionMode,
  complianceFlag,
  onUnpaidPromotion,
}: BookingSwipeRowProps) {
  const toast = useToast();
  const { venue } = useVenueContext();
  const updateStatus = useUpdateBookingStatus(booking.id);

  const transition = useCallback(
    (target: BookingStatus, successMsg: string) => {
      const run = (acceptUnpaid: boolean) => {
        updateStatus.mutate(acceptUnpaid ? { status: target, accept_unpaid: true } : target, {
          onSuccess: () => toast.success(successMsg),
          onError: (error) => {
            // Accepting an unpaid Pending booking: hand the 409 to the list's
            // guard so staff get the payment-link / accept-anyway choice rather
            // than a dead-end error toast.
            if (!acceptUnpaid && onUnpaidPromotion?.(booking.id, error, () => run(true))) {
              return;
            }
            toast.error(
              error instanceof ApiError ? error.message : 'Could not update the booking.',
            );
          },
        });
      };
      run(false);
    },
    [updateStatus, toast, onUnpaidPromotion, booking.id],
  );

  // Status-appropriate quick actions — never offered in selection mode.
  const rightActions: SwipeAction[] = [];
  if (!selectionMode) {
    const confirmedTint = bookingStatusVisualForKey('Confirmed').listStripeColor;
    const noShowTint = bookingStatusVisualForKey('No-Show').listStripeColor;
    if (booking.status === 'Pending') {
      rightActions.push({
        key: 'confirm',
        // "Accept" (web D9) — the Confirm on a Booked row is the attendance
        // action, and this one may be accepting an unpaid booking.
        label: 'Accept',
        icon: { ios: 'checkmark', android: 'check', web: 'check' },
        color: confirmedTint,
        onPress: () => transition('Booked', 'Booking accepted.'),
      });
    }
    // No-show is only offered once the start + grace window has elapsed — the same
    // guard the detail toolbar uses — so the swipe can't flip a future booking to
    // No-Show and then bounce back when the server rejects it.
    const venueTimeZone = venue?.timezone?.trim() || 'Europe/London';
    const noShowAllowed =
      (booking.status === 'Booked' || booking.status === 'Confirmed') &&
      booking.booking_time != null &&
      canMarkNoShowForSlot(
        booking.booking_date,
        booking.booking_time,
        clampNoShowGraceMinutes(venue?.no_show_grace_minutes),
        venueTimeZone,
      );
    if (noShowAllowed) {
      rightActions.push({
        key: 'no-show',
        label: 'No-show',
        icon: { ios: 'person.fill.xmark', android: 'person_off', web: 'person_off' },
        color: noShowTint,
        onPress: () => transition('No-Show', 'Marked as no-show.'),
      });
    }
  }

  const row = (
    <BookingRow
      booking={booking}
      isAppointment={isAppointment}
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected}
      selectionMode={selectionMode}
      complianceFlag={complianceFlag}
    />
  );

  if (rightActions.length === 0) {
    return row;
  }

  return <SwipeRow rightActions={rightActions}>{row}</SwipeRow>;
}

/** Memoized so the bookings list skips re-rendering unchanged rows on scroll. */
export const BookingSwipeRow = memo(BookingSwipeRowBase);

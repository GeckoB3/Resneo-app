import { useCallback } from 'react';

import { BookingRow } from '@/components/bookings/BookingRow';
import { SwipeRow, type SwipeAction } from '@/components/ui/SwipeRow';
import { useToast } from '@/providers/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';
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
};

/**
 * BookingRow + iOS swipe quick actions. The status transition is keyed to a
 * single booking id so the optimistic-update wiring in `useUpdateBookingStatus`
 * flips the row instantly. Swipe actions are ADDITIVE — tapping the row still
 * opens the detail sheet, and these same transitions live in the detail toolbar.
 * Gesture feel can only be verified on a device build.
 */
export function BookingSwipeRow({
  booking,
  isAppointment,
  onPress,
  onLongPress,
  selected,
  selectionMode,
  complianceFlag,
}: BookingSwipeRowProps) {
  const toast = useToast();
  const updateStatus = useUpdateBookingStatus(booking.id);

  const transition = useCallback(
    (target: BookingStatus, successMsg: string) => {
      updateStatus.mutate(target, {
        onSuccess: () => toast.success(successMsg),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : 'Could not update the booking.'),
      });
    },
    [updateStatus, toast],
  );

  // Status-appropriate quick actions — never offered in selection mode.
  const rightActions: SwipeAction[] = [];
  if (!selectionMode) {
    const confirmedTint = bookingStatusVisualForKey('Confirmed').listStripeColor;
    const noShowTint = bookingStatusVisualForKey('No-Show').listStripeColor;
    if (booking.status === 'Pending') {
      rightActions.push({
        key: 'confirm',
        label: 'Confirm',
        icon: { ios: 'checkmark', android: 'check', web: 'check' },
        color: confirmedTint,
        onPress: () => transition('Booked', 'Booking confirmed.'),
      });
    }
    if (booking.status === 'Booked' || booking.status === 'Confirmed') {
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

import type { BookingStatus } from '@/types/booking-detail';

/** Primary forward action per status — matches web `BOOKING_PRIMARY_ACTIONS`. */
const PRIMARY: Partial<Record<BookingStatus, { label: string; target: BookingStatus }>> = {
  Pending: { label: 'Confirm', target: 'Booked' },
  Booked: { label: 'Seat', target: 'Seated' },
  Confirmed: { label: 'Seat', target: 'Seated' },
  Seated: { label: 'Complete', target: 'Completed' },
};

export type BookingAction = {
  label: string;
  target: BookingStatus;
  variant: 'primary' | 'secondary' | 'danger';
  destructive?: boolean;
};

/**
 * Staff actions shown on booking detail — aligned with web ExpandedBookingContent v1 subset.
 */
export function bookingDetailActions(
  status: BookingStatus,
  isTableReservation: boolean,
): BookingAction[] {
  const actions: BookingAction[] = [];

  const primary = PRIMARY[status];
  if (primary) {
    let label = primary.label;
    if (primary.target === 'Seated' && !isTableReservation) {
      label = 'Start';
    }
    actions.push({
      label,
      target: primary.target,
      variant: 'primary',
    });
  }

  if (status === 'Booked' || status === 'Confirmed') {
    actions.push({
      label: 'No-show',
      target: 'No-Show',
      variant: 'danger',
      destructive: true,
    });
  }

  if (status !== 'Cancelled' && status !== 'Completed' && status !== 'No-Show') {
    actions.push({
      label: 'Cancel booking',
      target: 'Cancelled',
      variant: 'danger',
      destructive: true,
    });
  }

  return actions;
}

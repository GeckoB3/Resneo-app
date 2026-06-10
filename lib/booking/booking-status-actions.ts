import type { BookingStatus } from '@/types/booking-detail';

/** Primary forward action per status — matches web `BOOKING_PRIMARY_ACTIONS`. */
const PRIMARY: Partial<Record<BookingStatus, { label: string; target: BookingStatus }>> = {
  Pending: { label: 'Confirm', target: 'Booked' },
  Booked: { label: 'Seat', target: 'Seated' },
  Confirmed: { label: 'Seat', target: 'Seated' },
  Seated: { label: 'Complete', target: 'Completed' },
};

/** Non-destructive "undo" per status — matches web `BOOKING_REVERT_ACTIONS`. */
const REVERT: Partial<Record<BookingStatus, { label: string; target: BookingStatus }>> = {
  Booked: { label: 'Mark pending', target: 'Pending' },
  Confirmed: { label: 'Undo confirm', target: 'Booked' },
  Seated: { label: 'Unseat', target: 'Booked' },
  Completed: { label: 'Reopen', target: 'Seated' },
  'No-Show': { label: 'Undo No-Show', target: 'Booked' },
};

export type BookingActionKind = 'primary' | 'revert' | 'destructive';

export type BookingAction = {
  label: string;
  target: BookingStatus;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  kind: BookingActionKind;
  destructive?: boolean;
};

/**
 * Staff actions shown on booking detail — aligned with the web status model
 * (`BOOKING_PRIMARY_ACTIONS` + `BOOKING_REVERT_ACTIONS`). Reverts are
 * non-destructive undos applied instantly; cancel/no-show confirm first.
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
    actions.push({ label, target: primary.target, variant: 'primary', kind: 'primary' });
  }

  if (status === 'Booked' || status === 'Confirmed') {
    actions.push({
      label: 'No-show',
      target: 'No-Show',
      variant: 'danger',
      kind: 'destructive',
      destructive: true,
    });
  }

  if (status !== 'Cancelled' && status !== 'Completed' && status !== 'No-Show') {
    actions.push({
      label: 'Cancel booking',
      target: 'Cancelled',
      variant: 'danger',
      kind: 'destructive',
      destructive: true,
    });
  }

  const revert = REVERT[status];
  if (revert) {
    // Appointment venues say "Undo Start" (web ExpandedBookingContent override);
    // "Unseat" is restaurant wording.
    const label =
      status === 'Seated' && revert.target === 'Booked' && !isTableReservation
        ? 'Undo Start'
        : revert.label;
    actions.push({ label, target: revert.target, variant: 'ghost', kind: 'revert' });
  }

  return actions;
}

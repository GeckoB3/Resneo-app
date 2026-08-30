import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { useToast } from '@/providers/ToastProvider';
import {
  useCancelBooking,
  useConfirmAttendance,
  useRescheduleOptions,
  type CustomerBookingDetail,
} from '@/lib/queries/useCustomerBookings';
import { spacing } from '@/theme/index';

type Props = {
  booking: CustomerBookingDetail;
  onReschedule: () => void;
  onCancelled: () => void;
};

/**
 * What the customer can do about this booking.
 *
 * Nothing is offered on a booking that is over or already cancelled. An action
 * that exists but always fails is worse than an absent one: it invites a tap
 * and answers with an error the person cannot act on.
 */
export function BookingActions({ booking, onReschedule, onCancelled }: Props) {
  const toast = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const live = isLive(booking.status);
  const options = useRescheduleOptions(booking.booking_id, live);
  const cancel = useCancelBooking(booking.booking_id);
  const confirmAttendance = useConfirmAttendance(booking.booking_id);

  if (!live) return null;

  const alreadyConfirmed = Boolean(booking.guest_attendance_confirmed_at);

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        MANAGE
      </Text>

      {alreadyConfirmed ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          You have confirmed you are coming.
        </Text>
      ) : (
        <Button
          label="Confirm I am coming"
          variant="secondary"
          loading={confirmAttendance.isPending}
          onPress={() => {
            confirmAttendance.mutate(undefined, {
              onSuccess: () => toast.success('Thanks, the venue knows you are coming.'),
              onError: () => toast.error('Could not confirm. Please try again.'),
            });
          }}
          style={styles.gap}
        />
      )}

      {/*
        The move button reflects the SERVER's answer rather than a guess made
        here. `reschedule-options` knows the venue's own settings, the booking
        model and the deadline, and it returns the sentence to show when the
        answer is no. Deciding locally would mean maintaining a second copy of
        rules that already exist and can already change without us.
      */}
      {options.data?.can_reschedule ? (
        <Button
          label="Change date or time"
          variant="secondary"
          onPress={onReschedule}
          style={styles.gap}
        />
      ) : options.data?.message ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          {options.data.message}
        </Text>
      ) : null}

      <Button
        label="Cancel this booking"
        variant="danger"
        onPress={() => setConfirmingCancel(true)}
        style={styles.gap}
      />

      <ConfirmSheet
        visible={confirmingCancel}
        title="Cancel this booking?"
        message={cancelConsequence(booking)}
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
        loading={cancel.isPending}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={() => {
          cancel.mutate(undefined, {
            onSuccess: () => {
              setConfirmingCancel(false);
              toast.success('Your booking is cancelled.');
              onCancelled();
            },
            onError: () => {
              setConfirmingCancel(false);
              toast.error('Could not cancel. Please ring the venue.');
            },
          });
        }}
      />
    </Card>
  );
}

/**
 * What cancelling actually costs, said before the person commits.
 *
 * The deposit line is the one that matters. A customer who cancels inside the
 * notice window and only afterwards discovers their deposit is gone has been
 * charged by a button that did not warn them.
 */
export function cancelConsequence(booking: CustomerBookingDetail): string {
  const parts: string[] = [];

  if (booking.part_of_course) {
    parts.push('This cancels this session only. The rest of your course stays booked.');
  }

  if (booking.deposit_paid && booking.deposit_amount_pence) {
    const deadline = booking.cancellation_deadline
      ? new Date(booking.cancellation_deadline)
      : null;
    const past = deadline ? Date.now() > deadline.getTime() : false;
    parts.push(
      past
        ? 'The free cancellation period has passed, so your deposit may not be refunded.'
        : 'Your deposit should be refunded, because you are cancelling in time.',
    );
  }

  parts.push('This cannot be undone from here. You would need to book again.');
  return parts.join(' ');
}

/** Whether there is anything left to manage. */
function isLive(status: string): boolean {
  return status !== 'cancelled' && status !== 'canceled' && status !== 'completed' && status !== 'no_show';
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
});

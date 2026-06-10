import { format, parseISO } from 'date-fns';
import { Alert, StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { bookingDetailActions } from '@/lib/booking/booking-status-actions';
import { isTableReservationBooking } from '@/lib/booking/infer-booking-row-model';
import { formatPositivePence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useSetBookingAttendance,
  useUpdateBookingStatus,
} from '@/lib/queries/useBookingMutations';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { spacing } from '@/theme/index';
import type { BookingStatus } from '@/types/booking-detail';

type BookingPeekSheetProps = {
  bookingId: string | null;
  onClose: () => void;
  /** Push the full booking-detail screen. */
  onOpenFull: (bookingId: string) => void;
};

function formatWhen(date: string, time: string, endTime?: string | null): string {
  try {
    const parsed = parseISO(`${date}T${time.slice(0, 5)}:00`);
    const start = format(parsed, 'EEE d MMM · HH:mm');
    return endTime?.trim() ? `${start}–${endTime.slice(0, 5)}` : start;
  } catch {
    return `${date} · ${time.slice(0, 5)}`;
  }
}

/**
 * Quick peek at a booking from the calendar grid — the essentials plus a
 * one-tap path to the full detail screen (mirrors the web's popover).
 */
export function BookingPeekSheet({ bookingId, onClose, onOpenFull }: BookingPeekSheetProps) {
  const query = useBookingDetail(bookingId ?? undefined);
  const booking = query.data;
  const updateStatus = useUpdateBookingStatus(bookingId ?? '');
  const attendance = useSetBookingAttendance(bookingId ?? '');

  const guestName = booking?.guest
    ? [booking.guest.first_name, booking.guest.last_name].filter(Boolean).join(' ') || 'Guest'
    : 'Guest';
  const deposit = formatPositivePence(booking?.deposit_amount_pence);

  // Inline quick actions — mirrors the web calendar card (Confirm / Start /
  // Undo Start / Complete / Reopen + Arrived). Cancel/No-show live in full detail.
  const isTable = booking ? isTableReservationBooking(booking) : false;
  // Web calendar cards show: Confirm / Start / Undo Start + Complete / Reopen.
  // Other reverts and the destructive actions live on the full detail screen.
  const quickActions = booking
    ? bookingDetailActions(booking.status, isTable).filter(
        (a) =>
          a.kind === 'primary' ||
          (a.kind === 'revert' && (booking.status === 'Seated' || booking.status === 'Completed')),
      )
    : [];
  const arrived = !!booking?.client_arrived_at;
  const showArrived =
    !!booking && ['Pending', 'Booked', 'Confirmed', 'Seated'].includes(booking.status);

  const onError = (error: unknown) => {
    hapticWarning();
    Alert.alert('Could not update', error instanceof ApiError ? error.message : 'Try again.');
  };
  const changeStatus = (target: BookingStatus) =>
    updateStatus.mutate(target, { onSuccess: () => hapticSuccess(), onError });
  const toggleArrived = () =>
    attendance.mutate(
      { client_arrived: !arrived },
      { onSuccess: () => hapticSuccess(), onError },
    );
  const busy = updateStatus.isPending || attendance.isPending;

  return (
    <Sheet visible={!!bookingId} onClose={onClose}>
      {query.isLoading || !booking ? (
        <Text variant="bodySmall" tone="muted" style={styles.loading}>
          Loading booking…
        </Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Avatar name={guestName} size={44} />
            <View style={styles.headerText}>
              <Text variant="subheading" numberOfLines={1}>
                {guestName}
              </Text>
              <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                {formatWhen(booking.booking_date, booking.booking_time, booking.booking_end_time)}
              </Text>
            </View>
            <StatusPill status={booking.status} isTableReservation={isTable} />
          </View>

          {booking.service_variant_name ? (
            <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
              {booking.service_variant_name}
              {deposit ? ` · Deposit ${deposit}${booking.deposit_status ? ` (${booking.deposit_status})` : ''}` : ''}
            </Text>
          ) : null}
          {booking.special_requests?.trim() ? (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              “{booking.special_requests.trim()}”
            </Text>
          ) : null}

          {quickActions.length > 0 || showArrived ? (
            <View style={styles.quickRow}>
              {quickActions.map((action) => (
                <Button
                  key={`${action.target}-${action.label}`}
                  label={action.label}
                  size="sm"
                  variant={action.kind === 'primary' ? 'primary' : 'secondary'}
                  style={styles.quickBtn}
                  loading={busy}
                  onPress={() => changeStatus(action.target)}
                />
              ))}
              {showArrived ? (
                <Button
                  label={arrived ? 'Clear arrived' : 'Arrived'}
                  size="sm"
                  variant="secondary"
                  style={styles.quickBtn}
                  loading={busy}
                  onPress={toggleArrived}
                />
              ) : null}
            </View>
          ) : null}

          <Button label="Open full details" fullWidth onPress={() => onOpenFull(booking.id)} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  body: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickBtn: {
    flexGrow: 1,
    flexBasis: '30%',
  },
});

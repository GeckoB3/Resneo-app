import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { addDaysToDateStr, formatDayHeading, formatShortDayLabel } from '@/lib/dates/venue-dates';
import {
  useRescheduleBooking,
  useRescheduleOptions,
  type CustomerBookingDetail,
} from '@/lib/queries/useCustomerBookings';
import { useRescheduleSlots } from '@/lib/queries/useRescheduleSlots';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type Props = {
  booking: CustomerBookingDetail;
  visible: boolean;
  onClose: () => void;
};

/** How far ahead a customer may move a booking themselves. */
const DAYS_OFFERED = 14;

/**
 * Move a booking to another time.
 *
 * **Only for appointments, and the server decides that, not this file.**
 * `reschedule-options` returns `can_reschedule` and, when the answer is no, the
 * sentence to show. Events stay cancel-and-rebook, classes move by a different
 * mechanism, and a venue can turn self-service changes off entirely. Working
 * any of that out here would be a second copy of rules that already exist and
 * can already change without us.
 *
 * The slots come from the PUBLIC availability endpoint, because availability is
 * a property of the venue rather than of the caller and no `/api/v1/me/*` route
 * offers any.
 */
export function RescheduleSheet({ booking, visible, onClose }: Props) {
  const toast = useToast();
  const options = useRescheduleOptions(booking.booking_id, visible);
  const [date, setDate] = useState<string>(booking.booking_date);
  const [chosen, setChosen] = useState<string | null>(null);

  const dates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // From today rather than from the booking's own date: a booking whose date
    // has passed cannot be moved backwards, and offering yesterday is noise.
    const start = booking.booking_date > today ? today : today;
    return Array.from({ length: DAYS_OFFERED }, (_, i) => addDaysToDateStr(start, i));
  }, [booking.booking_date]);

  const slots = useRescheduleSlots({
    venueId: booking.venue_id,
    date: visible ? date : null,
    serviceId: booking.appointment_service_id,
    practitionerId: booking.practitioner_id,
  });

  const reschedule = useRescheduleBooking(booking.booking_id);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <Text variant="subheading">Change date or time</Text>

        {options.data && !options.data.can_reschedule ? (
          <Text variant="bodySmall" tone="secondary">
            {options.data.message ?? 'This booking cannot be changed here.'}
          </Text>
        ) : (
          <>
            <Text variant="bodySmall" tone="secondary">
              Currently {formatDayHeading(booking.booking_date)} at{' '}
              {booking.booking_time.slice(0, 5)}.
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.dateRow}>
                {dates.map((d) => (
                  <Chip
                    key={d}
                    label={formatShortDayLabel(d)}
                    selected={d === date}
                    onPress={() => {
                      setDate(d);
                      // A time chosen on one day means nothing on another.
                      setChosen(null);
                    }}
                  />
                ))}
              </View>
            </ScrollView>

            {slots.isLoading ? (
              <LoadingState message="Finding free times…" />
            ) : slots.isError ? (
              <Text variant="bodySmall" tone="secondary">
                Could not load times for that day. Try another, or ring the venue.
              </Text>
            ) : (slots.data ?? []).length === 0 ? (
              <Text variant="bodySmall" tone="secondary">
                Nothing free that day. Try another date.
              </Text>
            ) : (
              <View style={styles.slotWrap}>
                {(slots.data ?? []).map((slot) => (
                  <Chip
                    key={slot.start_time}
                    label={slot.start_time}
                    selected={chosen === slot.start_time}
                    onPress={() => setChosen(slot.start_time)}
                  />
                ))}
              </View>
            )}

            <Button
              label={chosen ? `Move to ${formatShortDayLabel(date)} at ${chosen}` : 'Choose a time'}
              disabled={!chosen}
              loading={reschedule.isPending}
              onPress={() => {
                if (!chosen) return;
                reschedule.mutate(
                  {
                    booking_date: date,
                    booking_time: chosen,
                    // Sent by name, as `reschedule-options` reports them. The
                    // service is what the venue prices and staffs the slot on,
                    // so a move that dropped it would be a different booking.
                    ...(booking.appointment_service_id
                      ? { appointment_service_id: booking.appointment_service_id }
                      : {}),
                    ...(booking.practitioner_id
                      ? { practitioner_id: booking.practitioner_id }
                      : {}),
                  },
                  {
                    onSuccess: () => {
                      toast.success('Your booking has been moved.');
                      onClose();
                    },
                    onError: () => {
                      toast.error('That time was not available. Please pick another.');
                    },
                  },
                );
              }}
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.base, padding: spacing.base },
  dateRow: { flexDirection: 'row', gap: spacing.xs },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

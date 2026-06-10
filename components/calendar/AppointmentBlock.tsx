import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import {
  bookingCalendarBlockPalette,
  isArrivedWaitingDisplay,
} from '@/lib/booking/booking-status-visual';
import { bookingStatusDisplayLabel } from '@/lib/booking/infer-booking-row-model';
import { hexToRgba } from '@/lib/color';
import { fonts, radius, spacing } from '@/theme/index';
import { TIME_GUTTER_WIDTH } from '@/components/calendar/grid-layout';

type AppointmentBlockProps = {
  id: string;
  guestName: string;
  serviceName: string;
  timeLabel: string;
  status: string;
  /** Attendance overlay — an arrived-but-not-started guest colours the bar amber. */
  clientArrivedAt?: string | null;
  staffAttendanceConfirmedAt?: string | null;
  guestAttendanceConfirmedAt?: string | null;
  top: number;
  height: number;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
};

/** A positioned appointment card on the day grid — filled with its status colour. */
export function AppointmentBlock({
  id,
  guestName,
  serviceName,
  timeLabel,
  status,
  clientArrivedAt,
  staffAttendanceConfirmedAt,
  guestAttendanceConfirmedAt,
  top,
  height,
  onPress,
  onLongPress,
}: AppointmentBlockProps) {
  const compact = height < 52;
  // The bar's saturated fill IS the status (web parity): Pending orange, Booked sky,
  // Confirmed navy, Started emerald, Completed slate, No-Show red, Cancelled ghost. A guest
  // who's arrived but not yet started overrides to amber; attendance-confirmed reads as Confirmed.
  const palette = bookingCalendarBlockPalette({
    status,
    client_arrived_at: clientArrivedAt,
    staff_attendance_confirmed_at: staffAttendanceConfirmedAt,
    guest_attendance_confirmed_at: guestAttendanceConfirmedAt,
  });
  const arrivedWaiting = isArrivedWaitingDisplay({ status, client_arrived_at: clientArrivedAt });
  const statusLabel = `${bookingStatusDisplayLabel(status, false)}${arrivedWaiting ? ', arrived' : ''}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}, ${guestName}, ${serviceName}, ${statusLabel}`}
      accessibilityHint="Tap to open, long-press to reschedule"
      onPress={() => onPress(id)}
      onLongPress={onLongPress ? () => onLongPress(id) : undefined}
      style={({ pressed }) => [
        styles.block,
        {
          top,
          height,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {/* Glass left edge — a luminous highlight that lifts the lozenge off the grid. */}
      <View style={styles.glassEdge} />
      <View style={styles.content}>
        <Text variant="caption" numberOfLines={1} style={[styles.guest, { color: palette.text }]}>
          {guestName}
        </Text>
        {!compact ? (
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: hexToRgba(palette.text, 0.82) }}>
            {serviceName} · {timeLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  glassEdge: {
    width: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    justifyContent: 'flex-start',
    gap: 1,
  },
  guest: {
    fontFamily: fonts.semibold,
  },
});

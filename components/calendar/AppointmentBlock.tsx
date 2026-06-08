import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';
import { hexToRgba } from '@/lib/color';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { TIME_GUTTER_WIDTH } from '@/components/calendar/grid-layout';

type AppointmentBlockProps = {
  id: string;
  guestName: string;
  serviceName: string;
  timeLabel: string;
  status: string;
  /** Resolved hex colour (service or practitioner). */
  color: string;
  top: number;
  height: number;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
};

/** A positioned appointment card on the day grid. */
export function AppointmentBlock({
  id,
  guestName,
  serviceName,
  timeLabel,
  status,
  color,
  top,
  height,
  onPress,
  onLongPress,
}: AppointmentBlockProps) {
  const { colors, isDark } = useTheme();
  const compact = height < 52;
  const statusColor = bookingStatusVisualForKey(status).dotColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${timeLabel}, ${guestName}, ${serviceName}, ${status}`}
      accessibilityHint="Tap to open, long-press to reschedule"
      onPress={() => onPress(id)}
      onLongPress={onLongPress ? () => onLongPress(id) : undefined}
      style={({ pressed }) => [
        styles.block,
        {
          top,
          height,
          backgroundColor: hexToRgba(color, isDark ? 0.26 : 0.16),
          borderLeftColor: color,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={styles.titleRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text variant="caption" numberOfLines={1} style={[styles.guest, { color: colors.text }]}>
          {guestName}
        </Text>
      </View>
      {!compact ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {serviceName} · {timeLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    left: TIME_GUTTER_WIDTH + spacing.xs,
    right: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
    justifyContent: 'flex-start',
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  guest: {
    flex: 1,
    fontFamily: fonts.semibold,
  },
});

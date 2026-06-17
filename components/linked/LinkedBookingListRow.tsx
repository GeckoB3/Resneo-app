import { StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/ui/Badge';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { formatBookingTime } from '@/lib/booking/booking-format';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LinkCalendarVisibility, LinkedBooking } from '@/types/linked-venues';

type LinkedBookingListRowProps = {
  booking: LinkedBooking;
  venueName: string;
  visibility: LinkCalendarVisibility;
  onPress: () => void;
};

/**
 * A linked venue's booking rendered in the appointments list — read-only and
 * grant-redacted (time_only shows "Busy" with no PII). An amber venue tag marks
 * it as linked; tapping opens the read-only linked detail sheet. (Editing/
 * creating cross-venue bookings happens on the Calendar tab.)
 */
export function LinkedBookingListRow({
  booking,
  venueName,
  visibility,
  onPress,
}: LinkedBookingListRowProps) {
  const { colors } = useTheme();
  const timeOnly = visibility === 'time_only';
  const title = timeOnly ? 'Busy' : booking.guestName?.trim() || 'Booking';
  const subtitle = timeOnly ? null : booking.serviceName?.trim() || null;
  const time = booking.bookingTime ? formatBookingTime(booking.bookingTime) : '';

  return (
    <PressableScale
      onPress={onPress}
      haptic
      accessibilityRole="button"
      accessibilityLabel={`${venueName} booking${timeOnly ? '' : ` — ${title}`}`}
      style={styles.row}>
      <Text variant="label" tone="muted" style={styles.time}>
        {time}
      </Text>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <View style={[styles.venueTag, { backgroundColor: colors.warningSurface }]}>
            <Text variant="caption" color={colors.warning} numberOfLines={1}>
              {venueName}
            </Text>
          </View>
        </View>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {!timeOnly ? <StatusPill status={booking.status} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  time: {
    width: 52,
    fontVariant: ['tabular-nums'],
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
  },
  venueTag: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    maxWidth: 140,
  },
});

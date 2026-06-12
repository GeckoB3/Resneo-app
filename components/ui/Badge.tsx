import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { bookingStatusVisualForKey } from '@/lib/booking/booking-status-visual';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Solid fill vs subtle tinted background (default: subtle). */
  solid?: boolean;
};

/** Small status/label pill. Use `StatusPill` for booking statuses. */
export function Badge({ label, tone = 'neutral', solid = false }: BadgeProps) {
  const { colors } = useTheme();

  const tones: Record<BadgeTone, { fg: string; subtleBg: string; solidBg: string }> = {
    neutral: { fg: colors.textSecondary, subtleBg: colors.surface, solidBg: colors.textSecondary },
    brand: { fg: colors.brand, subtleBg: colors.brandSubtle, solidBg: colors.brand },
    accent: { fg: colors.accentPressed, subtleBg: colors.accentSubtle, solidBg: colors.accent },
    success: { fg: colors.success, subtleBg: colors.successSurface, solidBg: colors.success },
    warning: { fg: colors.warning, subtleBg: colors.warningSurface, solidBg: colors.warning },
    danger: { fg: colors.danger, subtleBg: colors.dangerSurface, solidBg: colors.danger },
  };
  const t = tones[tone];

  const containerStyle: ViewStyle = {
    backgroundColor: solid ? t.solidBg : t.subtleBg,
  };

  return (
    <View style={[styles.badge, containerStyle]}>
      <Text variant="caption" color={solid ? colors.onColor : t.fg} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

/** "Seated" is restaurant wording — appointment venues display "Started" (web parity). */
const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  Seated: 'Started',
};

/**
 * Booking status pill. Colours come from the shared web palette
 * (`bookingStatusVisualForKey`) — Pending orange, Booked sky, Confirmed navy,
 * Seated/Started emerald — so the list/detail pills match the calendar bars and
 * the web dashboard exactly. (The previous generic `STATUS_TONE` map had
 * Confirmed/Booked/Seated colour-scrambled.)
 *
 * Appointments-first: `Seated` renders as "Started" unless the booking is a
 * genuine table reservation.
 */
export function StatusPill({
  status,
  isTableReservation = false,
}: {
  status: string;
  isTableReservation?: boolean;
}) {
  const label = isTableReservation ? status : APPOINTMENT_STATUS_LABEL[status] ?? status;
  const visual = bookingStatusVisualForKey(status);
  return (
    <View
      style={[
        styles.badge,
        styles.statusPill,
        { backgroundColor: visual.backgroundColor, borderColor: visual.borderColor },
      ]}>
      <Text variant="caption" color={visual.textColor} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusPill: {
    borderWidth: 1,
  },
  label: {
    fontFamily: fonts.semibold,
  },
});

import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
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

/** Booking status → badge tone mapping, mirroring the web status palette. */
const STATUS_TONE: Record<string, BadgeTone> = {
  Pending: 'warning',
  Booked: 'brand',
  Confirmed: 'success',
  Seated: 'accent',
  Completed: 'neutral',
  Cancelled: 'danger',
  'No-Show': 'danger',
};

export function StatusPill({ status }: { status: string }) {
  return <Badge label={status} tone={STATUS_TONE[status] ?? 'neutral'} />;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: fonts.semibold,
  },
});

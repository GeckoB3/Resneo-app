import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingListRow } from '@/types/booking-list';

interface StatPill {
  label: string;
  count: number;
  /** Theme color key for the pill background tint. */
  color: 'brand' | 'success' | 'danger' | 'textMuted';
}

function computeStats(rows: BookingListRow[]): StatPill[] {
  const total = rows.length;
  const confirmed = rows.filter(
    (b) =>
      b.status === 'Confirmed' ||
      !!b.guest_attendance_confirmed_at ||
      !!b.staff_attendance_confirmed_at,
  ).length;
  const completed = rows.filter((b) => b.status === 'Completed').length;
  const noShows = rows.filter((b) => b.status === 'No-Show').length;

  return [
    { label: 'Appointments', count: total, color: 'brand' },
    { label: 'Confirmed', count: confirmed, color: 'success' },
    { label: 'Completed', count: completed, color: 'success' },
    { label: 'No-shows', count: noShows, color: 'danger' },
  ];
}

type BookingStatsBarProps = {
  rows: BookingListRow[];
};

/**
 * Horizontal strip of coloured stat pills — Total / Confirmed / Completed /
 * No-shows for the selected period. Mirrors the web's AppointmentBookingsDashboard
 * summary tiles. Only rendered when there is at least one booking loaded.
 */
export function BookingStatsBar({ rows }: BookingStatsBarProps) {
  const { colors } = useTheme();

  if (rows.length === 0) return null;

  const stats = computeStats(rows);

  const colorMap: Record<StatPill['color'], { bg: string; text: string }> = {
    brand: { bg: colors.brandSubtle, text: colors.brand },
    success: { bg: colors.successSurface, text: colors.success },
    danger: { bg: colors.dangerSurface, text: colors.danger },
    textMuted: { bg: colors.surface, text: colors.textSecondary },
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}>
      {stats.map((stat) => {
        const c = colorMap[stat.color];
        return (
          <View
            key={stat.label}
            style={[styles.pill, { backgroundColor: c.bg }]}
            accessibilityLabel={`${stat.label}: ${stat.count}`}>
            <Text variant="label" style={{ color: c.text }}>
              {stat.count}
            </Text>
            <Text variant="caption" style={{ color: c.text }}>
              {stat.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
});

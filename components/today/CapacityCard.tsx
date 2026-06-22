import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { DashboardTodayStats } from '@/types/dashboard';

type CapacityCardProps = {
  today: DashboardTodayStats;
};

function getFillColor(pct: number, colors: { success: string; warning: string; danger: string; accent: string }) {
  if (pct >= 90) return colors.danger;
  if (pct >= 70) return colors.warning;
  return colors.accent;
}

export function CapacityCard({ today }: CapacityCardProps) {
  const { colors } = useTheme();

  const inHouseNow = today.covers_in_house_now ?? 0;
  const arrivingSoon = today.arriving_within_30_min ?? 0;
  const fillPct = today.peak_fill_percent ?? 0;
  const peakCovers = today.peak_in_house_covers ?? 0;
  const hasCap = today.concurrent_cap != null;
  const cap = today.concurrent_cap;

  const busyText = hasCap
    ? `Busiest time: ${peakCovers} of ${cap} covers at once`
    : today.bookings > 0
    ? `Busiest time: ${peakCovers} covers expected at once`
    : 'No bookings yet — capacity will appear as bookings come in.';

  const fillBarColor = getFillColor(fillPct, colors);

  return (
    <Card>
      <View style={styles.header}>
        <Text variant="label">Today&apos;s capacity</Text>
        {inHouseNow > 0 ? (
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
        ) : null}
      </View>

      <Text variant="caption" tone="muted" style={styles.busyText}>
        {busyText}
      </Text>

      {hasCap && (
        <View style={styles.fillBarRow}>
          <View style={[styles.fillTrack, { backgroundColor: colors.surface }]}>
            <View
              style={[
                styles.fillBar,
                {
                  width: `${Math.min(fillPct, 100)}%` as `${number}%`,
                  backgroundColor: fillBarColor,
                },
              ]}
            />
          </View>
          <Text variant="label" style={styles.fillPct}>
            {Math.min(fillPct, 100)}%
          </Text>
        </View>
      )}

      <View style={styles.miniStats}>
        <View style={[styles.miniStat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="display" style={styles.miniStatValue}>
            {inHouseNow}
          </Text>
          <Text variant="caption" tone="muted">
            in house now
          </Text>
        </View>
        <View style={[styles.miniStat, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="display" style={styles.miniStatValue}>
            {arrivingSoon}
          </Text>
          <Text variant="caption" tone="muted">
            arriving soon
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  busyText: {
    marginTop: spacing.xs,
  },
  fillBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  fillTrack: {
    flex: 1,
    height: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  fillBar: {
    height: '100%',
    borderRadius: radius.sm,
  },
  fillPct: {
    minWidth: 40,
    textAlign: 'right',
  },
  miniStats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  miniStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 2,
  },
  miniStatValue: {
    fontVariant: ['tabular-nums'],
  },
});

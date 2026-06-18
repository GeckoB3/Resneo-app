import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { brand, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { DashboardHeatmapDay } from '@/types/dashboard';

/**
 * Fill-percent → semantic bucket, mirroring the web `getHeatColor`
 * (DashboardHomeClient.tsx): 90+ Full · 70-89 Very busy · 40-69 Busy ·
 * 10-39 Steady · <10 Quiet. The web coerces a null fill_percent to 0, so a
 * day with no capacity reads as "quiet".
 */
export type HeatBucket = 'quiet' | 'steady' | 'busy' | 'veryBusy' | 'full';

export function heatBucket(fillPercent: number | null | undefined): HeatBucket {
  const pct = fillPercent ?? 0;
  if (pct >= 90) return 'full';
  if (pct >= 70) return 'veryBusy';
  if (pct >= 40) return 'busy';
  if (pct >= 10) return 'steady';
  return 'quiet';
}

type HeatPalette = {
  quiet: string;
  steady: string;
  busy: string;
  veryBusy: string;
  full: string;
};

/** Maps a bucket onto a fill colour from the active theme palette. */
export function heatColor(bucket: HeatBucket, palette: HeatPalette): string {
  return palette[bucket];
}

/** Buckets at or above this read as a dark tint → use light text on top. */
function isDarkTint(bucket: HeatBucket): boolean {
  return bucket === 'busy' || bucket === 'veryBusy' || bucket === 'full';
}

const LEGEND: { bucket: HeatBucket; label: string }[] = [
  { bucket: 'quiet', label: 'Quiet' },
  { bucket: 'steady', label: 'Steady' },
  { bucket: 'busy', label: 'Busy' },
  { bucket: 'veryBusy', label: 'Very busy' },
  { bucket: 'full', label: 'Full' },
];

type HeatmapWeekProps = {
  days: DashboardHeatmapDay[];
};

/**
 * 7-day capacity outlook — a colour-coded fill-% row mirroring the web's
 * "7-day capacity outlook" card. Each column tints by `fill_percent`; days with
 * a concurrent cap show the %, otherwise the day's total covers (or "—").
 * Rendered only for non-appointment venues (capacity is a dining concept).
 */
export function HeatmapWeek({ days }: HeatmapWeekProps) {
  const { colors } = useTheme();

  if (days.length === 0) return null;

  const palette: HeatPalette = {
    quiet: colors.surfaceSunken,
    steady: brand[300],
    busy: colors.brand,
    veryBusy: colors.warning,
    full: colors.danger,
  };

  const hasServiceDepth = days.some((d) => (d.by_service?.length ?? 0) > 0);

  return (
    <Card>
      <Text variant="label">7-day capacity outlook</Text>
      <Text variant="caption" tone="muted" style={styles.subtitle}>
        {hasServiceDepth
          ? 'Peak covers vs capacity, by service.'
          : 'Peak load versus capacity each day.'}
      </Text>

      <View style={styles.row}>
        {days.map((day, idx) => {
          const bucket = heatBucket(day.fill_percent);
          const fill = heatColor(bucket, palette);
          const hasCap = day.concurrent_cap != null;
          const total = day.daily_total_covers ?? 0;
          const cellLabel = hasCap
            ? `${day.fill_percent ?? 0}%`
            : total > 0
            ? String(total)
            : '—';
          const isToday = idx === 0;
          const onDark = isDarkTint(bucket);

          return (
            <View key={day.date} style={styles.col}>
              <View
                style={[
                  styles.cell,
                  { backgroundColor: fill },
                  isToday && { borderColor: colors.brand, borderWidth: 2 },
                ]}>
                <Text
                  variant="caption"
                  style={styles.cellValue}
                  color={onDark ? colors.onColor : colors.textSecondary}>
                  {cellLabel}
                </Text>
              </View>
              <Text
                variant="caption"
                tone="muted"
                numberOfLines={1}
                style={[styles.dayLabel, isToday && { color: colors.brand }]}>
                {isToday ? 'Today' : day.day}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        {LEGEND.map((entry) => (
          <View key={entry.bucket} style={styles.legendItem}>
            <View
              style={[styles.legendSwatch, { backgroundColor: heatColor(entry.bucket, palette) }]}
            />
            <Text variant="caption" tone="muted">
              {entry.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cell: {
    width: '100%',
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellValue: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  dayLabel: {
    minHeight: 14,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
});

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MiniSparkline } from '@/components/ui/MiniSparkline';
import { Text } from '@/components/ui/Text';
import { elevation as elevationTokens, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

type StatTileTrend = 'up' | 'down' | 'neutral';

type StatTileProps = {
  /** Caption above the value (e.g. "Bookings this week"). */
  label: string;
  /** The headline figure — pre-formatted (e.g. "£1,240", "32"). */
  value: string;
  /** Optional secondary line under the value. */
  caption?: string;
  /** Optional change indicator (e.g. "+12%"); coloured by `trend`. */
  delta?: string;
  /** Tints the delta + sparkline: up = success, down = danger, neutral = muted. */
  trend?: StatTileTrend;
  /** Optional trend series rendered as a MiniSparkline beneath the value. */
  sparkline?: number[];
  /** Optional leading adornment (icon). */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * StatTile — a compact KPI card: label, headline value, optional delta + caption,
 * and an optional `MiniSparkline` trend. The sparkline colour follows `trend` so
 * the figure and its line read as one unit. Feeds the Reports KPI row.
 */
export function StatTile({
  label,
  value,
  caption,
  delta,
  trend = 'neutral',
  sparkline,
  icon,
  style,
}: StatTileProps) {
  const { colors } = useTheme();

  const trendColor =
    trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.textMuted;

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
        elevationTokens.card,
        style,
      ]}>
      <View style={styles.headerRow}>
        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
      </View>

      <View style={styles.valueRow}>
        <Text variant="title" style={styles.value}>
          {value}
        </Text>
        {delta ? (
          <Text variant="caption" color={trendColor} style={styles.delta}>
            {delta}
          </Text>
        ) : null}
      </View>

      {caption ? (
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}

      {sparkline && sparkline.length >= 2 ? (
        <MiniSparkline data={sparkline} color={trendColor} height={32} style={styles.spark} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.base,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    flex: 1,
  },
  icon: {
    flexShrink: 0,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
  delta: {
    marginBottom: spacing.xxs,
    fontVariant: ['tabular-nums'],
  },
  spark: {
    marginTop: spacing.xs,
  },
});

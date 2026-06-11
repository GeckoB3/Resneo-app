import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { DashboardForecastDay } from '@/types/dashboard';

type ForecastChartProps = {
  days: DashboardForecastDay[];
  isAppointment: boolean;
  title?: string;
};

/**
 * 7-day bar chart using absolute-positioned bars (avoids the percentage-height
 * bug on Android where flex children don't accept percentage heights).
 */
export function ForecastChart({ days, isAppointment, title }: ForecastChartProps) {
  const { colors } = useTheme();
  const [trackHeight, setTrackHeight] = useState(0);

  const max = Math.max(1, ...days.map((d) => (isAppointment ? d.bookings : d.covers)));

  function handleLayout(e: LayoutChangeEvent) {
    setTrackHeight(e.nativeEvent.layout.height);
  }

  return (
    <Card>
      <Text variant="label">{title ?? (isAppointment ? '7-day appointments' : '7-day covers')}</Text>
      <Text variant="caption" tone="muted" style={styles.subtitle}>
        {isAppointment ? 'Total appointments booked each day.' : 'Total covers booked each day.'}
      </Text>
      <View style={styles.chart}>
        {days.map((day, idx) => {
          const value = isAppointment ? day.bookings : day.covers;
          const barRatio = max > 0 ? value / max : 0;
          const barHeight = trackHeight > 0 ? Math.max(2, Math.round(barRatio * trackHeight)) : 0;
          const isToday = idx === 0;

          return (
            <View key={day.date} style={styles.chartCol}>
              <Text variant="caption" tone="muted" style={styles.countLabel}>
                {value > 0 ? String(value) : ''}
              </Text>
              <View
                style={styles.barTrack}
                onLayout={idx === 0 ? handleLayout : undefined}
              >
                {trackHeight > 0 ? (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: isToday ? colors.brand : colors.accent,
                      },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                variant="caption"
                tone="muted"
                style={[styles.dayLabel, isToday && { color: colors.brand }]}
              >
                {isToday ? 'Today' : day.day}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 2,
  },
  chartCol: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  countLabel: {
    minHeight: 14,
  },
  barTrack: {
    flex: 1,
    width: '60%',
    maxWidth: 20,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  dayLabel: {
    minHeight: 14,
  },
});

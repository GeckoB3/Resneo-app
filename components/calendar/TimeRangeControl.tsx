/**
 * TimeRangeControl
 *
 * Visible-window (From / Until hour) control for the calendar grid — the mobile
 * analogue of the web's `TimeRangeCompact` From/Until selects. Lets staff pin the
 * day/week grid to e.g. 09:00–14:00; the choice persists per venue (the parent
 * threads it through `usePersistedCalendarPrefs`).
 *
 * The override only ever WIDENS the grid (see `computeGridBounds`) — a booking
 * outside the pinned window is never clipped — so this is a "show at least this
 * window" hint, not a hard clamp.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { hourLabel, type GridWindowOverride } from '@/components/calendar/grid-layout';
import { spacing } from '@/theme/index';

type TimeRangeControlProps = {
  value: GridWindowOverride | null;
  onChange: (next: GridWindowOverride | null) => void;
};

/** Selectable "From" hours (00–23) and "Until" hours (01–24). */
const START_HOURS = Array.from({ length: 24 }, (_, h) => h); // 0..23
const END_HOURS = Array.from({ length: 24 }, (_, h) => h + 1); // 1..24

/** "24:00" for the end-of-day edge; otherwise the normal HH:00 label. */
function endLabel(hour: number): string {
  return hour >= 24 ? '24:00' : hourLabel(hour);
}

export function TimeRangeControl({ value, onChange }: TimeRangeControlProps) {
  const start = value?.startHour ?? null;
  const end = value?.endHour ?? null;
  const hasOverride = start != null || end != null;

  // Keep From < Until: when picking a start, clamp/clear an end that's now <=.
  const setStart = (hour: number | null) => {
    if (hour == null) {
      onChange(end != null ? { startHour: null, endHour: end } : null);
      return;
    }
    const nextEnd = end != null && end <= hour ? null : end;
    onChange({ startHour: hour, endHour: nextEnd ?? null });
  };

  const setEnd = (hour: number | null) => {
    if (hour == null) {
      onChange(start != null ? { startHour: start, endHour: null } : null);
      return;
    }
    const nextStart = start != null && start >= hour ? null : start;
    onChange({ startHour: nextStart ?? null, endHour: hour });
  };

  // Only offer end hours strictly after the chosen start (and vice-versa is
  // handled by clamping above).
  const endOptions = useMemo(
    () => (start != null ? END_HOURS.filter((h) => h > start) : END_HOURS),
    [start],
  );
  const startOptions = useMemo(
    () => (end != null ? START_HOURS.filter((h) => h < end) : START_HOURS),
    [end],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="label" tone="muted">
          Visible hours
        </Text>
        {hasOverride ? (
          <Chip label="Reset" onPress={() => onChange(null)} />
        ) : null}
      </View>

      <Text variant="caption" tone="muted" style={styles.fieldLabel}>
        From
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        <Chip label="Auto" selected={start == null} onPress={() => setStart(null)} />
        {startOptions.map((h) => (
          <Chip
            key={`from-${h}`}
            label={hourLabel(h)}
            selected={start === h}
            onPress={() => setStart(h)}
          />
        ))}
      </ScrollView>

      <Text variant="caption" tone="muted" style={styles.fieldLabel}>
        Until
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        <Chip label="Auto" selected={end == null} onPress={() => setEnd(null)} />
        {endOptions.map((h) => (
          <Chip
            key={`until-${h}`}
            label={endLabel(h)}
            selected={end === h}
            onPress={() => setEnd(h)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    marginTop: spacing.xs,
  },
  chips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.base,
  },
});

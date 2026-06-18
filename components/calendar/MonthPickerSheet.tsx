import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthGrid } from '@/components/calendar/MonthGrid';
import { TimeRangeControl } from '@/components/calendar/TimeRangeControl';
import { type GridWindowOverride } from '@/components/calendar/grid-layout';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { addMonthsToDateStr, formatMonthLabel } from '@/lib/dates/venue-dates';
import { spacing } from '@/theme/index';

type MonthPickerSheetProps = {
  visible: boolean;
  /** The day the picker should open focused on (YYYY-MM-DD) — the current anchor. */
  anchor: string;
  /** Today in the venue timezone (YYYY-MM-DD) — highlights today's cell. */
  today: string;
  /** date → booking count for the day badges (same map the month scope uses). */
  counts: Record<string, number>;
  /** Selecting a day jumps the calendar to it (the caller also closes the sheet). */
  onSelectDay: (date: string) => void;
  /**
   * Current visible-window override. When `onWindowChange` is also supplied the
   * sheet renders a From/Until control beneath the grid (web parity); omit both
   * to hide it (e.g. on surfaces with no grid to clamp).
   */
  windowOverride?: GridWindowOverride | null;
  onWindowChange?: (next: GridWindowOverride | null) => void;
  onClose: () => void;
};

/**
 * Compact month-picker bottom sheet for jumping the day-view to any date.
 *
 * Wraps the shared {@link MonthGrid} with its own "displayed month" state and
 * prev/next-month chevrons (the grid itself has no month stepper), so the user
 * can page months out and tap a day without leaving the day view. The displayed
 * month re-seeds from `anchor` each time the sheet opens, so reopening always
 * starts on the month currently in view.
 */
export function MonthPickerSheet({
  visible,
  anchor,
  today,
  counts,
  onSelectDay,
  windowOverride,
  onWindowChange,
  onClose,
}: MonthPickerSheetProps) {
  // The month the grid is showing — any date within it. Seeded from the anchor
  // and re-seeded whenever the sheet (re)opens so it tracks the current day.
  const [displayMonth, setDisplayMonth] = useState(anchor);

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the displayed month from the anchor on open
      setDisplayMonth(anchor);
    }
  }, [visible, anchor]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <IconButton
          icon={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
          accessibilityLabel="Previous month"
          onPress={() => setDisplayMonth((m) => addMonthsToDateStr(m, -1))}
        />
        <Text variant="subheading" numberOfLines={1}>
          {formatMonthLabel(displayMonth)}
        </Text>
        <IconButton
          icon={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          accessibilityLabel="Next month"
          onPress={() => setDisplayMonth((m) => addMonthsToDateStr(m, 1))}
        />
      </View>
      <MonthGrid anchor={displayMonth} today={today} counts={counts} onSelectDay={onSelectDay} />

      {/* Visible-window (From/Until) control — clamps the day/week grid to a
          preferred window, persisted per venue by the caller. Hidden when the
          caller wires no handler. */}
      {onWindowChange ? (
        <TimeRangeControl value={windowOverride ?? null} onChange={onWindowChange} />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});

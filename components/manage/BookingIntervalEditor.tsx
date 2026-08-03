import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import {
  BOOKING_INTERVAL_PRESETS,
  bookingIntervalGrid,
  bookingStartTimesToMinutes,
  describeBookingStartOffsets,
  describeBookingStartTimes,
  findTooCloseStartTimes,
  minutesToBookingStartTime,
  normalizeBookingIntervalMinutes,
  sanitizeBookingMinuteMarks,
  sanitizeBookingStartTimes,
} from '@/lib/appointments/booking-interval';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

export interface BookingStartValue {
  intervalMinutes: number;
  /** `null` = no per-hour restriction (every interval mark is bookable). */
  minuteMarks: number[] | null;
  /** `null` = interval mode. Any list, including an empty one, means fixed times of day. */
  startTimes: string[] | null;
}

type BookingIntervalEditorProps = BookingStartValue & {
  /** Duration + buffer, used to warn when fixed times are closer together than the appointment. */
  spanMinutes: number;
  onChange: (next: BookingStartValue) => void;
};

/** A fixed-time row's minutes-since-midnight; blank rows sit at 9:00 until picked. */
const DEFAULT_NEW_TIME_MINUTES = 9 * 60;

/**
 * How a service offers start times, in one of two modes (web parity:
 * `BookingIntervalEditor`).
 *
 * Interval: a spacing of 1-60 minutes anchored to the top of the hour, plus an
 * optional selector for which minute marks within each hour are bookable, so a
 * venue can carve out patterns like "first half hour, every 5 minutes". The
 * pattern repeats every hour.
 *
 * Fixed times: the exact times of day this service is offered, for businesses
 * that take a handful of bookings a day at times that do not repeat hourly. Those
 * times still sit inside venue hours, calendar hours and any custom schedule, so
 * a shorter day simply offers fewer of them.
 */
export function BookingIntervalEditor({
  intervalMinutes,
  minuteMarks,
  startTimes,
  spanMinutes,
  onChange,
}: BookingIntervalEditorProps) {
  const { colors } = useTheme();
  const interval = normalizeBookingIntervalMinutes(intervalMinutes);
  const grid = useMemo(() => bookingIntervalGrid(interval), [interval]);
  const usesFixedTimes = startTimes !== null;
  const restricted = minuteMarks !== null;
  const selected = useMemo(
    () => new Set(restricted ? sanitizeBookingMinuteMarks(minuteMarks, interval) : grid),
    [restricted, minuteMarks, interval, grid],
  );
  const selectedSorted = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

  // Remembered so switching modes to look at the other one is not destructive.
  const [rememberedTimes, setRememberedTimes] = useState<string[]>(() => startTimes ?? []);

  // Memoised because `startTimes ?? []` would otherwise be a fresh array on every
  // render, churning every memo below it.
  const rows = useMemo(() => startTimes ?? [], [startTimes]);
  const validTimes = useMemo(() => sanitizeBookingStartTimes(rows), [rows]);
  const tooClose = useMemo(
    () => findTooCloseStartTimes(validTimes, spanMinutes),
    [validTimes, spanMinutes],
  );
  const duplicateRows = rows.length > validTimes.length;

  const setMode = (next: 'interval' | 'fixed') => {
    hapticSelect();
    if (next === 'fixed') {
      const seed =
        rememberedTimes.length > 0
          ? rememberedTimes
          : [minutesToBookingStartTime(DEFAULT_NEW_TIME_MINUTES)];
      onChange({ intervalMinutes: interval, minuteMarks, startTimes: seed });
      return;
    }
    onChange({ intervalMinutes: interval, minuteMarks, startTimes: null });
  };

  const setTimes = (next: string[]) => {
    setRememberedTimes(next);
    onChange({ intervalMinutes: interval, minuteMarks, startTimes: next });
  };

  const setInterval = (next: number) => {
    const nextInterval = normalizeBookingIntervalMinutes(next);
    // Re-anchor any existing restriction to the new grid (drop off-grid marks).
    const nextMarks = restricted ? sanitizeBookingMinuteMarks(minuteMarks, nextInterval) : null;
    onChange({ intervalMinutes: nextInterval, minuteMarks: nextMarks, startTimes });
  };

  const setRestricted = (on: boolean) => {
    // Turning restriction on starts from "all marks" so the venue carves marks away.
    onChange({ intervalMinutes: interval, minuteMarks: on ? [...grid] : null, startTimes });
  };

  const toggleMark = (offset: number) => {
    hapticSelect();
    const next = new Set(selected);
    if (next.has(offset)) next.delete(offset);
    else next.add(offset);
    onChange({
      intervalMinutes: interval,
      minuteMarks: [...next].sort((a, b) => a - b),
      startTimes,
    });
  };

  const noneSelected = restricted && selectedSorted.length === 0;
  const summary =
    selectedSorted.length > 0
      ? describeBookingStartOffsets(selectedSorted)
      : describeBookingStartOffsets(grid);

  return (
    <View style={styles.intervalCard}>
      <Text variant="caption" tone="muted">
        When a booking can start. This applies to this service&apos;s online bookable slots.
      </Text>

      <Segmented
        options={[
          { value: 'interval', label: 'Every few minutes' },
          { value: 'fixed', label: 'Fixed times of day' },
        ]}
        value={usesFixedTimes ? 'fixed' : 'interval'}
        onChange={(v) => setMode(v as 'interval' | 'fixed')}
        wrapLabels
      />

      {usesFixedTimes ? (
        <FixedTimesSection
          rows={rows}
          validTimes={validTimes}
          duplicateRows={duplicateRows}
          tooClose={tooClose}
          spanMinutes={spanMinutes}
          interval={interval}
          onChangeTimes={setTimes}
        />
      ) : (
        <>
          <Text variant="caption" tone="muted">
            Slots run through the day on a set spacing, anchored to the top of each hour.
          </Text>

          {/* Interval (minutes) — number input + quick-pick presets */}
          <View style={styles.intervalInputRow}>
            <View style={styles.intervalInputField}>
              <Input
                label="Interval (mins)"
                value={String(interval)}
                onChangeText={(v) => setInterval(Number(v))}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.intervalPresets}>
              {BOOKING_INTERVAL_PRESETS.map((preset) => {
                const active = interval === preset;
                return (
                  <Pressable
                    key={preset}
                    accessibilityRole="button"
                    accessibilityLabel={`Set interval to ${preset} minutes`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setInterval(preset)}
                    style={({ pressed }) => [
                      styles.intervalPreset,
                      {
                        backgroundColor: active ? colors.brand : colors.surface,
                        borderColor: active ? colors.brand : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}>
                    <Text variant="caption" color={active ? colors.onBrand : colors.textSecondary}>
                      {preset}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Restrict toggle */}
          <View style={styles.switchRow}>
            <View style={styles.intervalSwitchText}>
              <Text variant="bodyMedium">Restrict start times within each hour</Text>
              <Text variant="caption" tone="muted">
                Choose exactly which marks are bookable, e.g. only the first half-hour.
              </Text>
            </View>
            <Switch value={restricted} onValueChange={setRestricted} />
          </View>

          {restricted ? (
            <View
              style={[
                styles.markGridWrap,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}>
              <Text variant="caption" tone="muted">
                Tap the minutes past the hour when bookings can start:
              </Text>
              <View style={styles.markGrid}>
                {grid.map((offset) => {
                  const on = selected.has(offset);
                  return (
                    <Pressable
                      key={offset}
                      accessibilityRole="button"
                      accessibilityLabel={`Toggle start time at ${offset} minutes past the hour`}
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleMark(offset)}
                      style={({ pressed }) => [
                        styles.markChip,
                        {
                          backgroundColor: on ? colors.brand : colors.surface,
                          borderColor: on ? colors.brand : colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}>
                      <Text variant="label" color={on ? colors.onBrand : colors.textSecondary}>
                        :{String(offset).padStart(2, '0')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {noneSelected ? (
                <Text variant="caption" color={colors.warning}>
                  Select at least one start time, or turn off &quot;Restrict start times&quot; to
                  allow every interval.
                </Text>
              ) : null}
            </View>
          ) : null}

          <Text variant="caption" tone="muted">
            {noneSelected
              ? `No start times selected, so bookings will fall back to every ${interval}-minute mark.`
              : `Bookings can start at ${summary} past each hour.`}
          </Text>
        </>
      )}
    </View>
  );
}

function FixedTimesSection({
  rows,
  validTimes,
  duplicateRows,
  tooClose,
  spanMinutes,
  interval,
  onChangeTimes,
}: {
  rows: string[];
  validTimes: string[];
  duplicateRows: boolean;
  tooClose: { earlier: string; later: string } | null;
  spanMinutes: number;
  interval: number;
  onChangeTimes: (next: string[]) => void;
}) {
  const { colors } = useTheme();

  return (
    <>
      <Text variant="caption" tone="muted">
        You name the exact times, for example 9:20, 11:30, 1:45 and 3:30.
      </Text>

      <View
        style={[styles.markGridWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text variant="caption" tone="muted">
          Times this service is offered. Each one still has to fit inside your opening hours, the
          calendar&apos;s working hours and any custom schedule, so a shorter day simply offers fewer
          of them.
        </Text>

        {rows.map((time, i) => (
          // Rows are positional (a time can repeat while being edited), so the
          // index is the only stable key here.
          <View key={i} style={styles.timeRow}>
            <TimePickerField
              value={bookingStartTimesToMinutes([time])[0] ?? DEFAULT_NEW_TIME_MINUTES}
              accessibilityLabel={`Start time ${i + 1}`}
              onChange={(minutes) => {
                const next = [...rows];
                next[i] = minutesToBookingStartTime(minutes);
                onChangeTimes(next);
              }}
            />
            {rows.length > 1 ? (
              <Button
                label="Remove"
                variant="ghost"
                size="sm"
                onPress={() => onChangeTimes(rows.filter((_, j) => j !== i))}
              />
            ) : null}
          </View>
        ))}

        <Button
          label="Add a time"
          variant="secondary"
          size="sm"
          onPress={() => onChangeTimes([...rows, minutesToBookingStartTime(DEFAULT_NEW_TIME_MINUTES)])}
        />

        {validTimes.length === 0 ? (
          <Text variant="caption" color={colors.warning}>
            Add at least one time, or switch back to &quot;Every few minutes&quot;.
          </Text>
        ) : null}
        {duplicateRows ? (
          <Text variant="caption" tone="muted">
            Repeated times are only counted once.
          </Text>
        ) : null}
        {tooClose ? (
          <Text variant="caption" color={colors.warning}>
            {describeBookingStartTimes([tooClose.earlier])} and{' '}
            {describeBookingStartTimes([tooClose.later])} are closer together than this service takes
            ({spanMinutes} minutes), so guests will usually only be offered one of them.
          </Text>
        ) : null}
      </View>

      <Text variant="caption" tone="muted">
        {validTimes.length === 0
          ? `No times set yet, so bookings will fall back to every ${interval}-minute mark.`
          : `Bookings can start at ${describeBookingStartTimes(validTimes)}.`}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  intervalCard: {
    gap: spacing.sm,
  },
  intervalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  intervalInputField: {
    width: 110,
  },
  intervalPresets: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  intervalPreset: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  intervalSwitchText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    paddingRight: spacing.md,
  },
  markGridWrap: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  markGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  markChip: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

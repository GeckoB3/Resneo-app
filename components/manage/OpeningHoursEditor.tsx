import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { hapticSelect } from '@/lib/haptics';
import {
  NO_ROOM_FOR_PERIOD,
  canAddPeriod,
  nextPeriodAfter,
  type MinutePeriod,
} from '@/lib/scheduling/weekly-hours';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { OpeningHours, OpeningHoursDay, OpeningHoursPeriod } from '@/types/venue';

const DAYS: { key: '0' | '1' | '2' | '3' | '4' | '5' | '6'; label: string }[] = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

const DEFAULT_PERIOD: OpeningHoursPeriod = { open: '09:00', close: '17:00' };

/**
 * Normalise one day to its `periods`, tolerating legacy/foreign shapes.
 * Mirrors the web's `getDayConfig` (OpeningHoursControl.tsx): a legacy
 * day-level `{ open, close }` (no `periods` array) maps to a single period so
 * it renders as open rather than silently falling back to "Closed".
 */
function dayPeriods(day: OpeningHoursDay | undefined): OpeningHoursPeriod[] {
  if (!day) return [];
  if ('closed' in day && day.closed === true) return [];
  if ('periods' in day && Array.isArray(day.periods) && day.periods.length > 0) return day.periods;
  const legacy = day as { open?: unknown; close?: unknown };
  if (typeof legacy.open === 'string' && typeof legacy.close === 'string') {
    return [{ open: legacy.open, close: legacy.close }];
  }
  return [];
}

function isOpen(day: OpeningHoursDay | undefined): boolean {
  return dayPeriods(day).length > 0;
}

/** HH:mm periods → the minutes shape the shared weekly-hours rules work in. */
function toMinutePeriods(periods: OpeningHoursPeriod[]): MinutePeriod[] {
  return periods.map((p) => ({ start: timeToMinutes(p.open), end: timeToMinutes(p.close) }));
}

/**
 * The period the Add button hands back: an hour's gap after the last one
 * closes, an hour long.
 *
 * This used to be a hardcoded `{ open: periods[0].close, close: '21:00' }`,
 * which was wrong for any venue closing after 21:00 and only ever reachable on
 * a day with exactly one period. See `lib/scheduling/weekly-hours.ts`.
 */
function addedPeriod(periods: OpeningHoursPeriod[]): OpeningHoursPeriod {
  const minutes = toMinutePeriods(periods);
  const next = nextPeriodAfter(minutes[minutes.length - 1], timeToMinutes(DEFAULT_PERIOD.open));
  return { open: minutesToTime(next.start), close: minutesToTime(next.end) };
}

type OpeningHoursEditorProps = {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  /** Read-only render for non-admin staff. */
  editable?: boolean;
};

/**
 * Weekly opening-hours editor — per-day open/closed switch with any number of
 * service periods, native any-minute time pickers and a "Copy to other open
 * days" shortcut. Pure controlled component (mockable).
 *
 * There is no cap on periods per day. There used to be one of two, enforced
 * here rather than by any product rule: the editor could draw a first and a
 * second period and no more, so `openingHoursDaySchema.max(2)` on the backend
 * existed to stop that display truncation becoming data loss on save. Web
 * removed the schema cap (its `config-schemas.ts` is now `.min(1)` with no
 * upper bound) once its editor rendered the array; this does the same.
 */
export function OpeningHoursEditor({ value, onChange, editable = true }: OpeningHoursEditorProps) {
  const { colors } = useTheme();

  const setDay = (key: (typeof DAYS)[number]['key'], day: OpeningHoursDay) => {
    onChange({ ...value, [key]: day });
  };

  const setPeriod = (
    key: (typeof DAYS)[number]['key'],
    periods: OpeningHoursPeriod[],
    index: number,
    period: OpeningHoursPeriod,
  ) => {
    const next = periods.map((p, i) => (i === index ? period : p));
    setDay(key, { periods: next });
  };

  /** Copy this day's periods to every other currently-open day. */
  const copyToAllOpenDays = (
    sourceKey: (typeof DAYS)[number]['key'],
    sourcePeriods: OpeningHoursPeriod[],
  ) => {
    const updated = { ...value };
    for (const { key } of DAYS) {
      if (key === sourceKey) continue;
      const day = value[key];
      if (isOpen(day)) {
        updated[key] = { periods: sourcePeriods.map((p) => ({ ...p })) };
      }
    }
    hapticSelect();
    onChange(updated);
  };

  // Whether there is at least one OTHER open day (for the copy button visibility).
  const openDayKeys = DAYS.filter(({ key }) => isOpen(value[key])).map((d) => d.key);

  return (
    <View style={styles.container}>
      {DAYS.map(({ key, label }) => {
        const day = value[key];
        const periods = dayPeriods(day);
        const open = periods.length > 0;
        const otherOpenDays = openDayKeys.filter((k) => k !== key);
        return (
          <View key={key} style={[styles.dayCard, { borderColor: colors.border }]}>
            <View style={styles.dayHeader}>
              <Text variant="bodyMedium" style={styles.dayLabel}>
                {label}
              </Text>
              {!editable ? (
                <Text variant="bodySmall" tone="secondary">
                  {open ? periods.map((p) => `${p.open}–${p.close}`).join(', ') : 'Closed'}
                </Text>
              ) : (
                <View style={styles.switchRow}>
                  <Text variant="bodySmall" tone={open ? 'secondary' : 'muted'} style={styles.switchLabel}>
                    {open ? 'Open' : 'Closed'}
                  </Text>
                  <Switch
                    value={open}
                    onValueChange={(next) =>
                      setDay(key, next ? { periods: [DEFAULT_PERIOD] } : { closed: true })
                    }
                    accessibilityLabel={`${label} open`}
                  />
                </View>
              )}
            </View>

            {/* Copy to other open days — placed above the periods (mirrors web). */}
            {editable && open && otherOpenDays.length > 0 ? (
              <View style={styles.minTouchRow}>
                <Button
                  label="Copy to other open days"
                  variant="secondary"
                  size="sm"
                  onPress={() => copyToAllOpenDays(key, periods)}
                />
              </View>
            ) : null}

            {editable && open
              ? periods.map((period, index) => (
                  <View key={index} style={styles.periodRow}>
                    <TimePickerField
                      accessibilityLabel={`${label} opening time`}
                      value={timeToMinutes(period.open)}
                      onChange={(mins) =>
                        setPeriod(key, periods, index, { ...period, open: minutesToTime(mins) })
                      }
                    />
                    <Text variant="caption" tone="muted">
                      to
                    </Text>
                    <TimePickerField
                      accessibilityLabel={`${label} closing time`}
                      value={timeToMinutes(period.close)}
                      onChange={(mins) =>
                        setPeriod(key, periods, index, { ...period, close: minutesToTime(mins) })
                      }
                    />
                    {periods.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${label} period`}
                        hitSlop={8}
                        onPress={() =>
                          setDay(key, { periods: periods.filter((_, i) => i !== index) })
                        }
                        style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.5 : 1 }]}>
                        <Text variant="title" tone="danger">
                          ✕
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))
              : null}

            {editable && open ? (
              <View style={styles.minTouchRow}>
                {canAddPeriod(toMinutePeriods(periods)) ? (
                  <Button
                    label="+ Add period"
                    variant="ghost"
                    size="sm"
                    onPress={() => setDay(key, { periods: [...periods, addedPeriod(periods)] })}
                  />
                ) : (
                  <Text variant="caption" tone="muted">
                    {NO_ROOM_FOR_PERIOD}
                  </Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  // Rounded, bordered card per day (mirrors the web's SectionCard rows).
  dayCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  dayLabel: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  switchLabel: {
    minWidth: 52,
    textAlign: 'right',
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  removeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Ensures ghost buttons meet the 44pt touch target. */
  minTouchRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
});

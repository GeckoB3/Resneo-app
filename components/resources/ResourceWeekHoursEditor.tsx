import { StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { ResourceAvailabilityHours, ResourceHoursRange } from '@/types/resources-manage';

/**
 * One weekday's editable state: the first range is editable here (start/end);
 * `extraRanges` holds any further ranges configured on the web (split shifts) that
 * this single-range editor can't show. They're preserved verbatim through a save
 * so an untouched multi-range day round-trips intact rather than silently losing
 * range #2+.
 */
export type ResourceDayHours = {
  enabled: boolean;
  start: string;
  end: string;
  /** Ranges beyond the first (web split shifts); kept intact, not editable here. */
  extraRanges?: ResourceHoursRange[];
};
/** Map of weekday key ("0"–"6") to that day's range. Mirrors the web `WeekHours`. */
export type ResourceWeekHours = Record<string, ResourceDayHours>;

const DAYS: { key: string; label: string }[] = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

/** Default week — weekdays 09:00–17:00 on, weekends off (matches the web form). */
export function defaultResourceWeekHours(): ResourceWeekHours {
  const hours: ResourceWeekHours = {};
  for (const day of DAYS) {
    hours[day.key] =
      day.key === '0' || day.key === '6'
        ? { enabled: false, start: '09:00', end: '17:00' }
        : { enabled: true, start: '09:00', end: '17:00' };
  }
  return hours;
}

/** Seed the editor state from a resource's stored `availability_hours` JSON. */
export function resourceWeekHoursFromJSON(
  hours: ResourceAvailabilityHours | null | undefined,
): ResourceWeekHours {
  const result = defaultResourceWeekHours();
  if (!hours) return result;
  for (const day of DAYS) {
    const ranges = hours[day.key];
    if (ranges && ranges.length > 0 && ranges[0]) {
      // Keep range #2+ (web split shifts) aside so they survive a save unchanged.
      const extraRanges = ranges
        .slice(1)
        .filter((r): r is ResourceHoursRange => Boolean(r))
        .map((r) => ({ start: r.start, end: r.end }));
      result[day.key] = {
        enabled: true,
        start: ranges[0].start,
        end: ranges[0].end,
        ...(extraRanges.length > 0 ? { extraRanges } : {}),
      };
    } else {
      result[day.key] = { ...result[day.key]!, enabled: false };
    }
  }
  return result;
}

/**
 * Serialise the editor state back to `availability_hours` JSON (enabled days only).
 *
 * The editable first range is emitted as range #0, followed by any preserved
 * `extraRanges` (web split shifts) so a multi-range day round-trips intact. A day
 * toggled closed emits nothing — dropping every range, which is the correct intent.
 */
export function resourceWeekHoursToJSON(week: ResourceWeekHours): ResourceAvailabilityHours {
  const result: ResourceAvailabilityHours = {};
  for (const day of DAYS) {
    const value = week[day.key]!;
    if (value.enabled) {
      result[day.key] = [
        { start: value.start, end: value.end },
        ...(value.extraRanges ?? []).map((r) => ({ start: r.start, end: r.end })),
      ];
    }
  }
  return result;
}

type ResourceWeekHoursEditorProps = {
  value: ResourceWeekHours;
  onChange: (next: ResourceWeekHours) => void;
  /**
   * When provided, renders a "Match selected calendar's hours" button that
   * copies the selected host calendar's weekly hours into this editor. The
   * parent owns the conversion (host `working_hours` → {@link ResourceWeekHours}
   * via `resourceWeekHoursFromJSON`) and applies it in this callback.
   */
  onMatchCalendar?: () => void;
  /** Label for the match button (e.g. reflects the selected calendar name). */
  matchCalendarLabel?: string;
};

/**
 * Per-weekday availability editor for a resource — one open/closed switch and a
 * single start/end range per day, plus a "Copy to other open days" shortcut.
 *
 * Distinct from {@link OpeningHoursEditor} (which the booking-venue setup uses):
 * resources store exactly one range per weekday, so this is a leaner control and
 * the shared editor stays untouched.
 */
export function ResourceWeekHoursEditor({
  value,
  onChange,
  onMatchCalendar,
  matchCalendarLabel = 'Match selected calendar’s hours',
}: ResourceWeekHoursEditorProps) {
  const { colors } = useTheme();

  const setDay = (key: string, day: ResourceDayHours) => {
    onChange({ ...value, [key]: day });
  };

  const openDayKeys = DAYS.filter(({ key }) => value[key]?.enabled).map((d) => d.key);

  const copyToOpenDays = (sourceKey: string, source: ResourceDayHours) => {
    const next = { ...value };
    for (const { key } of DAYS) {
      if (key === sourceKey) continue;
      const target = value[key];
      if (target?.enabled) {
        // Copy only the editable first range; keep each target day's own preserved
        // split-shift ranges so the shortcut never silently drops them.
        next[key] = {
          ...target,
          enabled: true,
          start: source.start,
          end: source.end,
        };
      }
    }
    hapticSelect();
    onChange(next);
  };

  return (
    <View style={styles.container}>
      {onMatchCalendar ? (
        <View style={styles.matchRow}>
          <Button
            label={matchCalendarLabel}
            variant="secondary"
            size="sm"
            onPress={onMatchCalendar}
          />
        </View>
      ) : null}
      {DAYS.map(({ key, label }) => {
        const day = value[key] ?? { enabled: false, start: '09:00', end: '17:00' };
        const otherOpenDays = openDayKeys.filter((k) => k !== key);
        return (
          <View key={key} style={[styles.dayCard, { borderColor: colors.border }]}>
            <View style={styles.dayHeader}>
              <Text variant="bodyMedium" style={styles.dayLabel}>
                {label}
              </Text>
              <View style={styles.switchRow}>
                <Text
                  variant="bodySmall"
                  tone={day.enabled ? 'secondary' : 'muted'}
                  style={styles.switchLabel}>
                  {day.enabled ? 'Open' : 'Closed'}
                </Text>
                <Switch
                  value={day.enabled}
                  onValueChange={(enabled) => setDay(key, { ...day, enabled })}
                  accessibilityLabel={`${label} open`}
                />
              </View>
            </View>

            {day.enabled ? (
              <>
                {otherOpenDays.length > 0 ? (
                  <View style={styles.minTouchRow}>
                    <Button
                      label="Copy to other open days"
                      variant="secondary"
                      size="sm"
                      onPress={() => copyToOpenDays(key, day)}
                    />
                  </View>
                ) : null}
                <View style={styles.periodRow}>
                  <TimePickerField
                    accessibilityLabel={`${label} start time`}
                    value={timeToMinutes(day.start)}
                    onChange={(mins) => setDay(key, { ...day, start: minutesToTime(mins) })}
                  />
                  <Text variant="caption" tone="muted">
                    to
                  </Text>
                  <TimePickerField
                    accessibilityLabel={`${label} end time`}
                    value={timeToMinutes(day.end)}
                    onChange={(mins) => setDay(key, { ...day, end: minutesToTime(mins) })}
                  />
                </View>
                {day.extraRanges && day.extraRanges.length > 0 ? (
                  <Text variant="caption" tone="muted">
                    {`+${day.extraRanges.length} more time range${
                      day.extraRanges.length > 1 ? 's' : ''
                    } — edit on web. Kept as set.`}
                  </Text>
                ) : null}
              </>
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
  minTouchRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
  matchRow: {
    minHeight: 44,
    justifyContent: 'center',
  },
});

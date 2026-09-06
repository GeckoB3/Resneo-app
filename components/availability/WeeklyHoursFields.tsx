/**
 * WeeklyHoursFields — the seven weekday rows of a working-hours editor, as a
 * controlled field group: an "Open" switch per day, one or more start/end
 * ranges (split shifts) with "+ Add split", per-range "Remove", "Copy to other
 * open days", and the venue's hours for the day as read-only context.
 *
 * Shared by the standard weekly hours editor ({@link WorkingHoursEditor}) and
 * each week of a planned schedule change ({@link SchedulePeriodForm}), so the
 * two cannot drift apart. State in, state out; the caller owns saving.
 *
 * Web parity: `src/components/scheduling/WeeklyHoursEditor.tsx`.
 */
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import {
  calendarHoursOutsideVenue,
  describeVenueDay,
  venueDayContext,
} from '@/lib/calendar/venue-hours-context';
import { hapticSuccess } from '@/lib/haptics';
import { NO_ROOM_FOR_PERIOD, canAddPeriod, nextPeriodAfter } from '@/lib/scheduling/weekly-hours';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { TimeRange, WorkingHoursMap } from '@/types/availability-manage';
import type { OpeningHours } from '@/types/venue';

export const WEEKDAYS = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
] as const;

/** A range expressed in minutes-since-midnight for easy stepping/comparison. */
export type MinuteRange = { start: number; end: number };
export type DayState = { open: boolean; ranges: MinuteRange[] };
/** The seven days, keyed "0" (Sunday) to "6" (Saturday). */
export type WeekState = Record<string, DayState>;

export const DEFAULT_RANGE: MinuteRange = { start: 9 * 60, end: 17 * 60 };

const NAMED_KEYS: Record<string, string> = {
  '0': 'sun',
  '1': 'mon',
  '2': 'tue',
  '3': 'wed',
  '4': 'thu',
  '5': 'fri',
  '6': 'sat',
};

export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Read ALL ranges for a day (not just the first) so split shifts survive. */
function parseDay(wh: WorkingHoursMap | null | undefined, key: string): DayState {
  // Stored hours use "0"–"6" or "sun"–"sat" keys; read either.
  const ranges = wh?.[key] ?? wh?.[NAMED_KEYS[key] ?? ''];
  if (!ranges || ranges.length === 0) {
    return { open: false, ranges: [{ ...DEFAULT_RANGE }] };
  }
  return {
    open: true,
    ranges: ranges.map((r) => ({
      start: hhmmToMinutes(r?.start ?? '09:00'),
      end: hhmmToMinutes(r?.end ?? '17:00'),
    })),
  };
}

/** The editor's state for stored hours (a day with no ranges is closed). */
export function weekStateFromHours(wh: WorkingHoursMap | null | undefined): WeekState {
  const init: WeekState = {};
  for (const wd of WEEKDAYS) init[wd.key] = parseDay(wh, wd.key);
  return init;
}

/**
 * The stored shape for the editor's state, or the first day whose range ends
 * before it starts. A closed day is written as `[]` (the app's standard
 * weekly hours have always been stored that way) or left out (`omit`, how the
 * web writes a schedule change's weeks); every reader treats both as closed.
 */
export function hoursFromWeekState(
  days: WeekState,
  closedDays: 'empty' | 'omit' = 'empty',
): { ok: true; hours: WorkingHoursMap } | { ok: false; error: string } {
  const hours: WorkingHoursMap = {};
  for (const wd of WEEKDAYS) {
    const d = days[wd.key];
    if (!d || !d.open) {
      if (closedDays === 'empty') hours[wd.key] = [];
      continue;
    }
    for (const r of d.ranges) {
      if (r.end <= r.start) {
        return { ok: false, error: `End time must be after start time for ${wd.label}.` };
      }
    }
    hours[wd.key] = d.ranges.map(
      (r) => ({ start: minutesToHhmm(r.start), end: minutesToHhmm(r.end) }) satisfies TimeRange,
    );
  }
  return { ok: true, hours };
}

type Props = {
  value: WeekState;
  onChange: (next: WeekState) => void;
  /**
   * The venue's weekly opening hours, shown as read-only context beside each
   * day. Taken as a prop rather than read from `VenueProvider` so this stays
   * renderable on its own; the caller already holds the bootstrap.
   */
  venueOpeningHours?: OpeningHours | null;
  disabled?: boolean;
};

export function WeeklyHoursFields({ value, onChange, venueOpeningHours, disabled = false }: Props) {
  const { colors } = useTheme();

  function setDayOpen(key: string, open: boolean) {
    const cur = value[key] ?? { open: false, ranges: [] };
    // Re-open with a sensible default range if none survived.
    const ranges = cur.ranges.length > 0 ? cur.ranges : [{ ...DEFAULT_RANGE }];
    onChange({ ...value, [key]: { open, ranges } });
  }

  function updateRange(key: string, index: number, patch: Partial<MinuteRange>) {
    const cur = value[key]!;
    const ranges = cur.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange({ ...value, [key]: { ...cur, ranges } });
  }

  /**
   * Append a split shift starting an hour after the current last one
   * (`nextPeriodAfter`, the shared rule); the button is hidden entirely when
   * there is no room left in the day.
   */
  function addRange(key: string) {
    const cur = value[key]!;
    const next = nextPeriodAfter(cur.ranges[cur.ranges.length - 1], DEFAULT_RANGE.start);
    onChange({ ...value, [key]: { ...cur, ranges: [...cur.ranges, next] } });
  }

  function removeRange(key: string, index: number) {
    const cur = value[key]!;
    const ranges = cur.ranges.filter((_, i) => i !== index);
    onChange({
      ...value,
      [key]: { ...cur, ranges: ranges.length > 0 ? ranges : [{ ...DEFAULT_RANGE }] },
    });
  }

  /** Clone an open day's ranges to every OTHER day that is currently open. */
  function copyToOtherOpenDays(sourceKey: string) {
    const source = value[sourceKey];
    if (!source?.open) return;
    const template = source.ranges.map((r) => ({ ...r }));
    const next: WeekState = { ...value };
    for (const wd of WEEKDAYS) {
      if (wd.key === sourceKey) continue;
      if (next[wd.key]?.open) {
        next[wd.key] = { open: true, ranges: template.map((r) => ({ ...r })) };
      }
    }
    onChange(next);
    hapticSuccess();
  }

  return (
    <View>
      {WEEKDAYS.map((wd) => {
        const d = value[wd.key] ?? { open: false, ranges: [{ ...DEFAULT_RANGE }] };
        const canCopyElsewhere =
          d.open && WEEKDAYS.some((o) => o.key !== wd.key && value[o.key]?.open);
        const venueDay = venueDayContext(venueOpeningHours, wd.key);
        const outsideVenue = calendarHoursOutsideVenue(
          d.open
            ? d.ranges.map((r) => ({ open: minutesToHhmm(r.start), close: minutesToHhmm(r.end) }))
            : null,
          venueDay,
        );
        return (
          <View key={wd.key} style={[styles.dayRow, { borderBottomColor: colors.border }]}>
            <View style={styles.dayHeader}>
              <Text variant="bodyMedium">{wd.label}</Text>
              <Switch
                value={d.open}
                disabled={disabled}
                onValueChange={(v) => setDayOpen(wd.key, v)}
                trackColor={{ true: colors.brand, false: colors.border }}
                thumbColor={colors.surfaceRaised}
              />
            </View>
            {/* Venue hours for this day. Hidden entirely when the venue has
                never set opening hours: that imposes no constraint, so saying
                anything about it would be both wrong and alarming. */}
            {venueDay.kind !== 'unset' ? (
              <Text
                variant="caption"
                tone="muted"
                color={outsideVenue ? colors.warning : undefined}
                style={styles.venueContext}>
                Venue: {describeVenueDay(venueDay)}
                {outsideVenue ? ' (hours outside this are not bookable)' : ''}
              </Text>
            ) : null}
            {d.open ? (
              <View style={styles.dayBody}>
                {d.ranges.map((r, ri) => (
                  <View key={ri} style={styles.rangeRow}>
                    <TimePickerField
                      value={r.start}
                      onChange={(mins) => updateRange(wd.key, ri, { start: mins })}
                      accessibilityLabel={`${wd.label} start time, range ${ri + 1}`}
                    />
                    <Text variant="caption" tone="muted" style={styles.toLabel}>
                      to
                    </Text>
                    <TimePickerField
                      value={r.end}
                      onChange={(mins) => updateRange(wd.key, ri, { end: mins })}
                      accessibilityLabel={`${wd.label} end time, range ${ri + 1}`}
                    />
                    {d.ranges.length > 1 ? (
                      <Button
                        label="Remove"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        customColors={{ background: 'transparent', text: colors.danger }}
                        style={styles.inlineAction}
                        onPress={() => removeRange(wd.key, ri)}
                      />
                    ) : null}
                  </View>
                ))}
                <View style={styles.dayActions}>
                  {canAddPeriod(d.ranges) ? (
                    <Button
                      label="+ Add split"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      style={styles.inlineAction}
                      onPress={() => addRange(wd.key)}
                    />
                  ) : (
                    <Text variant="caption" tone="muted" style={styles.noRoomLabel}>
                      {NO_ROOM_FOR_PERIOD}
                    </Text>
                  )}
                  {canCopyElsewhere ? (
                    <Button
                      label="Copy to other open days"
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onPress={() => copyToOtherOpenDays(wd.key)}
                    />
                  ) : null}
                </View>
              </View>
            ) : (
              <Text variant="caption" tone="muted" style={styles.closedLabel}>
                Day off
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dayRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayBody: {
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toLabel: {
    paddingHorizontal: spacing.xs,
  },
  dayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inlineAction: {
    paddingHorizontal: spacing.sm,
  },
  closedLabel: {
    paddingLeft: spacing.sm,
  },
  noRoomLabel: {
    flex: 1,
    minWidth: 180,
  },
  venueContext: {
    paddingLeft: spacing.sm,
  },
});

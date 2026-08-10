import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError } from '@/lib/api/client';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBulkCreateClassInstances,
  useCreateClassInstance,
  useUpdateClassInstance,
} from '@/lib/queries/useClassesManage';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BulkClassInstanceRow, ManagedClassInstance, ManagedClassType } from '@/types/classes-manage';

/**
 * What the sheet does:
 *  - `schedule`: create sessions for a class type. A mode selector switches
 *    between Single (one-off POST), Weekly repeat (same weekday every N weeks),
 *    and Every N days — the last two batch-create via the bulk endpoint.
 *  - `edit`: change an existing session's date/time/capacity override (PATCH).
 */
export type ClassScheduleTarget =
  | { mode: 'schedule'; classType: ManagedClassType }
  | { mode: 'edit'; classType: ManagedClassType; instance: ManagedClassInstance };

type ClassScheduleSheetProps = {
  target: ClassScheduleTarget | null;
  onClose: () => void;
  onSaved?: () => void;
};

/** Single / Weekly repeat / Every N days. */
type ScheduleMode = 'single' | 'weekly' | 'interval_days';

/** How long a recurring schedule runs. */
type EndCondition = 'count' | 'until';

const DAY_LABELS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** Cap on a single bulk batch — matches the server `bodySchema.max(100)`. */
const MAX_SESSIONS = 100;

// ---------------------------------------------------------------------------
// Pure date-expansion helpers, ported verbatim (behaviour-preserving) from the
// web ClassScheduleModal so the app and dashboard schedule identical dates.
// All work in "YYYY-MM-DD" calendar-date space; noon avoids tz day slips.
// ---------------------------------------------------------------------------

// Parse/read/serialize all in UTC (noon-UTC anchor, matching lib/dates). The old
// code parsed at LOCAL noon but serialized via toISOString() (UTC) — at extreme
// offsets (e.g. UTC+13/+14) local noon falls on the previous UTC day, so the
// returned date / derived weekday slipped by one. Staying in UTC end-to-end is
// stable everywhere.
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dowFromIso(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

/** First calendar date on or after `iso` whose weekday matches `targetDow` (0–6). */
function firstDowOnOrAfter(iso: string, targetDow: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  while (d.getUTCDay() !== targetDow) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Bookable dates for "same weekday every N weeks" from an anchor day.
 * - weeks: occurrences from the anchor until before anchor + horizonWeeks × 7.
 * - range: occurrences between rangeStart and rangeEnd (inclusive), starting on the
 *   first matching weekday on-or-after rangeStart (so the start date can be any day).
 */
function expandWeeklyInstanceDates(
  anchorIso: string,
  intervalWeeks: number,
  weeklyScope: 'weeks' | 'range',
  horizonWeeks: number,
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const dow = dowFromIso(anchorIso);
  const stepDays = Math.min(8, Math.max(1, intervalWeeks)) * 7;
  const dates: string[] = [];

  if (weeklyScope === 'weeks') {
    const h = Math.min(52, Math.max(1, horizonWeeks));
    const endExclusive = addDays(anchorIso, h * 7);
    let cur = anchorIso;
    while (cur < endExclusive && dates.length < MAX_SESSIONS) {
      dates.push(cur);
      cur = addDays(cur, stepDays);
    }
    return dates;
  }

  // range: snap to the first matching weekday on-or-after rangeStart, then step.
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
    return [];
  }
  let cur = firstDowOnOrAfter(rangeStart, dow);
  if (cur > rangeEnd) {
    return [];
  }
  while (cur <= rangeEnd && dates.length < MAX_SESSIONS) {
    dates.push(cur);
    cur = addDays(cur, stepDays);
  }
  return dates;
}

/** Dates starting on `startIso`, then every `intervalDays`, until count or date. */
function expandEveryNDays(
  startIso: string,
  intervalDays: number,
  endMode: EndCondition,
  untilIso: string | null,
  occurrenceCount: number,
): string[] {
  const dates: string[] = [];
  let cur = startIso;

  if (endMode === 'count') {
    const n = Math.min(Math.max(occurrenceCount, 1), MAX_SESSIONS);
    for (let i = 0; i < n; i++) {
      dates.push(cur);
      cur = addDays(cur, intervalDays);
    }
    return dates;
  }

  if (!untilIso || untilIso < startIso) {
    return [startIso];
  }
  while (cur <= untilIso && dates.length < MAX_SESSIONS) {
    dates.push(cur);
    cur = addDays(cur, intervalDays);
  }
  return dates;
}

/** "HH:mm[:ss]" → minutes since midnight (tolerant of seconds). */
function startTimeToMinutes(time: string): number {
  return timeToMinutes(time.slice(0, 5));
}

const MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'interval_days', label: 'Every N days' },
];

const WEEK_INTERVALS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_INTERVALS = [1, 2, 3, 4, 5, 6, 7, 10, 14];

/**
 * Schedule class sessions (single, weekly-repeat, or every-N-days) or edit an
 * existing one. Uses the app's native date/time pickers and the bulk endpoint
 * for the repeat modes.
 *
 * @see _reference/Resneo/src/app/dashboard/class-timetable/ClassScheduleModal.tsx
 */
export function ClassScheduleSheet({ target, onClose, onSaved }: ClassScheduleSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = useMemo(() => calendarDateInTimeZone(new Date(), timeZone), [timeZone]);

  const create = useCreateClassInstance();
  const update = useUpdateClassInstance();
  const bulk = useBulkCreateClassInstances();

  const editingInstance = target?.mode === 'edit' ? target.instance : null;
  const classType = target?.classType ?? null;

  const [mode, setMode] = useState<ScheduleMode>('single');
  const [date, setDate] = useState(today);
  // Start time is held as minutes-since-midnight for the native picker.
  const [startMinutes, setStartMinutes] = useState(9 * 60);
  const [capacityOverride, setCapacityOverride] = useState('');

  // Weekly-repeat controls.
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [weeklyEnd, setWeeklyEnd] = useState<EndCondition>('count');
  const [weeklyWeeks, setWeeklyWeeks] = useState('8');
  // "Until date" mode is an independent start→end range; rangeStart snaps to the
  // first matching weekday (the weekday comes from the Start date picker above).
  const [weeklyRangeStart, setWeeklyRangeStart] = useState(today);
  const [weeklyUntil, setWeeklyUntil] = useState(today);

  // Every-N-days controls.
  const [intervalDays, setIntervalDays] = useState(2);
  const [intervalEnd, setIntervalEnd] = useState<EndCondition>('count');
  const [intervalCount, setIntervalCount] = useState('8');
  const [intervalUntil, setIntervalUntil] = useState(today);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setError(null);
    setMode('single');
    if (target.mode === 'edit') {
      setDate(target.instance.instance_date);
      setStartMinutes(startTimeToMinutes(target.instance.start_time));
      setCapacityOverride(
        target.instance.capacity_override != null ? String(target.instance.capacity_override) : '',
      );
    } else {
      setDate(today);
      setStartMinutes(9 * 60);
      setCapacityOverride('');
    }
    // Reset the recurring controls to defaults anchored on today.
    setIntervalWeeks(1);
    setWeeklyEnd('count');
    setWeeklyWeeks('8');
    setWeeklyRangeStart(today);
    setWeeklyUntil(addDays(today, 56));
    setIntervalDays(2);
    setIntervalEnd('count');
    setIntervalCount('8');
    setIntervalUntil(addDays(today, 14));
    // `today` excluded: re-seeding should track the target, not the clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const saving = create.isPending || update.isPending || bulk.isPending;
  const startTime = minutesToTime(startMinutes);
  const isEditing = editingInstance !== null;
  // The mode selector is only meaningful when scheduling new sessions.
  const showModes = !isEditing;

  /** Parse + validate the capacity override; returns `undefined` on error (already toasted via setError). */
  function readCapacity(): number | null | undefined {
    const trimmed = capacityOverride.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError('Capacity override must be a whole number of at least 1, or left blank.');
      return undefined;
    }
    return parsed;
  }

  /** Build the dates for the active repeat mode, or set an error and return null. */
  function buildDates(): string[] | null {
    if (mode === 'weekly') {
      if (weeklyEnd === 'count') {
        const weeks = Number(weeklyWeeks);
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
          setError('Enter a number of weeks between 1 and 52.');
          return null;
        }
        const dates = expandWeeklyInstanceDates(date, intervalWeeks, 'weeks', weeks, '', '');
        if (dates.length === 0) {
          setError('No sessions could be scheduled. Try a longer horizon.');
          return null;
        }
        return dates;
      }
      if (weeklyUntil < weeklyRangeStart) {
        setError('End date must be on or after the start date.');
        return null;
      }
      const dates = expandWeeklyInstanceDates(
        date,
        intervalWeeks,
        'range',
        0,
        weeklyRangeStart,
        weeklyUntil,
      );
      if (dates.length === 0) {
        setError('No sessions fall in that date range on this weekday. Check your dates.');
        return null;
      }
      return dates;
    }

    // interval_days
    const step = Math.min(14, Math.max(1, intervalDays));
    if (intervalEnd === 'count') {
      const count = Number(intervalCount);
      if (!Number.isInteger(count) || count < 1) {
        setError('Enter a valid number of sessions (1–100).');
        return null;
      }
      return expandEveryNDays(date, step, 'count', null, count);
    }
    if (intervalUntil < date) {
      setError('End date must be on or after the start date.');
      return null;
    }
    const dates = expandEveryNDays(date, step, 'until', intervalUntil, 1);
    if (dates.length === 0) {
      setError('No dates fall in that range.');
      return null;
    }
    return dates;
  }

  async function handleSave() {
    if (!classType) return;
    setError(null);

    const capacityValue = readCapacity();
    if (capacityValue === undefined) return;

    // Single (or edit) — one session via POST/PATCH.
    if (mode === 'single' || isEditing) {
      try {
        if (editingInstance) {
          await update.mutateAsync({
            id: editingInstance.id,
            instance_date: date,
            start_time: startTime,
            capacity_override: capacityValue,
          });
        } else {
          await create.mutateAsync({
            class_type_id: classType.id,
            instance_date: date,
            start_time: startTime,
            capacity_override: capacityValue,
          });
        }
        hapticSuccess();
        toast.success(editingInstance ? 'Session updated.' : 'Session scheduled.');
        onSaved?.();
        onClose();
      } catch (e) {
        hapticWarning();
        // Surface the API's conflict/validation message (e.g. calendar window busy).
        setError(e instanceof ApiError ? e.message : 'Could not save the session.');
      }
      return;
    }

    // Weekly / Every N days — batch via the bulk endpoint.
    const dates = buildDates();
    if (!dates) return;
    if (dates.length > MAX_SESSIONS) {
      setError(
        `That would create more than ${MAX_SESSIONS} sessions. Shorten the range or number of sessions.`,
      );
      return;
    }

    const instances: BulkClassInstanceRow[] = dates.map((instance_date) => ({
      instance_date,
      start_time: startTime,
      ...(capacityValue != null ? { capacity_override: capacityValue } : {}),
    }));

    try {
      const result = await bulk.mutateAsync({ class_type_id: classType.id, instances });
      const created = result.created ?? 0;
      const skipped = result.skipped ?? 0;
      hapticSuccess();
      toast.success(
        skipped > 0
          ? `Created ${created} (skipped ${skipped} existing).`
          : `Created ${created} session${created === 1 ? '' : 's'}.`,
      );
      onSaved?.();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not schedule the sessions.');
    }
  }

  const weekday = DAY_LABELS_FULL[dowFromIso(date)] ?? '';
  const saveLabel = isEditing ? 'Save' : mode === 'single' ? 'Schedule' : 'Schedule sessions';

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.bodyWrap}>
        <Text variant="overline" tone="muted">
          {isEditing ? 'Edit session' : 'Schedule session'}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {classType ? (
            <View
              style={[
                styles.classChip,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}>
              <View style={[styles.dot, { backgroundColor: classType.colour ?? colors.brand }]} />
              <View style={styles.classChipText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {classType.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {classType.duration_minutes} min · up to {classType.capacity} guests
                </Text>
              </View>
            </View>
          ) : null}

          {showModes ? (
            <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          ) : null}

          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">
              {mode === 'single' || isEditing ? 'Date' : 'Start date'}
            </Text>
            <DatePickerField value={date} onChange={setDate} accessibilityLabel="Session date" />
          </View>

          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">
              Start time
            </Text>
            <TimePickerField
              value={startMinutes}
              onChange={setStartMinutes}
              accessibilityLabel="Session start time"
            />
          </View>

          {/* Weekly-repeat options */}
          {!isEditing && mode === 'weekly' ? (
            <View style={styles.section}>
              <Text variant="caption" tone="muted">
                {weeklyEnd === 'until'
                  ? `Repeats on ${weekday}s — the weekday comes from the start date above; the range below sets when sessions run.`
                  : `Repeats on ${weekday}s, taken from the start date.`}
              </Text>
              <Text variant="label" tone="secondary">
                Every
              </Text>
              <ChipRow
                values={WEEK_INTERVALS}
                selected={intervalWeeks}
                onSelect={setIntervalWeeks}
                label={(n) => (n === 1 ? 'week' : `${n} wks`)}
              />
              <Segmented
                options={[
                  { value: 'count', label: 'For N weeks' },
                  { value: 'until', label: 'Between dates' },
                ]}
                value={weeklyEnd}
                onChange={setWeeklyEnd}
              />
              {weeklyEnd === 'count' ? (
                <Input
                  label="Number of weeks"
                  helper="How long the weekly repeat runs (1–52)."
                  value={weeklyWeeks}
                  onChangeText={(v) => setWeeklyWeeks(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              ) : (
                <>
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">
                      From
                    </Text>
                    <DatePickerField
                      value={weeklyRangeStart}
                      onChange={setWeeklyRangeStart}
                      accessibilityLabel="Repeat from date"
                    />
                  </View>
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">
                      Until
                    </Text>
                    <DatePickerField
                      value={weeklyUntil}
                      onChange={setWeeklyUntil}
                      minimumDate={new Date(weeklyRangeStart + 'T12:00:00')}
                      accessibilityLabel="Repeat until date"
                    />
                  </View>
                </>
              )}
            </View>
          ) : null}

          {/* Every-N-days options */}
          {!isEditing && mode === 'interval_days' ? (
            <View style={styles.section}>
              <Text variant="caption" tone="muted">
                Creates dated sessions starting on the start date, then every N days.
              </Text>
              <Text variant="label" tone="secondary">
                Repeat every
              </Text>
              <ChipRow
                values={DAY_INTERVALS}
                selected={intervalDays}
                onSelect={setIntervalDays}
                label={(n) => `${n} day${n === 1 ? '' : 's'}`}
              />
              <Segmented
                options={[
                  { value: 'count', label: 'N sessions' },
                  { value: 'until', label: 'Until date' },
                ]}
                value={intervalEnd}
                onChange={setIntervalEnd}
              />
              {intervalEnd === 'count' ? (
                <Input
                  label="Number of sessions"
                  helper="Up to 100."
                  value={intervalCount}
                  onChangeText={(v) => setIntervalCount(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              ) : (
                <View style={styles.pickerRow}>
                  <Text variant="label" tone="secondary">
                    Until
                  </Text>
                  <DatePickerField
                    value={intervalUntil}
                    onChange={setIntervalUntil}
                    minimumDate={new Date(date + 'T12:00:00')}
                    accessibilityLabel="Repeat until date"
                  />
                </View>
              )}
            </View>
          ) : null}

          <Input
            label="Capacity override"
            optional
            helper={
              mode === 'single' || isEditing
                ? 'Leave blank to use the class capacity for this one session.'
                : 'Leave blank to use the class capacity for every session.'
            }
            value={capacityOverride}
            onChangeText={(v) => setCapacityOverride(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label={saveLabel}
            style={styles.flex1}
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </Sheet>
  );
}

/** A horizontal row of selectable numeric chips (interval pickers). */
function ChipRow({
  values,
  selected,
  onSelect,
  label,
}: {
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
  label: (value: number) => string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chipRow}>
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(value)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: isSelected ? colors.brand : colors.surface,
                borderColor: isSelected ? colors.brand : colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            <Text
              variant="label"
              color={isSelected ? colors.onBrand : colors.textSecondary}
              numberOfLines={1}>
              {label(value)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // `fill` + a flexing ScrollView: the form outgrows the sheet, and a
  // content-sized body can't scroll AND pushes the pinned actions off the
  // bottom. `fill` Sheets supply no horizontal padding, so the body carries the
  // standard inset itself.
  bodyWrap: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  classChipText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  section: {
    gap: spacing.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});

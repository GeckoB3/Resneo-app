/**
 * SchedulePeriodForm — add or edit one schedule change: the Monday it starts,
 * one to six weekly shapes, and how long it runs. Saving inserts it into the
 * timeline, trimming or splitting whatever it overlaps, and the form says so
 * before the save. A full timeline makes room by dropping the change that
 * ended longest ago, and the form says that too.
 *
 * Web parity: `SchedulePeriodForm.tsx` on the Availability tab. The weekly
 * hours of each week are edited with the same rows as the standard weekly
 * hours ({@link WeeklyHoursFields}).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  WeeklyHoursFields,
  hoursFromWeekState,
  weekStateFromHours,
  type WeekState,
} from '@/components/availability/WeeklyHoursFields';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import {
  ROTA_MAX_CYCLES,
  ROTA_MAX_WEEKS,
  ROTA_MIN_WEEKS,
  SCHEDULE_MAX_PERIODS,
  describeScheduleTrim,
  describeYmdLong,
  describeYmdShort,
  insertSchedulePeriod,
  mondayOnOrBefore,
  newSchedulePeriodId,
  periodCyclesForEnd,
  periodEndForCycles,
  pruneEndedSchedulePeriods,
  sundayOnOrAfter,
  validateCalendarSchedule,
  type CalendarSchedule,
  type RotaWeeklyHours,
  type SchedulePeriod,
} from '@/lib/calendar/working-hours-rota';
import { minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { WorkingHoursMap } from '@/types/availability-manage';
import type { OpeningHours } from '@/types/venue';

type RepeatMode = 'forever' | 'cycles' | 'until';

interface Draft {
  from: string;
  weeks: WeekState[];
  repeatMode: RepeatMode;
  cycles: number;
  until: string;
}

function initialDraft(
  editing: SchedulePeriod | null,
  initialFrom: string | null | undefined,
  weeklyHours: RotaWeeklyHours | null | undefined,
  today: string,
): Draft {
  if (editing) {
    const cycles = periodCyclesForEnd(editing);
    return {
      from: editing.from,
      weeks: editing.weeks.map((w) => weekStateFromHours(w as WorkingHoursMap)),
      repeatMode: editing.until == null ? 'forever' : cycles != null ? 'cycles' : 'until',
      cycles: cycles ?? 4,
      until: editing.until ?? '',
    };
  }
  return {
    from: mondayOnOrBefore(initialFrom || today),
    weeks: [weekStateFromHours((weeklyHours ?? {}) as WorkingHoursMap)],
    repeatMode: 'forever',
    cycles: 4,
    until: '',
  };
}

/** A week's stored shape for the preview: an invalid week counts as closed until it is fixed. */
function weekHoursForPreview(week: WeekState): RotaWeeklyHours {
  const built = hoursFromWeekState(week, 'omit');
  return built.ok ? built.hours : {};
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

type Props = {
  /** The current timeline; the saved result replaces it. */
  schedule: CalendarSchedule | null;
  /** The period being edited, or null when adding. */
  editing: SchedulePeriod | null;
  /** Prefilled start for a new period (any date; snapped to its Monday). */
  initialFrom?: string | null;
  /** The calendar's ordinary weekly hours; new weeks start as a copy of them. */
  weeklyHours: RotaWeeklyHours | null | undefined;
  venueOpeningHours?: OpeningHours | null;
  onSave: (schedule: CalendarSchedule) => Promise<void> | void;
  onCancel: () => void;
  saving: boolean;
  /** Today, `YYYY-MM-DD`, in the venue's timezone. */
  todayYmd: string;
};

export function SchedulePeriodForm({
  schedule,
  editing,
  initialFrom,
  weeklyHours,
  venueOpeningHours,
  onSave,
  onCancel,
  saving,
  todayYmd,
}: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(editing, initialFrom, weeklyHours, todayYmd),
  );
  const [activeWeek, setActiveWeek] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const until = useMemo(() => {
    if (draft.repeatMode === 'forever') return null;
    if (draft.repeatMode === 'cycles') {
      return periodEndForCycles(draft.from, draft.weeks.length, draft.cycles);
    }
    return draft.until ? sundayOnOrAfter(draft.until) : null;
  }, [draft]);

  const candidate = useMemo<SchedulePeriod>(
    () => ({
      id: editing?.id ?? 'candidate',
      from: draft.from,
      until,
      // A period keeps its rhythm only while its start is unchanged; a moved start restarts it.
      cycle_start: editing && editing.from === draft.from ? editing.cycle_start : draft.from,
      weeks: draft.weeks.map(weekHoursForPreview),
    }),
    [draft, until, editing],
  );

  const preview = useMemo(() => {
    const inserted = insertSchedulePeriod(schedule, candidate, () => 'preview');
    const pruned = pruneEndedSchedulePeriods(inserted.schedule, todayYmd);
    return { trims: inserted.trims, dropped: pruned.removed };
  }, [schedule, candidate, todayYmd]);
  const byId = useMemo(
    () => new Map((schedule?.periods ?? []).map((p) => [p.id, p] as const)),
    [schedule],
  );

  function setCycleLength(next: number) {
    const clamped = Math.max(ROTA_MIN_WEEKS, Math.min(ROTA_MAX_WEEKS, next));
    setDraft((d) => {
      const weeks = d.weeks.slice(0, clamped);
      // Growing the cycle clones the last week; shrinking truncates.
      while (weeks.length < clamped) {
        const last = weeks[weeks.length - 1];
        weeks.push(last ? cloneWeek(last) : weekStateFromHours((weeklyHours ?? {}) as WorkingHoursMap));
      }
      return { ...d, weeks };
    });
    setActiveWeek((i) => Math.min(i, clamped - 1));
  }

  function setCycles(next: number) {
    setDraft((d) => ({
      ...d,
      cycles: Math.max(1, Math.min(ROTA_MAX_CYCLES, Math.floor(next) || 1)),
    }));
  }

  async function save() {
    setError(null);
    if (draft.repeatMode === 'until' && !draft.until) {
      setError('Choose the last day, or pick another way to repeat.');
      return;
    }
    const weeks: RotaWeeklyHours[] = [];
    for (const [i, week] of draft.weeks.entries()) {
      const built = hoursFromWeekState(week, 'omit');
      if (!built.ok) {
        setError(draft.weeks.length > 1 ? `Week ${i + 1}: ${built.error}` : built.error);
        return;
      }
      weeks.push(built.hours);
    }
    const id = editing?.id ?? newSchedulePeriodId();
    const { schedule: inserted } = insertSchedulePeriod(
      schedule,
      { ...candidate, id, weeks },
      newSchedulePeriodId,
    );
    const checked = validateCalendarSchedule(pruneEndedSchedulePeriods(inserted, todayYmd).schedule);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    await onSave(checked.schedule);
  }

  const weekCount = draft.weeks.length;
  const cycleNoun = weekCount > 1 ? 'cycle' : 'week';
  const repeatOptions: { value: RepeatMode; label: string }[] = [
    { value: 'forever', label: 'Until further notice' },
    { value: 'cycles', label: `For N ${cycleNoun}s` },
    { value: 'until', label: 'Until a date' },
  ];

  return (
    <View style={styles.root} accessibilityLabel={editing ? 'Edit schedule change' : 'Add schedule change'}>
      <Text variant="label">{editing ? 'Edit this change' : 'Add a change from a date'}</Text>

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          New hours from
        </Text>
        <DatePickerField
          value={draft.from}
          onChange={(iso) => setDraft((d) => ({ ...d, from: mondayOnOrBefore(iso) }))}
          accessibilityLabel="New hours from"
        />
        <Text variant="caption" tone="muted">
          {describeYmdLong(draft.from)}. Changes start on a Monday.
        </Text>
      </View>

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          Pattern
        </Text>
        <CountRow
          label="Weeks in the pattern"
          value={weekCount}
          display={weekCount === 1 ? 'Same hours every week' : `${weekCount}-week rota`}
          min={ROTA_MIN_WEEKS}
          max={ROTA_MAX_WEEKS}
          disabled={saving}
          onChange={setCycleLength}
        />
      </View>

      {weekCount > 1 ? (
        <Segmented
          options={draft.weeks.map((_, i) => ({ value: String(i), label: `Week ${i + 1}` }))}
          value={String(activeWeek)}
          onChange={(v) => setActiveWeek(Number(v))}
        />
      ) : null}

      <WeeklyHoursFields
        value={draft.weeks[activeWeek] ?? draft.weeks[0]!}
        onChange={(next) =>
          setDraft((d) => ({
            ...d,
            weeks: d.weeks.map((w, i) => (i === activeWeek ? next : w)),
          }))
        }
        venueOpeningHours={venueOpeningHours}
        disabled={saving}
      />

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          Runs
        </Text>
        <Segmented
          options={repeatOptions}
          value={draft.repeatMode}
          onChange={(mode) => setDraft((d) => ({ ...d, repeatMode: mode }))}
          wrapLabels
        />
        {draft.repeatMode === 'cycles' ? (
          <>
            <CountRow
              label={weekCount > 1 ? 'Number of cycles' : 'Number of weeks'}
              value={draft.cycles}
              display={`${draft.cycles} ${cycleNoun}${draft.cycles === 1 ? '' : 's'}`}
              min={1}
              max={ROTA_MAX_CYCLES}
              disabled={saving}
              onChange={setCycles}
            />
            {until ? (
              <Text variant="caption" tone="muted">
                Ends on {describeYmdLong(until)}.
              </Text>
            ) : null}
          </>
        ) : null}
        {draft.repeatMode === 'until' ? (
          <>
            <DatePickerField
              value={draft.until || draft.from}
              onChange={(iso) => setDraft((d) => ({ ...d, until: iso }))}
              accessibilityLabel="Last week of the change"
              minimumDate={ymdToDate(draft.from)}
            />
            {until ? (
              <Text variant="caption" tone="muted">
                Ends on {describeYmdLong(until)}, the end of that week.
              </Text>
            ) : (
              <Text variant="caption" tone="muted">
                Pick the last day; the change runs to the end of that week.
              </Text>
            )}
          </>
        ) : null}
      </View>

      {preview.trims.length > 0 || preview.dropped.length > 0 ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: colors.warningSurface, borderColor: colors.warning },
          ]}
          accessibilityRole="text">
          <Text variant="label" color={colors.warning}>
            Saving will adjust what it overlaps:
          </Text>
          {preview.trims.map((t, i) => (
            <Text key={`${t.id}-${i}`} variant="caption" color={colors.warning}>
              • {describeScheduleTrim(t, byId)}
            </Text>
          ))}
          {preview.dropped.map((p) => (
            <Text key={`dropped-${p.id}`} variant="caption" color={colors.warning}>
              • Drops the past change from {describeYmdShort(p.from)} (ended{' '}
              {describeYmdShort(p.until ?? p.from)}) to stay within {SCHEDULE_MAX_PERIODS} changes.
            </Text>
          ))}
        </View>
      ) : null}

      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="secondary"
          style={styles.flex1}
          disabled={saving}
          onPress={onCancel}
        />
        <Button
          label={editing ? 'Save changes' : 'Add to schedule'}
          style={styles.flex1}
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}

function cloneWeek(week: WeekState): WeekState {
  const out: WeekState = {};
  for (const [key, day] of Object.entries(week)) {
    out[key] = { open: day.open, ranges: day.ranges.map((r) => ({ ...r })) };
  }
  return out;
}

/** A − value + row for a small bounded count (the pattern length, the cycle count). */
function CountRow({
  label,
  value,
  display,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const { colors } = useTheme();
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;
  return (
    <View style={styles.countRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        accessibilityState={{ disabled: !canDecrease }}
        disabled={!canDecrease}
        onPress={() => onChange(value - 1)}
        style={[
          styles.countButton,
          { borderColor: colors.border, opacity: canDecrease ? 1 : 0.4 },
        ]}>
        <Text variant="bodyMedium">−</Text>
      </Pressable>
      <Text variant="bodyMedium" style={styles.countValue}>
        {display}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        accessibilityState={{ disabled: !canIncrease }}
        disabled={!canIncrease}
        onPress={() => onChange(value + 1)}
        style={[
          styles.countButton,
          { borderColor: colors.border, opacity: canIncrease ? 1 : 0.4 },
        ]}>
        <Text variant="bodyMedium">+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countValue: {
    flex: 1,
    textAlign: 'center',
  },
  notice: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});

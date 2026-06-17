import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { hapticSelect } from '@/lib/haptics';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Resource } from '@/types/resources-manage';

/** Ceiling on a single closed/amended range application (web `MAX_EXCEPTION_RANGE_DAYS`). */
const MAX_EXCEPTION_RANGE_DAYS = 366;

/** The stored exceptions map shape (date "YYYY-MM-DD" → closed or amended single range). */
export type ResourceExceptionsMap = NonNullable<Resource['availability_exceptions']>;
/** One day's exception value. */
export type ResourceExceptionValue = ResourceExceptionsMap[string];

/** Whether this day's override is a full closure or amended (custom) hours. */
type ExceptionKind = 'closed' | 'custom';

/** Today's local date as "YYYY-MM-DD" (default for the add-date picker). */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inclusive list of "YYYY-MM-DD" dates from start→end. Empty if invalid or end before start. */
function eachDateInRangeInclusive(start: string, end: string): string[] {
  const parse = (s: string) => {
    const [y, mo, da] = s.split('-').map(Number);
    if (!y || !mo || !da) return null;
    const d = new Date(y, mo - 1, da, 12, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const a = parse(start);
  const b = parse(end);
  if (!a || !b || b < a) return [];
  const out: string[] = [];
  for (const cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
  }
  return out;
}

/** "YYYY-MM-DD" → "d MMM yyyy"-ish label without pulling a formatter into the row. */
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Human summary of one exception value for the list row. */
function describeException(value: ResourceExceptionValue): string {
  if ('closed' in value) return 'Closed all day';
  const range = value.periods[0];
  if (!range) return 'Amended hours';
  const extra = value.periods.length - 1;
  const suffix = extra > 0 ? ` (+${extra} more — edit on web)` : '';
  return `Open ${range.start} – ${range.end}${suffix}`;
}

/**
 * Seed the editor map from a resource's stored `availability_exceptions` JSON.
 *
 * Amended dates keep their FULL `periods` array: `periods[0]` is the range this
 * single-range editor exposes, and any range #2+ (web split shifts) is preserved
 * so an untouched multi-range exception round-trips intact rather than losing the
 * extra ranges on save.
 */
export function resourceExceptionsFromJSON(
  exceptions: Resource['availability_exceptions'] | undefined,
): ResourceExceptionsMap {
  const result: ResourceExceptionsMap = {};
  if (!exceptions) return result;
  for (const [date, value] of Object.entries(exceptions)) {
    if (!value) continue;
    if ('closed' in value && value.closed) {
      result[date] = { closed: true };
    } else if ('periods' in value && value.periods.length > 0 && value.periods[0]) {
      const periods = value.periods
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({ start: p.start, end: p.end }));
      result[date] = { periods };
    }
  }
  return result;
}

/**
 * Serialise the editor map back to `availability_exceptions` JSON.
 *
 * The full `periods` array is emitted (editable range #0 plus any preserved
 * split-shift ranges), so a multi-range amended date round-trips intact. A date
 * set to "closed" emits `{ closed: true }`, dropping every range as intended.
 */
export function resourceExceptionsToJSON(map: ResourceExceptionsMap): ResourceExceptionsMap {
  const result: ResourceExceptionsMap = {};
  for (const [date, value] of Object.entries(map)) {
    if ('closed' in value) {
      result[date] = { closed: true };
    } else if (value.periods.length > 0 && value.periods[0]) {
      result[date] = { periods: value.periods.map((r) => ({ start: r.start, end: r.end })) };
    }
  }
  return result;
}

const KIND_OPTIONS: { value: ExceptionKind; label: string }[] = [
  { value: 'closed', label: 'Closed all day' },
  { value: 'custom', label: 'Amended hours' },
];

type ResourceExceptionsEditorProps = {
  value: ResourceExceptionsMap;
  onChange: (next: ResourceExceptionsMap) => void;
};

/**
 * Date-specific availability overrides for a resource — a list of existing
 * exceptions (each "Closed all day" or an amended single range, with a remove
 * control) plus an "Add date exception" composer (date + closed/amended toggle,
 * and a start/end range when amended).
 *
 * Single-range-per-day for amended hours, mirroring {@link ResourceWeekHoursEditor}.
 * The web equivalent is a month-grid calendar; on mobile a date-picker + list is
 * the leaner fit.
 *
 * @see _reference/Resneo/src/app/dashboard/resource-timeline/ResourceExceptionsCalendar.tsx
 */
export function ResourceExceptionsEditor({ value, onChange }: ResourceExceptionsEditorProps) {
  const { colors } = useTheme();

  // Add-row composer state.
  const [draftDate, setDraftDate] = useState(todayIso);
  const [draftKind, setDraftKind] = useState<ExceptionKind>('closed');
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd, setDraftEnd] = useState('17:00');
  // Optional multi-day range: when on, apply the value across draftDate→draftEndDate
  // inclusive (web `applyExceptionRange`), instead of a single date.
  const [rangeMode, setRangeMode] = useState(false);
  const [draftEndDate, setDraftEndDate] = useState(todayIso);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const entries = Object.keys(value)
    .sort()
    .map((date) => ({ date, exception: value[date]! }));

  // Extra split-shift ranges on the date being composed, surfaced so the user knows
  // updating amended hours here edits range #1 and keeps the rest.
  const draftExisting = value[draftDate];
  const draftExtraCount =
    draftExisting && 'periods' in draftExisting ? draftExisting.periods.length - 1 : 0;

  const addException = () => {
    setRangeError(null);

    // Multi-day range — set one flat value across every date start→end inclusive
    // (matches the web; per-date split-shift ranges are intentionally replaced).
    if (rangeMode) {
      const dates = eachDateInRangeInclusive(draftDate, draftEndDate);
      if (dates.length === 0) {
        setRangeError('End date must be on or after the start date.');
        return;
      }
      if (dates.length > MAX_EXCEPTION_RANGE_DAYS) {
        setRangeError(`Date range can’t exceed ${MAX_EXCEPTION_RANGE_DAYS} days.`);
        return;
      }
      const rangeValue: ResourceExceptionValue =
        draftKind === 'closed'
          ? { closed: true }
          : { periods: [{ start: draftStart, end: draftEnd }] };
      const next = { ...value };
      for (const dateKey of dates) {
        next[dateKey] = rangeValue;
      }
      hapticSelect();
      onChange(next);
      return;
    }

    let next: ResourceExceptionValue;
    if (draftKind === 'closed') {
      next = { closed: true };
    } else {
      // If this date already had extra split-shift ranges, keep them after the
      // edited first range so an update here never drops range #2+.
      const existing = value[draftDate];
      const preserved =
        existing && 'periods' in existing ? existing.periods.slice(1) : [];
      next = { periods: [{ start: draftStart, end: draftEnd }, ...preserved] };
    }
    hapticSelect();
    onChange({ ...value, [draftDate]: next });
  };

  const removeException = (date: string) => {
    const next = { ...value };
    delete next[date];
    hapticSelect();
    onChange(next);
  };

  return (
    <View style={styles.container}>
      {entries.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          No date exceptions. Add one below to close or change hours on a specific date.
        </Text>
      ) : (
        <View style={styles.list}>
          {entries.map(({ date, exception }) => (
            <View key={date} style={[styles.exceptionRow, { borderColor: colors.border }]}>
              <View style={styles.exceptionText}>
                <Text variant="bodyMedium">{formatDateLabel(date)}</Text>
                <Text variant="caption" tone="muted">
                  {describeException(exception)}
                </Text>
              </View>
              <Button
                label="Remove"
                variant="danger"
                size="sm"
                onPress={() => removeException(date)}
              />
            </View>
          ))}
        </View>
      )}

      {/* Add-date composer */}
      <View style={[styles.addCard, { borderColor: colors.border }]}>
        <Text variant="label" tone="secondary">
          Add date exception
        </Text>
        <View style={styles.addRow}>
          <Text variant="bodySmall" tone="muted" style={styles.addRowLabel}>
            {rangeMode ? 'From' : 'Date'}
          </Text>
          <DatePickerField
            accessibilityLabel="Exception date"
            value={draftDate}
            onChange={(next) => {
              setDraftDate(next);
              setRangeError(null);
              // Keep the end on/after the new start so the range stays valid.
              if (rangeMode && draftEndDate < next) setDraftEndDate(next);
            }}
            minimumDate={new Date()}
          />
        </View>

        <View style={styles.addRow}>
          <Text variant="bodySmall" tone="muted" style={styles.addRowLabel}>
            Apply across a date range
          </Text>
          <Switch
            value={rangeMode}
            onValueChange={(on) => {
              setRangeMode(on);
              setRangeError(null);
              if (on && draftEndDate < draftDate) setDraftEndDate(draftDate);
            }}
            accessibilityLabel="Apply across a date range"
          />
        </View>

        {rangeMode ? (
          <View style={styles.addRow}>
            <Text variant="bodySmall" tone="muted" style={styles.addRowLabel}>
              To
            </Text>
            <DatePickerField
              accessibilityLabel="Exception end date"
              value={draftEndDate}
              onChange={(next) => {
                setDraftEndDate(next);
                setRangeError(null);
              }}
              minimumDate={new Date()}
            />
          </View>
        ) : null}

        <Segmented options={KIND_OPTIONS} value={draftKind} onChange={setDraftKind} />

        {draftKind === 'custom' ? (
          <View style={styles.periodRow}>
            <TimePickerField
              accessibilityLabel="Amended start time"
              value={timeToMinutes(draftStart)}
              onChange={(mins) => setDraftStart(minutesToTime(mins))}
            />
            <Text variant="caption" tone="muted">
              to
            </Text>
            <TimePickerField
              accessibilityLabel="Amended end time"
              value={timeToMinutes(draftEnd)}
              onChange={(mins) => setDraftEnd(minutesToTime(mins))}
            />
          </View>
        ) : null}

        {!rangeMode && draftKind === 'custom' && draftExtraCount > 0 ? (
          <Text variant="caption" tone="muted">
            {`This date has +${draftExtraCount} more time range${
              draftExtraCount > 1 ? 's' : ''
            } set on web — they're kept; this edits the first range.`}
          </Text>
        ) : null}

        {rangeError ? (
          <Text variant="caption" tone="danger">
            {rangeError}
          </Text>
        ) : null}

        <Button
          label={
            rangeMode
              ? 'Apply to date range'
              : value[draftDate]
                ? 'Update this date'
                : 'Add exception'
          }
          variant="secondary"
          size="sm"
          onPress={addException}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  exceptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  exceptionText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  addCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  addRowLabel: {
    flex: 1,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { ResourceExceptionsCalendar } from '@/components/resources/ResourceExceptionsCalendar';
import { Button } from '@/components/ui/Button';
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

/** Today's local date as "YYYY-MM-DD" (default month + today highlight). */
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

/** "YYYY-MM-DD" → "d MMM yyyy"-ish label for the editor panel header. */
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
  { value: 'closed', label: 'Closed' },
  { value: 'custom', label: 'Amended hours' },
];

type ResourceExceptionsEditorProps = {
  value: ResourceExceptionsMap;
  onChange: (next: ResourceExceptionsMap) => void;
};

/**
 * Date-specific availability overrides for a resource — a month-grid calendar
 * (tap a day to select it or a range, tap a marked day to edit it) plus an
 * inline editor panel that switches between "add" mode (apply a closure/amended
 * hours to the selected range) and "edit" mode (change or remove an existing
 * day). A direct port of the web resource-timeline date-exceptions flow.
 *
 * Single-range-per-day for amended hours (mirroring the weekly-hours editor);
 * any extra split-shift ranges set on web are preserved untouched on save.
 *
 * @see _reference/Resneo/src/app/dashboard/resource-timeline/ResourceTimelineView.tsx
 */
export function ResourceExceptionsEditor({ value, onChange }: ResourceExceptionsEditorProps) {
  const { colors } = useTheme();
  const today = todayIso();

  // Calendar month + tap-to-select range (web `exceptionMonth` / range state).
  const [monthAnchor, setMonthAnchor] = useState(today);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  // The day open in the edit panel (null = add mode).
  const [editingDay, setEditingDay] = useState<string | null>(null);
  // Shared closure/amended draft (web `formExceptionType` / start / end).
  const [draftKind, setDraftKind] = useState<ExceptionKind>('closed');
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd, setDraftEnd] = useState('17:00');
  const [error, setError] = useState<string | null>(null);

  // Guard against a stale editing day (e.g. after the parent re-seeds with a
  // different resource): only treat it as editing when the day still exists.
  const isEditing = editingDay != null && value[editingDay] != null;
  const editingValue = isEditing ? value[editingDay] : undefined;
  // Extra split-shift ranges on the edited day, surfaced so the user knows
  // saving amended hours here edits range #1 and keeps the rest.
  const editingExtraCount =
    editingValue && 'periods' in editingValue ? editingValue.periods.length - 1 : 0;

  // Tap a day: edit it if it has an exception, otherwise advance the range
  // selection (start → end → restart) — mirrors web `handleExceptionDayClick`.
  const handleDayClick = (ymd: string) => {
    setError(null);
    const ex = value[ymd];
    if (ex) {
      setEditingDay(ymd);
      setRangeStart(null);
      setRangeEnd(null);
      if ('closed' in ex) {
        setDraftKind('closed');
      } else {
        setDraftKind('custom');
        setDraftStart(ex.periods[0]?.start ?? '09:00');
        setDraftEnd(ex.periods[0]?.end ?? '17:00');
      }
      return;
    }
    setEditingDay(null);
    if (!rangeStart) {
      setRangeStart(ymd);
      setRangeEnd(null);
      return;
    }
    if (!rangeEnd) {
      const [a, b] = ymd < rangeStart ? [ymd, rangeStart] : [rangeStart, ymd];
      setRangeStart(a);
      setRangeEnd(b);
      return;
    }
    setRangeStart(ymd);
    setRangeEnd(null);
  };

  // True when the draft's amended end is at or before its start.
  const customTimesInvalid =
    draftKind === 'custom' && timeToMinutes(draftEnd) <= timeToMinutes(draftStart);

  // Apply the draft to every day in the selected range (web `applyExceptionRange`).
  const applyRange = () => {
    setError(null);
    if (!rangeStart) {
      setError('Tap a day on the calendar to select it (tap a second day for a range), then Apply.');
      return;
    }
    const end = rangeEnd ?? rangeStart;
    const dates = eachDateInRangeInclusive(rangeStart, end);
    if (dates.length === 0) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (dates.length > MAX_EXCEPTION_RANGE_DAYS) {
      setError(`Date range can’t exceed ${MAX_EXCEPTION_RANGE_DAYS} days.`);
      return;
    }
    if (customTimesInvalid) {
      setError('Amended end time must be after the start time.');
      return;
    }
    const rangeValue: ResourceExceptionValue =
      draftKind === 'closed' ? { closed: true } : { periods: [{ start: draftStart, end: draftEnd }] };
    const next = { ...value };
    for (const dateKey of dates) {
      next[dateKey] = rangeValue;
    }
    hapticSelect();
    onChange(next);
    setRangeStart(null);
    setRangeEnd(null);
  };

  // Save changes to the day being edited (web `saveExceptionEdit`), keeping any
  // extra split-shift ranges after the edited first range.
  const saveEdit = () => {
    if (!editingDay) return;
    setError(null);
    if (customTimesInvalid) {
      setError('Amended end time must be after the start time.');
      return;
    }
    let next: ResourceExceptionValue;
    if (draftKind === 'closed') {
      next = { closed: true };
    } else {
      const existing = value[editingDay];
      const preserved = existing && 'periods' in existing ? existing.periods.slice(1) : [];
      next = { periods: [{ start: draftStart, end: draftEnd }, ...preserved] };
    }
    hapticSelect();
    onChange({ ...value, [editingDay]: next });
    setEditingDay(null);
  };

  const removeDay = (date: string) => {
    const next = { ...value };
    delete next[date];
    hapticSelect();
    onChange(next);
    if (editingDay === date) setEditingDay(null);
  };

  const clearSelection = () => {
    setRangeStart(null);
    setRangeEnd(null);
    setError(null);
  };

  // Range summary shown in the add panel (web's "start → end" / "single day" hint).
  const rangeSummary = rangeStart
    ? rangeEnd && rangeEnd !== rangeStart
      ? `${formatDateLabel(rangeStart)} – ${formatDateLabel(rangeEnd)}`
      : `${formatDateLabel(rangeStart)} · tap another day for a range`
    : 'Tap a day on the calendar to select it.';

  const customTimeRow =
    draftKind === 'custom' ? (
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
    ) : null;

  return (
    <View style={styles.container}>
      <ResourceExceptionsCalendar
        monthAnchor={monthAnchor}
        onChangeMonth={setMonthAnchor}
        exceptions={value}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        editingDay={isEditing ? editingDay : null}
        today={today}
        onDayClick={handleDayClick}
      />

      {isEditing ? (
        /* Edit mode — change or remove the tapped day. */
        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderText}>
              <Text variant="overline" tone="muted">
                Editing
              </Text>
              <Text variant="bodyMedium">{formatDateLabel(editingDay!)}</Text>
            </View>
            <Button label="Close" variant="ghost" size="sm" onPress={() => setEditingDay(null)} />
          </View>
          <Segmented options={KIND_OPTIONS} value={draftKind} onChange={setDraftKind} />
          {customTimeRow}
          {editingExtraCount > 0 ? (
            <Text variant="caption" tone="muted">
              {`This date has +${editingExtraCount} more time range${
                editingExtraCount > 1 ? 's' : ''
              } set on web — they're kept; this edits the first range.`}
            </Text>
          ) : null}
          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <View style={styles.panelActions}>
            <Button label="Save changes" size="sm" style={styles.flex1} onPress={saveEdit} />
            <Button
              label="Remove"
              variant="danger"
              size="sm"
              style={styles.flex1}
              onPress={() => removeDay(editingDay!)}
            />
          </View>
        </View>
      ) : (
        /* Add mode — apply a closure / amended hours to the selected range. */
        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text variant="label" tone="secondary">
            Add closure or amended hours
          </Text>
          <Text variant="caption" tone="muted">
            {rangeSummary}
          </Text>
          <Segmented options={KIND_OPTIONS} value={draftKind} onChange={setDraftKind} />
          {customTimeRow}
          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
          <View style={styles.panelActions}>
            <Button
              label="Apply"
              size="sm"
              style={styles.flex1}
              disabled={!rangeStart}
              onPress={applyRange}
            />
            <Button
              label="Clear"
              variant="secondary"
              size="sm"
              style={styles.flex1}
              disabled={!rangeStart}
              onPress={clearSelection}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  panel: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  panelHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  panelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});

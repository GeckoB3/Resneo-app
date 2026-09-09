/**
 * BreaksEditor — per-weekday break windows for a single calendar.
 *
 * Shows the 7 weekdays. For each day, lists existing breaks (any-minute
 * times, the OS time picker) with Remove and an "+ Add break" button, plus the
 * web's "Copy Monday to all days" shortcut. Saves via usePatchPractitioner
 * with break_times_by_day; "Save to all calendars" confirms first and then
 * writes every permitted calendar one PATCH at a time.
 *
 * Two homes: inline on the Breaks tab of the Availability screen (the web's
 * home for it, `inline`), or in a fill Sheet.
 *
 * Web parity: `BreaksScheduleEditor` + `saveBreakSchedule` in
 * `AppointmentAvailabilitySettings.tsx`.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePatchPractitioner } from '@/lib/queries/useAvailabilityManage';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BreakTimesByDayMap, TimeRange } from '@/types/availability-manage';

const WEEKDAYS = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
] as const;

/** What a staff member reads on a colleague's calendar (web `readOnlyHint`). */
export const BREAKS_READ_ONLY_HINT =
  'View only - you can edit breaks for calendars linked to your account only.';

/** The intro over the editor for someone who may change it (web copy). */
export const BREAKS_INTRO =
  'Breaks are short windows on a day when this calendar stays closed to bookings (for example a lunch break), using the working-hours window you set on the Availability tab. Guests cannot book during a break.';

/** What a resource shows instead of the editor (web copy). */
export const BREAKS_RESOURCE_NOTE =
  'Breaks are not available for resources yet. Set the hours this resource can be booked on the Availability tab instead. To keep a room free at the same time each day, add a break on the staff calendar it appears on.';

function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Convert stored TimeRange[] for a day key to [startMin, endMin] pairs. */
function parseDayBreaks(map: BreakTimesByDayMap | null | undefined, key: string): [number, number][] {
  const ranges = map?.[key] ?? [];
  return ranges.map((r) => [hhmmToMinutes(r.start), hhmmToMinutes(r.end)]);
}

function hasPerDayBreaks(map: BreakTimesByDayMap | null | undefined): boolean {
  return Boolean(map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).length > 0);
}

/**
 * Seed initial per-day break state (mirrors web's `initialBreaksByDayFromPractitioner`):
 * prefer stored per-day breaks; otherwise repeat the legacy every-day `break_times`
 * onto every weekday so they show up (and don't get wiped on the next save).
 */
function initialDayBreaks(
  byDay: BreakTimesByDayMap | null | undefined,
  legacy: TimeRange[] | null | undefined,
): Record<string, [number, number][]> {
  const init: Record<string, [number, number][]> = {};
  if (hasPerDayBreaks(byDay)) {
    for (const wd of WEEKDAYS) init[wd.key] = parseDayBreaks(byDay, wd.key);
    return init;
  }
  const daily = (Array.isArray(legacy) ? legacy : []).map(
    (r) => [hhmmToMinutes(r.start), hhmmToMinutes(r.end)] as [number, number],
  );
  for (const wd of WEEKDAYS) init[wd.key] = daily.map((b) => [b[0], b[1]] as [number, number]);
  return init;
}

type Props = {
  practitionerId: string;
  practitionerName: string;
  currentBreaksByDay?: BreakTimesByDayMap | null;
  /** Legacy every-day breaks — seeded onto each weekday when no per-day map exists. */
  currentBreaks?: TimeRange[] | null;
  /**
   * Every calendar this user may set breaks on, for "Save to all calendars".
   * Include the selected one; the caller is responsible for the permission
   * filter AND for leaving RESOURCES out — the resource engine reads
   * `break_times` from the host calendar row, never the resource's own, so a
   * break written there would save and do nothing.
   */
  applyToAllCalendars?: { id: string; name: string }[];
  /**
   * Rendered inside a scrolling tab rather than a Sheet: no scroll of its own,
   * no heading, no Cancel, no inset.
   */
  inline?: boolean;
  /** The viewer may look but not change (a colleague's calendar). */
  readOnly?: boolean;
  readOnlyHint?: string;
  /** Called after a successful save; the Sheet host closes on it. */
  onClose?: () => void;
};

export function BreaksEditor({
  practitionerId,
  practitionerName,
  currentBreaksByDay,
  currentBreaks,
  applyToAllCalendars,
  inline = false,
  readOnly = false,
  readOnlyHint,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const patchPractitioner = usePatchPractitioner();

  const [dayBreaks, setDayBreaks] = useState<Record<string, [number, number][]>>(() =>
    initialDayBreaks(currentBreaksByDay, currentBreaks),
  );
  /** "Save to all calendars" asks first: it overwrites the others' breaks. */
  const [confirmAll, setConfirmAll] = useState(false);

  const otherCalendars = (applyToAllCalendars ?? []).filter((c) => c.id !== practitionerId);
  /**
   * Offered only when there is somewhere else for the breaks to go AND the
   * calendar on screen is itself in the permitted list.
   *
   * The second half matters for staff: `applyToAllCalendars` carries the
   * calendars they may write to, but the editor can be opened on a colleague's.
   * Without this check the button would appear there and fan out a run of 403s.
   */
  const canApplyToAll =
    otherCalendars.length > 0 && (applyToAllCalendars ?? []).some((c) => c.id === practitionerId);

  function addBreak(dayKey: string) {
    setDayBreaks((prev) => ({
      ...prev,
      [dayKey]: [...(prev[dayKey] ?? []), [12 * 60, 13 * 60]],
    }));
  }

  function removeBreak(dayKey: string, idx: number) {
    setDayBreaks((prev) => ({
      ...prev,
      [dayKey]: (prev[dayKey] ?? []).filter((_, i) => i !== idx),
    }));
  }

  function updateBreak(dayKey: string, idx: number, field: 0 | 1, minutes: number) {
    setDayBreaks((prev) => {
      const breaks = [...(prev[dayKey] ?? [])];
      const pair = breaks[idx] ? [...breaks[idx]] as [number, number] : [12 * 60, 13 * 60] as [number, number];
      pair[field] = minutes;
      breaks[idx] = pair as [number, number];
      return { ...prev, [dayKey]: breaks };
    });
  }

  function copyMondayToAll() {
    const mondayBreaks = dayBreaks['1'] ?? [];
    const next: Record<string, [number, number][]> = {};
    for (const wd of WEEKDAYS) {
      next[wd.key] = mondayBreaks.map((b) => [b[0], b[1]] as [number, number]);
    }
    setDayBreaks(next);
  }

  /** The validated payload, or null after telling the user what is wrong. */
  function buildPayload(): BreakTimesByDayMap | null {
    for (const wd of WEEKDAYS) {
      for (const [s, e] of dayBreaks[wd.key] ?? []) {
        if (e <= s) {
          toast.error(`Break end time must be after start for ${wd.label}.`);
          return null;
        }
      }
    }
    const breaksByDay: BreakTimesByDayMap = {};
    for (const wd of WEEKDAYS) {
      breaksByDay[wd.key] = (dayBreaks[wd.key] ?? []).map(
        ([s, e]) => ({ start: minutesToHhmm(s), end: minutesToHhmm(e) }) satisfies TimeRange,
      );
    }
    return breaksByDay;
  }

  /** The first tap on "Save to all calendars" only asks (web `window.confirm`). */
  function askSaveToAll() {
    if (readOnly || !canApplyToAll) return;
    if (!buildPayload()) return;
    hapticWarning();
    setConfirmAll(true);
  }

  async function handleSave(applyToAll: boolean) {
    if (readOnly) return;
    const breaksByDay = buildPayload();
    if (!breaksByDay) return;

    /**
     * One PATCH at a time, because `/api/venue/practitioners` takes a single
     * id — there is no batch endpoint to use instead. A partial failure
     * therefore leaves some calendars updated, so the message reports what
     * actually succeeded rather than what was attempted (web parity).
     */
    const targets =
      applyToAll && canApplyToAll
        ? [{ id: practitionerId, name: practitionerName }, ...otherCalendars]
        : [{ id: practitionerId, name: practitionerName }];

    let saved = 0;
    try {
      for (const target of targets) {
        await patchPractitioner.mutateAsync({
          id: target.id,
          // Clear the legacy every-day field so breaks don't double-apply (web parity).
          break_times: [],
          break_times_by_day: breaksByDay,
        });
        saved += 1;
      }
      setConfirmAll(false);
      hapticSuccess();
      onClose?.();
      toast.success(
        targets.length > 1 ? `Breaks saved to ${saved} calendars.` : 'Breaks saved.',
      );
    } catch (e) {
      setConfirmAll(false);
      hapticWarning();
      if (saved > 0) {
        toast.error(
          `Saved breaks to ${saved} of ${targets.length} calendars, then failed. Check the remaining ones.`,
        );
        return;
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  }

  const busy = patchPractitioner.isPending || confirmAll;

  const days = WEEKDAYS.map((wd) => {
    const breaks = dayBreaks[wd.key] ?? [];
    return (
      <View
        key={wd.key}
        style={[styles.dayBlock, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
        <View style={styles.dayHeader}>
          <Text variant="bodyMedium">{wd.label}</Text>
          {!readOnly ? (
            <Button
              label="+ Add break"
              variant="ghost"
              size="sm"
              disabled={busy}
              onPress={() => addBreak(wd.key)}
            />
          ) : null}
        </View>
        {breaks.length === 0 ? (
          <Text variant="caption" tone="muted">
            No breaks - bookable for the full working-hours window
          </Text>
        ) : (
          <View style={styles.breaksCol}>
            {breaks.map(([start, end], idx) => (
              <View key={idx} style={styles.breakRow}>
                <TimePickerField
                  value={start}
                  onChange={(m) => updateBreak(wd.key, idx, 0, m)}
                  accessibilityLabel={`${wd.label} break ${idx + 1} start`}
                  disabled={readOnly || busy}
                />
                <Text variant="caption" tone="muted">
                  to
                </Text>
                <TimePickerField
                  value={end}
                  onChange={(m) => updateBreak(wd.key, idx, 1, m)}
                  accessibilityLabel={`${wd.label} break ${idx + 1} end`}
                  disabled={readOnly || busy}
                />
                {!readOnly ? (
                  <Button
                    label="Remove"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    customColors={{ background: 'transparent', text: colors.danger }}
                    accessibilityLabel={`Remove ${wd.label} break ${idx + 1}`}
                    onPress={() => removeBreak(wd.key, idx)}
                  />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  });

  const body = (
    <>
      <Text variant="caption" tone="muted">
        For each day of the week, add one or more breaks when this calendar should not offer
        appointments. Leave a day with no breaks if it stays bookable for the full working-hours
        window that day. If several days share the same pattern, set Monday first and use{' '}
        <Text variant="caption" tone="secondary">
          Copy Monday to all days
        </Text>
        .
      </Text>

      {!readOnly ? (
        <Button
          label="Copy Monday to all days"
          variant="secondary"
          size="sm"
          disabled={busy}
          onPress={copyMondayToAll}
        />
      ) : null}

      <View style={styles.list}>{days}</View>
    </>
  );

  const actions = readOnly ? (
    <Text variant="bodySmall" tone="muted">
      {readOnlyHint ??
        'You can only edit breaks for calendars linked to your account. Ask an admin to select a different calendar.'}
    </Text>
  ) : confirmAll ? (
    <ConfirmPanel
      title="Save to all calendars?"
      message={`Replace the breaks on ${otherCalendars.length} other calendar${
        otherCalendars.length === 1 ? '' : 's'
      } with these? Their existing breaks will be overwritten.`}
      confirmLabel="Replace breaks"
      destructive
      loading={patchPractitioner.isPending}
      onConfirm={() => void handleSave(true)}
      onCancel={() => {
        if (!patchPractitioner.isPending) setConfirmAll(false);
      }}
    />
  ) : (
    <View style={styles.actions}>
      {!inline ? (
        <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
      ) : null}
      <Button
        label="Save breaks"
        style={styles.flex1}
        loading={patchPractitioner.isPending}
        onPress={() => void handleSave(false)}
      />
      {/* Overwrites other calendars, so it confirms first and never becomes
          the default action. Hidden when there is nothing else to write to. */}
      {canApplyToAll ? (
        <Button
          label="Save to all calendars"
          variant="secondary"
          style={styles.flex1}
          disabled={patchPractitioner.isPending}
          onPress={askSaveToAll}
        />
      ) : null}
    </View>
  );

  if (inline) {
    return (
      <View style={styles.inlineRoot}>
        {body}
        {actions}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Breaks — {practitionerName}
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
        {body}
      </ScrollView>
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.md,
    // `fill` Sheets supply no horizontal padding (they delegate it to the
    // child), so pad the editor itself to match the standard sheet inset.
    paddingHorizontal: spacing.lg,
  },
  inlineRoot: {
    gap: spacing.md,
  },
  sheetBody: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  dayBlock: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  breaksCol: {
    gap: spacing.xs,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});

/**
 * BreaksEditor — per-weekday break window editor for a single practitioner.
 *
 * Shows the 7 weekdays. For each day, lists existing breaks with swipe-
 * to-remove and an "+ Add break" button. A "Copy Monday to all days"
 * shortcut is provided. Saves via usePatchPractitioner with break_times_by_day.
 */
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePatchPractitioner } from '@/lib/queries/useAvailabilityManage';
import { useToast } from '@/providers/ToastProvider';
import { fonts, spacing } from '@/theme/index';
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

const STEP_MINUTES = 15;
const MAX_MINUTES = 23 * 60 + 45;

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

function InlineStep({
  value,
  onDecrement,
  onIncrement,
}: {
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepRow}>
      <Pressable
        onPress={onDecrement}
        accessibilityRole="button"
        style={[styles.stepBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.brand, fontFamily: fonts.bold }}>−</Text>
      </Pressable>
      <Text variant="label" style={styles.stepValue}>
        {value}
      </Text>
      <Pressable
        onPress={onIncrement}
        accessibilityRole="button"
        style={[styles.stepBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.brand, fontFamily: fonts.bold }}>+</Text>
      </Pressable>
    </View>
  );
}

type Props = {
  practitionerId: string;
  practitionerName: string;
  currentBreaksByDay?: BreakTimesByDayMap | null;
  /** Legacy every-day breaks — seeded onto each weekday when no per-day map exists. */
  currentBreaks?: TimeRange[] | null;
  /**
   * Every calendar this user may set breaks on, for the "Apply to all
   * calendars" switch. Include the selected one; the caller is responsible for
   * the permission filter AND for leaving RESOURCES out — the resource engine
   * reads `break_times` from the host calendar row, never the resource's own,
   * so a break written there would save and do nothing.
   */
  applyToAllCalendars?: { id: string; name: string }[];
  onClose: () => void;
};

export function BreaksEditor({
  practitionerId,
  practitionerName,
  currentBreaksByDay,
  currentBreaks,
  applyToAllCalendars,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const patchPractitioner = usePatchPractitioner();

  const [dayBreaks, setDayBreaks] = useState<Record<string, [number, number][]>>(() =>
    initialDayBreaks(currentBreaksByDay, currentBreaks),
  );
  const [applyToAll, setApplyToAll] = useState(false);

  const otherCalendars = (applyToAllCalendars ?? []).filter((c) => c.id !== practitionerId);
  /**
   * Offered only when there is somewhere else for the breaks to go AND the
   * calendar on screen is itself in the permitted list.
   *
   * The second half matters for staff: `applyToAllCalendars` carries the
   * calendars they may write to, but the editor can be opened on a colleague's.
   * Without this check the switch would appear there and fan out a run of 403s.
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

  async function handleSave() {
    // Validate no break where end <= start
    for (const wd of WEEKDAYS) {
      for (const [s, e] of dayBreaks[wd.key] ?? []) {
        if (e <= s) {
          toast.error(`Break end time must be after start for ${wd.label}.`);
          return;
        }
      }
    }

    const breaksByDay: BreakTimesByDayMap = {};
    for (const wd of WEEKDAYS) {
      breaksByDay[wd.key] = (dayBreaks[wd.key] ?? []).map(
        ([s, e]) => ({ start: minutesToHhmm(s), end: minutesToHhmm(e) }) satisfies TimeRange,
      );
    }

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
      hapticSuccess();
      onClose();
      toast.success(
        targets.length > 1 ? `Breaks saved to ${saved} calendars.` : 'Breaks saved.',
      );
    } catch (e) {
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

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Breaks — {practitionerName}
      </Text>

      <Button
        label="Copy Monday to all days"
        variant="secondary"
        size="sm"
        onPress={copyMondayToAll}
      />

      {/* A lunch break is nearly always the same shape across a team, and
          retyping it per calendar is how two calendars end up disagreeing by a
          typo nobody notices. Leave already has its own apply-to-all. */}
      {canApplyToAll ? (
        <View style={styles.applyAllRow}>
          <Text variant="bodyMedium" style={styles.applyAllLabel}>
            Apply to all calendars
          </Text>
          <Switch
            value={applyToAll}
            onValueChange={setApplyToAll}
            accessibilityLabel="Apply these breaks to all calendars"
            trackColor={{ true: colors.brand, false: colors.border }}
            thumbColor={colors.surfaceRaised}
          />
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {WEEKDAYS.map((wd) => {
          const breaks = dayBreaks[wd.key] ?? [];
          return (
            <View key={wd.key} style={[styles.dayBlock, { borderBottomColor: colors.border }]}>
              <View style={styles.dayHeader}>
                <Text variant="bodyMedium">{wd.label}</Text>
                <Button
                  label="+ Add"
                  variant="ghost"
                  size="sm"
                  onPress={() => addBreak(wd.key)}
                />
              </View>
              {breaks.length === 0 ? (
                <Text variant="caption" tone="muted" style={styles.noBreaks}>
                  No breaks
                </Text>
              ) : (
                <View style={styles.breaksCol}>
                  {breaks.map(([start, end], idx) => (
                    <View key={idx} style={[styles.breakRow, { backgroundColor: colors.surface }]}>
                      <View style={styles.breakTimes}>
                        <View style={styles.breakField}>
                          <Text variant="caption" tone="secondary">
                            Start
                          </Text>
                          <InlineStep
                            value={minutesToHhmm(start)}
                            onDecrement={() =>
                              updateBreak(wd.key, idx, 0, Math.max(0, start - STEP_MINUTES))
                            }
                            onIncrement={() =>
                              updateBreak(
                                wd.key,
                                idx,
                                0,
                                Math.min(MAX_MINUTES, start + STEP_MINUTES),
                              )
                            }
                          />
                        </View>
                        <Text variant="caption" tone="muted" style={styles.dash}>
                          –
                        </Text>
                        <View style={styles.breakField}>
                          <Text variant="caption" tone="secondary">
                            End
                          </Text>
                          <InlineStep
                            value={minutesToHhmm(end)}
                            onDecrement={() =>
                              updateBreak(wd.key, idx, 1, Math.max(0, end - STEP_MINUTES))
                            }
                            onIncrement={() =>
                              updateBreak(
                                wd.key,
                                idx,
                                1,
                                Math.min(MAX_MINUTES, end + STEP_MINUTES),
                              )
                            }
                          />
                        </View>
                      </View>
                      <Pressable
                        onPress={() => removeBreak(wd.key, idx)}
                        accessibilityLabel="Remove break"
                        style={styles.removeBtn}>
                        <Text variant="caption" tone="danger">
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
        <Button
          label="Save breaks"
          style={styles.flex1}
          loading={patchPractitioner.isPending}
          onPress={() => void handleSave()}
        />
      </View>
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
  applyAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  applyAllLabel: {
    flex: 1,
  },
  list: { gap: 0 },
  dayBlock: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noBreaks: {
    paddingLeft: spacing.sm,
  },
  breaksCol: {
    gap: spacing.sm,
  },
  breakRow: {
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  breakTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakField: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  dash: {
    paddingHorizontal: 2,
    marginTop: spacing.base,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  removeBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});

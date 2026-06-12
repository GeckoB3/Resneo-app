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
  onClose: () => void;
};

export function BreaksEditor({
  practitionerId,
  practitionerName,
  currentBreaksByDay,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const patchPractitioner = usePatchPractitioner();

  const [dayBreaks, setDayBreaks] = useState<Record<string, [number, number][]>>(() => {
    const init: Record<string, [number, number][]> = {};
    for (const wd of WEEKDAYS) {
      init[wd.key] = parseDayBreaks(currentBreaksByDay, wd.key);
    }
    return init;
  });

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

    try {
      await patchPractitioner.mutateAsync({
        id: practitionerId,
        break_times_by_day: breaksByDay,
      });
      hapticSuccess();
      onClose();
      toast.success('Breaks saved.');
    } catch (e) {
      hapticWarning();
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

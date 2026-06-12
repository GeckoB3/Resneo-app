/**
 * WorkingHoursEditor — per-weekday working hour editor for a single practitioner.
 *
 * Shows 7 rows (Sun–Sat). Each row has an "Open" toggle plus start/end time
 * steppers. Saves via usePatchPractitioner (PATCH /api/venue/practitioners).
 */
import { useState } from 'react';
import {
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
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { TimeRange, WorkingHoursMap } from '@/types/availability-manage';

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

function parseHours(wh: WorkingHoursMap | undefined, key: string): { open: boolean; start: number; end: number } {
  const ranges = wh?.[key];
  if (!ranges || ranges.length === 0) {
    return { open: false, start: 9 * 60, end: 17 * 60 };
  }
  const first = ranges[0];
  return {
    open: true,
    start: hhmmToMinutes(first?.start ?? '09:00'),
    end: hhmmToMinutes(first?.end ?? '17:00'),
  };
}

type DayState = { open: boolean; start: number; end: number };

function TimeRow({
  label,
  value,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.timeRow}>
      <Text variant="caption" tone="secondary" style={styles.timeLabel}>
        {label}
      </Text>
      <View style={styles.timeControl}>
        <Button
          label="−"
          variant="secondary"
          size="sm"
          style={[styles.stepBtn, { borderColor: colors.border }]}
          onPress={onDecrement}
        />
        <Text variant="label" style={styles.timeValue}>
          {value}
        </Text>
        <Button
          label="+"
          variant="secondary"
          size="sm"
          style={[styles.stepBtn, { borderColor: colors.border }]}
          onPress={onIncrement}
        />
      </View>
    </View>
  );
}

type Props = {
  practitionerId: string;
  practitionerName: string;
  currentWorkingHours?: WorkingHoursMap;
  onClose: () => void;
};

export function WorkingHoursEditor({
  practitionerId,
  practitionerName,
  currentWorkingHours,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const patchPractitioner = usePatchPractitioner();

  const [days, setDays] = useState<Record<string, DayState>>(() => {
    const init: Record<string, DayState> = {};
    for (const wd of WEEKDAYS) {
      init[wd.key] = parseHours(currentWorkingHours, wd.key);
    }
    return init;
  });

  function updateDay(key: string, patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  async function handleSave() {
    const workingHours: WorkingHoursMap = {};
    for (const wd of WEEKDAYS) {
      const d = days[wd.key]!;
      if (d.open) {
        if (d.end <= d.start) {
          toast.error(`End time must be after start time for ${wd.label}.`);
          return;
        }
        workingHours[wd.key] = [
          { start: minutesToHhmm(d.start), end: minutesToHhmm(d.end) },
        ] satisfies TimeRange[];
      } else {
        workingHours[wd.key] = [];
      }
    }
    try {
      await patchPractitioner.mutateAsync({ id: practitionerId, working_hours: workingHours });
      hapticSuccess();
      onClose();
      toast.success('Working hours saved.');
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  }

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Working hours — {practitionerName}
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        {WEEKDAYS.map((wd) => {
          const d = days[wd.key]!;
          return (
            <View key={wd.key} style={[styles.dayRow, { borderBottomColor: colors.border }]}>
              <View style={styles.dayHeader}>
                <Text variant="bodyMedium">{wd.label}</Text>
                <Switch
                  value={d.open}
                  onValueChange={(v) => updateDay(wd.key, { open: v })}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor={colors.surfaceRaised}
                />
              </View>
              {d.open ? (
                <View style={styles.timePickers}>
                  <TimeRow
                    label="Start"
                    value={minutesToHhmm(d.start)}
                    onDecrement={() =>
                      updateDay(wd.key, { start: Math.max(0, d.start - STEP_MINUTES) })
                    }
                    onIncrement={() =>
                      updateDay(wd.key, { start: Math.min(MAX_MINUTES, d.start + STEP_MINUTES) })
                    }
                  />
                  <TimeRow
                    label="End"
                    value={minutesToHhmm(d.end)}
                    onDecrement={() =>
                      updateDay(wd.key, { end: Math.max(0, d.end - STEP_MINUTES) })
                    }
                    onIncrement={() =>
                      updateDay(wd.key, { end: Math.min(MAX_MINUTES, d.end + STEP_MINUTES) })
                    }
                  />
                </View>
              ) : (
                <Text variant="caption" tone="muted" style={styles.closedLabel}>
                  Day off
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
        <Button
          label="Save hours"
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
  list: {
    gap: 0,
  },
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
  timePickers: {
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: {
    width: 40,
  },
  timeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepBtn: {
    width: 36,
    minHeight: 36,
    paddingHorizontal: 0,
  },
  timeValue: {
    minWidth: 50,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  closedLabel: {
    paddingLeft: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});

/**
 * WorkingHoursEditor — per-weekday working hour editor for a single practitioner.
 *
 * Shows 7 rows (Mon–Sun). Each row has an "Open" toggle plus one or more
 * start/end time ranges (split shifts), with "+ Add split", per-range "Remove",
 * and "Copy to other open days". Saves the FULL set of ranges per open day via
 * usePatchPractitioner (PATCH /api/venue/practitioners).
 *
 * Web parity: _reference/Resneo/src/components/scheduling/WorkingHoursControl.tsx
 */
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { usePatchPractitioner } from '@/lib/queries/useAvailabilityManage';
import { useToast } from '@/providers/ToastProvider';
import { spacing, radius } from '@/theme/index';
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

/** A range expressed in minutes-since-midnight for easy stepping/comparison. */
type MinuteRange = { start: number; end: number };
type DayState = { open: boolean; ranges: MinuteRange[] };

const DEFAULT_RANGE: MinuteRange = { start: 9 * 60, end: 17 * 60 };

function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Read ALL ranges for a day (not just the first) so split shifts survive. */
function parseHours(wh: WorkingHoursMap | undefined, key: string): DayState {
  const ranges = wh?.[key];
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

  // "Save anyway?" — narrowing this calendar's hours can orphan upcoming
  // bookings; the route replies 409 `{ requires_confirmation, message }`. We
  // keep the validated payload so the confirm can re-save with `acknowledge`.
  const [ackConfirm, setAckConfirm] = useState<{ message: string; payload: WorkingHoursMap } | null>(
    null,
  );

  function setDayOpen(key: string, open: boolean) {
    setDays((prev) => {
      const cur = prev[key]!;
      // Re-open with a sensible default range if none survived.
      const ranges = cur.ranges.length > 0 ? cur.ranges : [{ ...DEFAULT_RANGE }];
      return { ...prev, [key]: { open, ranges } };
    });
  }

  function updateRange(key: string, index: number, patch: Partial<MinuteRange>) {
    setDays((prev) => {
      const cur = prev[key]!;
      const ranges = cur.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return { ...prev, [key]: { ...cur, ranges } };
    });
  }

  function addRange(key: string) {
    setDays((prev) => {
      const cur = prev[key]!;
      return { ...prev, [key]: { ...cur, ranges: [...cur.ranges, { ...DEFAULT_RANGE }] } };
    });
  }

  function removeRange(key: string, index: number) {
    setDays((prev) => {
      const cur = prev[key]!;
      const ranges = cur.ranges.filter((_, i) => i !== index);
      return {
        ...prev,
        [key]: { ...cur, ranges: ranges.length > 0 ? ranges : [{ ...DEFAULT_RANGE }] },
      };
    });
  }

  /** Clone an open day's ranges to every OTHER day that is currently open. */
  function copyToOtherOpenDays(sourceKey: string) {
    setDays((prev) => {
      const source = prev[sourceKey]!;
      if (!source.open) return prev;
      const template = source.ranges.map((r) => ({ ...r }));
      const next: Record<string, DayState> = { ...prev };
      for (const wd of WEEKDAYS) {
        if (wd.key === sourceKey) continue;
        if (next[wd.key]!.open) {
          next[wd.key] = { open: true, ranges: template.map((r) => ({ ...r })) };
        }
      }
      return next;
    });
    hapticSuccess();
  }

  /** Build + validate the working-hours payload from the current day state, or null on error. */
  function buildWorkingHours(): WorkingHoursMap | null {
    const workingHours: WorkingHoursMap = {};
    for (const wd of WEEKDAYS) {
      const d = days[wd.key]!;
      if (d.open) {
        for (const r of d.ranges) {
          if (r.end <= r.start) {
            toast.error(`End time must be after start time for ${wd.label}.`);
            return null;
          }
        }
        workingHours[wd.key] = d.ranges.map(
          (r) => ({ start: minutesToHhmm(r.start), end: minutesToHhmm(r.end) }),
        ) satisfies TimeRange[];
      } else {
        workingHours[wd.key] = [];
      }
    }
    return workingHours;
  }

  async function handleSave() {
    const workingHours = buildWorkingHours();
    if (!workingHours) return;
    try {
      await patchPractitioner.mutateAsync({ id: practitionerId, working_hours: workingHours });
      hapticSuccess();
      onClose();
      toast.success('Working hours saved.');
    } catch (e) {
      // 409 with requires_confirmation → ask, then re-save acknowledged.
      if (e instanceof ApiError && e.status === 409 && isRequiresConfirmationBody(e.body)) {
        hapticWarning();
        setAckConfirm({
          message:
            e.body.message ??
            'Some upcoming bookings fall outside the new hours. Save these hours anyway?',
          payload: workingHours,
        });
        return;
      }
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  }

  /** User confirmed the orphan-bookings warning — re-save with the acknowledge flag. */
  async function handleConfirmAck() {
    if (!ackConfirm) return;
    try {
      await patchPractitioner.mutateAsync({
        id: practitionerId,
        working_hours: ackConfirm.payload,
        acknowledge: true,
      });
      setAckConfirm(null);
      hapticSuccess();
      onClose();
      toast.success('Working hours saved.');
    } catch (e) {
      setAckConfirm(null);
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    }
  }

  return (
    <View style={styles.root}>
      <Text variant="overline" tone="muted">
        Working hours — {practitionerName}
      </Text>

      <View
        style={[
          styles.infoNote,
          { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
        ]}>
        <Text variant="caption" tone="secondary" style={styles.infoText}>
          These hours are when this calendar can take bookings, but a time is only bookable where
          it also falls within your venue&apos;s business hours. To open bookings earlier or later,
          widen Settings → Business hours as well.
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}>
        {WEEKDAYS.map((wd) => {
          const d = days[wd.key]!;
          const canCopyElsewhere =
            d.open && WEEKDAYS.some((o) => o.key !== wd.key && days[o.key]!.open);
          return (
            <View key={wd.key} style={[styles.dayRow, { borderBottomColor: colors.border }]}>
              <View style={styles.dayHeader}>
                <Text variant="bodyMedium">{wd.label}</Text>
                <Switch
                  value={d.open}
                  onValueChange={(v) => setDayOpen(wd.key, v)}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor={colors.surfaceRaised}
                />
              </View>
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
                          customColors={{ background: 'transparent', text: colors.danger }}
                          style={styles.inlineAction}
                          onPress={() => removeRange(wd.key, ri)}
                        />
                      ) : null}
                    </View>
                  ))}
                  <View style={styles.dayActions}>
                    <Button
                      label="+ Add split"
                      variant="ghost"
                      size="sm"
                      style={styles.inlineAction}
                      onPress={() => addRange(wd.key)}
                    />
                    {canCopyElsewhere ? (
                      <Button
                        label="Copy to other open days"
                        variant="secondary"
                        size="sm"
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

      {/* "Save anyway?" — orphan-bookings confirmation (409 requires_confirmation). */}
      <ConfirmSheet
        visible={ackConfirm != null}
        title="Save these hours anyway?"
        message={ackConfirm?.message}
        confirmLabel="Save anyway"
        destructive={false}
        loading={patchPractitioner.isPending}
        onConfirm={() => void handleConfirmAck()}
        onClose={() => {
          if (!patchPractitioner.isPending) setAckConfirm(null);
        }}
      />
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
  infoNote: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoText: {
    lineHeight: 18,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  flex1: { flex: 1 },
});

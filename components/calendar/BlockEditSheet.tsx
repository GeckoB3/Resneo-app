import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { minutesToTime } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError } from '@/lib/api/client';
import { nowMinutesInTz } from '@/lib/booking/no-show-grace';
import {
  BLOCK_REASON_MAX_LENGTH,
  blockSavedMessage,
  defaultBlockCalendarId,
  defaultBlockEnd,
  defaultBlockStart,
} from '@/lib/calendar/block-time';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateBlock, useDeleteBlock } from '@/lib/queries/useAvailabilityManage';
import { useBlockableCalendars } from '@/lib/queries/useBlockableCalendars';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useUpdateBlock } from '@/lib/queries/useUpdateBlock';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import { CONFIRM_ARM_MS } from '@/lib/ui/confirm-arm';

export type BlockTarget =
  | {
      mode: 'create';
      /** The calendar in view, as a starting point. Null lets the sheet pick the first they may block. */
      practitionerId: string | null;
      /** Null starts on today, on the venue's clock. */
      date: string | null;
      /** Pre-filled start time HH:mm. Null when no slot was tapped: the next half hour, or 09:00. */
      startTime: string | null;
    }
  | {
      mode: 'edit';
      blockId: string;
      practitionerId: string;
      date: string;
      startTime: string;
      endTime: string;
      reason: string | null;
    };

type BlockEditSheetProps = {
  target: BlockTarget | null;
  onClose: () => void;
};

const DEFAULT_TIMEZONE = 'Europe/London';

/** "HH:mm" or "HH:mm:ss" → minutes since midnight. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Bottom sheet for creating or editing a time block: which calendar, which day, from when to when. */
export function BlockEditSheet({ target, onClose }: BlockEditSheetProps) {
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? DEFAULT_TIMEZONE;
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useToast();
  const createMutation = useCreateBlock();
  const updateMutation = useUpdateBlock();
  const deleteMutation = useDeleteBlock();
  const blockable = useBlockableCalendars({ enabled: !!target });
  // The whole roster, only to name a block's own calendar when it is not one they could pick.
  const rosterQuery = usePractitioners({ includeInactive: true, enabled: !!target });

  // Seed form state when target changes
  useEffect(() => {
    if (!target) return;
    /* eslint-disable react-hooks/set-state-in-effect -- seed local form state when target changes */
    if (target.mode === 'create') {
      const today = calendarDateInTimeZone(new Date(), timeZone);
      const day = target.date ?? today;
      const start = target.startTime?.slice(0, 5) ?? defaultBlockStart(day, today, nowMinutesInTz(timeZone));
      setCalendarId(target.practitionerId);
      setDate(day);
      setStartTime(start);
      setEndTime(defaultBlockEnd(start));
      setReason('');
    } else {
      setCalendarId(target.practitionerId);
      setDate(target.date);
      setStartTime(target.startTime.slice(0, 5));
      setEndTime(target.endTime.slice(0, 5));
      setReason(target.reason ?? '');
    }
    setTimeError(null);
    setConfirmingDelete(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [target, timeZone]);

  useEffect(
    () => () => {
      if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
    },
    [],
  );

  const isEdit = target?.mode === 'edit';
  const roster = rosterQuery.data?.practitioners;

  /** What can be chosen. An existing block keeps its own calendar listed, so opening one never moves it. */
  const options = useMemo(() => {
    const list = blockable.map((c) => ({ id: c.id, label: c.name }));
    if (isEdit && calendarId && !list.some((c) => c.id === calendarId)) {
      const own = roster?.find((c) => c.id === calendarId);
      const label = own ? (own.is_active === false ? `${own.name} (paused)` : own.name) : 'This calendar';
      return [{ id: calendarId, label }, ...list];
    }
    return list;
  }, [blockable, isEdit, calendarId, roster]);

  // Until the calendars load, or if the one in view is not theirs to block, start on the first they may.
  const selectedCalendarId = isEdit ? calendarId : defaultBlockCalendarId(options, calendarId);
  const selectedCalendarName = options.find((c) => c.id === selectedCalendarId)?.label;

  function validate(): boolean {
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      setTimeError('End time must be after start time.');
      return false;
    }
    setTimeError(null);
    return true;
  }

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  async function handleSave() {
    if (!target || !selectedCalendarId || !validate()) return;
    try {
      // Send times as HH:mm — the create route validates `HH:mm` exactly (it
      // rejects a seconds suffix with "Invalid request"), and the edit route
      // accepts HH:mm too. `startTime`/`endTime` are already HH:mm.
      if (target.mode === 'create') {
        await createMutation.mutateAsync({
          practitioner_id: selectedCalendarId,
          block_date: date,
          start_time: startTime,
          end_time: endTime,
          reason: reason.trim() || undefined,
        });
      } else {
        await updateMutation.mutateAsync({
          id: target.blockId,
          practitioner_id: selectedCalendarId,
          block_date: date,
          start_time: startTime,
          end_time: endTime,
          reason: reason.trim() || null,
        });
      }
      hapticSuccess();
      toast.success(
        blockSavedMessage({
          edited: target.mode === 'edit',
          calendarName: selectedCalendarName,
          date,
          startTime,
          endTime,
        }),
      );
      onClose();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not save the block. Please try again.');
    }
  }

  // Two-step confirm (arm → confirm within 4s) — Alert.alert is a no-op on web.
  async function handleDelete() {
    if (!target || target.mode !== 'edit') return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      hapticWarning();
      if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
      deleteConfirmTimer.current = setTimeout(() => setConfirmingDelete(false), CONFIRM_ARM_MS);
      return;
    }
    if (deleteConfirmTimer.current) clearTimeout(deleteConfirmTimer.current);
    setConfirmingDelete(false);
    try {
      await deleteMutation.mutateAsync(target.blockId);
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      toast.error(e instanceof ApiError ? e.message : 'Could not delete the block. Please try again.');
    }
  }

  return (
    // `fill` with a scrolling body and pinned buttons: however many calendars a venue has, Save stays
    // on screen (components/ui/sheet-scroll-contract.test.ts).
    <Sheet visible={!!target} onClose={onClose} maxHeight="70%" fill>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text variant="overline" tone="muted">
            {isEdit ? 'Edit block' : 'Block time'}
          </Text>
          <Text variant="title">{isEdit ? 'Edit time block' : 'Add time block'}</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text variant="label" tone="secondary">
              Calendar
            </Text>
            {options.length === 1 ? (
              <Text variant="body">{options[0]!.label}</Text>
            ) : (
              <View style={styles.calendarChips}>
                {options.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.label}
                    selected={c.id === selectedCalendarId}
                    onPress={() => setCalendarId(c.id)}
                  />
                ))}
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text variant="label" tone="secondary">
              Date
            </Text>
            <DatePickerField value={date} onChange={setDate} accessibilityLabel="Block date" />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.timeField]}>
              <Text variant="label" tone="secondary">
                Start
              </Text>
              <TimePickerField
                value={toMinutes(startTime)}
                onChange={(mins) => {
                  const start = minutesToTime(mins);
                  setStartTime(start);
                  // A start moved past the end takes the end with it, rather than leaving an error to fix.
                  if (toMinutes(endTime) <= mins) setEndTime(defaultBlockEnd(start));
                  setTimeError(null);
                }}
                accessibilityLabel="Block start time"
              />
            </View>
            <View style={[styles.field, styles.timeField]}>
              <Text variant="label" tone="secondary">
                End
              </Text>
              <TimePickerField
                value={toMinutes(endTime)}
                onChange={(mins) => {
                  setEndTime(minutesToTime(mins));
                  setTimeError(null);
                }}
                accessibilityLabel="Block end time"
              />
            </View>
          </View>

          {timeError ? (
            <Text variant="caption" tone="danger">
              {timeError}
            </Text>
          ) : null}

          <Input
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Lunch break"
            autoCorrect={false}
            maxLength={BLOCK_REASON_MAX_LENGTH}
          />
        </ScrollView>

        <View style={styles.actions}>
          {isEdit ? (
            <Button
              label={confirmingDelete ? 'Tap to confirm' : 'Delete'}
              variant="danger"
              onPress={() => void handleDelete()}
              loading={deleteMutation.isPending}
              disabled={isPending}
              style={styles.actionBtn}
            />
          ) : (
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onClose}
              disabled={isPending}
              style={styles.actionBtn}
            />
          )}
          <Button
            label={isEdit ? 'Save' : 'Block time'}
            onPress={() => void handleSave()}
            loading={createMutation.isPending || updateMutation.isPending}
            disabled={isPending || !selectedCalendarId || !date}
            style={styles.actionBtn}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.sm,
  },
  calendarChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeField: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
});

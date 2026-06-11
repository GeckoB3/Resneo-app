import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateBlock, useDeleteBlock } from '@/lib/queries/useAvailabilityManage';
import { useUpdateBlock } from '@/lib/queries/useUpdateBlock';
import { spacing } from '@/theme/index';

export type BlockTarget =
  | {
      mode: 'create';
      practitionerId: string;
      date: string;
      /** Pre-filled start time HH:mm */
      startTime: string;
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

/** Parse "HH:mm" or "HH:mm:ss" → { hours, minutes } */
function parseTime(time: string): { hours: number; minutes: number } {
  const parts = time.split(':');
  return {
    hours: Number(parts[0] ?? 0),
    minutes: Number(parts[1] ?? 0),
  };
}

/** { hours, minutes } → "HH:mm" */
function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Add 30 minutes to a "HH:mm" string, capped at "23:30". */
function add30(time: string): string {
  const { hours, minutes } = parseTime(time);
  const total = Math.min(hours * 60 + minutes + 30, 23 * 60 + 30);
  return formatTime(Math.floor(total / 60), total % 60);
}

/** Bottom sheet for creating or editing a practitioner time block. */
export function BlockEditSheet({ target, onClose }: BlockEditSheetProps) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);

  const createMutation = useCreateBlock();
  const updateMutation = useUpdateBlock();
  const deleteMutation = useDeleteBlock();

  // Seed form state when target changes
  useEffect(() => {
    if (!target) return;
    if (target.mode === 'create') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
      setStartTime(target.startTime.slice(0, 5));
      setEndTime(add30(target.startTime.slice(0, 5)));
      setReason('');
    } else {
      setStartTime(target.startTime.slice(0, 5));
      setEndTime(target.endTime.slice(0, 5));
      setReason(target.reason ?? '');
    }
    setTimeError(null);
  }, [target]);

  function validate(): boolean {
    const { hours: sh, minutes: sm } = parseTime(startTime);
    const { hours: eh, minutes: em } = parseTime(endTime);
    if (eh * 60 + em <= sh * 60 + sm) {
      setTimeError('End time must be after start time.');
      return false;
    }
    setTimeError(null);
    return true;
  }

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  async function handleSave() {
    if (!target || !validate()) return;
    try {
      if (target.mode === 'create') {
        await createMutation.mutateAsync({
          practitioner_id: target.practitionerId,
          block_date: target.date,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          reason: reason.trim() || undefined,
        });
      } else {
        await updateMutation.mutateAsync({
          id: target.blockId,
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          reason: reason.trim() || null,
        });
      }
      hapticSuccess();
      onClose();
    } catch (e) {
      hapticWarning();
      Alert.alert(
        'Could not save block',
        e instanceof ApiError ? e.message : 'Please try again.',
      );
    }
  }

  function handleDelete() {
    if (!target || target.mode !== 'edit') return;
    Alert.alert('Delete block', 'Remove this time block?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMutation.mutateAsync(target.blockId);
            hapticSuccess();
            onClose();
          } catch (e) {
            hapticWarning();
            Alert.alert(
              'Could not delete',
              e instanceof ApiError ? e.message : 'Please try again.',
            );
          }
        },
      },
    ]);
  }

  const isEdit = target?.mode === 'edit';

  return (
    <Sheet visible={!!target} onClose={onClose}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text variant="overline" tone="muted">
            {isEdit ? 'Edit block' : 'Block time'}
          </Text>
          <Text variant="title">{isEdit ? 'Edit time block' : 'Add time block'}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.timeField}>
            <Input
              label="Start"
              value={startTime}
              onChangeText={(v) => { setStartTime(v); setTimeError(null); }}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              maxLength={5}
            />
          </View>
          <View style={styles.timeDash}>
            <Text variant="body" tone="muted" style={styles.dash}>
              –
            </Text>
          </View>
          <View style={styles.timeField}>
            <Input
              label="End"
              value={endTime}
              onChangeText={(v) => { setEndTime(v); setTimeError(null); }}
              placeholder="09:30"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              maxLength={5}
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
          maxLength={120}
        />

        <View style={styles.actions}>
          {isEdit ? (
            <Button
              label="Delete"
              variant="danger"
              onPress={handleDelete}
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
            disabled={isPending}
            style={styles.actionBtn}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  timeField: {
    flex: 1,
  },
  timeDash: {
    paddingBottom: spacing.md,
  },
  dash: {
    lineHeight: 44,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
});

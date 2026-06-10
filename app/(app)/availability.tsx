import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { minutesToTime } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCalendarBlocks,
  useCreateBlock,
  useCreateLeave,
  useDeleteBlock,
  useDeleteLeave,
  usePractitionerLeave,
} from '@/lib/queries/useAvailabilityManage';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LeaveType } from '@/types/availability-manage';

const RANGE_DAYS = 14;
const STEP_MINUTES = 15;
const MAX_MINUTES = 23 * 60 + 45;

function Stepper({
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
    <View style={styles.stepperRow}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View style={styles.stepperControl}>
        <Pressable
          onPress={onDecrement}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          style={({ pressed }) => [
            styles.stepButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.stepSymbol, { color: colors.brand }]}>−</Text>
        </Pressable>
        <Text variant="subheading" style={styles.stepperValue}>
          {value}
        </Text>
        <Pressable
          onPress={onIncrement}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          style={({ pressed }) => [
            styles.stepButton,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.stepSymbol, { color: colors.brand }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

type SheetKind = 'block' | 'leave' | null;

export default function AvailabilityScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const to = addDaysToDateStr(today, RANGE_DAYS - 1);

  const practitionersQuery = usePractitioners();
  const blocksQuery = useCalendarBlocks(today, to);
  const leaveQuery = usePractitionerLeave(today, to);
  const createBlock = useCreateBlock();
  const deleteBlock = useDeleteBlock();
  const createLeave = useCreateLeave();
  const deleteLeave = useDeleteLeave();

  const practitioners = practitionersQuery.data?.practitioners ?? [];
  const practitionerName = (id: string | null) =>
    practitioners.find((p) => p.id === id)?.name ?? 'Staff member';

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startMinutes, setStartMinutes] = useState(12 * 60);
  const [endMinutes, setEndMinutes] = useState(13 * 60);
  const [reason, setReason] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [error, setError] = useState<string | null>(null);

  const openSheet = (kind: Exclude<SheetKind, null>) => {
    setPractitionerId(practitioners[0]?.id ?? null);
    setDate(today);
    setEndDate(today);
    setStartMinutes(12 * 60);
    setEndMinutes(13 * 60);
    setReason('');
    setLeaveType('annual');
    setError(null);
    setSheet(kind);
  };

  async function handleCreate() {
    if (!practitionerId) return;
    setError(null);
    try {
      if (sheet === 'block') {
        if (endMinutes <= startMinutes) {
          setError('End time must be after the start time.');
          return;
        }
        await createBlock.mutateAsync({
          practitioner_id: practitionerId,
          block_date: date,
          start_time: minutesToTime(startMinutes),
          end_time: minutesToTime(endMinutes),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      } else {
        if (endDate < date) {
          setError('End date must be on or after the start date.');
          return;
        }
        await createLeave.mutateAsync({
          practitioner_id: practitionerId,
          start_date: date,
          end_date: endDate,
          leave_type: leaveType,
          ...(reason.trim() ? { notes: reason.trim() } : {}),
        });
      }
      hapticSuccess();
      setSheet(null);
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    }
  }

  const confirmDelete = (label: string, run: () => void) => {
    Alert.alert(label, undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run },
    ]);
  };

  const blocks = (blocksQuery.data?.blocks ?? []).filter((b) => !b.class_instance_id);
  const leave = leaveQuery.data?.periods ?? [];
  const isLoading = blocksQuery.isLoading || leaveQuery.isLoading;
  const isError = blocksQuery.isError || leaveQuery.isError;
  const saving = createBlock.isPending || createLeave.isPending;

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ title: 'Availability' }} />

      {isLoading ? (
        <DetailSkeleton />
      ) : isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              blocksQuery.error instanceof ApiError
                ? blocksQuery.error.message
                : 'Could not load availability.'
            }
            onRetry={() => {
              void blocksQuery.refetch();
              void leaveQuery.refetch();
            }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={blocksQuery.isRefetching || leaveQuery.isRefetching}
              onRefresh={() => {
                void blocksQuery.refetch();
                void leaveQuery.refetch();
              }}
            />
          }>
          <View style={styles.actionRow}>
            <Button label="Block time" style={styles.flex1} onPress={() => openSheet('block')} />
            <Button
              label="Add leave"
              variant="secondary"
              style={styles.flex1}
              onPress={() => openSheet('leave')}
            />
          </View>
          <Text variant="caption" tone="muted">
            Next {RANGE_DAYS} days. Working-hours setup stays on the web dashboard.
          </Text>

          <Card>
            <Text variant="label">Time blocks</Text>
            {blocks.length === 0 ? (
              <EmptyState title="No blocks" message="Blocked-out time will appear here." />
            ) : (
              <View style={styles.list}>
                {blocks.map((block) => (
                  <View key={block.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                    <View style={styles.rowBody}>
                      <Text variant="bodyMedium">
                        {formatDayHeading(block.block_date)} · {block.start_time.slice(0, 5)}–
                        {block.end_time.slice(0, 5)}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {practitionerName(block.practitioner_id ?? block.calendar_id)}
                        {block.reason ? ` · ${block.reason}` : ''}
                      </Text>
                    </View>
                    <Button
                      label="Remove"
                      variant="ghost"
                      size="sm"
                      loading={deleteBlock.isPending}
                      onPress={() =>
                        confirmDelete('Remove this block?', () => deleteBlock.mutate(block.id))
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <Text variant="label">Leave</Text>
            {leave.length === 0 ? (
              <EmptyState title="No leave booked" message="Leave periods will appear here." />
            ) : (
              <View style={styles.list}>
                {leave.map((period) => (
                  <View key={period.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                    <View style={styles.rowBody}>
                      <Text variant="bodyMedium">
                        {formatDayHeading(period.start_date)}
                        {period.end_date !== period.start_date
                          ? ` → ${formatDayHeading(period.end_date)}`
                          : ''}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {period.practitioner_name ?? practitionerName(period.practitioner_id)} ·{' '}
                        {period.leave_type}
                        {period.notes ? ` · ${period.notes}` : ''}
                      </Text>
                    </View>
                    <Button
                      label="Remove"
                      variant="ghost"
                      size="sm"
                      loading={deleteLeave.isPending}
                      onPress={() =>
                        confirmDelete('Remove this leave?', () => deleteLeave.mutate(period.id))
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </Card>
          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* Create sheet (block / leave) */}
      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} accessibilityLabel="Dismiss" />
          <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.sheetContent}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <Text variant="overline" tone="muted">
                {sheet === 'block' ? 'Block time' : 'Add leave'}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}>
                {practitioners.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={practitionerId === p.id}
                    onPress={() => setPractitionerId(p.id)}
                  />
                ))}
              </ScrollView>

              <Stepper
                label={sheet === 'leave' ? 'From' : 'Date'}
                value={formatDayHeading(date)}
                onDecrement={() => setDate((d) => addDaysToDateStr(d, -1))}
                onIncrement={() => setDate((d) => addDaysToDateStr(d, 1))}
              />
              {sheet === 'leave' ? (
                <Stepper
                  label="To"
                  value={formatDayHeading(endDate)}
                  onDecrement={() => setEndDate((d) => addDaysToDateStr(d, -1))}
                  onIncrement={() => setEndDate((d) => addDaysToDateStr(d, 1))}
                />
              ) : (
                <>
                  <Stepper
                    label="Start"
                    value={minutesToTime(startMinutes)}
                    onDecrement={() => setStartMinutes((m) => Math.max(0, m - STEP_MINUTES))}
                    onIncrement={() => setStartMinutes((m) => Math.min(MAX_MINUTES, m + STEP_MINUTES))}
                  />
                  <Stepper
                    label="End"
                    value={minutesToTime(endMinutes)}
                    onDecrement={() => setEndMinutes((m) => Math.max(0, m - STEP_MINUTES))}
                    onIncrement={() => setEndMinutes((m) => Math.min(MAX_MINUTES, m + STEP_MINUTES))}
                  />
                </>
              )}

              {sheet === 'leave' ? (
                <Segmented
                  options={[
                    { value: 'annual', label: 'Annual' },
                    { value: 'sick', label: 'Sick' },
                    { value: 'other', label: 'Other' },
                  ]}
                  value={leaveType}
                  onChange={setLeaveType}
                />
              ) : null}

              <Input
                label={sheet === 'block' ? 'Reason (optional)' : 'Notes (optional)'}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
              />

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <View style={styles.actionRow}>
                <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={() => setSheet(null)} />
                <Button
                  label="Save"
                  style={styles.flex1}
                  loading={saving}
                  disabled={!practitionerId}
                  onPress={() => void handleCreate()}
                />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  list: {
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.surface,
    borderTopRightRadius: radius.surface,
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  stepperValue: {
    minWidth: 132,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 26,
  },
});

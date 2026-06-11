import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { BreaksEditor } from '@/components/availability/BreaksEditor';
import { TeamLeaveCalendar } from '@/components/availability/TeamLeaveCalendar';
import { WorkingHoursEditor } from '@/components/availability/WorkingHoursEditor';
import { minutesToTime } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
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
  useUpdateBlock,
  useUpdateLeave,
} from '@/lib/queries/useAvailabilityManage';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  BreakTimesByDayMap,
  LeavePeriod,
  LeaveType,
  WorkingHoursMap,
} from '@/types/availability-manage';


const RANGE_DAYS = 90;
const STEP_MINUTES = 15;
const MAX_MINUTES = 23 * 60 + 45;

// ---- Leave type display labels (web parity) --------------------------------
const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Closed',
  sick: 'Unavailable',
  other: 'Other',
};

function leaveTypeLabel(t: string): string {
  return LEAVE_TYPE_LABELS[t] ?? t;
}

// ---- Stepper primitive ------------------------------------------------------
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

// ---- Sheet mode types -------------------------------------------------------
type SheetKind = 'block' | 'leave' | 'hours' | 'breaks' | null;
type BlockType = 'allday' | 'window';

export default function AvailabilityScreen() {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const to = addDaysToDateStr(today, RANGE_DAYS - 1);

  const staffQuery = useStaffMe();
  const staff = staffQuery.data?.staff;
  const isAdmin = staff?.role === 'admin';

  const practitionersQuery = usePractitioners();
  const practitioners = useMemo(
    () => practitionersQuery.data?.practitioners ?? [],
    [practitionersQuery.data?.practitioners],
  );

  // Practitioner filter (null = all)
  const [filterPractitionerId, setFilterPractitionerId] = useState<string | null>(null);

  const blocksQuery = useCalendarBlocks(today, to, filterPractitionerId);
  const leaveQuery = usePractitionerLeave(today, to, filterPractitionerId);

  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();
  const deleteBlock = useDeleteBlock();
  const createLeave = useCreateLeave();
  const updateLeave = useUpdateLeave();
  const deleteLeave = useDeleteLeave();

  // Track per-id pending deletes to prevent double-delete and scope loading state
  const [deletingBlockIds, setDeletingBlockIds] = useState<Set<string>>(new Set());
  const [deletingLeaveIds, setDeletingLeaveIds] = useState<Set<string>>(new Set());

  const practitionerName = useCallback(
    (id: string | null) =>
      id ? (practitioners.find((p) => p.id === id)?.name ?? 'Calendar') : 'Staff member',
    [practitioners],
  );

  // ---- Sheet state -----------------------------------------------------------
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  // Block/leave form
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [blockType, setBlockType] = useState<BlockType>('allday');
  const [startMinutes, setStartMinutes] = useState(12 * 60);
  const [endMinutes, setEndMinutes] = useState(13 * 60);
  const [reason, setReason] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Hours/breaks sheet
  const [hoursTargetId, setHoursTargetId] = useState<string | null>(null);

  // ---- Helpers ---------------------------------------------------------------
  function defaultPractitionerId(): string | null {
    // Non-admin: default to own calendar
    if (!isAdmin && staff?.linked_calendar_ids?.length) {
      return staff.linked_calendar_ids[0] ?? null;
    }
    return practitioners[0]?.id ?? null;
  }

  function openSheet(kind: 'block' | 'leave') {
    setEditingBlockId(null);
    setEditingLeaveId(null);
    setPractitionerId(defaultPractitionerId());
    setApplyToAll(false);
    setDate(today);
    setEndDate(today);
    setBlockType('allday');
    setStartMinutes(12 * 60);
    setEndMinutes(13 * 60);
    setReason('');
    setLeaveType('annual');
    setSheetError(null);
    setSheet(kind);
  }

  function openEditBlock(id: string) {
    const block = (blocksQuery.data?.blocks ?? []).find((b) => b.id === id);
    if (!block) return;
    setEditingBlockId(id);
    setEditingLeaveId(null);
    setPractitionerId(block.practitioner_id ?? block.calendar_id);
    setDate(block.block_date);
    setStartMinutes(timeStringToMinutes(block.start_time));
    setEndMinutes(timeStringToMinutes(block.end_time));
    setReason(block.reason ?? '');
    setSheetError(null);
    setSheet('block');
  }

  function openEditLeave(period: LeavePeriod) {
    setEditingLeaveId(period.id);
    setEditingBlockId(null);
    setPractitionerId(period.practitioner_id);
    setDate(period.start_date);
    setEndDate(period.end_date);
    setLeaveType((period.leave_type as LeaveType) || 'annual');
    setReason(period.notes ?? '');
    if (period.unavailable_start_time && period.unavailable_end_time) {
      setBlockType('window');
      setStartMinutes(timeStringToMinutes(period.unavailable_start_time));
      setEndMinutes(timeStringToMinutes(period.unavailable_end_time));
    } else {
      setBlockType('allday');
      setStartMinutes(12 * 60);
      setEndMinutes(13 * 60);
    }
    setApplyToAll(false);
    setSheetError(null);
    setSheet('leave');
  }

  function openHoursSheet(practId: string) {
    setHoursTargetId(practId);
    setSheet('hours');
  }

  function openBreaksSheet(practId: string) {
    setHoursTargetId(practId);
    setSheet('breaks');
  }

  // ---- Create / update handler -----------------------------------------------
  async function handleSave() {
    if (!practitionerId && !applyToAll) {
      setSheetError('Please select a practitioner.');
      return;
    }
    setSheetError(null);

    try {
      if (sheet === 'block') {
        if (endMinutes <= startMinutes) {
          setSheetError('End time must be after the start time.');
          return;
        }
        const payload = {
          block_date: date,
          start_time: minutesToTime(startMinutes),
          end_time: minutesToTime(endMinutes),
          reason: reason.trim() || null,
        };
        if (editingBlockId) {
          await updateBlock.mutateAsync({ blockId: editingBlockId, ...payload });
        } else {
          await createBlock.mutateAsync({
            practitioner_id: practitionerId!,
            block_date: payload.block_date,
            start_time: payload.start_time,
            end_time: payload.end_time,
            ...(payload.reason ? { reason: payload.reason } : {}),
          });
        }
      } else {
        // leave
        if (endDate < date) {
          setSheetError('End date must be on or after the start date.');
          return;
        }
        if (blockType === 'window' && endMinutes <= startMinutes) {
          setSheetError('End time must be after the start time.');
          return;
        }
        const unavailableStart =
          blockType === 'window' ? minutesToTime(startMinutes) : null;
        const unavailableEnd =
          blockType === 'window' ? minutesToTime(endMinutes) : null;

        if (editingLeaveId) {
          await updateLeave.mutateAsync({
            id: editingLeaveId,
            start_date: date,
            end_date: endDate,
            leave_type: leaveType,
            notes: reason.trim() || null,
            unavailable_start_time: unavailableStart,
            unavailable_end_time: unavailableEnd,
          });
        } else {
          await createLeave.mutateAsync({
            ...(applyToAll
              ? { apply_to_all_active: true }
              : { practitioner_id: practitionerId! }),
            start_date: date,
            end_date: endDate,
            leave_type: leaveType,
            ...(reason.trim() ? { notes: reason.trim() } : {}),
            unavailable_start_time: unavailableStart,
            unavailable_end_time: unavailableEnd,
          });
        }
      }

      hapticSuccess();
      setSheet(null);
    } catch (e) {
      hapticWarning();
      setSheetError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    }
  }

  // ---- Delete handlers -------------------------------------------------------
  const confirmDelete = (label: string, run: () => void) => {
    Alert.alert(label, undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: run },
    ]);
  };

  function handleDeleteBlock(blockId: string) {
    confirmDelete('Remove this block?', async () => {
      if (deletingBlockIds.has(blockId)) return;
      setDeletingBlockIds((prev) => new Set(prev).add(blockId));
      try {
        await deleteBlock.mutateAsync(blockId);
        hapticSuccess();
      } catch (e) {
        hapticWarning();
        Alert.alert(
          'Could not remove',
          e instanceof ApiError ? e.message : 'An error occurred.',
        );
      } finally {
        setDeletingBlockIds((prev) => {
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
      }
    });
  }

  function handleDeleteLeave(leaveId: string) {
    confirmDelete('Remove this leave?', async () => {
      if (deletingLeaveIds.has(leaveId)) return;
      setDeletingLeaveIds((prev) => new Set(prev).add(leaveId));
      try {
        await deleteLeave.mutateAsync(leaveId);
        hapticSuccess();
      } catch (e) {
        hapticWarning();
        Alert.alert(
          'Could not remove',
          e instanceof ApiError ? e.message : 'An error occurred.',
        );
      } finally {
        setDeletingLeaveIds((prev) => {
          const next = new Set(prev);
          next.delete(leaveId);
          return next;
        });
      }
    });
  }

  // ---- Derived data ----------------------------------------------------------
  const blocks = (blocksQuery.data?.blocks ?? []).filter((b) => !b.class_instance_id);
  const leave = leaveQuery.data?.periods ?? [];
  const isLoading = blocksQuery.isLoading || leaveQuery.isLoading || practitionersQuery.isLoading;
  const isError = blocksQuery.isError || leaveQuery.isError;
  const saving =
    createBlock.isPending ||
    updateBlock.isPending ||
    createLeave.isPending ||
    updateLeave.isPending;

  const hoursTarget = practitioners.find((p) => p.id === hoursTargetId);

  // ---- Render ----------------------------------------------------------------
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

          {/* Filter chips */}
          {practitioners.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}>
              <Chip
                label="All"
                selected={filterPractitionerId === null}
                onPress={() => setFilterPractitionerId(null)}
              />
              {practitioners.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={filterPractitionerId === p.id}
                  onPress={() =>
                    setFilterPractitionerId((prev) => (prev === p.id ? null : p.id))
                  }
                />
              ))}
            </ScrollView>
          ) : null}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Button
              label="Block time"
              style={styles.flex1}
              onPress={() => openSheet('block')}
            />
            <Button
              label="Add leave"
              variant="secondary"
              style={styles.flex1}
              onPress={() => openSheet('leave')}
            />
          </View>
          {/* Team leave calendar — whole team's time off, month view (web parity) */}
          <TeamLeaveCalendar
            today={today}
            filterPractitionerId={filterPractitionerId}
            onEditLeave={openEditLeave}
            onDeleteLeave={handleDeleteLeave}
            deletingLeaveIds={deletingLeaveIds}
          />

          <Text variant="caption" tone="muted">
            Next {RANGE_DAYS} days
          </Text>

          {/* Time blocks card */}
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
                    <View style={styles.rowActions}>
                      <Button
                        label="Edit"
                        variant="ghost"
                        size="sm"
                        onPress={() => openEditBlock(block.id)}
                      />
                      <Button
                        label="Remove"
                        variant="ghost"
                        size="sm"
                        loading={deletingBlockIds.has(block.id)}
                        disabled={deletingBlockIds.has(block.id)}
                        onPress={() => handleDeleteBlock(block.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Leave card */}
          <Card>
            <Text variant="label">Leave / Unavailability</Text>
            {leave.length === 0 ? (
              <EmptyState title="No leave booked" message="Leave periods will appear here." />
            ) : (
              <View style={styles.list}>
                {leave.map((period) => {
                  const isPartial =
                    period.unavailable_start_time && period.unavailable_end_time;
                  return (
                    <View key={period.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                      <View style={styles.rowBody}>
                        <Text variant="bodyMedium">
                          {formatDayHeading(period.start_date)}
                          {period.end_date !== period.start_date
                            ? ` → ${formatDayHeading(period.end_date)}`
                            : ''}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {period.practitioner_name ?? practitionerName(period.practitioner_id)} ·{' '}
                          {leaveTypeLabel(period.leave_type)}
                          {isPartial
                            ? ` · ${period.unavailable_start_time?.slice(0, 5)}–${period.unavailable_end_time?.slice(0, 5)} (window)`
                            : ''}
                          {period.notes ? ` · ${period.notes}` : ''}
                        </Text>
                      </View>
                      <View style={styles.rowActions}>
                        <Button
                          label="Edit"
                          variant="ghost"
                          size="sm"
                          onPress={() => openEditLeave(period)}
                        />
                        <Button
                          label="Remove"
                          variant="ghost"
                          size="sm"
                          loading={deletingLeaveIds.has(period.id)}
                          disabled={deletingLeaveIds.has(period.id)}
                          onPress={() => handleDeleteLeave(period.id)}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Card>

          {/* Working hours & breaks — one card per practitioner */}
          {practitioners.length > 0 ? (
            <Card>
              <Text variant="label">Working hours & breaks</Text>
              <View style={styles.list}>
                {practitioners
                  .filter((p) =>
                    filterPractitionerId ? p.id === filterPractitionerId : true,
                  )
                  .map((p) => (
                    <View
                      key={p.id}
                      style={[styles.row, { borderBottomColor: colors.border }]}>
                      <View style={styles.rowBody}>
                        <Text variant="bodyMedium">{p.name}</Text>
                        <Text variant="caption" tone="muted">
                          {p.is_active ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                      <View style={styles.rowActions}>
                        <Button
                          label="Hours"
                          variant="ghost"
                          size="sm"
                          onPress={() => openHoursSheet(p.id)}
                        />
                        <Button
                          label="Breaks"
                          variant="ghost"
                          size="sm"
                          onPress={() => openBreaksSheet(p.id)}
                        />
                      </View>
                    </View>
                  ))}
              </View>
            </Card>
          ) : null}

          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* Block / Leave create + edit sheet */}
      <Sheet
        visible={sheet === 'block' || sheet === 'leave'}
        onClose={() => setSheet(null)}
        maxHeight="92%">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetBody}>
          <Text variant="overline" tone="muted">
            {sheet === 'block'
              ? editingBlockId
                ? 'Edit block'
                : 'Block time'
              : editingLeaveId
                ? 'Edit leave'
                : 'Add leave'}
          </Text>

          {/* Apply to all — admin only, create only */}
          {sheet === 'leave' && isAdmin && !editingLeaveId ? (
            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Apply to all practitioners</Text>
              <Switch
                value={applyToAll}
                onValueChange={setApplyToAll}
                trackColor={{ true: colors.brand, false: colors.border }}
                thumbColor={colors.surfaceRaised}
              />
            </View>
          ) : null}

          {/* Practitioner chips — hidden when applying to all or editing leave (can't change owner) */}
          {!(sheet === 'leave' && applyToAll) && !editingLeaveId ? (
            practitioners.length > 0 ? (
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
            ) : (
              <Text variant="bodySmall" tone="muted">
                No practitioners found. Add practitioners on the web dashboard first.
              </Text>
            )
          ) : null}

          {/* Date stepper(s) */}
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

          {/* Leave-specific: type + block type (all-day vs window) */}
          {sheet === 'leave' ? (
            <>
              <Segmented
                options={[
                  { value: 'annual', label: 'Closed' },
                  { value: 'sick', label: 'Unavailable' },
                  { value: 'other', label: 'Other' },
                ]}
                value={leaveType}
                onChange={setLeaveType}
              />
              <Segmented
                options={[
                  { value: 'allday', label: 'All day' },
                  { value: 'window', label: 'Time window' },
                ]}
                value={blockType}
                onChange={setBlockType}
              />
              {blockType === 'window' ? (
                <>
                  <Stepper
                    label="Window start"
                    value={minutesToTime(startMinutes)}
                    onDecrement={() =>
                      setStartMinutes((m) => Math.max(0, m - STEP_MINUTES))
                    }
                    onIncrement={() =>
                      setStartMinutes((m) => Math.min(MAX_MINUTES, m + STEP_MINUTES))
                    }
                  />
                  <Stepper
                    label="Window end"
                    value={minutesToTime(endMinutes)}
                    onDecrement={() =>
                      setEndMinutes((m) => Math.max(0, m - STEP_MINUTES))
                    }
                    onIncrement={() =>
                      setEndMinutes((m) => Math.min(MAX_MINUTES, m + STEP_MINUTES))
                    }
                  />
                </>
              ) : null}
            </>
          ) : null}

          <Input
            label={sheet === 'block' ? 'Reason (optional)' : 'Notes (optional)'}
            value={reason}
            onChangeText={setReason}
            maxLength={200}
          />

          {sheetError ? (
            <Text variant="bodySmall" tone="danger">
              {sheetError}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <Button
              label="Cancel"
              variant="secondary"
              style={styles.flex1}
              onPress={() => setSheet(null)}
            />
            <Button
              label={editingBlockId || editingLeaveId ? 'Update' : 'Save'}
              style={styles.flex1}
              loading={saving}
              disabled={!applyToAll && !practitionerId && !editingLeaveId}
              onPress={() => void handleSave()}
            />
          </View>
        </ScrollView>
      </Sheet>

      {/* Working hours sheet */}
      <Sheet
        visible={sheet === 'hours'}
        onClose={() => setSheet(null)}
        fill
        maxHeight="92%">
        {hoursTarget ? (
          <WorkingHoursEditor
            practitionerId={hoursTarget.id}
            practitionerName={hoursTarget.name}
            currentWorkingHours={
              (hoursTarget as unknown as { working_hours?: WorkingHoursMap }).working_hours
            }
            onClose={() => setSheet(null)}
          />
        ) : null}
      </Sheet>

      {/* Breaks sheet */}
      <Sheet
        visible={sheet === 'breaks'}
        onClose={() => setSheet(null)}
        fill
        maxHeight="92%">
        {hoursTarget ? (
          <BreaksEditor
            practitionerId={hoursTarget.id}
            practitionerName={hoursTarget.name}
            currentBreaksByDay={
              (hoursTarget as unknown as { break_times_by_day?: BreakTimesByDayMap | null })
                .break_times_by_day
            }
            onClose={() => setSheet(null)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  filterRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
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
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  spacer: {
    height: spacing.xl,
  },
  stateWrap: {
    flex: 1,
    padding: spacing.base,
  },
  sheetBody: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    width: minTouchTarget,
    height: minTouchTarget,
    minWidth: minTouchTarget,
    borderRadius: 9999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSymbol: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: fonts.bold,
  },
});

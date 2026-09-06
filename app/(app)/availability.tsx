import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { BreaksEditor } from '@/components/availability/BreaksEditor';
import { ScheduleTimelineSheet } from '@/components/availability/ScheduleTimelineSheet';
import { TeamLeaveCalendar } from '@/components/availability/TeamLeaveCalendar';
import { WorkingHoursEditor } from '@/components/availability/WorkingHoursEditor';
import { minutesToTime } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  describePeriod,
  describeScheduleSource,
  resolveScheduleForDate,
  schedulePeriodHasEnded,
  scheduleForRow,
} from '@/lib/calendar/working-hours-rota';
import { addDaysToDateStr, formatDayHeading } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  appointmentCalendarsOf,
  isResourceCalendar,
} from '@/lib/calendar/schedule-calendars';
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
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, minTouchTarget, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  BreakTimesByDayMap,
  LeavePeriod,
  LeaveType,
  TimeRange,
  WorkingHoursMap,
} from '@/types/availability-manage';
import type { Practitioner, PractitionerTimeRange } from '@/types/practitioner';


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

// ---- Working-hours / breaks summaries (web parity: at-a-glance schedule) -----
const WH_DAYS: { key: string; short: string }[] = [
  { key: '1', short: 'Mon' },
  { key: '2', short: 'Tue' },
  { key: '3', short: 'Wed' },
  { key: '4', short: 'Thu' },
  { key: '5', short: 'Fri' },
  { key: '6', short: 'Sat' },
  { key: '0', short: 'Sun' },
];

function rangeSignature(ranges?: PractitionerTimeRange[] | null): string {
  if (!ranges || ranges.length === 0) return '';
  return ranges.map((r) => `${r.start.slice(0, 5)}–${r.end.slice(0, 5)}`).join(', ');
}

/**
 * Compact weekly hours summary (e.g. "Mon–Fri 09:00–17:00 · Sat 10:00–14:00"),
 * grouping consecutive open days that share identical hours. Returns null when
 * the calendar has no open days so the caller can show a "not set" hint.
 */
function summariseWorkingHours(
  wh?: Record<string, PractitionerTimeRange[]> | null,
): string | null {
  if (!wh) return null;
  const days = WH_DAYS.map((d) => ({ short: d.short, sig: rangeSignature(wh[d.key]) }));
  if (days.every((d) => d.sig === '')) return null;
  const parts: string[] = [];
  let i = 0;
  while (i < days.length) {
    const cur = days[i]!;
    if (!cur.sig) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && days[j + 1]!.sig === cur.sig) j += 1;
    const label = i === j ? cur.short : `${days[i]!.short}–${days[j]!.short}`;
    parts.push(`${label} ${cur.sig}`);
    i = j + 1;
  }
  return parts.join(' · ');
}

/** Short list of weekdays that carry at least one break (or "Every day" for legacy). */
function summariseBreaks(p: Practitioner): string | null {
  const byDay = p.break_times_by_day;
  if (byDay && typeof byDay === 'object' && Object.keys(byDay).length > 0) {
    const daysWith = WH_DAYS.filter((d) => (byDay[d.key]?.length ?? 0) > 0).map((d) => d.short);
    return daysWith.length > 0 ? daysWith.join(', ') : null;
  }
  if (Array.isArray(p.break_times) && p.break_times.length > 0) return 'Every day';
  return null;
}

// ---- Section header ---------------------------------------------------------
function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {caption ? (
        <Text variant="caption" tone="muted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

// ---- Sheet mode types -------------------------------------------------------
type SheetKind = 'block' | 'leave' | 'hours' | 'breaks' | 'schedule' | null;
type BlockType = 'allday' | 'window';

export default function AvailabilityScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const to = addDaysToDateStr(today, RANGE_DAYS - 1);
  // Ended schedule changes stay in the timeline but sit behind a per-calendar
  // "Show N past changes" toggle (web 2026-09-04).
  const [pastChangesShownFor, setPastChangesShownFor] = useState<Set<string>>(() => new Set());

  const staffQuery = useStaffMe();
  const staff = staffQuery.data?.staff;
  const isAdmin = staff?.role === 'admin';

  /**
   * Resources included: a resource is a `unified_calendars` row like any other
   * and its weekly hours are the same `working_hours` column, so this is where
   * they belong (`/api/venue/resources` only aliases the column as
   * `availability_hours`). Everything on this screen that is NOT hours works on
   * `appointmentCalendars` below instead — see the note there.
   */
  const practitionersQuery = usePractitioners({ includeResources: true });
  /** Every calendar whose weekly schedule is editable here, resources included. */
  const practitioners = useMemo(
    () => practitionersQuery.data?.practitioners ?? [],
    [practitionersQuery.data?.practitioners],
  );

  /**
   * The calendars that take BOOKINGS — everything except resources.
   *
   * Hours are the one thing a resource genuinely supports. Breaks and leave are
   * not: the resource engine reads `break_times` from the host calendar row and
   * never the resource's own, and `POST /api/venue/practitioner-leave` rejects
   * a resource outright (`requireVenueHostCalendarId` filters them), so leave
   * stored against one would be invisible to every engine. Offering either
   * would be a control that saves and does nothing, which is why web excludes
   * resources from its closures panel and refuses its breaks tab for them.
   */
  const appointmentCalendars = useMemo(
    () => appointmentCalendarsOf(practitioners),
    [practitioners],
  );

  const isResourceId = useCallback(
    (id: string | null | undefined) =>
      id != null && isResourceCalendar(practitioners.find((p) => p.id === id)),
    [practitioners],
  );

  // Non-admins may only manage their OWN calendar's leave/blocks (web parity:
  // StaffLeaveCalendarPanel locks calendarId to the self calendar and hides the
  // picker). Admins manage every calendar.
  const ownCalendarIds = useMemo(
    () => new Set(staff?.linked_calendar_ids ?? []),
    [staff?.linked_calendar_ids],
  );
  const ownsCalendar = useCallback(
    (id: string | null | undefined) => isAdmin || (id != null && ownCalendarIds.has(id)),
    [isAdmin, ownCalendarIds],
  );
  // Practitioner chips a non-admin may target (self calendars only). Built from
  // `appointmentCalendars`, so leave and blocks are never offered a resource.
  const selectablePractitioners = useMemo(
    () =>
      isAdmin
        ? appointmentCalendars
        : appointmentCalendars.filter((p) => ownCalendarIds.has(p.id)),
    [isAdmin, appointmentCalendars, ownCalendarIds],
  );

  /**
   * Calendars the breaks editor may write to with "Apply to all calendars" —
   * the same permission pool as the chips, and resource-free for the reason
   * given on `appointmentCalendars`.
   */
  const breakTargets = useMemo(
    () => selectablePractitioners.map((p) => ({ id: p.id, name: p.name })),
    [selectablePractitioners],
  );

  // Legacy per-calendar "days off" — older venues stored blocked DATES (YYYY-MM-DD)
  // in `days_off`. Those still block booking but aren't editable here, so warn
  // admins to re-add them as proper closures (web parity: amber legacy banner).
  const legacyDaysOffCalendars = useMemo(
    () =>
      appointmentCalendars.filter((p) =>
        (p.days_off ?? []).some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ),
    [appointmentCalendars],
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

  // Two-step confirm for destructive removes. `Alert.alert` confirms never fire
  // on react-native-web (the dev-preview path), so arm a button then confirm.
  const [pendingConfirm, setPendingConfirm] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armConfirm = useCallback((token: string) => {
    setPendingConfirm(token);
    hapticWarning();
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setPendingConfirm(null), 4000);
  }, []);
  const clearConfirm = useCallback(() => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setPendingConfirm(null);
  }, []);
  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const practitionerName = useCallback(
    (id: string | null) =>
      id ? (practitioners.find((p) => p.id === id)?.name ?? 'Calendar') : 'Staff member',
    [practitioners],
  );

  // ---- Sheet state -----------------------------------------------------------
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  // Collapsible past-leave group (mirrors web's collapsible "Past blocks").
  const [showPastLeave, setShowPastLeave] = useState(false);

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
    // Appointment calendars only — this seeds the leave / block sheet, and
    // neither can be stored against a resource.
    return appointmentCalendars[0]?.id ?? null;
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

  /**
   * Calendar-first add: open the leave sheet prefilled with a tapped date range.
   * Same fresh-create reset as `openSheet('leave')`, but keep the chosen dates
   * (steppers below still work as a fine-adjust fallback).
   */
  function openCreateLeaveRange(startDate: string, endDate: string) {
    setEditingBlockId(null);
    setEditingLeaveId(null);
    setPractitionerId(defaultPractitionerId());
    setApplyToAll(false);
    setDate(startDate);
    setEndDate(endDate);
    setBlockType('allday');
    setStartMinutes(12 * 60);
    setEndMinutes(13 * 60);
    setReason('');
    setLeaveType('annual');
    setSheetError(null);
    setSheet('leave');
  }

  function openEditBlock(id: string) {
    const block = (blocksQuery.data?.blocks ?? []).find((b) => b.id === id);
    if (!block) return;
    // Non-admins can only edit blocks on their own calendar.
    if (!ownsCalendar(block.practitioner_id ?? block.calendar_id)) {
      toast.error('You can only edit blocks on your own calendar.');
      return;
    }
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
    // Non-admins can only edit leave on their own calendar.
    if (!ownsCalendar(period.practitioner_id)) {
      toast.error('You can only edit leave on your own calendar.');
      return;
    }
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

  /** Plan hours ahead (schedule changes, rotas, the planning calendar). */
  function openScheduleSheet(practId: string) {
    setHoursTargetId(practId);
    setSheet('schedule');
  }

  function openBreaksSheet(practId: string) {
    // Belt and braces: the row hides the button for a resource, but a break
    // written against one would save and do nothing, so never open the editor.
    if (isResourceId(practId)) return;
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
      toast.success(
        sheet === 'block'
          ? editingBlockId
            ? 'Block updated.'
            : 'Time blocked.'
          : editingLeaveId
            ? 'Leave updated.'
            : 'Leave added.',
      );
    } catch (e) {
      hapticWarning();
      setSheetError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    }
  }

  // ---- Delete handlers -------------------------------------------------------
  async function handleDeleteBlock(blockId: string) {
    clearConfirm();
    if (deletingBlockIds.has(blockId)) return;
    setDeletingBlockIds((prev) => new Set(prev).add(blockId));
    try {
      await deleteBlock.mutateAsync(blockId);
      toast.success('Block removed.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not remove. An error occurred.');
    } finally {
      setDeletingBlockIds((prev) => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });
    }
  }

  async function handleDeleteLeave(leaveId: string) {
    clearConfirm();
    if (deletingLeaveIds.has(leaveId)) return;
    setDeletingLeaveIds((prev) => new Set(prev).add(leaveId));
    try {
      await deleteLeave.mutateAsync(leaveId);
      toast.success('Leave removed.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not remove. An error occurred.');
    } finally {
      setDeletingLeaveIds((prev) => {
        const next = new Set(prev);
        next.delete(leaveId);
        return next;
      });
    }
  }

  // ---- Derived data ----------------------------------------------------------
  const blocks = (blocksQuery.data?.blocks ?? []).filter((b) => !b.class_instance_id);
  const leave = useMemo(() => leaveQuery.data?.periods ?? [], [leaveQuery.data?.periods]);

  // Upcoming first (asc), past collapsed behind a toggle (desc) — web parity.
  const upcomingLeave = useMemo(
    () =>
      leave
        .filter((p) => p.end_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [leave, today],
  );
  const pastLeave = useMemo(
    () =>
      leave
        .filter((p) => p.end_date < today)
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [leave, today],
  );
  const isLoading = blocksQuery.isLoading || leaveQuery.isLoading || practitionersQuery.isLoading;
  const isError = blocksQuery.isError || leaveQuery.isError;
  const saving =
    createBlock.isPending ||
    updateBlock.isPending ||
    createLeave.isPending ||
    updateLeave.isPending;

  const hoursTarget = practitioners.find((p) => p.id === hoursTargetId);

  // Single leave row — shared by the Upcoming and Past groups below.
  function renderLeaveRow(period: LeavePeriod) {
    const isPartial = period.unavailable_start_time && period.unavailable_end_time;
    // Non-admins can only edit/remove leave on their own calendar.
    const canManage = ownsCalendar(period.practitioner_id);
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
        {canManage ? (
          <View style={styles.rowActions}>
            <Button label="Edit" variant="ghost" size="sm" onPress={() => openEditLeave(period)} />
            <Button
              label={pendingConfirm === `leave-${period.id}` ? 'Tap to confirm' : 'Remove'}
              variant="ghost"
              size="sm"
              loading={deletingLeaveIds.has(period.id)}
              disabled={deletingLeaveIds.has(period.id)}
              onPress={() =>
                pendingConfirm === `leave-${period.id}`
                  ? void handleDeleteLeave(period.id)
                  : armConfirm(`leave-${period.id}`)
              }
            />
          </View>
        ) : null}
      </View>
    );
  }

  // Single working-hours row — name + at-a-glance weekly summary + edit actions.
  function renderHoursRow(p: Practitioner) {
    // Hours planned ahead or on a rota replace `working_hours` on the dates they
    // cover, so the summary is the shape in force THIS week, named by the rule
    // that set it; the standard weekly hours are what "Edit hours" changes.
    const schedule = scheduleForRow(p);
    const thisWeek = resolveScheduleForDate(p, today);
    // An admin may change every calendar; a staff member only those linked to
    // their account (web `canEditWorkingHoursFor`).
    const canEdit = ownsCalendar(p.id);
    const endedPeriods = schedule
      ? schedule.periods.filter((period) => schedulePeriodHasEnded(period, today))
      : [];
    const showPast = pastChangesShownFor.has(p.id);
    const listedPeriods = schedule
      ? showPast
        ? schedule.periods
        : schedule.periods.filter((period) => !schedulePeriodHasEnded(period, today))
      : [];
    const summary = summariseWorkingHours(thisWeek.hours);
    const breaks = summariseBreaks(p);
    const isResource = isResourceCalendar(p);
    return (
      <View key={p.id} style={[styles.hoursItem, { borderBottomColor: colors.border }]}>
        <View style={styles.hoursNameRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.flex1}>
            {p.name}
          </Text>
          {isResource ? (
            <Text variant="caption" tone="muted">
              Resource
            </Text>
          ) : null}
        </View>
        <Text variant="caption" tone={summary ? 'secondary' : 'muted'}>
          {summary ?? 'No working hours set'}
        </Text>
        {schedule ? (
          <View style={styles.scheduleBlock}>
            <Text variant="caption" tone="muted">
              This week · {describeScheduleSource(thisWeek.source)}
            </Text>
            {/* The change running now and any still to come. An ended change
                stays in the stored timeline (the web's planning calendar pages
                back through it) but moves behind a toggle (web 2026-09-04). */}
            {listedPeriods.map((period) => (
              <Text key={period.id} variant="caption" tone="muted">
                {describePeriod(period)}
              </Text>
            ))}
            {endedPeriods.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  setPastChangesShownFor((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  })
                }>
                <Text variant="caption" color={colors.brand}>
                  {showPast
                    ? 'Hide past changes'
                    : `Show ${endedPeriods.length} past change${endedPeriods.length === 1 ? '' : 's'}`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {!isResource && breaks ? (
          <Text variant="caption" tone="muted">
            Breaks · {breaks}
          </Text>
        ) : null}
        {/* Breaks are not offered for a resource: the resource engine reads
            `break_times` from the HOST calendar row, never the resource's own,
            so a break saved here would be invisible to every engine. Saying so
            beats a control that appears to work (web parity). */}
        {isResource ? (
          <Text variant="caption" tone="muted">
            Breaks aren&apos;t available for resources yet. To keep this free at the same time
            each day, add a break on the staff calendar it appears on.
          </Text>
        ) : null}
        {/* Only a calendar the viewer may change gets its editors (web parity:
            `canEditWorkingHoursFor`); a colleague's reads as view only, and its
            planned hours can still be looked at. */}
        <View style={styles.hoursActions}>
          {canEdit ? (
            <Button
              label="Edit hours"
              variant="secondary"
              size="sm"
              onPress={() => openHoursSheet(p.id)}
            />
          ) : null}
          {canEdit && !isResource ? (
            <Button
              label="Edit breaks"
              variant="ghost"
              size="sm"
              onPress={() => openBreaksSheet(p.id)}
            />
          ) : null}
          {!isResource && (canEdit || schedule) ? (
            <Button
              label={canEdit ? 'Plan hours ahead' : 'View planned hours'}
              variant="ghost"
              size="sm"
              onPress={() => openScheduleSheet(p.id)}
            />
          ) : null}
        </View>
        {!canEdit ? (
          <Text variant="caption" tone="muted">
            View only — you can change hours and breaks for calendars linked to your account. Ask
            an admin to edit other calendars.
          </Text>
        ) : null}
      </View>
    );
  }

  // ---- Render ----------------------------------------------------------------
  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Availability',
          // Admin-only entry to the bookable-calendar management surface
          // (create/rename/activate/reorder/booking-link/delete + assignments).
          headerRight: isAdmin
            ? () => (
                <IconButton
                  icon={{ ios: 'calendar.badge.plus', android: 'edit_calendar', web: 'edit_calendar' }}
                  accessibilityLabel="Manage calendars"
                  tint={colors.brand}
                  iconSize={22}
                  onPress={() => router.push('/availability/calendars' as Href)}
                />
              )
            : undefined,
        }}
      />

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

          {/* Legacy days-off migration notice (web parity) */}
          {isAdmin && legacyDaysOffCalendars.length > 0 ? (
            <Card style={[styles.legacyBanner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
              <Text variant="label" color={colors.warning}>
                Legacy blocked dates
              </Text>
              <Text variant="caption" tone="secondary">
                {legacyDaysOffCalendars.map((p) => p.name).join(', ')}{' '}
                {legacyDaysOffCalendars.length === 1 ? 'has' : 'have'} blocked dates saved in an older
                field. Those dates still block booking but can&apos;t be edited here — re-add them as
                closures (Business hours → Closures &amp; Exceptions) or time blocks so they stay
                visible.
              </Text>
            </Card>
          ) : null}

          {/* Filter chips.

              Appointment calendars only, deliberately. The filter feeds the
              leave and blocks queries as well as the hours list, and
              `GET /api/venue/practitioner-leave?practitioner_id=<resource>`
              404s ("Calendar not found" — `requireVenueHostCalendarId` filters
              resources out), which would blank this whole screen into an error
              state. Resources are still listed under Working hours on "All". */}
          {appointmentCalendars.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}>
              <Chip
                label="All"
                selected={filterPractitionerId === null}
                onPress={() => setFilterPractitionerId(null)}
              />
              {appointmentCalendars.map((p) => (
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

          {/* ===== Working hours & breaks (primary section, top) ===== */}
          <SectionHeader
            title="Working hours"
            caption="When each calendar can take bookings. Times must also sit within your venue's business hours."
          />
          {practitioners.length === 0 ? (
            <Card>
              <EmptyState
                title="No calendars yet"
                message={
                  isAdmin
                    ? 'Add a calendar to set its weekly working hours and breaks.'
                    : 'Ask an admin to link a calendar to your account.'
                }
              />
            </Card>
          ) : (
            <Card>
              <View style={styles.hoursList}>
                {practitioners
                  .filter((p) => (filterPractitionerId ? p.id === filterPractitionerId : true))
                  .map(renderHoursRow)}
              </View>
            </Card>
          )}

          {/* ===== Time off & blocks ===== */}
          <SectionHeader
            title="Time off & blocks"
            caption="Add leave, mark an unavailable window, or block out a one-off slot."
          />
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
            onCreateRange={openCreateLeaveRange}
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
                {blocks.map((block) => {
                  // Non-admins can only edit/remove blocks on their own calendar.
                  const canManage = ownsCalendar(block.practitioner_id ?? block.calendar_id);
                  return (
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
                    {canManage ? (
                      <View style={styles.rowActions}>
                        <Button
                          label="Edit"
                          variant="ghost"
                          size="sm"
                          onPress={() => openEditBlock(block.id)}
                        />
                        <Button
                          label={
                            pendingConfirm === `block-${block.id}` ? 'Tap to confirm' : 'Remove'
                          }
                          variant="ghost"
                          size="sm"
                          loading={deletingBlockIds.has(block.id)}
                          disabled={deletingBlockIds.has(block.id)}
                          onPress={() =>
                            pendingConfirm === `block-${block.id}`
                              ? void handleDeleteBlock(block.id)
                              : armConfirm(`block-${block.id}`)
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                  );
                })}
              </View>
            )}
          </Card>

          {/* Leave card — upcoming first, past collapsed (web parity) */}
          <Card>
            <Text variant="label">Leave / Unavailability</Text>
            {leave.length === 0 ? (
              <EmptyState title="No leave booked" message="Leave periods will appear here." />
            ) : (
              <>
                {upcomingLeave.length > 0 ? (
                  <View style={styles.list}>
                    <Text variant="caption" tone="secondary" style={styles.groupHeading}>
                      Upcoming
                    </Text>
                    {upcomingLeave.map(renderLeaveRow)}
                  </View>
                ) : (
                  <Text variant="caption" tone="muted" style={styles.groupHeading}>
                    No upcoming leave.
                  </Text>
                )}

                {pastLeave.length > 0 ? (
                  <View style={styles.pastGroup}>
                    <Pressable
                      onPress={() => setShowPastLeave((v) => !v)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showPastLeave }}
                      style={styles.pastToggle}>
                      <Text variant="caption" tone="secondary">
                        Past ({pastLeave.length})
                      </Text>
                      <Text variant="caption" tone="muted">
                        {showPastLeave ? '▴' : '▾'}
                      </Text>
                    </Pressable>
                    {showPastLeave ? (
                      <View style={styles.list}>{pastLeave.map(renderLeaveRow)}</View>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </Card>

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

          {/* Practitioner chips — hidden when applying to all or editing leave (can't change
              owner). Non-admins only see their own calendar(s); a single self-calendar shows a
              read-only label instead of a picker (web parity: locked calendarId, hidden picker). */}
          {!(sheet === 'leave' && applyToAll) && !editingLeaveId ? (
            selectablePractitioners.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {isAdmin
                  ? 'No practitioners found. Add a calendar from the Calendars screen first.'
                  : 'No calendar is linked to your account. Ask an admin to link one.'}
              </Text>
            ) : !isAdmin && selectablePractitioners.length === 1 ? (
              <Text variant="bodySmall" tone="secondary">
                {selectablePractitioners[0]!.name}
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}>
                {selectablePractitioners.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name}
                    selected={practitionerId === p.id}
                    onPress={() => setPractitionerId(p.id)}
                  />
                ))}
              </ScrollView>
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
            // The server caps leave notes at 500 characters and a block's reason at 200.
            maxLength={sheet === 'leave' ? 500 : 200}
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
            venueOpeningHours={venue?.opening_hours}
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
            currentBreaks={
              (hoursTarget as unknown as { break_times?: TimeRange[] | null }).break_times
            }
            applyToAllCalendars={breakTargets}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </Sheet>

      {/* Plan hours ahead: the schedule timeline, its form and planning calendar. */}
      <Sheet
        visible={sheet === 'schedule'}
        onClose={() => setSheet(null)}
        fill
        maxHeight="92%">
        {hoursTarget ? (
          <ScheduleTimelineSheet
            calendar={hoursTarget}
            venueOpeningHours={venue?.opening_hours}
            readOnly={!ownsCalendar(hoursTarget.id)}
            copyTargets={
              isAdmin
                ? appointmentCalendars
                    .filter((c) => c.id !== hoursTarget.id)
                    .map((c) => ({ id: c.id, name: c.name }))
                : []
            }
            todayYmd={today}
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
  legacyBanner: {
    borderWidth: 1,
    gap: spacing.xs,
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
  sectionHeader: {
    gap: spacing.xxs,
    marginTop: spacing.sm,
  },
  hoursList: {
    marginTop: spacing.xs,
  },
  hoursItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  hoursNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scheduleBlock: {
    gap: 2,
  },
  hoursActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  groupHeading: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  pastGroup: {
    marginTop: spacing.sm,
  },
  pastToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingVertical: spacing.xs,
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

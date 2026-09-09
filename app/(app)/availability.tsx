/**
 * Availability Settings — the web's four tabs, one screen:
 *
 *   Calendars (admin only) · Availability · Breaks · Closures & amended hours
 *
 * Availability and Breaks share one selected calendar and render their editors
 * inline (the standard weekly hours, the schedule timeline with its planning
 * calendar, the per-weekday breaks). Closures & amended hours is the team
 * month grid, the Upcoming / Past lists, and one sheet for a closure or a run
 * of amended hours. One-off time blocks are not here: as on the web they live
 * on the Calendar tab (`BlockEditSheet`), where the slot is.
 *
 * Web parity: `AppointmentAvailabilitySettings.tsx` (+ `BookableCalendarsPanel`,
 * `StaffLeaveCalendarPanel`, `ScheduleTimelineEditor`).
 */
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { BookableCalendarsManager } from '@/components/availability/BookableCalendarsManager';
import {
  BREAKS_INTRO,
  BREAKS_READ_ONLY_HINT,
  BREAKS_RESOURCE_NOTE,
  BreaksEditor,
} from '@/components/availability/BreaksEditor';
import { ScheduleTimelineSheet } from '@/components/availability/ScheduleTimelineSheet';
import { TeamLeaveCalendar } from '@/components/availability/TeamLeaveCalendar';
import {
  WORKING_HOURS_READ_ONLY_HINT,
  WorkingHoursEditor,
} from '@/components/availability/WorkingHoursEditor';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError, isRequiresConfirmationBody } from '@/lib/api/client';
import {
  AMENDED_HOURS_MAX_PERIODS,
  AMENDED_HOURS_MAX_REASON_LENGTH,
  amendedHoursLeaveNote,
  amendedHoursOnDate,
  amendedHoursVenueNote,
  describeAmendedRange,
  describeHoursPeriods,
  minutesToHm,
  normaliseHoursPeriods,
  type AmendedHoursEntry,
} from '@/lib/availability/calendar-amended-hours';
import {
  parseAvailabilityTab,
  resolveAvailabilityTab,
  visibleAvailabilityTabs,
  type AvailabilityTab,
} from '@/lib/availability/availability-tabs';
import { appointmentCalendarsOf, isResourceCalendar } from '@/lib/calendar/schedule-calendars';
import { addDaysToDateStr } from '@/lib/dates/venue-dates';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useCreateLeave,
  useDeleteLeave,
  usePractitionerLeave,
  useUpdateLeave,
} from '@/lib/queries/useAvailabilityManage';
import { useAvailabilityBlocks } from '@/lib/queries/useAvailabilityBlocks';
import {
  useAmendedHours,
  useDeleteAmendedHours,
  usePutAmendedHours,
} from '@/lib/queries/useCalendarAmendedHours';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { usePractitioners } from '@/lib/queries/usePractitioners';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, minTouchTarget, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { LeavePeriod, LeaveType } from '@/types/availability-manage';
import type { Practitioner } from '@/types/practitioner';

type Tab = AvailabilityTab;

/** How far the Upcoming and Past lists reach either side of today. */
const RANGE_DAYS = 90;

// ---- Leave type display labels (web parity) --------------------------------
const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Closed',
  sick: 'Unavailable',
  other: 'Other',
};

function leaveTypeLabel(t: string): string {
  return LEAVE_TYPE_LABELS[t] ?? t;
}

/** One line of the closures list: a leave period, or a run of amended hours (web #187). */
type ClosureItem = { key: string; sort: string; ended: boolean } & (
  | { type: 'closed'; row: LeavePeriod }
  | { type: 'hours'; row: AmendedHoursEntry }
);

/** A run of amended hours is keyed by calendar and start: it has no id of its own. */
function amendedKey(row: Pick<AmendedHoursEntry, 'calendar_id' | 'date_start'>): string {
  return `hours-${row.calendar_id}-${row.date_start}`;
}

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Which calendar the Availability / Breaks tabs land on (web
 * `pickScheduleCalendarId`): keep a still-valid selection, a resource included;
 * a fresh pick prefers the viewer's own staff calendar, then any staff calendar.
 */
function pickScheduleCalendarId(
  previous: string | null,
  calendars: readonly Practitioner[],
  ownIds: ReadonlySet<string>,
): string | null {
  if (previous && calendars.some((c) => c.id === previous)) return previous;
  const staff = calendars.filter((c) => !isResourceCalendar(c));
  return (
    staff.find((c) => ownIds.has(c.id))?.id ?? staff[0]?.id ?? calendars[0]?.id ?? null
  );
}

// ---- The tab strip -------------------------------------------------------------
function TabStrip({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: Tab; label: string }[];
  value: Tab;
  onChange: (tab: Tab) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tabStrip, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabStripContent}>
        {tabs.map((t) => {
          const selected = t.key === value;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(t.key)}
              style={({ pressed }) => [
                styles.tab,
                { borderBottomColor: selected ? colors.brand : 'transparent' },
                pressed ? { opacity: 0.7 } : null,
              ]}>
              <Text
                variant="bodyMedium"
                color={selected ? colors.text : colors.textSecondary}
                style={selected ? styles.tabLabelSelected : null}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---- Sheet mode ---------------------------------------------------------------
type BlockType = 'allday' | 'window';

export default function AvailabilityScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const staffQuery = useStaffMe();
  const staff = staffQuery.data?.staff;
  const isAdmin = staff?.role === 'admin';

  // ---- Tabs ------------------------------------------------------------------
  const visibleTabs = useMemo(() => visibleAvailabilityTabs(isAdmin), [isAdmin]);
  const [chosenTab, setTab] = useState<Tab>(() => resolveAvailabilityTab(params.tab, false));
  const [tabSeeded, setTabSeeded] = useState(false);
  // The default is Calendars for an admin, Availability for everyone else;
  // the role is only known once `staff/me` answers, so seed then. A later
  // `?tab=` (a link from elsewhere in the app) wins over the chosen tab.
  // Both are "adjust state during render", not effects.
  if (!tabSeeded && staff) {
    setTabSeeded(true);
    setTab(resolveAvailabilityTab(params.tab, isAdmin));
  }
  const [seenParamTab, setSeenParamTab] = useState(params.tab);
  if (seenParamTab !== params.tab) {
    setSeenParamTab(params.tab);
    const fromUrl = parseAvailabilityTab(params.tab);
    if (fromUrl) setTab(fromUrl);
  }
  // A non-admin never sees Calendars: bounce to Availability (web parity).
  const tab: Tab = staff && !isAdmin && chosenTab === 'team' ? 'hours' : chosenTab;

  /**
   * Resources included: a resource is a `unified_calendars` row like any other
   * and its weekly hours are the same `working_hours` column, so the
   * Availability tab edits them here too. Breaks and closures work on
   * `appointmentCalendars` instead — see the note there.
   */
  const practitionersQuery = usePractitioners({ includeResources: true });
  /** Every calendar whose weekly schedule is editable here, in column order. */
  const practitioners = useMemo(
    () =>
      [...(practitionersQuery.data?.practitioners ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
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

  // Non-admins may only change their OWN calendars (web `canEditWorkingHoursFor`,
  // `canEditBreaksFor`, and the closures panel's locked `calendarId`). Admins
  // change every calendar.
  const ownCalendarIds = useMemo(
    () => new Set(staff?.linked_calendar_ids ?? []),
    [staff?.linked_calendar_ids],
  );
  const ownsCalendar = useCallback(
    (id: string | null | undefined) => isAdmin || (id != null && ownCalendarIds.has(id)),
    [isAdmin, ownCalendarIds],
  );
  // Calendars a non-admin may put a closure on (self calendars only). Built from
  // `appointmentCalendars`, so leave is never offered a resource.
  const selectablePractitioners = useMemo(
    () =>
      isAdmin
        ? appointmentCalendars
        : appointmentCalendars.filter((p) => ownCalendarIds.has(p.id)),
    [isAdmin, appointmentCalendars, ownCalendarIds],
  );
  /** Calendars the breaks editor may write to with "Save to all calendars". */
  const breakTargets = useMemo(
    () => selectablePractitioners.map((p) => ({ id: p.id, name: p.name })),
    [selectablePractitioners],
  );
  const canManageUnavailability = selectablePractitioners.length > 0;

  // ---- The calendar the Availability and Breaks tabs work on ----------------
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCalendarId = pickScheduleCalendarId(selectedId, practitioners, ownCalendarIds);
  const selectedCalendar = practitioners.find((p) => p.id === selectedCalendarId) ?? null;
  const selectedIsResource = isResourceCalendar(selectedCalendar);
  const canEditSelected = ownsCalendar(selectedCalendarId);

  // Legacy per-calendar "days off" — older venues stored blocked DATES (YYYY-MM-DD)
  // in `days_off`. Those still block booking but aren't editable here (web
  // parity: the amber legacy banner, shown to every role).
  const hasLegacyDaysOff = useMemo(
    () =>
      appointmentCalendars.some((p) =>
        (p.days_off ?? []).some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ),
    [appointmentCalendars],
  );

  // ---- Closures: filter, lists, mutations -------------------------------------
  const [filterPractitionerId, setFilterPractitionerId] = useState<string | null>(null);
  // Past entries are real (web lists the displayed month either way), so the
  // lists reach back as far as they reach forward.
  const listFrom = addDaysToDateStr(today, -RANGE_DAYS);
  const listTo = addDaysToDateStr(today, RANGE_DAYS - 1);
  const leaveQuery = usePractitionerLeave(listFrom, listTo, filterPractitionerId);
  const amendedQuery = useAmendedHours(listFrom, listTo, filterPractitionerId);

  const createLeave = useCreateLeave();
  const updateLeave = useUpdateLeave();
  const deleteLeave = useDeleteLeave();
  const putAmended = usePutAmendedHours();
  const deleteAmended = useDeleteAmendedHours();
  // Venue-wide closures and amended hours, for the note under the hours form.
  const venueBlocksQuery = useAvailabilityBlocks();

  const [deletingLeaveIds, setDeletingLeaveIds] = useState<Set<string>>(new Set());
  const [deletingAmendedKeys, setDeletingAmendedKeys] = useState<Set<string>>(new Set());

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
      id ? (practitioners.find((p) => p.id === id)?.name ?? 'Calendar') : 'A calendar',
    [practitioners],
  );

  // ---- The closure / amended-hours sheet -------------------------------------
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [showPastLeave, setShowPastLeave] = useState(false);

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
  /**
   * The sheet's two kinds of entry (web #187): a closure (leave, hard) or
   * working different hours (an override the diary and every engine read).
   */
  const [entryKind, setEntryKind] = useState<'closed' | 'hours'>('closed');
  /** The hours form's periods, in minutes since midnight; up to three. */
  const [hoursPeriods, setHoursPeriods] = useState<{ start: number; end: number }[]>([
    { start: 9 * 60, end: 17 * 60 },
  ]);
  /** The run being edited; its range is replaced on save. */
  const [editingAmended, setEditingAmended] = useState<AmendedHoursEntry | null>(null);
  /** The 409 "save anyway?" for amended hours, asked as a step of this sheet. */
  const [amendedAck, setAmendedAck] = useState<{ message: string } | null>(null);

  function defaultPractitionerId(): string | null {
    if (!isAdmin) return selectablePractitioners[0]?.id ?? null;
    return appointmentCalendars[0]?.id ?? null;
  }

  /** A fresh sheet: a closure by default, on the given dates (or today). */
  function openNewEntry(
    startDate = today,
    finishDate = startDate,
    kind: 'closed' | 'hours' = 'closed',
    calendarId: string | null = null,
  ) {
    setEditingLeaveId(null);
    setEditingAmended(null);
    setPractitionerId(calendarId ?? defaultPractitionerId());
    setApplyToAll(false);
    setDate(startDate);
    setEndDate(finishDate);
    setBlockType('allday');
    setStartMinutes(12 * 60);
    setEndMinutes(13 * 60);
    setReason('');
    setLeaveType('annual');
    setEntryKind(kind);
    setHoursPeriods([{ start: 9 * 60, end: 17 * 60 }]);
    setAmendedAck(null);
    setSheetError(null);
    setSheetOpen(true);
  }

  function openEditLeave(period: LeavePeriod) {
    if (!ownsCalendar(period.practitioner_id)) {
      toast.error('You can only edit closures on your own calendar.');
      return;
    }
    setEditingLeaveId(period.id);
    setEditingAmended(null);
    setEntryKind('closed');
    setAmendedAck(null);
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
    setSheetOpen(true);
  }

  /** Load a run of amended hours back into the sheet (web: `editAmended`). */
  function openEditAmended(row: AmendedHoursEntry) {
    if (!ownsCalendar(row.calendar_id)) {
      toast.error('You can only amend hours on your own calendar.');
      return;
    }
    setEditingLeaveId(null);
    setEditingAmended(row);
    setEntryKind('hours');
    setPractitionerId(row.calendar_id);
    setApplyToAll(false);
    setDate(row.date_start);
    setEndDate(row.date_end);
    setHoursPeriods(
      row.periods.length > 0
        ? row.periods.map((p) => ({
            start: timeStringToMinutes(p.start),
            end: timeStringToMinutes(p.end),
          }))
        : [{ start: 9 * 60, end: 17 * 60 }],
    );
    setReason(row.reason ?? '');
    setAmendedAck(null);
    setSheetError(null);
    setSheetOpen(true);
  }

  /**
   * The planning calendar's "Amend hours for this date" (web
   * `amendedHoursHref`): jump to Closures & amended hours and open the sheet
   * on that date — the existing run when there is one, else a new hours entry.
   */
  function amendHoursFromPlanner(calendar: Practitioner, dateYmd: string, existing: boolean) {
    setTab('daysoff');
    if (existing) {
      const listed = amendedHoursOnDate(amendedQuery.data ?? [], dateYmd, calendar.id);
      if (listed) {
        openEditAmended(listed);
        return;
      }
      const stored = calendar.availability_exceptions?.[dateYmd];
      if (stored && 'periods' in stored) {
        openEditAmended({
          kind: 'hours',
          date_start: dateYmd,
          date_end: dateYmd,
          periods: stored.periods.map((p) => ({ start: p.start.slice(0, 5), end: p.end.slice(0, 5) })),
          reason: null,
          calendar_id: calendar.id,
          calendar_name: calendar.name,
        });
        return;
      }
    }
    openNewEntry(dateYmd, dateYmd, 'hours', calendar.id);
  }

  /**
   * Save the hours form: PUT the range (replacing the run being edited). A 409
   * `requires_confirmation` (an upcoming booking now sits outside the hours)
   * asks in the sheet and re-sends acknowledged; a plain 409 is a full-day
   * closure in the range, which the route refuses and the note already named.
   */
  async function saveAmendedHours(acknowledge: boolean) {
    if (endDate < date) {
      setSheetError('End date must be on or after start date.');
      return;
    }
    const normalised = normaliseHoursPeriods(
      hoursPeriods.map((p) => ({ start: minutesToHm(p.start), end: minutesToHm(p.end) })),
    );
    if (!normalised.ok) {
      setSheetError(normalised.error);
      return;
    }
    if (!editingAmended && !applyToAll && !practitionerId) {
      setSheetError('Select a calendar.');
      return;
    }
    setSheetError(null);
    try {
      await putAmended.mutateAsync({
        ...(!editingAmended && applyToAll
          ? { apply_to_all_active: true }
          : { practitioner_id: editingAmended?.calendar_id ?? practitionerId! }),
        date_start: date,
        date_end: endDate,
        periods: normalised.periods,
        reason: reason.trim() || null,
        replace: editingAmended
          ? { date_start: editingAmended.date_start, date_end: editingAmended.date_end }
          : null,
        acknowledge,
      });
      setAmendedAck(null);
      hapticSuccess();
      setSheetOpen(false);
      toast.success(editingAmended ? 'Amended hours updated.' : 'Amended hours saved.');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && isRequiresConfirmationBody(e.body)) {
        hapticWarning();
        setAmendedAck({
          message:
            e.body.message ?? 'Some upcoming bookings fall outside these hours. Save anyway?',
        });
        return;
      }
      setAmendedAck(null);
      hapticWarning();
      setSheetError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    }
  }

  async function handleSave() {
    if (!practitionerId && !applyToAll && !editingLeaveId && !editingAmended) {
      setSheetError('Select a calendar.');
      return;
    }
    setSheetError(null);
    if (entryKind === 'hours') {
      await saveAmendedHours(false);
      return;
    }
    try {
      if (endDate < date) {
        setSheetError('End date must be on or after start date.');
        return;
      }
      if (blockType === 'window' && endMinutes <= startMinutes) {
        setSheetError('End time must be after start time.');
        return;
      }
      const unavailableStart = blockType === 'window' ? minutesToHm(startMinutes) : null;
      const unavailableEnd = blockType === 'window' ? minutesToHm(endMinutes) : null;

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
          ...(applyToAll ? { apply_to_all_active: true } : { practitioner_id: practitionerId! }),
          start_date: date,
          end_date: endDate,
          leave_type: leaveType,
          ...(reason.trim() ? { notes: reason.trim() } : {}),
          unavailable_start_time: unavailableStart,
          unavailable_end_time: unavailableEnd,
        });
      }
      hapticSuccess();
      setSheetOpen(false);
      toast.success(editingLeaveId ? 'Closure updated.' : 'Closure added to the calendar.');
    } catch (e) {
      hapticWarning();
      setSheetError(e instanceof ApiError ? e.message : 'Could not save. Try again.');
    }
  }

  async function handleDeleteAmended(row: AmendedHoursEntry) {
    const key = amendedKey(row);
    clearConfirm();
    if (deletingAmendedKeys.has(key)) return;
    setDeletingAmendedKeys((prev) => new Set(prev).add(key));
    try {
      await deleteAmended.mutateAsync({
        practitioner_id: row.calendar_id,
        date_start: row.date_start,
        date_end: row.date_end,
      });
      if (editingAmended && amendedKey(editingAmended) === key) setSheetOpen(false);
      toast.success('Amended hours removed. The dates go back to the usual hours.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not remove. An error occurred.');
    } finally {
      setDeletingAmendedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
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
      if (editingLeaveId === leaveId) setSheetOpen(false);
      toast.success('Closure removed from the calendar.');
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

  // ---- Derived data ------------------------------------------------------------
  const leave = useMemo(() => leaveQuery.data?.periods ?? [], [leaveQuery.data?.periods]);
  const amended = useMemo(
    () => (amendedQuery.data ?? []).filter((e) => e.kind === 'hours'),
    [amendedQuery.data],
  );
  // Both kinds in one list, interleaved by date (web #187): upcoming first
  // (asc), past collapsed behind a toggle (desc).
  const closureItems: ClosureItem[] = [
    ...leave.map(
      (p): ClosureItem => ({ key: `leave-${p.id}`, sort: p.start_date, ended: p.end_date < today, type: 'closed', row: p }),
    ),
    ...amended.map(
      (a): ClosureItem => ({ key: amendedKey(a), sort: a.date_start, ended: a.date_end < today, type: 'hours', row: a }),
    ),
  ];
  const upcomingItems = closureItems
    .filter((i) => !i.ended)
    .sort((a, b) => a.sort.localeCompare(b.sort));
  const pastItems = closureItems
    .filter((i) => i.ended)
    .sort((a, b) => b.sort.localeCompare(a.sort));
  const venueBlocks = useMemo(
    () => (venueBlocksQuery.data ?? []).filter((b) => b.service_id == null),
    [venueBlocksQuery.data],
  );
  const sheetCalendarName = practitionerName(
    editingAmended?.calendar_id ?? (applyToAll ? null : practitionerId),
  );
  const hoursPeriodsHm = hoursPeriods.map((p) => ({ start: minutesToHm(p.start), end: minutesToHm(p.end) }));
  const amendedLeaveNote =
    sheetOpen && entryKind === 'hours'
      ? amendedHoursLeaveNote({
          dateStart: date,
          dateEnd: endDate,
          leave: leave.filter((l) =>
            applyToAll && !editingAmended
              ? true
              : l.practitioner_id === (editingAmended?.calendar_id ?? practitionerId),
          ),
          calendarName: applyToAll && !editingAmended ? 'A calendar' : sheetCalendarName,
        })
      : null;
  const amendedVenueNote =
    sheetOpen && entryKind === 'hours'
      ? amendedHoursVenueNote({
          dateStart: date,
          dateEnd: endDate,
          periods: hoursPeriodsHm,
          venueHours: venue?.opening_hours,
          venueBlocks,
        })
      : null;
  const saving = createLeave.isPending || updateLeave.isPending || putAmended.isPending;
  const editing = editingLeaveId != null || editingAmended != null;
  const deletingCurrent =
    (editingLeaveId != null && deletingLeaveIds.has(editingLeaveId)) ||
    (editingAmended != null && deletingAmendedKeys.has(amendedKey(editingAmended)));

  // ---- Rows of the Upcoming / Past lists ---------------------------------------
  function renderClosureItem(item: ClosureItem) {
    const isHours = item.type === 'hours';
    const row = item.row;
    const calendarId = isHours ? item.row.calendar_id : item.row.practitioner_id;
    const canManage = ownsCalendar(calendarId);
    const key = item.key;
    const deleting = isHours
      ? deletingAmendedKeys.has(key)
      : deletingLeaveIds.has(item.row.id);
    const partial =
      !isHours && Boolean(item.row.unavailable_start_time && item.row.unavailable_end_time);
    const chip = isHours
      ? { label: 'Amended hours', surface: colors.warningSurface, ink: colors.warning }
      : partial
        ? { label: 'Part day', surface: colors.infoSurface, ink: colors.info }
        : { label: 'All day', surface: colors.dangerSurface, ink: colors.danger };
    const range = isHours
      ? describeAmendedRange(item.row.date_start, item.row.date_end)
      : describeAmendedRange(item.row.start_date, item.row.end_date);
    const times = isHours
      ? describeHoursPeriods(item.row.periods)
      : partial
        ? `${item.row.unavailable_start_time!.slice(0, 5)}–${item.row.unavailable_end_time!.slice(0, 5)} each day`
        : null;
    const calendarName = isHours
      ? item.row.calendar_name
      : (item.row.practitioner_name ?? practitionerName(item.row.practitioner_id));
    const note = isHours ? item.row.reason : item.row.notes;
    const onEdit = () => (isHours ? openEditAmended(item.row) : openEditLeave(item.row));
    const onRemove = () =>
      isHours ? void handleDeleteAmended(item.row) : void handleDeleteLeave(item.row.id);
    return (
      <Pressable
        key={key}
        accessibilityRole={canManage ? 'button' : undefined}
        disabled={!canManage}
        onPress={onEdit}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border },
          item.ended ? { opacity: 0.75 } : null,
          pressed && canManage ? { opacity: 0.6 } : null,
        ]}>
        <View style={styles.rowBody}>
          <View style={styles.rowTitle}>
            <View style={[styles.chip, { backgroundColor: chip.surface }]}>
              <Text variant="caption" color={chip.ink}>
                {chip.label}
              </Text>
            </View>
            <Text variant="bodyMedium" style={styles.flexShrink} numberOfLines={1}>
              {range}
            </Text>
          </View>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {calendarName}
            {times ? ` · ${times}` : ''}
            {!isHours ? ` · ${leaveTypeLabel((row as LeavePeriod).leave_type)}` : ''}
            {note ? ` · ${note}` : ''}
          </Text>
        </View>
        {canManage ? (
          <View style={styles.rowActions}>
            <Button
              label={pendingConfirm === key ? 'Tap to confirm' : 'Remove'}
              variant="ghost"
              size="sm"
              loading={deleting}
              disabled={deleting}
              customColors={{ background: 'transparent', text: colors.danger }}
              onPress={() => (pendingConfirm === key ? onRemove() : armConfirm(key))}
            />
          </View>
        ) : null}
      </Pressable>
    );
  }

  // ---- The calendar selector shared by Availability and Breaks -----------------
  function renderCalendarSelector() {
    return (
      <View style={styles.selector}>
        <Text variant="label">Calendar</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          {practitioners.map((p) => (
            <Chip
              key={p.id}
              label={isResourceCalendar(p) ? `${p.name} (resource)` : p.name}
              selected={p.id === selectedCalendarId}
              onPress={() => setSelectedId(p.id)}
            />
          ))}
        </ScrollView>
        {!isAdmin && selectedCalendar && !canEditSelected ? (
          <Text variant="caption" tone="secondary">
            View only - you can change hours and breaks for calendars linked to your account.
            Ask an admin to edit other calendars.
          </Text>
        ) : null}
      </View>
    );
  }

  // ---- Availability tab ------------------------------------------------------------
  function renderHoursTab() {
    if (practitioners.length === 0) {
      return (
        <Card>
          <EmptyState
            title="No calendars yet"
            message="Add calendars first to set their schedule."
          />
        </Card>
      );
    }
    return (
      <>
        {renderCalendarSelector()}

        {/* How calendar hours and business hours work together (web banner). */}
        <View
          style={[
            styles.infoBanner,
            { backgroundColor: colors.brandSubtle, borderColor: colors.brandBorder },
          ]}>
          <Text variant="label">How calendar hours and business hours work together</Text>
          <Text variant="caption" tone="secondary" style={styles.infoText}>
            The hours you set below are when this calendar can take bookings, but a time is only
            bookable where it also falls inside your venue&apos;s business hours. If you set
            calendar hours wider than your business hours, the extra time outside them won&apos;t
            be bookable, and days your venue is closed stay closed here too.
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/manage/hours' as Href)}
            hitSlop={4}>
            <Text variant="caption" tone="secondary" style={styles.infoText}>
              To open bookings earlier or later, widen your{' '}
              <Text variant="caption" color={colors.brand}>
                Settings → Business hours
              </Text>{' '}
              as well. If you haven&apos;t set business hours, the calendar hours below apply on
              their own.
            </Text>
          </Pressable>
        </View>

        {selectedCalendar ? (
          <Card>
            <Text variant="label">Working hours</Text>
            <WorkingHoursEditor
              key={`${selectedCalendar.id}:${JSON.stringify(selectedCalendar.working_hours ?? null)}`}
              inline
              practitionerId={selectedCalendar.id}
              practitionerName={selectedCalendar.name}
              currentWorkingHours={selectedCalendar.working_hours ?? undefined}
              venueOpeningHours={venue?.opening_hours}
              readOnly={!canEditSelected}
              readOnlyHint={!isAdmin ? WORKING_HOURS_READ_ONLY_HINT : undefined}
            />
          </Card>
        ) : null}

        {selectedCalendar && !selectedIsResource ? (
          <Card>
            <ScheduleTimelineSheet
              key={`${selectedCalendar.id}:${JSON.stringify(
                selectedCalendar.schedule_periods ?? selectedCalendar.working_hours_rota ?? null,
              )}`}
              inline
              calendar={selectedCalendar}
              venueOpeningHours={venue?.opening_hours}
              readOnly={!canEditSelected}
              copyTargets={
                isAdmin
                  ? appointmentCalendars
                      .filter((c) => c.id !== selectedCalendar.id)
                      .map((c) => ({ id: c.id, name: c.name }))
                  : []
              }
              todayYmd={today}
              onAmendHours={(dateYmd, existing) =>
                amendHoursFromPlanner(selectedCalendar, dateYmd, existing)
              }
            />
          </Card>
        ) : null}
      </>
    );
  }

  // ---- Breaks tab ----------------------------------------------------------------------
  function renderBreaksTab() {
    if (practitioners.length === 0) {
      return (
        <Card>
          <EmptyState
            title="No calendars yet"
            message="Add calendars first to set their schedule."
          />
        </Card>
      );
    }
    return (
      <>
        {renderCalendarSelector()}
        {selectedCalendar && selectedIsResource ? (
          <Card>
            <Text variant="bodySmall" tone="secondary">
              {BREAKS_RESOURCE_NOTE}
            </Text>
          </Card>
        ) : selectedCalendar ? (
          <>
            {canEditSelected ? (
              <Text variant="caption" tone="secondary">
                {BREAKS_INTRO}
              </Text>
            ) : null}
            <Card>
              <BreaksEditor
                key={`${selectedCalendar.id}:${JSON.stringify(selectedCalendar.break_times ?? null)}:${JSON.stringify(selectedCalendar.break_times_by_day ?? null)}`}
                inline
                practitionerId={selectedCalendar.id}
                practitionerName={selectedCalendar.name}
                currentBreaksByDay={selectedCalendar.break_times_by_day}
                currentBreaks={selectedCalendar.break_times}
                applyToAllCalendars={breakTargets}
                readOnly={!canEditSelected}
                readOnlyHint={!isAdmin ? BREAKS_READ_ONLY_HINT : undefined}
              />
            </Card>
          </>
        ) : null}
      </>
    );
  }

  // ---- Closures & amended hours tab --------------------------------------------------
  function renderClosuresTab() {
    if (appointmentCalendars.length === 0) {
      return (
        <Card>
          <EmptyState
            title="No calendars yet"
            message="Add calendars first to set full-day closures and unavailability."
          />
        </Card>
      );
    }
    if (leaveQuery.isError) {
      return (
        <ErrorState
          title="Could not load calendar unavailability"
          message={
            leaveQuery.error instanceof ApiError
              ? leaveQuery.error.message
              : 'Could not load closures.'
          }
          onRetry={() => void leaveQuery.refetch()}
        />
      );
    }
    const filterChips = isAdmin ? appointmentCalendars : selectablePractitioners;
    return (
      <>
        {hasLegacyDaysOff ? (
          <Card style={[styles.legacyBanner, { backgroundColor: colors.warningSurface, borderColor: colors.warning }]}>
            <Text variant="label" color={colors.warning}>
              Legacy blocked dates
            </Text>
            <Text variant="caption" tone="secondary">
              Some calendars still have dates in the older per-calendar &ldquo;days off&rdquo;
              list. Those dates still block booking. Add new blocks here so full-day
              unavailability stays visible in one place.
            </Text>
          </Card>
        ) : null}

        <Text variant="caption" tone="secondary">
          Take one calendar out for a date or a range, or give it different hours on those dates.
          Tap dates on the calendar to select a range, then set the details.
        </Text>

        {!canManageUnavailability ? (
          <Text variant="caption" tone="muted">
            You cannot manage calendar unavailability until your account is assigned to a
            calendar. Ask an admin to link your staff profile to the right calendar column.
          </Text>
        ) : null}

        {/* Which calendar the grid and lists show. An admin may look at any;
            a staff member only their own (web hides the picker and locks the
            calendar), so the chips never offer a calendar the leave route
            would 403. */}
        {filterChips.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}>
            <Chip
              label="All"
              selected={filterPractitionerId === null}
              onPress={() => setFilterPractitionerId(null)}
            />
            {filterChips.map((p) => (
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

        {canManageUnavailability ? (
          <Button label="New entry" onPress={() => openNewEntry()} />
        ) : null}

        <TeamLeaveCalendar
          today={today}
          filterPractitionerId={filterPractitionerId}
          onEditLeave={openEditLeave}
          onEditAmended={openEditAmended}
          onCreateRange={(start, end) => openNewEntry(start, end)}
          onDeleteLeave={handleDeleteLeave}
          deletingLeaveIds={deletingLeaveIds}
        />

        <Card>
          <Text variant="label">Upcoming</Text>
          {amendedQuery.isError ? (
            <View style={styles.inlineError}>
              <Text variant="caption" tone="danger" style={styles.flex1}>
                Could not load amended hours.
              </Text>
              <Button
                label="Retry"
                variant="ghost"
                size="sm"
                onPress={() => void amendedQuery.refetch()}
              />
            </View>
          ) : null}
          {closureItems.length === 0 ? (
            <Text variant="caption" tone="muted" style={styles.groupHeading}>
              No closures or amended hours for this calendar. Tap dates on the calendar to add
              one.
            </Text>
          ) : (
            <>
              {upcomingItems.length > 0 ? (
                <View style={styles.list}>{upcomingItems.map(renderClosureItem)}</View>
              ) : (
                <Text variant="caption" tone="muted" style={styles.groupHeading}>
                  No upcoming closures or amended hours.
                </Text>
              )}

              {pastItems.length > 0 ? (
                <View style={styles.pastGroup}>
                  <Pressable
                    onPress={() => setShowPastLeave((v) => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showPastLeave }}
                    style={styles.pastToggle}>
                    <Text variant="caption" tone="secondary">
                      Past entries ({pastItems.length})
                    </Text>
                    <Text variant="caption" tone="muted">
                      {showPastLeave ? '▴' : '▾'}
                    </Text>
                  </Pressable>
                  {showPastLeave ? (
                    <View style={styles.list}>{pastItems.map(renderClosureItem)}</View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
          <Text variant="caption" tone="muted" style={styles.groupHeading}>
            Upcoming: the next {RANGE_DAYS} days. Past: the last {RANGE_DAYS} days.
          </Text>
        </Card>
      </>
    );
  }

  // ---- Render --------------------------------------------------------------------------
  const isLoading = practitionersQuery.isLoading || (staffQuery.isLoading && !staff);
  const refreshing = practitionersQuery.isRefetching || leaveQuery.isRefetching;
  const refetchAll = () => {
    void practitionersQuery.refetch();
    void leaveQuery.refetch();
    void amendedQuery.refetch();
  };

  return (
    <Screen scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: true, title: 'Availability Settings' }} />

      {isLoading ? (
        <DetailSkeleton />
      ) : practitionersQuery.isError ? (
        <View style={styles.stateWrap}>
          <ErrorState
            message={
              practitionersQuery.error instanceof ApiError
                ? practitionersQuery.error.message
                : 'Could not load availability.'
            }
            onRetry={refetchAll}
          />
        </View>
      ) : (
        <>
          {!isAdmin ? (
            <Text variant="caption" tone="secondary" style={styles.intro}>
              Browse any team member for reference; only your calendar can be changed here. Venue
              admins can adjust everyone.
            </Text>
          ) : null}
          <TabStrip tabs={visibleTabs} value={tab} onChange={setTab} />

          {tab === 'team' ? (
            <BookableCalendarsManager />
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}>
              {tab === 'hours' ? renderHoursTab() : null}
              {tab === 'breaks' ? renderBreaksTab() : null}
              {tab === 'daysoff' ? renderClosuresTab() : null}
              <View style={styles.spacer} />
            </ScrollView>
          )}
        </>
      )}

      {/* One sheet for a closure or a run of amended hours (web: the form). */}
      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} maxHeight="92%">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetBody}>
          <Text variant="overline" tone="muted">
            {editingLeaveId ? 'Edit block' : editingAmended ? 'Edit amended hours' : 'New entry'}
          </Text>

          {/* Entry type (web #187): a closure, or working different hours. Create only. */}
          {!editing ? (
            <>
              <Segmented
                options={[
                  { value: 'closed', label: 'Closed' },
                  { value: 'hours', label: 'Working different hours' },
                ]}
                value={entryKind}
                onChange={(next) => {
                  setEntryKind(next);
                  setSheetError(null);
                  setAmendedAck(null);
                }}
              />
              <Text variant="caption" tone="muted">
                {entryKind === 'hours'
                  ? 'Open on these dates with these hours.'
                  : 'All day, or a window each day.'}
              </Text>
            </>
          ) : null}

          {/* Apply to all — admin only, create only */}
          {isAdmin && !editing ? (
            <View style={styles.switchRow}>
              <View style={styles.flex1}>
                <Text variant="bodyMedium">Apply to all active calendars</Text>
                <Text variant="caption" tone="muted">
                  {entryKind === 'hours'
                    ? 'Same dates and hours on every active calendar column at once.'
                    : 'Same dates and times on every active calendar column at once.'}
                </Text>
              </View>
              <Switch
                value={applyToAll}
                onValueChange={setApplyToAll}
                trackColor={{ true: colors.brand, false: colors.border }}
                thumbColor={colors.surfaceRaised}
              />
            </View>
          ) : null}

          {/* Calendar chips — hidden when applying to all or editing (the owner cannot
              change). Non-admins only see their own calendar(s); a single self-calendar
              shows a read-only label instead of a picker (web: locked calendarId). */}
          {!applyToAll && !editing ? (
            selectablePractitioners.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                {isAdmin
                  ? 'No calendars found. Add a calendar on the Calendars tab first.'
                  : 'No calendar is linked to your account. Ask an admin to link one.'}
              </Text>
            ) : !isAdmin && selectablePractitioners.length === 1 ? (
              <Text variant="bodySmall" tone="secondary">
                {selectablePractitioners[0]!.name}
              </Text>
            ) : (
              <View style={styles.field}>
                <Text variant="label" tone="secondary">
                  Calendar
                </Text>
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
              </View>
            )
          ) : null}

          {/* Dates */}
          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">
              Start date
            </Text>
            <DatePickerField
              value={date}
              onChange={(iso) => {
                setDate(iso);
                if (endDate < iso) setEndDate(iso);
              }}
              accessibilityLabel="Start date"
            />
          </View>
          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">
              End date
            </Text>
            <DatePickerField value={endDate} onChange={setEndDate} accessibilityLabel="End date" />
          </View>

          {entryKind === 'hours' ? (
            <>
              <Text variant="caption" tone="muted">
                These hours replace the calendar&rsquo;s usual hours on every date in the range,
                including days it does not normally work. Breaks still apply.
              </Text>
              {hoursPeriods.map((p, idx) => (
                <View key={idx} style={styles.periodBlock}>
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">
                      {hoursPeriods.length > 1 ? `Period ${idx + 1} open` : 'Open'}
                    </Text>
                    <TimePickerField
                      value={p.start}
                      onChange={(m) =>
                        setHoursPeriods((all) =>
                          all.map((q, i) => (i === idx ? { ...q, start: m } : q)),
                        )
                      }
                      accessibilityLabel={`Period ${idx + 1} open`}
                    />
                  </View>
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">
                      {hoursPeriods.length > 1 ? `Period ${idx + 1} close` : 'Close'}
                    </Text>
                    <TimePickerField
                      value={p.end}
                      onChange={(m) =>
                        setHoursPeriods((all) =>
                          all.map((q, i) => (i === idx ? { ...q, end: m } : q)),
                        )
                      }
                      accessibilityLabel={`Period ${idx + 1} close`}
                    />
                  </View>
                  {hoursPeriods.length > 1 ? (
                    <Button
                      label={`Remove period ${idx + 1}`}
                      variant="ghost"
                      size="sm"
                      onPress={() => setHoursPeriods((all) => all.filter((_, i) => i !== idx))}
                    />
                  ) : null}
                </View>
              ))}
              {hoursPeriods.length < AMENDED_HOURS_MAX_PERIODS ? (
                <Button
                  label="Add another period (for a break in the middle of the day)"
                  variant="secondary"
                  size="sm"
                  onPress={() =>
                    setHoursPeriods((all) => {
                      const last = all[all.length - 1];
                      const start = Math.min(23 * 60 + 45, (last?.end ?? 12 * 60) + 60);
                      return [...all, { start, end: Math.min(23 * 60 + 59, start + 3 * 60) }];
                    })
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              <Text variant="caption" tone="muted">
                All day blocks the whole day. A time window blocks that window on every date in
                the range.
              </Text>
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
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">
                      Start time
                    </Text>
                    <TimePickerField
                      value={startMinutes}
                      onChange={setStartMinutes}
                      accessibilityLabel="Start time"
                    />
                  </View>
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">
                      End time
                    </Text>
                    <TimePickerField
                      value={endMinutes}
                      onChange={setEndMinutes}
                      accessibilityLabel="End time"
                    />
                  </View>
                </>
              ) : null}
              <View style={styles.field}>
                <Text variant="label" tone="secondary">
                  Label (optional)
                </Text>
                <Segmented
                  options={[
                    { value: 'annual', label: 'Closed' },
                    { value: 'sick', label: 'Unavailable' },
                    { value: 'other', label: 'Other' },
                  ]}
                  value={leaveType}
                  onChange={setLeaveType}
                />
              </View>
            </>
          )}

          <Input
            label="Notes (optional)"
            value={reason}
            onChangeText={setReason}
            placeholder={
              entryKind === 'hours'
                ? 'e.g. Late opening for the fair'
                : 'e.g. Training day, equipment maintenance'
            }
            // The server caps closure notes at 500 characters, an amended-hours note at 200.
            maxLength={entryKind === 'closed' ? 500 : AMENDED_HOURS_MAX_REASON_LENGTH}
          />

          {/* What the hours form is about to do to leave and to the venue's hours (web #187). */}
          {amendedLeaveNote ? (
            <Text variant="bodySmall" tone={amendedLeaveNote.blocking ? 'danger' : 'secondary'}>
              {amendedLeaveNote.text}
            </Text>
          ) : null}
          {amendedVenueNote ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                setSheetOpen(false);
                router.push('/manage/hours' as Href);
              }}
              hitSlop={4}>
              <Text variant="bodySmall" tone="secondary">
                {amendedVenueNote}
              </Text>
            </Pressable>
          ) : null}

          {sheetError ? (
            <Text variant="bodySmall" tone="danger">
              {sheetError}
            </Text>
          ) : null}

          {amendedAck ? (
            <ConfirmPanel
              title="Save these hours anyway?"
              message={amendedAck.message}
              confirmLabel="Save anyway"
              loading={putAmended.isPending}
              onConfirm={() => void saveAmendedHours(true)}
              onCancel={() => {
                if (!putAmended.isPending) setAmendedAck(null);
              }}
            />
          ) : (
            <>
              <View style={styles.actionRow}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={styles.flex1}
                  onPress={() => setSheetOpen(false)}
                />
                <Button
                  label={editing ? 'Save changes' : 'Add to calendar'}
                  style={styles.flex1}
                  loading={saving}
                  disabled={
                    (!applyToAll && !practitionerId && !editing) ||
                    amendedLeaveNote?.blocking === true ||
                    deletingCurrent
                  }
                  onPress={() => void handleSave()}
                />
              </View>
              {/* Delete while editing (web: the red Delete button in the form). */}
              {editing ? (
                <Button
                  label={
                    pendingConfirm === 'sheet-delete'
                      ? 'Tap to confirm'
                      : editingAmended
                        ? 'Delete these amended hours'
                        : 'Delete this closure'
                  }
                  variant="ghost"
                  loading={deletingCurrent}
                  disabled={saving || deletingCurrent}
                  customColors={{ background: 'transparent', text: colors.danger }}
                  onPress={() => {
                    if (pendingConfirm !== 'sheet-delete') {
                      armConfirm('sheet-delete');
                      return;
                    }
                    if (editingAmended) void handleDeleteAmended(editingAmended);
                    else if (editingLeaveId) void handleDeleteLeave(editingLeaveId);
                  }}
                />
              ) : null}
              {pendingConfirm === 'sheet-delete' && editing ? (
                <Text variant="caption" tone="muted">
                  {editingAmended
                    ? 'Remove these amended hours? The dates go back to the calendar’s usual hours.'
                    : 'Remove this closure from the calendar?'}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  tabStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabStripContent: {
    paddingHorizontal: spacing.base,
    gap: spacing.base,
  },
  tab: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
  },
  tabLabelSelected: {
    fontFamily: fonts.bold,
  },
  content: {
    padding: spacing.base,
    gap: spacing.base,
  },
  selector: {
    gap: spacing.xs,
  },
  chipRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  infoBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  infoText: {
    lineHeight: 18,
  },
  legacyBanner: {
    borderWidth: 1,
    gap: spacing.xs,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  list: {
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
    gap: 2,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
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
  field: {
    gap: spacing.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  periodBlock: {
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

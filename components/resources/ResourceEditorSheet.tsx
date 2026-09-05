import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  ResourceExceptionsEditor,
  resourceExceptionsFromJSON,
  resourceExceptionsToJSON,
  type ResourceExceptionsMap,
} from '@/components/resources/ResourceExceptionsEditor';
import {
  ResourceWeekHoursEditor,
  defaultResourceWeekHours,
  resourceWeekHoursFromJSON,
  resourceWeekHoursToJSON,
  type ResourceWeekHours,
} from '@/components/resources/ResourceWeekHoursEditor';
import { timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateHostCalendar } from '@/lib/queries/usePractitioners';
import {
  useCreateResource,
  useUpdateResource,
  type HostCalendar,
} from '@/lib/queries/useResourcesManage';
import { useSetupStatus } from '@/lib/queries/useSetupStatus';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { Resource, ResourcePaymentRequirement } from '@/types/resources-manage';

/** Free-text category quick-picks (web `RESOURCE_TYPE_SUGGESTIONS`). */
const TYPE_SUGGESTIONS = [
  'Tennis Court', 'Meeting Room', 'Studio', 'Pitch', 'Equipment', 'Desk', 'Bay', 'Lane', 'Pod',
];

/**
 * The four payment options every venue can choose from (exact web copy). Card
 * hold (spec 6.2) is a standard option; it is no longer gated by a venue flag.
 */
const PAYMENT_OPTIONS: { value: ResourcePaymentRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No online payment', hint: 'Pay at the venue or arrange separately' },
  { value: 'deposit', label: 'Custom deposit', hint: 'Fixed amount paid online when booking' },
  { value: 'full_payment', label: 'Pay in full online', hint: 'Full price taken at booking' },
  {
    value: 'card_hold',
    label: 'Card hold',
    hint: 'No payment is taken when the client books. Their card is stored securely and you can charge a no-show fee if they do not attend.',
  },
];

/** Shortest-booking floor (server `resourceSchema` min). */
const MIN_BOOKING_FLOOR = 15;

/**
 * Shortest booking when it "follows the start-time step": the venue floor, or the
 * slot itself when the slot is larger. Ports the web `syncedMinBookingMinutesFromSlot`.
 */
function syncedMinBookingMinutesFromSlot(slotMinutes: number, floorMinutes: number): number {
  if (!Number.isFinite(slotMinutes)) return floorMinutes;
  return Math.max(floorMinutes, slotMinutes);
}

/** "0"–"6" / "sun"–"sat" → ordered, valid ranges (minutes) for one weekday. */
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

type HostWorkingHours = NonNullable<HostCalendar['working_hours']>;

function calendarRangesForDay(
  hours: HostWorkingHours,
  dayIndex0to6: number,
): { start: number; end: number }[] {
  const ranges = hours[String(dayIndex0to6)] ?? hours[DAY_NAMES[dayIndex0to6]!] ?? [];
  return ranges
    .map((r) => ({ start: timeToMinutes(r.start), end: timeToMinutes(r.end) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
}

/** Merge overlapping/adjacent ranges for a day so coverage checks are gap-aware. */
function mergedCalendarRangesForDay(
  hours: HostWorkingHours,
  dayIndex0to6: number,
): { start: number; end: number }[] {
  const ranges = calendarRangesForDay(hours, dayIndex0to6);
  if (ranges.length === 0) return [];
  const merged: { start: number; end: number }[] = [{ ...ranges[0]! }];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * True when any enabled resource day's range falls outside the host calendar's
 * hours for that weekday (web `resourceHoursOutsideCalendar`). Used to warn
 * before save that the resource will only be bookable where hours overlap.
 */
function resourceHoursOutsideCalendar(
  week: ResourceWeekHours,
  hours: HostWorkingHours,
): boolean {
  for (const key of Object.keys(week)) {
    const day = week[key];
    if (!day?.enabled) continue;
    const start = timeToMinutes(day.start);
    const end = timeToMinutes(day.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const calendarRanges = mergedCalendarRangesForDay(hours, Number(key));
    if (calendarRanges.length === 0) return true;
    const covered = calendarRanges.some((r) => r.start <= start && end <= r.end);
    if (!covered) return true;
  }
  return false;
}

/** Web `RESOURCE_CALENDAR_LIMIT_WARNING`. */
const CALENDAR_RESTRICTION_WARNING =
  'This resource has hours outside the selected calendar. It will only be bookable when venue, calendar, and resource hours all allow it.';

/**
 * Per-field help copy ported verbatim from the web resource form
 * (`_reference/Resneo/src/lib/help/resource-booking-tooltips.ts`). Surfaced via a
 * tappable {@link HelpTooltip} next to the slot-interval + shortest-booking labels
 * so the longer explanation is available without crowding the inline helper text.
 */
const RESOURCE_SLOT_INTERVAL_HELP =
  'How often a guest may start a booking: start times move forward in steps of this many minutes from the beginning of each open period (e.g. 60 = on the hour only; 30 = on the hour and :30). This is not extra buffer after a booking ends—if a session ends between grid times, that gap can stay empty until the next allowed start. Online pricing uses the same step: total price = (price per step) × (booking length ÷ this many minutes).';

const RESOURCE_MIN_BOOKING_HELP =
  'Shortest session length you allow for availability checks. By default it matches the start-time step; use “Advanced” only when you want a finer grid but a longer minimum (e.g. start every 15 minutes, book at least 60). Guest duration choices increase from this value in steps of the start-time step.';

/**
 * True when a save error reads like a host-calendar clash — the server's 409s
 * ("another resource … overlaps", or the column "already has" bookings/classes/
 * events "during times when this resource" is available). This is the most common
 * reason a create fails on an active venue, so we use it to steer the user toward
 * a dedicated, conflict-free column rather than leaving a dead-end error.
 */
function isCalendarConflictError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('overlap') ||
    m.includes('already has') ||
    m.includes('during times when this resource') ||
    m.includes('another resource on this calendar')
  );
}

/** What the sheet is editing: a brand-new resource, or an existing one. */
export type ResourceEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; resource: Resource };

type ResourceEditorSheetProps = {
  target: ResourceEditorTarget | null;
  /** Non-resource calendar columns this resource can be hosted on (required pick). */
  hostCalendars: HostCalendar[];
  onClose: () => void;
  /** Called after a successful create/update so the parent can refresh + toast. */
  onSaved?: () => void;
};

/**
 * Full create/edit editor for a bookable resource (court, room, bay…). Sections:
 * Basics (name, type), Show on calendar (required host column), Booking rules
 * (slot/min/max + guest window), Pricing & payment (radio none/deposit/full +
 * conditional deposit + active), and Weekly hours. Client validation mirrors the
 * server `resourceSchema` so errors surface before the request.
 *
 * @see _reference/Resneo/src/app/dashboard/resource-timeline/ResourceTimelineView.tsx
 * @see _reference/Resneo/src/app/api/venue/resources/route.ts (resourceSchema)
 */
export function ResourceEditorSheet({
  target,
  hostCalendars,
  onClose,
  onSaved,
}: ResourceEditorSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const isAdmin = venue?.current_user_role === 'admin';
  const create = useCreateResource();
  const update = useUpdateResource();
  const createCalendar = useCreateHostCalendar();
  const setupStatus = useSetupStatus();
  const stripeConnected = setupStatus.data?.stripe_connected ?? true;

  const editing = target?.mode === 'edit' ? target.resource : null;

  // Form state.
  const [name, setName] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [hostId, setHostId] = useState<string | null>(null);
  const [slot, setSlot] = useState('30');
  const [minMinutes, setMinMinutes] = useState('30');
  const [maxMinutes, setMaxMinutes] = useState('120');
  const [price, setPrice] = useState('');
  const [paymentReq, setPaymentReq] = useState<ResourcePaymentRequirement>('none');
  const [deposit, setDeposit] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [advanceDays, setAdvanceDays] = useState('90');
  const [noticeHours, setNoticeHours] = useState('1');
  const [cancelHours, setCancelHours] = useState('24');
  const [sameDay, setSameDay] = useState(true);
  const [week, setWeek] = useState<ResourceWeekHours>(defaultResourceWeekHours);
  const [exceptions, setExceptions] = useState<ResourceExceptionsMap>({});
  const [error, setError] = useState<string | null>(null);
  // Shortest booking follows the start-time step unless "Advanced" is on (web parity).
  const [advancedMin, setAdvancedMin] = useState(false);

  // Inline "Add calendar" (admin) — columns created here are held locally and
  // selected optimistically so a fresh venue isn't blocked waiting for a refetch.
  const [addedHosts, setAddedHosts] = useState<HostCalendar[]>([]);
  const [showAddCalendar, setShowAddCalendar] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Host that was saved on the resource but is no longer in the list (e.g. column
  // deleted) — keep it selectable so editing doesn't silently drop it.
  const orphanHost = useMemo<HostCalendar | null>(() => {
    if (!editing?.display_on_calendar_id) return null;
    if (hostCalendars.some((c) => c.id === editing.display_on_calendar_id)) return null;
    if (addedHosts.some((c) => c.id === editing.display_on_calendar_id)) return null;
    return { id: editing.display_on_calendar_id, name: 'Saved calendar' };
  }, [editing, hostCalendars, addedHosts]);

  const hostOptions = useMemo<HostCalendar[]>(() => {
    // De-dupe in case a freshly-added column also lands in the refetched feed.
    const seen = new Set<string>();
    const merged: HostCalendar[] = [];
    for (const c of [...hostCalendars, ...addedHosts, ...(orphanHost ? [orphanHost] : [])]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
    return merged;
  }, [hostCalendars, addedHosts, orphanHost]);

  // The selected host's weekly working hours (drives Match-hours + the
  // outside-calendar warning). Only the host feed carries `working_hours`.
  const selectedHostHours = useMemo<HostCalendar['working_hours'] | null>(() => {
    if (!hostId) return null;
    return hostOptions.find((c) => c.id === hostId)?.working_hours ?? null;
  }, [hostId, hostOptions]);

  // Live "hours outside the selected calendar" warning (web `formCalendarRestrictionWarning`).
  const hoursOutsideCalendar = useMemo(() => {
    if (!selectedHostHours) return false;
    return resourceHoursOutsideCalendar(week, selectedHostHours);
  }, [week, selectedHostHours]);

  // Seed the form whenever the target changes (open).
  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setError(null);
    setAddedHosts([]);
    setShowAddCalendar(false);
    setNewCalendarName('');
    setCalendarError(null);
    if (target.mode === 'edit') {
      const r = target.resource;
      setName(r.name);
      setResourceType(r.resource_type ?? '');
      setHostId(r.display_on_calendar_id ?? null);
      setSlot(String(r.slot_interval_minutes));
      setMinMinutes(String(r.min_booking_minutes));
      setMaxMinutes(String(r.max_booking_minutes));
      // "Advanced" stays on only when the saved min exceeds the slot-synced value.
      setAdvancedMin(
        r.min_booking_minutes !==
          syncedMinBookingMinutesFromSlot(r.slot_interval_minutes, MIN_BOOKING_FLOOR),
      );
      setPrice(penceToPoundsInput(r.price_per_slot_pence));
      setPaymentReq(r.payment_requirement ?? 'none');
      setDeposit(penceToPoundsInput(r.deposit_amount_pence));
      setIsActive(r.is_active !== false);
      setAdvanceDays(String(r.max_advance_booking_days ?? 90));
      setNoticeHours(String(r.min_booking_notice_hours ?? 1));
      setCancelHours(String(r.cancellation_notice_hours ?? 48));
      setSameDay(r.allow_same_day_booking !== false);
      setWeek(resourceWeekHoursFromJSON(r.availability_hours));
      setExceptions(resourceExceptionsFromJSON(r.availability_exceptions));
    } else {
      setName('');
      setResourceType('');
      // Do NOT auto-target an existing column. The first team calendar is usually
      // a busy practitioner calendar, and the server rejects a resource whose
      // weekly hours clash with that column's bookings/classes/events (409). Start
      // unset so the user consciously picks a free column or — recommended —
      // creates a dedicated one. Matches the web form, which also defaults to none.
      setHostId(null);
      setSlot('30');
      // Shortest booking follows the start-time step by default (Advanced off).
      setMinMinutes(String(syncedMinBookingMinutesFromSlot(30, MIN_BOOKING_FLOOR)));
      setAdvancedMin(false);
      setMaxMinutes('120');
      setPrice('');
      setPaymentReq('none');
      setDeposit('');
      setIsActive(true);
      setAdvanceDays('90');
      setNoticeHours('1');
      setCancelHours('48');
      setSameDay(true);
      setWeek(defaultResourceWeekHours());
      setExceptions({});
    }
    // Re-seed only when the target changes (open / switch between create & edit).
  }, [target]);

  const saving = create.isPending || update.isPending;

  // Changing the start-time step keeps the synced shortest-booking in lock-step
  // while "Advanced" is off (web behaviour); a free value is preserved when on.
  function onSlotChange(next: string) {
    setSlot(next);
    if (!advancedMin) {
      const slotNum = Number(next);
      setMinMinutes(
        Number.isFinite(slotNum) && slotNum > 0
          ? String(syncedMinBookingMinutesFromSlot(slotNum, MIN_BOOKING_FLOOR))
          : String(MIN_BOOKING_FLOOR),
      );
    }
  }

  function onToggleAdvancedMin(on: boolean) {
    setAdvancedMin(on);
    // Switching back to synced snaps the shortest booking to the step value.
    if (!on) {
      const slotNum = Number(slot);
      setMinMinutes(
        Number.isFinite(slotNum) && slotNum > 0
          ? String(syncedMinBookingMinutesFromSlot(slotNum, MIN_BOOKING_FLOOR))
          : String(MIN_BOOKING_FLOOR),
      );
    }
  }

  // Copy the selected host calendar's weekly hours into the editor (web "Match
  // calendar hours"). Reuses the shared JSON → editor converter for parity.
  function matchCalendarHours() {
    if (!selectedHostHours) return;
    hapticSuccess();
    setWeek(resourceWeekHoursFromJSON(selectedHostHours));
  }

  async function handleAddCalendar() {
    const trimmed = newCalendarName.trim();
    if (!trimmed) {
      setCalendarError('Enter a calendar name.');
      return;
    }
    setCalendarError(null);
    try {
      const created = await createCalendar.mutateAsync({ name: trimmed });
      const host: HostCalendar = {
        id: created.id,
        name: created.name,
        working_hours: created.working_hours,
      };
      setAddedHosts((prev) => [...prev, host]);
      setHostId(created.id);
      setNewCalendarName('');
      setShowAddCalendar(false);
      hapticSuccess();
      toast.success(`"${created.name}" added.`);
    } catch (e) {
      hapticWarning();
      // Surface the 403 upgrade_required / limit message verbatim.
      setCalendarError(e instanceof ApiError ? e.message : 'Could not create the calendar.');
    }
  }

  async function handleSave() {
    setError(null);
    const slotMins = Number(slot);
    // When "Advanced" is off the shortest booking follows the start-time step
    // (web `syncedMinBookingMinutesFromSlot`); only a free value is read raw.
    const minMins = advancedMin
      ? Number(minMinutes)
      : syncedMinBookingMinutesFromSlot(slotMins, MIN_BOOKING_FLOOR);
    const maxMins = Number(maxMinutes);
    const advance = Number(advanceDays);
    const notice = Number(noticeHours);
    const cancel = Number(cancelHours);

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!hostId) { setError('Choose a calendar to show this resource on.'); return; }
    if (!Number.isInteger(slotMins) || slotMins < 5 || slotMins > 480) {
      setError('Slot interval must be 5–480 minutes.'); return;
    }
    if (!Number.isInteger(minMins) || minMins < 15 || minMins > 480) {
      setError('Shortest booking must be 15–480 minutes.'); return;
    }
    if (!Number.isInteger(maxMins) || maxMins < 15 || maxMins > 1440) {
      setError('Longest booking must be 15–1440 minutes.'); return;
    }
    if (minMins > maxMins) {
      setError('Shortest booking can’t be longer than the longest booking.'); return;
    }
    if (!Number.isInteger(advance) || advance < 1 || advance > 365) {
      setError('Book ahead must be 1–365 days.'); return;
    }
    if (!Number.isInteger(notice) || notice < 0 || notice > 168) {
      setError('Min notice must be 0–168 hours.'); return;
    }
    if (!Number.isInteger(cancel) || cancel < 0 || cancel > 168) {
      setError('Cancellation notice must be 0–168 hours.'); return;
    }

    const pricePence = parsePoundsToPence(price);
    const depositPence = parsePoundsToPence(deposit);
    if (pricePence === undefined || depositPence === undefined) {
      setError('Price and deposit must be valid amounts.'); return;
    }
    const effectivePrice = pricePence ?? 0;
    if ((paymentReq === 'deposit' || paymentReq === 'full_payment') && effectivePrice <= 0) {
      setError('Set a price per slot before choosing deposit or full payment.'); return;
    }
    if (paymentReq === 'deposit' && !(depositPence != null && depositPence > 0)) {
      setError('Enter a deposit amount greater than zero.'); return;
    }
    // Mirror the server's deposit ceiling: deposit ≤ price × max bookable slots.
    if (paymentReq === 'deposit' && depositPence != null && effectivePrice > 0) {
      const maxTotal = effectivePrice * Math.max(1, Math.ceil(maxMins / slotMins));
      if (depositPence > maxTotal) {
        setError('Deposit can’t exceed the maximum booking total.'); return;
      }
    }
    // Card hold (spec 6.2): no price relationship — the flat no-show fee just
    // has to be at least £1.
    if (paymentReq === 'card_hold' && !(depositPence != null && depositPence >= 100)) {
      setError('No-show fee must be at least £1.'); return;
    }

    // Every weekly range + amended exception must end after it starts (the API
    // stores hours verbatim with no order check).
    const availabilityHours = resourceWeekHoursToJSON(week);
    const availabilityExceptions = resourceExceptionsToJSON(exceptions);
    for (const ranges of Object.values(availabilityHours)) {
      for (const range of ranges) {
        if (timeToMinutes(range.end) <= timeToMinutes(range.start)) {
          setError('Each open day’s end time must be after its start time.'); return;
        }
      }
    }
    for (const exception of Object.values(availabilityExceptions)) {
      if ('periods' in exception) {
        for (const range of exception.periods) {
          if (timeToMinutes(range.end) <= timeToMinutes(range.start)) {
            setError('Each amended date’s end time must be after its start time.'); return;
          }
        }
      }
    }

    const shared = {
      name: name.trim(),
      resource_type: resourceType.trim() || undefined,
      display_on_calendar_id: hostId,
      slot_interval_minutes: slotMins,
      min_booking_minutes: minMins,
      max_booking_minutes: maxMins,
      // Omitted, never null, when the price is blank: the schema is `.optional()`
      // and would 400 on null, making every FREE resource unsaveable. Mirrors the
      // web, which spreads the key in only when a price was typed.
      ...(pricePence != null ? { price_per_slot_pence: pricePence } : {}),
      payment_requirement: paymentReq,
      // 'card_hold' stores the flat no-show fee in the same column (spec D5).
      deposit_amount_pence:
        paymentReq === 'deposit' || paymentReq === 'card_hold' ? depositPence ?? null : null,
      is_active: isActive,
      availability_hours: availabilityHours,
      availability_exceptions: availabilityExceptions,
      max_advance_booking_days: advance,
      min_booking_notice_hours: notice,
      cancellation_notice_hours: cancel,
      allow_same_day_booking: sameDay,
    };

    try {
      const result = editing
        ? await update.mutateAsync({ id: editing.id, ...shared })
        : await create.mutateAsync(shared);
      hapticSuccess();
      toast.success(editing ? 'Resource updated.' : 'Resource created.');
      if (result?.availability_warning) {
        toast.info(result.availability_warning);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      hapticWarning();
      const message = e instanceof ApiError ? e.message : 'Could not save the resource.';
      setError(message);
      // A calendar clash (409) is the most common create failure: the chosen
      // column already has bookings/classes/events at the resource's hours. Open
      // the "new calendar" form (prefilled with the resource name) so an admin can
      // give it a dedicated, conflict-free column in one step.
      if (isAdmin && isCalendarConflictError(message)) {
        setShowAddCalendar(true);
        if (!newCalendarName.trim()) setNewCalendarName(name.trim());
      }
    }
  }

  // Show extra "use a dedicated column" guidance under a calendar-clash error.
  const showConflictHint = error !== null && isCalendarConflictError(error);

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.bodyWrap}>
        <Text variant="overline" tone="muted">
          {editing ? 'Edit resource' : 'New resource'}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {/* Basics */}
          <Input label="Name" value={name} onChangeText={setName} maxLength={200} />
          <Input
            label="Type (optional)"
            helper="e.g. Tennis Court, Meeting Room"
            value={resourceType}
            onChangeText={setResourceType}
            maxLength={100}
          />
          <View style={styles.chipRow}>
            {TYPE_SUGGESTIONS.map((suggestion) => {
              const selected = resourceType.trim().toLowerCase() === suggestion.toLowerCase();
              return (
                <Pressable
                  key={suggestion}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setResourceType(suggestion)}
                  style={({ pressed }) => [
                    styles.suggestChip,
                    {
                      backgroundColor: selected ? colors.brandSubtle : colors.surface,
                      borderColor: selected ? colors.brand : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <Text variant="caption" color={selected ? colors.brand : colors.textSecondary}>
                    {suggestion}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Host calendar — required single-select */}
          <Text variant="overline" tone="muted">Show on calendar</Text>
          <Text variant="caption" tone="muted">
            Each resource appears on a team calendar column. Give it its own column to avoid
            clashing with staff bookings — two resources can share a column only when their
            weekly hours don&apos;t overlap.
          </Text>
          {hostOptions.length === 0 && !isAdmin ? (
            <Text variant="bodySmall" tone="danger">
              No calendars are available. Ask an admin to create a team calendar first.
            </Text>
          ) : null}
          {hostOptions.length > 0 ? (
            <View style={styles.columnWrap}>
              {hostOptions.map((column) => {
                const selected = hostId === column.id;
                return (
                  <Pressable
                    key={column.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setHostId(column.id)}
                    style={({ pressed }) => [
                      styles.columnChip,
                      {
                        backgroundColor: selected ? colors.brand : colors.surface,
                        borderColor: selected ? colors.brand : colors.border,
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}>
                    <Text
                      variant="label"
                      color={selected ? colors.onBrand : colors.textSecondary}
                      numberOfLines={1}>
                      {column.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Inline "Add calendar" — admin only (web :1286). On create this is the
              recommended path: a dedicated, empty column never clashes with bookings. */}
          {isAdmin ? (
            <View style={[styles.addCalendarCard, { borderColor: colors.border }]}>
              {showAddCalendar ? (
                <>
                  <Input
                    label="New calendar name"
                    placeholder="e.g. Room 1"
                    value={newCalendarName}
                    onChangeText={setNewCalendarName}
                    maxLength={200}
                    autoFocus
                    error={calendarError ?? undefined}
                  />
                  <Text variant="caption" tone="muted">
                    Creates a team calendar column and selects it for this resource. Refine its
                    weekly hours later in Calendar availability.
                  </Text>
                  <View style={styles.addCalendarActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      size="sm"
                      style={styles.flex1}
                      onPress={() => {
                        setShowAddCalendar(false);
                        setNewCalendarName('');
                        setCalendarError(null);
                      }}
                    />
                    <Button
                      label="Create and select"
                      size="sm"
                      style={styles.flex1}
                      loading={createCalendar.isPending}
                      onPress={() => void handleAddCalendar()}
                    />
                  </View>
                </>
              ) : (
                <Button
                  label={
                    hostOptions.length === 0
                      ? 'Create a calendar for this resource'
                      : 'New calendar for this resource'
                  }
                  // Prominent while nothing's chosen yet (the recommended path);
                  // a quiet secondary once a column is already selected.
                  variant={hostId ? 'secondary' : 'primary'}
                  size="sm"
                  onPress={() => {
                    setShowAddCalendar(true);
                    setCalendarError(null);
                    // Prefill the column name from the resource name so one tap
                    // creates e.g. "Court 1" → its own "Court 1" calendar column.
                    if (!newCalendarName.trim()) setNewCalendarName(name.trim());
                  }}
                />
              )}
            </View>
          ) : null}

          {/* Booking rules */}
          <Text variant="overline" tone="muted">Booking rules</Text>
          <View style={styles.labelledField}>
            <View style={styles.labelRow}>
              <Text variant="label" tone="secondary">Start times every (mins)</Text>
              <HelpTooltip
                title="Start times every (mins)"
                accessibilityLabel="Help: start times every (mins)">
                {RESOURCE_SLOT_INTERVAL_HELP}
              </HelpTooltip>
            </View>
            <Input
              helper="Spacing of bookable start times."
              value={slot}
              onChangeText={onSlotChange}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.advancedLabel}>
              <Text variant="bodyMedium">Longer minimum than start-time step</Text>
              <Text variant="caption" tone="muted">
                {advancedMin
                  ? 'Set a shortest booking above the start-time step.'
                  : 'Shortest booking follows the start-time step.'}
              </Text>
            </View>
            <Switch value={advancedMin} onValueChange={onToggleAdvancedMin} />
          </View>
          <View style={styles.row}>
            <View style={[styles.field, styles.labelledField]}>
              <View style={styles.labelRow}>
                <Text variant="label" tone="secondary">Shortest (mins)</Text>
                <HelpTooltip
                  title="Shortest booking (mins)"
                  accessibilityLabel="Help: shortest booking (mins)">
                  {RESOURCE_MIN_BOOKING_HELP}
                </HelpTooltip>
              </View>
              <Input
                helper={advancedMin ? undefined : 'Matches the start-time step.'}
                value={minMinutes}
                onChangeText={setMinMinutes}
                keyboardType="number-pad"
                editable={advancedMin}
                style={advancedMin ? undefined : styles.disabledInput}
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Longest (mins)"
                value={maxMinutes}
                onChangeText={setMaxMinutes}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.field}>
              <Input
                label="Book ahead (days)"
                value={advanceDays}
                onChangeText={setAdvanceDays}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.field}>
              <Input
                label="Min notice (hours)"
                value={noticeHours}
                onChangeText={setNoticeHours}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <Input
            label="Cancellation notice (hours)"
            helper="Refund cut-off for deposits and online payments."
            value={cancelHours}
            onChangeText={setCancelHours}
            keyboardType="number-pad"
          />
          <View style={styles.switchRow}>
            <Text variant="bodyMedium">Allow same-day bookings</Text>
            <Switch value={sameDay} onValueChange={setSameDay} />
          </View>

          {/* Pricing & payment */}
          <Text variant="overline" tone="muted">Pricing &amp; payment</Text>
          <Input
            label="Price per slot (£)"
            helper="Leave blank for free."
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          {PAYMENT_OPTIONS.map((option) => {
            const selected = paymentReq === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setPaymentReq(option.value)}
                style={({ pressed }) => [
                  styles.radioRow,
                  {
                    borderColor: selected ? colors.brand : colors.border,
                    backgroundColor: selected ? colors.brandSubtle : colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.radioDot,
                    { borderColor: selected ? colors.brand : colors.borderStrong },
                  ]}>
                  {selected ? (
                    <View style={[styles.radioDotInner, { backgroundColor: colors.brand }]} />
                  ) : null}
                </View>
                <View style={styles.radioText}>
                  <Text variant="bodyMedium">{option.label}</Text>
                  <Text variant="caption" tone="muted">{option.hint}</Text>
                </View>
              </Pressable>
            );
          })}
          {paymentReq === 'deposit' || paymentReq === 'card_hold' ? (
            <Input
              label={paymentReq === 'card_hold' ? 'No-show fee (£)' : 'Deposit (£)'}
              helper={paymentReq === 'card_hold' ? 'The no-show fee must be at least £1.' : undefined}
              value={deposit}
              onChangeText={setDeposit}
              keyboardType="decimal-pad"
            />
          ) : null}
          {paymentReq !== 'none' && !stripeConnected ? (
            <Text variant="caption" color={colors.warning}>
              Connect Stripe (Plan &amp; payments) to take online payments — bookings will fall
              back to pay-at-venue until then.
            </Text>
          ) : null}
          <View style={styles.switchRow}>
            <Text variant="bodyMedium">Active (bookable by guests)</Text>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>

          {/* Weekly hours */}
          <Text variant="overline" tone="muted">Weekly availability</Text>
          <Text variant="caption" tone="muted">
            Guests can only book when resource, venue, and host calendar hours all overlap.
          </Text>
          {hoursOutsideCalendar ? (
            <View
              style={[
                styles.warningBanner,
                { backgroundColor: colors.warningSurface, borderColor: colors.warning },
              ]}>
              <Text variant="caption" color={colors.warning}>
                {CALENDAR_RESTRICTION_WARNING}
              </Text>
            </View>
          ) : null}
          <ResourceWeekHoursEditor
            value={week}
            onChange={setWeek}
            onMatchCalendar={selectedHostHours ? matchCalendarHours : undefined}
            matchCalendarLabel="Match selected calendar’s hours"
          />

          {/* Date exceptions */}
          <Text variant="overline" tone="muted">Date exceptions (optional)</Text>
          <Text variant="caption" tone="muted">
            Closures or special hours on specific dates (holidays, one-off events). Tap a day to
            select it (tap a second day for a range), or tap a marked day to edit it.
          </Text>
          <ResourceExceptionsEditor
            key={editing ? editing.id : 'new'}
            value={exceptions}
            onChange={setExceptions}
          />

          {error ? (
            <View style={styles.errorBlock}>
              <Text variant="bodySmall" tone="danger">
                {error}
              </Text>
              {showConflictHint ? (
                <Text variant="caption" tone="muted">
                  {isAdmin
                    ? 'Tip: give this resource its own calendar column (use “New calendar for this resource” above) so its hours don’t clash with staff bookings, classes, or events.'
                    : 'Ask an admin to put this resource on its own calendar column, or narrow its weekly hours so they don’t clash with what’s already booked.'}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" style={styles.flex1} onPress={onClose} />
          <Button
            label="Save"
            style={styles.flex1}
            loading={saving}
            onPress={() => void handleSave()}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bodyWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  advancedLabel: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  disabledInput: {
    opacity: 0.5,
  },
  labelledField: {
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  warningBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorBlock: {
    gap: spacing.xs,
  },
  addCalendarCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  addCalendarActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  columnWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  columnChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  radioText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});

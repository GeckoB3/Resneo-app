import { format } from 'date-fns';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError, isApiErrorBody } from '@/lib/api/client';
import { calendarDateInTimeZone } from '@/lib/dates/venue-dates';
import { parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateEvent, useUpdateEvent } from '@/lib/queries/useEventsManage';
import { useCreateHostCalendar, usePractitioners } from '@/lib/queries/usePractitioners';
import { useSetupStatus } from '@/lib/queries/useSetupStatus';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  EventPaymentRequirement,
  EventScheduleInput,
  EventTicketWriteInput,
  ManagedEvent,
} from '@/types/events-manage';

const PAYMENT_OPTIONS: { value: EventPaymentRequirement; label: string; hint: string }[] = [
  { value: 'none', label: 'No online payment', hint: 'Pay at the venue or arrange separately' },
  { value: 'deposit', label: 'Custom deposit', hint: 'Fixed amount paid online when booking' },
  { value: 'full_payment', label: 'Pay in full online', hint: 'Full ticket price taken at booking' },
];

/** One editable ticket-tier row. `key` is a stable local id for the list. */
type TicketDraft = { key: string; name: string; price: string; capacity: string };

let ticketKeySeq = 0;
function nextTicketKey(): string {
  ticketKeySeq += 1;
  return `t${ticketKeySeq}`;
}

function blankTicket(): TicketDraft {
  return { key: nextTicketKey(), name: '', price: '', capacity: '' };
}

/**
 * How a NEW event repeats (create mode only — edit is always single-date).
 * Mirrors the server `scheduleSchema` discriminator.
 */
type ScheduleMode = 'single' | 'weekly' | 'custom';

const SCHEDULE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
];

/** One extra custom date row. `key` is a stable local id for the list. */
type CustomDateDraft = { key: string; date: string };

let customDateKeySeq = 0;
function nextCustomDateKey(): string {
  customDateKeySeq += 1;
  return `d${customDateKeySeq}`;
}

/** "HH:mm[:ss]" → minutes since midnight (tolerant of seconds). */
function hhmmToMinutes(time: string): number {
  return timeToMinutes(time.slice(0, 5));
}

/** "YYYY-MM-DD" → a local noon Date (noon avoids any tz day-boundary slip). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Zod flatten() shape the API returns under `details` for a 400. */
type ZodFlattened = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

/** First human-readable message from a zod flatten() body, or null. */
function firstZodDetail(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const d = details as ZodFlattened;
  if (Array.isArray(d.formErrors) && d.formErrors.length > 0 && d.formErrors[0]) {
    return d.formErrors[0];
  }
  for (const vals of Object.values(d.fieldErrors ?? {})) {
    if (vals && vals.length > 0 && vals[0]) return vals[0];
  }
  return null;
}

/**
 * Turn a save failure into a clear inline message. Surfaces the server's
 * structured errors that the plain `ApiError.message` hides:
 *  - 403 plan-limit (`upgrade_required` with `current`/`limit`) → upgrade hint.
 *  - 400 with zod `details` → the first field message appended.
 * @see _reference/Resneo/.../EventManagerView.tsx handleSaveEvent
 */
function formatSaveError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not save the event.';
  const body = error.body as
    | (Partial<{ error: string; details: unknown }> & {
        upgrade_required?: boolean;
        current?: number;
        limit?: number;
      })
    | undefined;

  if (error.status === 403 && body?.upgrade_required) {
    const current = body.current ?? '?';
    const limit = body.limit ?? '?';
    return `Plan limit reached: ${current} of ${limit} active events. Upgrade your plan or deactivate old events.`;
  }

  if (isApiErrorBody(body)) {
    const detail = firstZodDetail(body.details);
    if (detail) return `${error.message}: ${detail}`;
  }

  return error.message;
}

/** What the sheet is editing: a brand-new event, or an existing one. */
export type EventEditorTarget =
  | { mode: 'create' }
  | { mode: 'edit'; event: ManagedEvent };

type EventEditorSheetProps = {
  target: EventEditorTarget | null;
  onClose: () => void;
  onSaved?: () => void;
};

/**
 * Full create/edit editor for a ticketed event. Sections: Basics (name,
 * description, date, time, capacity, image), Ticket types (repeater, ≥1 named),
 * Calendar column, Booking rules, and Payment (radio none/deposit/full + deposit
 * + Stripe warning). Ticket types are REPLACE-ALL on save. Client validation
 * mirrors the server `eventSchema`.
 *
 * @see _reference/Resneo/src/app/dashboard/event-manager/EventManagerView.tsx
 * @see _reference/Resneo/src/app/api/venue/experience-events/route.ts (eventSchema)
 */
export function EventEditorSheet({ target, onClose, onSaved }: EventEditorSheetProps) {
  const { colors } = useTheme();
  const toast = useToast();
  const { venue } = useVenueContext();
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = useMemo(() => calendarDateInTimeZone(new Date(), timeZone), [timeZone]);
  // Non-admins must place an event on a calendar they control (server enforces
  // on create — see experience-events/route.ts). Threading the role lets us
  // require it inline instead of bouncing the user off a server 400.
  const isAdmin = venue?.current_user_role === 'admin';

  const create = useCreateEvent();
  const update = useUpdateEvent();
  const setupStatus = useSetupStatus();
  const stripeConnected = setupStatus.data?.stripe_connected ?? true;
  const practitionersQuery = usePractitioners();
  const createCalendar = useCreateHostCalendar();

  // Locally-added calendar columns (from the inline "Add calendar" affordance),
  // kept until the practitioners query refetches and absorbs them.
  const [extraColumns, setExtraColumns] = useState<{ id: string; name: string }[]>([]);
  const [showAddCalendar, setShowAddCalendar] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [addCalendarError, setAddCalendarError] = useState<string | null>(null);

  // Calendar columns events can be placed on (exclude resource columns).
  const calendarColumns = useMemo(
    () =>
      (practitionersQuery.data?.practitioners ?? []).filter((p) => p.calendar_type !== 'resource'),
    [practitionersQuery.data?.practitioners],
  );

  const editing = target?.mode === 'edit' ? target.event : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(today);
  const [startMinutes, setStartMinutes] = useState(18 * 60);
  const [endMinutes, setEndMinutes] = useState(20 * 60);
  const [capacity, setCapacity] = useState('20');
  const [imageUrl, setImageUrl] = useState('');
  // Hides the banner preview when the remote image fails to load (web parity).
  const [imageError, setImageError] = useState(false);
  const [tickets, setTickets] = useState<TicketDraft[]>([blankTicket()]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [advanceDays, setAdvanceDays] = useState('90');
  const [noticeHours, setNoticeHours] = useState('1');
  const [cancelHours, setCancelHours] = useState('48');
  const [sameDay, setSameDay] = useState(true);
  const [paymentReq, setPaymentReq] = useState<EventPaymentRequirement>('none');
  const [deposit, setDeposit] = useState('');
  const [isActive, setIsActive] = useState(true);
  // Create-time schedule (hidden in edit mode). `weeklyUntil`/`customDates` are
  // only meaningful for their matching `scheduleMode`.
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('single');
  const [weeklyUntil, setWeeklyUntil] = useState(today);
  const [customDates, setCustomDates] = useState<CustomDateDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Saved calendar that's no longer in the list — keep it selectable.
  const orphanColumn = useMemo(() => {
    if (!editing?.calendar_id) return null;
    if (calendarColumns.some((c) => c.id === editing.calendar_id)) return null;
    return { id: editing.calendar_id, name: 'Saved calendar' };
  }, [editing, calendarColumns]);

  const columnOptions = useMemo(() => {
    const base: { id: string; name: string }[] = orphanColumn
      ? [...calendarColumns, orphanColumn]
      : [...calendarColumns];
    // Append any just-created columns the practitioners query hasn't picked up.
    for (const extra of extraColumns) {
      if (!base.some((c) => c.id === extra.id)) base.push(extra);
    }
    return base;
  }, [calendarColumns, orphanColumn, extraColumns]);

  // Weekly recurrence can't end before the event's first date.
  const minWeeklyUntil = useMemo(() => isoToDate(eventDate), [eventDate]);

  useEffect(() => {
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
    setError(null);
    setShowAddCalendar(false);
    setNewCalendarName('');
    setAddCalendarError(null);
    setExtraColumns([]);
    if (target.mode === 'edit') {
      const ev = target.event;
      setName(ev.name);
      setDescription(ev.description ?? '');
      setEventDate(ev.event_date);
      setStartMinutes(hhmmToMinutes(ev.start_time));
      setEndMinutes(hhmmToMinutes(ev.end_time));
      setCapacity(String(ev.capacity));
      setImageUrl(ev.image_url ?? '');
      setImageError(false);
      setTickets(
        ev.ticket_types.length > 0
          ? [...ev.ticket_types]
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((tt) => ({
                key: nextTicketKey(),
                name: tt.name,
                price: penceToPoundsInput(tt.price_pence),
                capacity: tt.capacity != null ? String(tt.capacity) : '',
              }))
          : [blankTicket()],
      );
      setCalendarId(ev.calendar_id ?? null);
      setAdvanceDays(String(ev.max_advance_booking_days ?? 90));
      setNoticeHours(String(ev.min_booking_notice_hours ?? 1));
      setCancelHours(String(ev.cancellation_notice_hours ?? 48));
      setSameDay(ev.allow_same_day_booking !== false);
      setPaymentReq(ev.payment_requirement ?? 'none');
      setDeposit(penceToPoundsInput(ev.deposit_amount_pence));
      setIsActive(ev.is_active !== false);
    } else {
      setName('');
      setDescription('');
      setEventDate(today);
      setStartMinutes(18 * 60);
      setEndMinutes(20 * 60);
      setCapacity('20');
      setImageUrl('');
      setImageError(false);
      setTickets([blankTicket()]);
      setCalendarId(null);
      setAdvanceDays('90');
      setNoticeHours('1');
      setCancelHours('48');
      setSameDay(true);
      setPaymentReq('none');
      setDeposit('');
      setIsActive(true);
      setScheduleMode('single');
      setWeeklyUntil(today);
      setCustomDates([]);
    }
    // `today` excluded: re-seed should track the target, not the clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const saving = create.isPending || update.isPending;

  const setTicket = (key: string, patch: Partial<TicketDraft>) =>
    setTickets((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addTicket = () => setTickets((rows) => [...rows, blankTicket()]);
  const removeTicket = (key: string) =>
    setTickets((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.key !== key)));

  const setCustomDate = (key: string, date: string) =>
    setCustomDates((rows) => rows.map((row) => (row.key === key ? { ...row, date } : row)));
  const addCustomDate = () =>
    setCustomDates((rows) => [...rows, { key: nextCustomDateKey(), date: eventDate }]);
  const removeCustomDate = (key: string) =>
    setCustomDates((rows) => rows.filter((row) => row.key !== key));

  async function handleSave() {
    setError(null);
    const capacityValue = Number(capacity);
    const advance = Number(advanceDays);
    const notice = Number(noticeHours);
    const cancel = Number(cancelHours);

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!Number.isInteger(capacityValue) || capacityValue < 1) {
      setError('Capacity must be at least 1.'); return;
    }
    if (endMinutes <= startMinutes) {
      setError('End time must be after the start time.'); return;
    }
    if (imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim())) {
      setError('Image URL must start with http:// or https://'); return;
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

    // Ticket types — at least one named, each a valid price + optional capacity.
    const named = tickets.filter((t) => t.name.trim());
    if (named.length === 0) {
      setError('Add at least one ticket type with a name.'); return;
    }
    const ticketRows: EventTicketWriteInput[] = [];
    for (let i = 0; i < named.length; i += 1) {
      const t = named[i]!;
      const pricePence = parsePoundsToPence(t.price);
      if (pricePence === undefined) {
        setError(`Ticket "${t.name.trim()}" has an invalid price.`); return;
      }
      let cap: number | null = null;
      if (t.capacity.trim()) {
        const parsed = Number(t.capacity);
        if (!Number.isInteger(parsed) || parsed < 1) {
          setError(`Ticket "${t.name.trim()}" capacity must be a whole number, or left blank.`);
          return;
        }
        cap = parsed;
      }
      ticketRows.push({
        name: t.name.trim(),
        price_pence: pricePence ?? 0,
        capacity: cap,
        sort_order: i,
      });
    }

    const depositPence = parsePoundsToPence(deposit);
    if (depositPence === undefined) {
      setError('Deposit must be a valid amount.'); return;
    }
    if (paymentReq === 'deposit' && !(depositPence != null && depositPence > 0)) {
      setError('Enter a deposit amount greater than zero.'); return;
    }

    // Non-admins must place a new event on a calendar they control — the server
    // rejects an unassigned create with a 400 (experience-events/route.ts), so
    // catch it inline. Admins may leave it unassigned.
    if (!editing && !isAdmin && !calendarId) {
      setError('Choose a calendar column for this event.'); return;
    }

    // Create-time schedule (edit is always single-date). Build + validate the
    // discriminated union the API expects.
    let schedule: EventScheduleInput | undefined;
    if (!editing) {
      if (scheduleMode === 'weekly') {
        if (weeklyUntil < eventDate) {
          setError('Repeat-until date must be on or after the event date.'); return;
        }
        schedule = { type: 'weekly', until_date: weeklyUntil };
      } else if (scheduleMode === 'custom') {
        // De-duped union of the event date + extra rows, chronologically sorted.
        const dates = Array.from(
          new Set([eventDate, ...customDates.map((d) => d.date)]),
        ).sort();
        if (dates.length === 0) {
          setError('Add at least one date for a custom schedule.'); return;
        }
        schedule = { type: 'custom', dates };
      } else {
        schedule = { type: 'single' };
      }
    }

    const shared = {
      name: name.trim(),
      description: description.trim() || null,
      event_date: eventDate,
      start_time: minutesToTime(startMinutes),
      end_time: minutesToTime(endMinutes),
      capacity: capacityValue,
      ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
      calendar_id: calendarId,
      max_advance_booking_days: advance,
      min_booking_notice_hours: notice,
      cancellation_notice_hours: cancel,
      allow_same_day_booking: sameDay,
      payment_requirement: paymentReq,
      deposit_amount_pence: paymentReq === 'deposit' ? depositPence ?? null : null,
      ticket_types: ticketRows,
      is_active: isActive,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...shared });
        hapticSuccess();
        toast.success('Event updated.');
      } else {
        const res = await create.mutateAsync({ ...shared, schedule });
        hapticSuccess();
        const count = res.created ?? 0;
        toast.success(count > 1 ? `Created ${count} events.` : 'Event created.');
      }
      onSaved?.();
      onClose();
    } catch (e) {
      hapticWarning();
      setError(formatSaveError(e));
    }
  }

  // Admin-only inline "Add calendar": creates a column via the shared hook,
  // appends it to the local options and selects it. A plan calendar-limit
  // comes back as a 403 (`upgrade_required`) and is surfaced inline.
  async function handleAddCalendar() {
    const trimmed = newCalendarName.trim();
    if (!trimmed) {
      setAddCalendarError('Enter a display name for the calendar.');
      return;
    }
    setAddCalendarError(null);
    try {
      const created = await createCalendar.mutateAsync({ name: trimmed });
      setExtraColumns((cols) =>
        cols.some((c) => c.id === created.id)
          ? cols
          : [...cols, { id: created.id, name: created.name }],
      );
      setCalendarId(created.id);
      setNewCalendarName('');
      setShowAddCalendar(false);
      hapticSuccess();
      toast.success(`Calendar "${created.name}" created and selected.`);
    } catch (e) {
      hapticWarning();
      setAddCalendarError(
        e instanceof ApiError ? e.message : 'Could not create the calendar.',
      );
    }
  }

  return (
    <Sheet visible={target !== null} onClose={onClose} maxHeight="92%" fill>
      <View style={styles.bodyWrap}>
        <Text variant="overline" tone="muted">
          {editing ? 'Edit event' : 'New event'}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled">
          {/* Basics */}
          <Input label="Name" value={name} onChangeText={setName} maxLength={200} />
          <Input
            label="Description"
            optional
            value={description}
            onChangeText={setDescription}
            multiline
            style={styles.multiline}
            maxLength={2000}
          />

          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">Date</Text>
            <DatePickerField value={eventDate} onChange={setEventDate} accessibilityLabel="Event date" />
          </View>
          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">Start time</Text>
            <TimePickerField
              value={startMinutes}
              onChange={setStartMinutes}
              accessibilityLabel="Event start time"
            />
          </View>
          <View style={styles.pickerRow}>
            <Text variant="label" tone="secondary">End time</Text>
            <TimePickerField
              value={endMinutes}
              onChange={setEndMinutes}
              accessibilityLabel="Event end time"
            />
          </View>
          <Input
            label="Total capacity"
            value={capacity}
            onChangeText={(v) => setCapacity(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />
          <Input
            label="Image URL"
            optional
            helper="A link to the event's banner image."
            value={imageUrl}
            onChangeText={(v) => {
              setImageUrl(v);
              if (imageError) setImageError(false);
            }}
            autoCapitalize="none"
            keyboardType="url"
          />
          {/^https?:\/\//i.test(imageUrl.trim()) && !imageError ? (
            <View style={styles.imagePreviewWrap}>
              <Text variant="caption" tone="muted">Preview</Text>
              <Image
                source={{ uri: imageUrl.trim() }}
                style={[styles.imagePreview, { borderColor: colors.border }]}
                contentFit="cover"
                onError={() => setImageError(true)}
                accessibilityLabel="Event banner preview"
              />
            </View>
          ) : null}

          {/* Repeats (create only — edit is always a single date) */}
          {!editing ? (
            <>
              <Text variant="overline" tone="muted">Repeats</Text>
              <Segmented
                options={SCHEDULE_OPTIONS}
                value={scheduleMode}
                onChange={setScheduleMode}
              />
              {scheduleMode === 'single' ? (
                <Text variant="caption" tone="muted">One event on the date above.</Text>
              ) : null}
              {scheduleMode === 'weekly' ? (
                <>
                  <Text variant="caption" tone="muted">
                    Creates one event each week on the same weekday, up to and including the date
                    below.
                  </Text>
                  <View style={styles.pickerRow}>
                    <Text variant="label" tone="secondary">Repeat until</Text>
                    <DatePickerField
                      value={weeklyUntil}
                      onChange={setWeeklyUntil}
                      minimumDate={minWeeklyUntil}
                      accessibilityLabel="Repeat weekly until date"
                    />
                  </View>
                </>
              ) : null}
              {scheduleMode === 'custom' ? (
                <>
                  <Text variant="caption" tone="muted">
                    Creates one event per date (same ticket setup on each).
                  </Text>
                  <View style={[styles.customDateRow, { borderColor: colors.border }]}>
                    <Text variant="bodyMedium">{format(isoToDate(eventDate), 'd MMM yyyy')}</Text>
                    <Text variant="caption" tone="muted">From date above</Text>
                  </View>
                  {customDates.map((row) => (
                    <View
                      key={row.key}
                      style={[styles.customDateRow, { borderColor: colors.border }]}>
                      <DatePickerField
                        value={row.date}
                        onChange={(v) => setCustomDate(row.key, v)}
                        accessibilityLabel="Custom event date"
                      />
                      <IconButton
                        icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                        accessibilityLabel="Remove date"
                        tint={colors.danger}
                        onPress={() => removeCustomDate(row.key)}
                      />
                    </View>
                  ))}
                  <Button
                    label="Add date"
                    variant="secondary"
                    size="sm"
                    onPress={addCustomDate}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {/* Ticket types */}
          <Text variant="overline" tone="muted">Ticket types</Text>
          {tickets.map((ticket) => (
            <View key={ticket.key} style={[styles.ticketCard, { borderColor: colors.border }]}>
              <View style={styles.ticketHeader}>
                <View style={styles.ticketNameField}>
                  <Input
                    label="Ticket name"
                    placeholder="e.g. General admission"
                    value={ticket.name}
                    onChangeText={(v) => setTicket(ticket.key, { name: v })}
                    maxLength={120}
                  />
                </View>
                {tickets.length > 1 ? (
                  <IconButton
                    icon={{ ios: 'trash', android: 'delete', web: 'delete' }}
                    accessibilityLabel={`Remove ${ticket.name || 'ticket'}`}
                    tint={colors.danger}
                    onPress={() => removeTicket(ticket.key)}
                  />
                ) : null}
              </View>
              <View style={styles.row}>
                <View style={styles.field}>
                  <Input
                    label="Price (£)"
                    value={ticket.price}
                    onChangeText={(v) => setTicket(ticket.key, { price: v })}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.field}>
                  <Input
                    label="Capacity"
                    optional
                    value={ticket.capacity}
                    onChangeText={(v) => setTicket(ticket.key, { capacity: v.replace(/[^0-9]/g, '') })}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </View>
          ))}
          <Button label="Add ticket type" variant="secondary" size="sm" onPress={addTicket} />

          {/* Calendar column */}
          <Text variant="overline" tone="muted">Calendar column</Text>
          <Text variant="caption" tone="muted">
            {isAdmin
              ? 'The team calendar this event is placed on (optional for admins).'
              : 'Pick the team calendar you control to place this event on (required).'}
          </Text>
          <View style={styles.columnWrap}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: calendarId === null }}
              onPress={() => setCalendarId(null)}
              style={({ pressed }) => [
                styles.columnChip,
                {
                  backgroundColor: calendarId === null ? colors.brand : colors.surface,
                  borderColor: calendarId === null ? colors.brand : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <Text
                variant="label"
                color={calendarId === null ? colors.onBrand : colors.textSecondary}>
                No specific calendar
              </Text>
            </Pressable>
            {columnOptions.map((column) => {
              const selected = calendarId === column.id;
              return (
                <Pressable
                  key={column.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setCalendarId(column.id)}
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

          {/* Inline "Add calendar" — admin only (server is admin-gated). */}
          {isAdmin ? (
            showAddCalendar ? (
              <View style={styles.addCalendarBox}>
                <Input
                  label="New calendar name"
                  placeholder="e.g. Events team"
                  value={newCalendarName}
                  onChangeText={(v) => {
                    setNewCalendarName(v);
                    if (addCalendarError) setAddCalendarError(null);
                  }}
                  maxLength={200}
                  autoFocus
                />
                {addCalendarError ? (
                  <Text variant="caption" tone="danger">
                    {addCalendarError}
                  </Text>
                ) : null}
                <View style={styles.addCalendarActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    size="sm"
                    style={styles.flex1}
                    onPress={() => {
                      setShowAddCalendar(false);
                      setNewCalendarName('');
                      setAddCalendarError(null);
                    }}
                  />
                  <Button
                    label="Create & select"
                    size="sm"
                    style={styles.flex1}
                    loading={createCalendar.isPending}
                    onPress={() => void handleAddCalendar()}
                  />
                </View>
              </View>
            ) : (
              <Button
                label="Add calendar"
                variant="secondary"
                size="sm"
                onPress={() => {
                  setAddCalendarError(null);
                  setNewCalendarName('');
                  setShowAddCalendar(true);
                }}
              />
            )
          ) : null}

          {/* Booking rules */}
          <Text variant="overline" tone="muted">Booking rules</Text>
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

          {/* Payment */}
          <Text variant="overline" tone="muted">Online payment</Text>
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
          {paymentReq === 'deposit' ? (
            <Input
              label="Deposit (£)"
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

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
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
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  imagePreviewWrap: {
    gap: spacing.xs,
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
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
  },
  ticketCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  ticketNameField: {
    flex: 1,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
  columnWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  addCalendarBox: {
    gap: spacing.sm,
  },
  addCalendarActions: {
    flexDirection: 'row',
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

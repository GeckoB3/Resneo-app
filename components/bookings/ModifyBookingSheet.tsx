import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import {
  dedupeSlotsByStartTime,
  groupSlotsByPeriod,
} from '@/components/booking-wizard/TimeSlotStep';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { calendarDateInTimeZone, formatDayHeading } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAppointmentAvailability } from '@/lib/queries/useAppointmentAvailability';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { useMonthAvailability } from '@/lib/queries/useMonthAvailability';
import {
  useModifyAppointment,
  useNotifyBookingModification,
  useValidateAppointmentModification,
} from '@/lib/queries/useBookingMutations';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  AppointmentCatalogAddonGroup,
  AppointmentCatalogService,
} from '@/types/appointment-catalog';

export type ModifyBookingTarget = {
  id: string;
  guestName: string;
  /** Current date (YYYY-MM-DD) and time (HH:mm[:ss]). */
  date: string;
  time: string;
  durationMinutes: number | null;
  /** calendar_id ?? practitioner_id from the booking row. */
  practitionerId: string | null;
  /** appointment_service_id ?? service_item_id from the booking row. */
  serviceId: string | null;
  /** Which anchor column the booking uses — decides the PATCH field name. */
  usesServiceItem: boolean;
  serviceVariantId: string | null;
};

type ModifyBookingSheetProps = {
  target: ModifyBookingTarget | null;
  onClose: () => void;
};

const MAX_MINUTES = 23 * 60 + 59;
/**
 * Duration bounds. The API floor is 5 (`MIN_APPOINTMENT_CORE_DURATION_MINUTES`),
 * but the web modify form's input is `min={15} step={5}`, so the UI floor stays
 * 15 here to match it — deliberately, not by omission.
 */
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 14 * 60;
/** Web parity: the duration input steps in 5s. */
const DURATION_STEP_MINUTES = 5;
/** The by-hand start nudge steps in 5s too, onto a clean :00/:05/:10 grid. */
const START_STEP_MINUTES = 5;
const VALIDATE_DEBOUNCE_MS = 450;

/**
 * Step the start time by whole 5-minute marks. A start seeded off-grid (a slot
 * at 14:02, an overrun) snaps to the next mark in the direction of travel rather
 * than carrying the offset forward, so the value always lands on :00/:05/:10.
 */
function stepStartMinutes(current: number, direction: 1 | -1): number {
  const stepped =
    direction === 1
      ? (Math.floor(current / START_STEP_MINUTES) + 1) * START_STEP_MINUTES
      : (Math.ceil(current / START_STEP_MINUTES) - 1) * START_STEP_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(0, stepped));
}

/**
 * Which pane of the sheet is showing. The date/time pickers and the post-save
 * notify prompt are STEPS inside this sheet, not sheets of their own: opening a
 * second modal from a visible one is unreliable on iOS, and a month grid nested
 * in the form's ScrollView would put two same-axis scrollers on screen at once.
 */
type Mode = 'form' | 'date' | 'time' | 'notify';

type CheckState =
  | { state: 'idle' | 'checking' | 'valid' | 'unknown' }
  | { state: 'invalid'; reason: string };

function formatDuration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Short "+£X · +Ymin" badge for an add-on, or null when it adds nothing. */
function addonExtraLabel(pricePence: number, durationMinutes: number): string | null {
  const parts: string[] = [];
  if (pricePence > 0) {
    const formatted = formatPence(pricePence);
    if (formatted) parts.push(`+${formatted}`);
  }
  if (durationMinutes > 0) parts.push(`+${durationMinutes} min`);
  return parts.length ? parts.join(' · ') : null;
}

/** Per-group selection rule hint (mirrors the wizard's AddonsStep). */
function addonRequirementLabel(group: AppointmentCatalogAddonGroup['group']): string | null {
  const { selection_type, min_select, max_select } = group;
  if (min_select > 0 && max_select != null && min_select === max_select) {
    return `Choose ${min_select}`;
  }
  if (min_select > 0) return `Choose at least ${min_select}`;
  if (selection_type === 'single') return 'Optional · choose one';
  if (max_select != null) return `Optional · up to ${max_select}`;
  return 'Optional';
}

/**
 * Full appointment modify — change service, variant, staff, date, time and
 * duration with live availability validation (web StaffAppointmentModifyForm
 * parity). The quick RescheduleSheet stays for date/time-only moves.
 */
export function ModifyBookingSheet({ target, onClose }: ModifyBookingSheetProps) {
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const toast = useToast();
  const catalogQuery = useAppointmentCatalog(target ? venue?.id ?? null : null);
  const modify = useModifyAppointment(target?.id ?? '');
  const validate = useValidateAppointmentModification(target?.id ?? '');
  // Sends the email the save deliberately held back, when the user taps Notify.
  const notifyModification = useNotifyBookingModification();
  // Read the open booking's full detail (cache hit — the detail sheet is already
  // open) so we can seed the booking's current add-ons. ModifyBookingTarget does
  // not carry them and its source component is out of scope to edit.
  const detailQuery = useBookingDetail(target?.id);
  const currentAddons = detailQuery.data?.addons ?? null;

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [duration, setDuration] = useState(30);
  /** Flat selected add-on ids across all groups (matches AddonsStep's `value`). */
  const [addonIds, setAddonIds] = useState<string[]>([]);
  /** True once we've seeded add-ons from the loaded booking detail. */
  const [addonsSeeded, setAddonsSeeded] = useState(false);
  // Last validation result, keyed by the field signature it was checked for —
  // "checking" is derived (signature mismatch) so the effect never sets state
  // synchronously.
  const [checked, setChecked] = useState<{ sig: string | null; result: CheckState }>({
    sig: null,
    result: { state: 'idle' },
  });
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  const checkSeq = useRef(0);
  const [mode, setMode] = useState<Mode>('form');
  /** Any date inside the month the calendar step is showing. */
  const [monthAnchor, setMonthAnchor] = useState('');
  /**
   * The add-ons the booking had when the sheet opened. Kept in a ref because
   * Undo needs them AFTER the save has invalidated the detail query — by then
   * `currentAddons` describes the NEW booking, not the one we're restoring.
   */
  const originalAddonIds = useRef<string[]>([]);
  /** True once an Undo PATCH is in flight, so the pane can show it working. */
  const [undoing, setUndoing] = useState(false);

  // Seed from the booking when the sheet opens or the target booking changes.
  // useEffect avoids setState-during-render in Fabric/concurrent mode.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset seed when sheet closes
      setSeededId(null);
      return;
    }
    if (target.id === seededId) return;
    setSeededId(target.id);
    setServiceId(target.serviceId);
    setVariantId(target.serviceVariantId);
    setPractitionerId(target.practitionerId);
    setDate(target.date);
    setMinutes(timeToMinutes(target.time));
    setDuration(target.durationMinutes ?? 30);
    setAddonIds([]);
    setAddonsSeeded(false);
    originalAddonIds.current = [];
    setChecked({ sig: null, result: { state: 'idle' } });
    setError(null);
    setUndoing(false);
    setMode('form');
    setMonthAnchor(target.date);
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique services across the catalog + which practitioners offer each.
  const { services, offeredBy, practitioners } = useMemo(() => {
    const serviceMap = new Map<string, AppointmentCatalogService>();
    const offers = new Map<string, Set<string>>();
    const staff: { id: string; name: string }[] = [];
    for (const p of catalogQuery.data?.practitioners ?? []) {
      staff.push({ id: p.id, name: p.name });
      for (const s of p.services) {
        if (!serviceMap.has(s.id)) serviceMap.set(s.id, s);
        const set = offers.get(s.id) ?? new Set<string>();
        set.add(p.id);
        offers.set(s.id, set);
      }
    }
    return { services: [...serviceMap.values()], offeredBy: offers, practitioners: staff };
  }, [catalogQuery.data]);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const serviceInCatalog = !serviceId || !!selectedService;
  const variants = selectedService?.variants ?? [];
  const requiresVariant = variants.length > 0;

  // Staff offering the selected service; all staff when the service is
  // unknown to the catalog (archived) so reassignment stays possible.
  const eligibleStaff = useMemo(() => {
    if (!serviceId || !offeredBy.has(serviceId)) return practitioners;
    const ids = offeredBy.get(serviceId)!;
    return practitioners.filter((p) => ids.has(p.id));
  }, [serviceId, offeredBy, practitioners]);

  const selectService = (svc: AppointmentCatalogService) => {
    // Switching to a different service invalidates the current add-on choices
    // (groups are per-service). Re-selecting the same service keeps them.
    if (svc.id !== serviceId) {
      setAddonIds([]);
    }
    setServiceId(svc.id);
    const svcVariants = svc.variants ?? [];
    const keepVariant =
      svc.id === target?.serviceId &&
      svcVariants.some((v) => v.id === target?.serviceVariantId);
    const nextVariant = keepVariant
      ? svcVariants.find((v) => v.id === target?.serviceVariantId)!
      : svcVariants[0] ?? null;
    setVariantId(nextVariant?.id ?? null);
    setDuration(nextVariant?.duration_minutes ?? svc.duration_minutes);
    const offering = offeredBy.get(svc.id);
    if (practitionerId && offering && !offering.has(practitionerId)) {
      setPractitionerId(null);
    }
  };

  const selectVariant = (id: string) => {
    setVariantId(id);
    const v = variants.find((x) => x.id === id);
    if (v) setDuration(v.duration_minutes);
  };

  // Add-on groups for the chosen service (catalog carries them per service).
  // Derived from the stable `services`/`serviceId` so its identity is stable for
  // the lookups/effects below (selectedService is an unmemoised .find()).
  const addonGroups = useMemo(
    () => services.find((s) => s.id === serviceId)?.addon_groups ?? [],
    [services, serviceId],
  );
  const hasAddonGroups = addonGroups.length > 0;

  // Flat addon -> {price, duration} lookup for the chosen service so totals and
  // chips read the catalogue (not the booking snapshot, which may be stale).
  const addonById = useMemo(() => {
    const map = new Map<string, { price_pence: number; duration_minutes: number }>();
    for (const group of addonGroups) {
      for (const addon of group.addons) {
        map.set(addon.id, {
          price_pence: addon.additional_price_pence,
          duration_minutes: addon.additional_duration_minutes,
        });
      }
    }
    return map;
  }, [addonGroups]);

  const selectedAddonSet = useMemo(() => new Set(addonIds), [addonIds]);

  // Seed selected add-ons from the booking's current add-ons once the detail
  // loads AND the catalogue knows the service's groups (so stale snapshots that
  // are no longer offered drop out). Effect (not render) to stay Fabric-safe.
  //
  // `seededId !== target.id` holds this off until the target-seeding effect above
  // has actually applied. Both effects run in the SAME commit, and this one reads
  // the pre-seed closure — where `serviceId` is still null, so `serviceInCatalog`
  // is vacuously true and `hasAddonGroups` false. Without the guard it took the
  // "nothing to seed" branch and latched `addonsSeeded` before the service was
  // known, so a booking whose detail was already cached (the normal case — the
  // detail sheet is open behind this one) never seeded its add-ons and the next
  // save PATCHed `addons: []`, silently clearing them.
  useEffect(() => {
    if (!target || addonsSeeded || !currentAddons || seededId !== target.id) return;
    if (!serviceInCatalog || !hasAddonGroups) {
      // Nothing to seed against yet (or service has no add-ons) — mark seeded so
      // we don't keep re-checking, but only once the catalogue has resolved.
      if (serviceInCatalog && !catalogQuery.isLoading) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot seed flag
        setAddonsSeeded(true);
      }
      return;
    }
    const seeded = currentAddons
      .map((a) => a.addon_id)
      .filter((id): id is string => !!id && addonById.has(id));
    setAddonIds(seeded);
    originalAddonIds.current = seeded;
    setAddonsSeeded(true);
  }, [
    target,
    seededId,
    addonsSeeded,
    currentAddons,
    serviceInCatalog,
    hasAddonGroups,
    addonById,
    catalogQuery.isLoading,
  ]);

  // Toggle an add-on, enforcing the group's selection rule (single vs multi,
  // max cap) — same logic as the wizard's AddonsStep.toggle.
  const toggleAddon = (group: AppointmentCatalogAddonGroup, addonId: string) => {
    hapticSelect();
    const groupAddonIds = group.addons.map((a) => a.id);
    const selectedInGroup = groupAddonIds.filter((id) => selectedAddonSet.has(id));
    const isSelected = selectedAddonSet.has(addonId);
    const next = new Set(selectedAddonSet);

    if (group.group.selection_type === 'single') {
      groupAddonIds.forEach((id) => next.delete(id));
      if (!isSelected || group.group.min_select > 0) {
        next.add(addonId);
      }
    } else if (isSelected) {
      next.delete(addonId);
    } else {
      const max = group.group.max_select;
      if (max != null && selectedInGroup.length >= max) {
        return; // at cap — ignore
      }
      next.add(addonId);
    }
    setAddonIds([...next]);
  };

  // Only count add-ons that belong to the current service's groups so a service
  // switch can't carry orphaned ids into the totals or payload.
  const validAddonIds = useMemo(
    () => addonIds.filter((id) => addonById.has(id)),
    [addonIds, addonById],
  );
  const addonTotals = useMemo(() => {
    let price = 0;
    let mins = 0;
    for (const id of validAddonIds) {
      const a = addonById.get(id);
      if (a) {
        price += a.price_pence;
        mins += a.duration_minutes;
      }
    }
    return { pricePence: price, durationMinutes: mins };
  }, [validAddonIds, addonById]);

  // Every group satisfies its minimum (mirrors AddonsStep.allGroupsValid).
  const addonGroupsValid = addonGroups.every(
    (g) => g.addons.filter((a) => selectedAddonSet.has(a.id)).length >= g.group.min_select,
  );

  // Total length sent to the validator + PATCH: the user-set base duration plus
  // the selected add-ons' extra minutes (the create route adds these the same
  // way; the PATCH validator only takes a single duration_minutes).
  const effectiveDuration = duration + addonTotals.durationMinutes;

  // Quick duration presets — current/default/initial + common lengths.
  const durationPresets = [
    ...new Set(
      [
        selectedService?.duration_minutes,
        target?.durationMinutes ?? undefined,
        30,
        45,
        60,
        90,
        120,
      ].filter((d): d is number => d != null && d >= MIN_DURATION_MINUTES),
    ),
  ].sort((a, b) => a - b);

  // Free slots for the chosen day (the booking's own slot stays available).
  // Use the effective length so add-ons that lengthen the booking re-query slots.
  const availability = useAppointmentAvailability({
    date: date || null,
    serviceId,
    practitionerId,
    variantId,
    durationMinutes: effectiveDuration,
    excludeBookingId: target?.id,
    enabled: !!target && serviceInCatalog,
  });
  const slots = useMemo(() => {
    const practitioner = availability.data?.practitioners.find((p) => p.id === practitionerId);
    return dedupeSlotsByStartTime(
      (practitioner?.slots ?? []).filter((s) => !s.service_id || s.service_id === serviceId),
    );
  }, [availability.data, practitionerId, serviceId]);
  /** Morning / Afternoon / Evening sections (web parity: `groupSlotsByPeriod`). */
  const slotPeriods = useMemo(() => groupSlotsByPeriod(slots), [slots]);

  const selectedTime = minutesToTime(minutes);

  // Which dates in the shown month can fit this service — drives the calendar's
  // availability markers, matching the web picker's month fetch.
  const [monthYear, monthMonth] = (monthAnchor || target?.date || '').split('-').map(Number);
  const monthQuery = useMonthAvailability({
    serviceId,
    practitionerId,
    year: monthYear ?? new Date().getFullYear(),
    month: monthMonth ?? 1,
    variantId: requiresVariant ? variantId : null,
    durationMinutes: effectiveDuration,
    enabled: mode === 'date' && !!target && serviceInCatalog && !!serviceId && !!practitionerId,
  });
  const availableDates = useMemo(
    () => (monthQuery.data ? new Set(monthQuery.data.available_dates) : null),
    [monthQuery.data],
  );

  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  /**
   * Web parity: Save stays disabled until something actually changes ("Adjust a
   * field to check availability and enable save"). Without it the button invites
   * a PATCH that would rewrite the booking to exactly what it already is.
   */
  const hasChanges =
    !!target &&
    (serviceId !== target.serviceId ||
      variantId !== target.serviceVariantId ||
      practitionerId !== target.practitionerId ||
      date !== target.date ||
      minutes !== timeToMinutes(target.time) ||
      effectiveDuration !== (target.durationMinutes ?? 30));

  /** The booking's original start, for the "orig" marker on the slot list. */
  const originalTime = target ? minutesToTime(timeToMinutes(target.time)) : '';
  /** Date or time moved — the web picker highlights this as its own state. */
  const scheduleChanged =
    !!target && (date !== target.date || minutes !== timeToMinutes(target.time));

  // Debounced dry-run validation (450ms, web parity). Auth/availability errors
  // on the endpoint degrade to "unknown" — the PATCH still validates.
  const canCheck = !!target && !!serviceId && !!practitionerId && !!date;
  const signature = canCheck
    ? [target.id, serviceId, variantId, practitionerId, date, minutes, effectiveDuration].join('|')
    : null;
  const validateMutate = validate.mutate;
  useEffect(() => {
    if (!target || !serviceId || !practitionerId || !date || !signature) {
      return;
    }
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      validateMutate(
        {
          booking_date: date,
          booking_time: minutesToTime(minutes),
          practitioner_id: practitionerId,
          ...(target.usesServiceItem
            ? { service_item_id: serviceId }
            : { appointment_service_id: serviceId }),
          duration_minutes: effectiveDuration,
          service_variant_id: requiresVariant ? variantId : null,
        },
        {
          onSuccess: (res) => {
            if (checkSeq.current !== seq) return;
            setChecked({
              sig: signature,
              result: res.ok
                ? { state: 'valid' }
                : { state: 'invalid', reason: res.error ?? 'This time is not available.' },
            });
          },
          onError: () => {
            if (checkSeq.current !== seq) return;
            setChecked({ sig: signature, result: { state: 'unknown' } });
          },
        },
      );
    }, VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    target,
    serviceId,
    variantId,
    practitionerId,
    date,
    minutes,
    effectiveDuration,
    requiresVariant,
    signature,
    validateMutate,
  ]);

  const check: CheckState = !canCheck
    ? { state: 'idle' }
    : checked.sig === signature
      ? checked.result
      : { state: 'checking' };

  const canSave =
    !!target &&
    !!serviceId &&
    !!practitionerId &&
    (!requiresVariant || !!variantId) &&
    addonGroupsValid &&
    hasChanges &&
    check.state !== 'invalid' &&
    check.state !== 'checking';

  async function handleSave() {
    if (!target || !serviceId || !practitionerId) return;
    setError(null);
    try {
      await modify.mutateAsync({
        booking_date: date,
        booking_time: `${minutesToTime(minutes)}:00`,
        practitioner_id: practitionerId,
        ...(target.usesServiceItem
          ? { service_item_id: serviceId }
          : { appointment_service_id: serviceId }),
        // Total length = base duration + selected add-on minutes (REPLACE).
        duration_minutes: effectiveDuration,
        service_variant_id: requiresVariant ? variantId : null,
        // Full desired add-on set (REPLACE semantics). Only send the key when
        // the service has groups so non-add-on services keep a clean payload.
        ...(hasAddonGroups
          ? { addons: validAddonIds.map((addon_id) => ({ addon_id })) }
          : {}),
        // Moving the start is the only change the server emails the guest about,
        // and it does so the instant the PATCH lands. Hold it back so the staff
        // member gets the same Notify / Don't notify / Undo choice the calendar
        // gives them after a drag.
        ...(scheduleChanged ? { defer_modification_guest_notification: true } : {}),
      });
      hapticSuccess();
      if (scheduleChanged) {
        setMode('notify');
        return;
      }
      onClose();
    } catch (e) {
      hapticWarning();
      setError(e instanceof ApiError ? e.message : 'Could not save changes. Try again.');
    }
  }

  /** Send the held-back "your booking changed" email, then close. */
  function handleNotify() {
    if (!target) return;
    const name = target.guestName;
    notifyModification.mutate(
      { bookingId: target.id },
      {
        onSuccess: () => toast.success(`${name} notified of the change.`),
        onError: () => toast.error('Could not notify the guest.'),
      },
    );
    onClose();
  }

  /**
   * Put the booking back exactly as it was. Modify can change service, variant,
   * staff, slot, duration AND add-ons, so Undo restores all of them — a
   * schedule-only revert would silently keep the rest of the edit. The restore
   * defers its own notification: an undone change is not something to email
   * about.
   *
   * Ids fall back to the just-saved values when the booking opened without one
   * (an archived service leaves `serviceId` null), which keeps the payload valid
   * while still restoring everything we know the original of.
   */
  async function handleUndo() {
    if (!target) return;
    const restoreServiceId = target.serviceId ?? serviceId;
    const restorePractitionerId = target.practitionerId ?? practitionerId;
    if (!restoreServiceId || !restorePractitionerId) {
      onClose();
      return;
    }
    // The original service's groups decide whether add-ons are part of the
    // restore — not the service the user may have switched to. `addonsSeeded`
    // gates it: without a seeded snapshot we don't KNOW the original set, and
    // sending an empty list would clear the booking's add-ons rather than
    // restore them (the server treats a present `addons` key as REPLACE, and an
    // omitted one as "leave alone").
    const originalHadAddons =
      addonsSeeded &&
      services.some((s) => s.id === restoreServiceId && (s.addon_groups?.length ?? 0) > 0);
    setUndoing(true);
    try {
      await modify.mutateAsync({
        booking_date: target.date,
        booking_time: `${target.time.slice(0, 5)}:00`,
        practitioner_id: restorePractitionerId,
        ...(target.usesServiceItem
          ? { service_item_id: restoreServiceId }
          : { appointment_service_id: restoreServiceId }),
        duration_minutes: target.durationMinutes ?? 30,
        service_variant_id: target.serviceVariantId,
        ...(originalHadAddons
          ? { addons: originalAddonIds.current.map((addon_id) => ({ addon_id })) }
          : {}),
        defer_modification_guest_notification: true,
      });
      hapticSuccess();
      toast.success('Change undone.');
      onClose();
    } catch {
      hapticWarning();
      setUndoing(false);
      toast.error('Could not undo the change.');
    }
  }

  const endPreview = minutesToTime((minutes + effectiveDuration) % (24 * 60));

  // ---- Notify step: the save landed, the guest email is still held back -------
  // Content-sized (no `fill`), matching the calendar's post-drag prompt — a
  // 90%-tall sheet for three buttons would be all empty space.
  if (target && seededId === target.id && mode === 'notify') {
    return (
      <Sheet visible onClose={onClose}>
        <Text variant="subheading">Booking moved</Text>
        <Text variant="caption" tone="muted">
          Let {target.guestName} know about the change?
        </Text>
        <View style={styles.noticeActions}>
          <Button label={`Notify ${target.guestName}`} fullWidth onPress={handleNotify} />
          <Button label="Don't notify" variant="secondary" fullWidth onPress={onClose} />
          <Button
            label="Undo change"
            variant="ghost"
            fullWidth
            loading={undoing}
            onPress={() => void handleUndo()}
          />
        </View>
      </Sheet>
    );
  }

  // ---- Date step: the wizard's month calendar, reused whole -------------------
  if (target && seededId === target.id && mode === 'date') {
    return (
      <Sheet visible fill onClose={onClose}>
        {/* MonthDatePicker takes its gutter from its parent (in the wizard, a
            padded Screen), so the date pane needs a padded wrapper of its own. */}
        <View style={styles.pickerPane}>
          <MonthDatePicker
            title="Choose a date"
            monthAnchor={monthAnchor || target.date}
            onChangeMonth={setMonthAnchor}
            today={today}
            selectedDate={date}
            onSelectDate={setDate}
            availableDates={availableDates}
            isLoading={monthQuery.isLoading}
            timeZone={timeZone}
            weekShortcuts
            availabilityHint="Green dates can fit this appointment."
            onContinue={() => setMode('time')}
          />
        </View>
      </Sheet>
    );
  }

  // ---- Time step: free slots, grouped and marked ------------------------------
  if (target && seededId === target.id && mode === 'time') {
    return (
      <Sheet visible fill onClose={onClose}>
        <View style={styles.stepBody}>
          <Text variant="heading">Choose a time</Text>
          <Text variant="bodySmall" tone="muted">
            {formatDayHeading(date)} · {formatDuration(effectiveDuration)}
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            {availability.isLoading ? (
              <Text variant="bodySmall" tone="muted">
                Loading free slots…
              </Text>
            ) : slotPeriods.length === 0 ? (
              <Text variant="bodySmall" tone="muted">
                No free slots on this day. Pick another date, or set the time by hand on the
                previous screen.
              </Text>
            ) : (
              slotPeriods.map((period) => (
                <View key={period.title} style={styles.fieldBlock}>
                  <Text variant="label" tone="secondary">
                    {period.title}
                  </Text>
                  <View style={styles.chipWrap}>
                    {period.slots.map((slot) => {
                      const key = slot.start_time.slice(0, 5);
                      // Web marks the booking's CURRENT slot so staff can find
                      // their way back to it after browsing other times.
                      const isOriginal = date === target.date && key === originalTime;
                      return (
                        <Chip
                          key={`${slot.practitioner_id}-${slot.start_time}`}
                          label={isOriginal ? `${key} · now` : key}
                          selected={key === selectedTime}
                          onPress={() => {
                            hapticSelect();
                            setMinutes(timeToMinutes(slot.start_time));
                            setMode('form');
                          }}
                        />
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label="Back"
              variant="secondary"
              onPress={() => setMode('date')}
              style={styles.actionButton}
            />
            <Button label="Done" onPress={() => setMode('form')} style={styles.actionButton} />
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={!!target} fill onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text variant="overline" tone="muted">
              Modify booking
            </Text>
            <Text variant="title">{target.guestName}</Text>
            <Text variant="bodySmall" tone="muted">
              Now: {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
              {target.durationMinutes != null
                ? ` · ${formatDuration(target.durationMinutes)}`
                : ''}
            </Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            {catalogQuery.isLoading ? (
              <Text variant="bodySmall" tone="muted">
                Loading services…
              </Text>
            ) : null}

            {!serviceInCatalog ? (
              <Text variant="caption" tone="muted">
                The booked service is no longer in the catalogue — pick a service below to
                change it, or just adjust the time and duration.
              </Text>
            ) : null}

            {services.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Service
                </Text>
                <View style={styles.chipWrap}>
                  {services.map((svc) => (
                    <Chip
                      key={svc.id}
                      label={svc.name}
                      selected={svc.id === serviceId}
                      onPress={() => selectService(svc)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {requiresVariant ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Variant
                </Text>
                <View style={styles.chipWrap}>
                  {variants.map((v) => (
                    <Chip
                      key={v.id}
                      label={`${v.name} (${v.duration_minutes}m)`}
                      selected={v.id === variantId}
                      onPress={() => selectVariant(v.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {eligibleStaff.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Staff
                </Text>
                <View style={styles.chipWrap}>
                  {eligibleStaff.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.name}
                      selected={p.id === practitionerId}
                      onPress={() => setPractitionerId(p.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {serviceInCatalog && hasAddonGroups ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Add-ons
                </Text>
                {addonGroups.map((group) => (
                  <View key={group.group.id} style={styles.addonGroup}>
                    <View style={styles.addonGroupHeader}>
                      <Text variant="bodySmall" tone="secondary">
                        {group.group.name}
                      </Text>
                      {addonRequirementLabel(group.group) ? (
                        <Text variant="caption" tone="muted">
                          {addonRequirementLabel(group.group)}
                        </Text>
                      ) : null}
                    </View>
                    {group.group.prompt_to_client ? (
                      <Text variant="caption" tone="muted">
                        {group.group.prompt_to_client}
                      </Text>
                    ) : null}
                    {group.addons.map((addon) => {
                      const isSelected = selectedAddonSet.has(addon.id);
                      const extra = addonExtraLabel(
                        addon.additional_price_pence,
                        addon.additional_duration_minutes,
                      );
                      return (
                        <Pressable
                          key={addon.id}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          onPress={() => toggleAddon(group, addon.id)}
                          style={({ pressed }) => [
                            styles.addonRow,
                            {
                              backgroundColor: isSelected
                                ? colors.surfaceRaised
                                : colors.surface,
                              borderColor: isSelected ? colors.brand : colors.border,
                              opacity: pressed ? 0.9 : 1,
                            },
                          ]}>
                          <View
                            style={[
                              styles.addonCheck,
                              {
                                borderColor: isSelected ? colors.brand : colors.borderStrong,
                                backgroundColor: isSelected ? colors.brand : 'transparent',
                              },
                            ]}>
                            {isSelected ? (
                              <Text style={[styles.addonCheckMark, { color: colors.onBrand }]}>
                                ✓
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.addonText}>
                            <Text variant="bodyMedium">{addon.name}</Text>
                            {extra ? (
                              <Text variant="caption" tone="muted">
                                {extra}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}

            {/* When — the web shows a month calendar and grouped slot list here.
                On a sheet those are steps (see `Mode`), so this row states the
                current selection and opens them. */}
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                When
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change the date and time"
                onPress={() => {
                  hapticSelect();
                  setMonthAnchor(date);
                  setMode('date');
                }}
                style={({ pressed }) => [
                  styles.whenRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: scheduleChanged ? colors.brand : colors.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <View style={styles.addonText}>
                  <Text variant="bodyMedium">
                    {formatDayHeading(date)} · {selectedTime}
                  </Text>
                  {scheduleChanged ? (
                    <Text variant="caption" tone="muted">
                      was {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
                    </Text>
                  ) : (
                    <Text variant="caption" tone="muted">
                      Ends at {endPreview}
                    </Text>
                  )}
                </View>
                <Text variant="bodySmall" color={colors.brand}>
                  Change
                </Text>
              </Pressable>
            </View>

            {/* Manual nudge — the app keeps a by-hand start time, which the web
                picker has no equivalent of: staff sometimes need a time the
                availability engine won't offer (an overrun, a squeezed-in fit). */}
            <Stepper
              label="Start"
              value={selectedTime}
              onDecrement={() => setMinutes((m) => stepStartMinutes(m, -1))}
              onIncrement={() => setMinutes((m) => stepStartMinutes(m, 1))}
            />
            <Stepper
              label="Duration"
              value={formatDuration(duration)}
              onDecrement={() =>
                setDuration((d) => Math.max(MIN_DURATION_MINUTES, d - DURATION_STEP_MINUTES))
              }
              onIncrement={() =>
                setDuration((d) => Math.min(MAX_DURATION_MINUTES, d + DURATION_STEP_MINUTES))
              }
            />
            <View style={styles.chipWrap}>
              {durationPresets.map((preset) => (
                <Chip
                  key={preset}
                  label={formatDuration(preset)}
                  selected={duration === preset}
                  onPress={() => setDuration(preset)}
                />
              ))}
            </View>
            <Text variant="caption" tone="muted">
              Ends at {endPreview}. Hold − / + to change faster.
            </Text>
            {addonTotals.durationMinutes > 0 || addonTotals.pricePence > 0 ? (
              <Text variant="caption" tone="muted">
                Includes add-ons
                {addonTotals.durationMinutes > 0
                  ? ` · +${addonTotals.durationMinutes} min`
                  : ''}
                {addonTotals.pricePence > 0
                  ? ` · +${formatPence(addonTotals.pricePence)}`
                  : ''}
                {` · ${formatDuration(effectiveDuration)} total`}
              </Text>
            ) : null}

          </ScrollView>

          {!hasChanges ? (
            <Text variant="caption" tone="muted">
              Adjust a field to check availability and enable save.
            </Text>
          ) : check.state === 'checking' ? (
            <Text variant="caption" tone="muted">
              Checking availability…
            </Text>
          ) : check.state === 'valid' ? (
            <Text variant="caption" color={colors.success}>
              Time available ✓
            </Text>
          ) : check.state === 'invalid' ? (
            <Text variant="caption" tone="danger">
              {check.reason}
            </Text>
          ) : check.state === 'unknown' ? (
            <Text variant="caption" tone="muted">
              Could not pre-check availability — Save will validate.
            </Text>
          ) : null}

          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.actionButton} />
            <Button
              label="Save changes"
              onPress={() => void handleSave()}
              loading={modify.isPending}
              disabled={!canSave}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // `flex: 1` + a `fill` Sheet: the form is long enough to exceed the sheet's
  // height, and a content-sized body pushes the pinned Save/Cancel row off the
  // bottom of the screen. The ScrollView must be the part that gives.
  //
  // `fill` Sheets supply no horizontal padding (they delegate it to the child),
  // so every pane pads itself to the standard sheet inset — otherwise the form
  // runs flush to the screen edges while the content-sized sheets beside it
  // (deposit, filters, take payment) sit inset, and Modify reads as too wide.
  body: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  stepBody: {
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pickerPane: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  scrollBody: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  addonGroup: {
    gap: spacing.sm,
  },
  addonGroupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  addonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  addonCheck: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addonCheckMark: {
    fontSize: 13,
    fontFamily: fonts.bold,
    lineHeight: 16,
  },
  addonText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  noticeActions: {
    gap: spacing.sm,
  },
});

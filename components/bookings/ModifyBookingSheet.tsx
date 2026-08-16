import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError } from '@/lib/api/client';
import {
  minimumVisitFloorMinutes,
  type VisitEditTarget,
} from '@/lib/booking/appointment-visit';
import { MIN_CORE_DURATION_MINUTES } from '@/lib/booking/booking-core-duration';
import { filterToUsableCalendars } from '@/lib/calendar/managed-calendars';
import {
  describeProcessingChange,
  describeProcessingGaps,
  effectiveProcessingTemplate,
  fitProcessingBlocksToDuration,
  parseProcessingTimeBlocks,
} from '@/lib/booking/processing-time-fit';
import { calendarDateInTimeZone, formatDayHeading } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useAppointmentAvailability } from '@/lib/queries/useAppointmentAvailability';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { useBookingDetail } from '@/lib/queries/useBookingDetail';
import { useMonthAvailability } from '@/lib/queries/useMonthAvailability';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import {
  useModifyAppointment,
  useNotifyBookingModification,
  useValidateAppointmentModification,
} from '@/lib/queries/useBookingMutations';
import { useVisitSchedule, useVisitServices } from '@/lib/queries/useVisitMutations';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  AppointmentCatalogAddonGroup,
  AppointmentCatalogService,
} from '@/types/appointment-catalog';
import type { ProcessingTimeBlock } from '@/types/services-manage';

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
  /**
   * Set when this booking is one service of a multi-service visit. The form then
   * edits the VISIT: one start, one calendar and ONE wall-clock duration, written
   * through the visit endpoint so the services cannot come apart.
   *
   * Per-service editing is withdrawn while it is set, deliberately — shortening
   * one service and leaving the rest where they were is what opened dead time
   * inside a visit in the first place. Changing WHAT a visit is made of is a
   * separate endpoint the app does not surface yet (R15-4).
   */
  visit?: VisitEditTarget | null;
};

type ModifyBookingSheetProps = {
  target: ModifyBookingTarget | null;
  onClose: () => void;
};

const MAX_MINUTES = 23 * 60 + 59;
/**
 * Duration bounds. The floor is the ONE shared floor
 * ({@link MIN_CORE_DURATION_MINUTES}, 5) that the API, the calendar drag and the
 * reschedule sheet all use.
 *
 * It was 15 here, justified by the web modify form's `min={15}`. That input is
 * now `min={5}` too: web found eight places carrying their own 15 against an
 * engine floor of 5, so a 5 or 10 minute appointment "could be configured but
 * not booked, dragged but not saved". The last 15 in this app was here, and it
 * also gated the catalogue adoption below — a sub-15 service whose row had no
 * end time never resolved a duration at all, leaving Save disabled for good.
 */
const MIN_DURATION_MINUTES = MIN_CORE_DURATION_MINUTES;
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
type Mode = 'form' | 'date' | 'time' | 'notify' | 'visitService';

/** One line of a visit's service list, as the form holds it. */
type VisitServiceLine = {
  /** Stable across edits so React keys survive a swap. */
  key: string;
  /** The row this line keeps, or null for a service being added. */
  bookingId: string | null;
  serviceId: string;
  variantId: string | null;
};

let visitLineSeq = 0;
function nextVisitLineKey(): string {
  visitLineSeq += 1;
  return `visit-line-${visitLineSeq}`;
}

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
  /**
   * A visit is edited as one booking through its own endpoint, which plans every
   * service, checks each one, and rolls back anything already written if one is
   * refused. Null `groupBookingId` leaves the hook inert.
   */
  const visit = target?.visit ?? null;
  const isVisit = visit != null;
  const visitSchedule = useVisitSchedule(visit?.groupBookingId);
  /**
   * Changing WHAT a visit is made of is a different write from changing when it
   * is: the services endpoint takes the list and reconciles it, and lays the
   * visit out from what it then holds.
   */
  const visitServices = useVisitServices(visit?.groupBookingId);
  // Sends the email the save deliberately held back, when the user taps Notify.
  const notifyModification = useNotifyBookingModification();
  // Read the open booking's full detail (cache hit — the detail sheet is already
  // open) so we can seed the booking's current add-ons. ModifyBookingTarget does
  // not carry them and its source component is out of scope to edit.
  const detailQuery = useBookingDetail(target?.id);
  const currentAddons = detailQuery.data?.addons ?? null;

  /** Role + assigned calendars, for the reassign gate on the picker (R16-1). */
  const staffMe = useStaffMe();

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState(0);
  /**
   * null until resolved: the booking's own core duration when its row carries
   * an end time, otherwise the service's catalogue duration adopted once the
   * catalogue loads (see the effect below). Never a hardcoded default — that is
   * what used to shrink a guest-created appointment to 30 minutes on save,
   * because those rows have no `booking_end_time`.
   */
  const [duration, setDuration] = useState<number | null>(null);
  /**
   * What the form OPENED with. Tracks an adopted catalogue duration so adopting
   * one does not read as a staff edit (which would arm Save on a form nobody
   * has touched), and so Undo restores the real original length.
   */
  const [baselineDuration, setBaselineDuration] = useState<number | null>(null);
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
  /**
   * The booking's own processing gaps as they stood when the sheet opened, for
   * the same reason `originalAddonIds` exists: by Undo time the save has
   * invalidated the detail query and it describes the NEW booking. `null` means
   * not resolved yet, where omitting the key and leaving the row alone is the
   * only safe answer. State rather than a ref because the panel's copy reads it.
   */
  const [originalProcessingBlocks, setOriginalProcessingBlocks] = useState<
    ProcessingTimeBlock[] | null
  >(null);
  /** True once an Undo PATCH is in flight, so the pane can show it working. */
  const [undoing, setUndoing] = useState(false);
  /**
   * The save that just landed rewrote the visit's SERVICES, so Undo is not
   * offered after it.
   *
   * Undo restores a schedule, and there is no honest schedule-only undo here: a
   * removed service has been cancelled (a new row would be an insert, not a
   * resurrection), and the ids this form knows are stale the moment the write
   * lands. Putting the visit back where it was while leaving it made of
   * something else would be worse than not offering it.
   */
  const [savedServiceChange, setSavedServiceChange] = useState(false);
  /**
   * The visit carries dead time an earlier per-service edit left behind, so
   * saving will re-lay it even if the staff member changes nothing. Answered by
   * the endpoint on open (`changed` on a dry run that asks for the visit's
   * current shape) — the rows' own span is not the visit's span when a hole sits
   * inside it.
   */
  const [visitRelayNeeded, setVisitRelayNeeded] = useState(false);
  /** The span the endpoint says this visit has, once its opening dry run answers. */
  const [visitPlannedMinutes, setVisitPlannedMinutes] = useState<number | null>(null);
  /**
   * The visit's services as the staff member wants them, and as they stand.
   *
   * Both null until the opening plan answers: the rows the booking list hands
   * this form carry service NAMES, not ids, and the endpoint needs ids to say
   * what the visit is made of.
   */
  const [serviceLines, setServiceLines] = useState<VisitServiceLine[] | null>(null);
  const [baselineServiceLines, setBaselineServiceLines] = useState<VisitServiceLine[] | null>(
    null,
  );
  /**
   * Every scheduled row of the visit as this form last saw it, sent with a
   * service edit so a service that appeared meanwhile cannot be cancelled by a
   * list that never included it.
   */
  const [knownBookingIds, setKnownBookingIds] = useState<string[]>([]);
  /** Which line the service picker is editing; -1 while adding a new one. */
  const [pickerLineIndex, setPickerLineIndex] = useState<number | null>(null);
  /** The service chosen in the picker, while its options are being chosen. */
  const [pickerServiceId, setPickerServiceId] = useState<string | null>(null);

  /**
   * The duration floor for whatever is being edited. A visit's is its services'
   * floors added up, deliberately excluding the gaps the server adds on top: a
   * client clamp below the server's floor can never put a legitimate length out
   * of reach, and one that is genuinely too short comes back from the dry run
   * naming the real minimum.
   */
  const minDuration = visit
    ? minimumVisitFloorMinutes(visit.serviceCount)
    : MIN_DURATION_MINUTES;

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
    setDuration(target.durationMinutes);
    setBaselineDuration(target.durationMinutes);
    setAddonIds([]);
    setAddonsSeeded(false);
    originalAddonIds.current = [];
    setOriginalProcessingBlocks(null);
    setChecked({ sig: null, result: { state: 'idle' } });
    setError(null);
    setUndoing(false);
    setSavedServiceChange(false);
    setVisitRelayNeeded(false);
    setVisitPlannedMinutes(null);
    setServiceLines(null);
    setBaselineServiceLines(null);
    setKnownBookingIds([]);
    setPickerLineIndex(null);
    setPickerServiceId(null);
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
  // Derived from the stable `services`/`serviceId` (like `addonGroups` below) so
  // its identity is stable for the adoption effect's dependency list.
  const variants = useMemo(
    () => services.find((s) => s.id === serviceId)?.variants ?? [],
    [services, serviceId],
  );
  const requiresVariant = variants.length > 0;

  /**
   * The booking row carried no end time (every guest-created appointment), so
   * adopt the catalogue duration — the chosen variant's when there is one — as
   * BOTH the value and the baseline: it is what this appointment is scheduled
   * for, not an edit staff made. Self-limiting: it fills the null it tests, so
   * it runs at most once per opened booking.
   */
  const catalogueDuration = selectedService
    ? variants.find((v) => v.id === variantId)?.duration_minutes ??
      selectedService.duration_minutes
    : null;
  useEffect(() => {
    // Never on a visit: `duration` there is the WHOLE visit's span, and adopting
    // the lead service's catalogue length would silently propose collapsing a
    // three-service visit to the length of its first service.
    if (isVisit || duration != null || catalogueDuration == null) return;
    if (!Number.isFinite(catalogueDuration) || catalogueDuration < MIN_DURATION_MINUTES) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption once the catalogue resolves
    setDuration(catalogueDuration);
    setBaselineDuration(catalogueDuration);
  }, [isVisit, duration, catalogueDuration]);

  // Staff offering the selected service; all staff when the service is
  // unknown to the catalog (archived) so reassignment stays possible.
  const eligibleStaff = useMemo(() => {
    // A visit has several services, so no single "who offers this" answer. Show
    // every calendar and let the endpoint judge: it checks each service against
    // the target calendar and names the one that cannot go there.
    const offering = isVisit
      ? practitioners
      : !serviceId || !offeredBy.has(serviceId)
        ? practitioners
        : practitioners.filter((p) => offeredBy.get(serviceId)!.has(p.id));
    /**
     * R16-1 — a non-admin may only move a booking onto a calendar assigned to
     * their account, so do not offer the rest. The catalogue behind
     * `practitioners` comes from a `roster=1` fetch, which is exactly the flag
     * that turns the server's own narrowing off, so without this the picker
     * lists every colleague and the save 403s.
     *
     * The booking's CURRENT calendar is kept even when it is not theirs: it is
     * the selected value, and dropping it out of the list would render the
     * picker with nothing selected and make an unrelated edit look like a
     * reassign. Selecting it changes nothing, so it never arms the gate.
     */
    const usable = filterToUsableCalendars(
      {
        role: staffMe.data?.staff.role,
        managedCalendarIds: staffMe.data?.staff.linked_calendar_ids,
      },
      offering,
    );
    const current = offering.find((p) => p.id === target?.practitionerId);
    return current && !usable.some((p) => p.id === current.id) ? [current, ...usable] : usable;
  }, [isVisit, serviceId, offeredBy, practitioners, staffMe.data, target?.practitionerId]);

  /**
   * The calendar id to SEND, or undefined when it has not changed.
   *
   * Re-asserting the booking's existing calendar arms the server's
   * managed-calendar gate for no reason — see
   * {@link ModifyAppointmentInput.practitioner_id}. Every send site below uses
   * this rather than `practitionerId` directly.
   */
  const reassignedPractitionerId =
    practitionerId && practitionerId !== target?.practitionerId ? practitionerId : undefined;

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
    // A visit does not edit add-ons, and its span already includes their minutes.
    // Seeding them would add those minutes a second time.
    if (isVisit) return;
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
    isVisit,
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
  // way; the PATCH validator only takes a single duration_minutes). Null while
  // the base duration is still unresolved — never a guess.
  // On a visit this IS the wall-clock span, gaps and add-ons already inside it —
  // adding the add-on minutes again would lengthen the visit by them on save.
  const effectiveDuration =
    duration == null ? null : duration + (isVisit ? 0 : addonTotals.durationMinutes);

  // ---- Processing time ------------------------------------------------------
  // A booking snapshots its service's processing gaps at creation, and the
  // server validates that snapshot against whatever `duration_minutes` the
  // request asks for. Send the gaps FITTED to that same number, or shortening a
  // booking below its last gap's end is rejected ("Processing blocks must lie
  // within the service duration") with nothing the app can do about it.
  //
  // Fitted against `effectiveDuration`, not the bare core: that is the value
  // sent as `duration_minutes`, so it is what the server will judge them by.
  // Add-on minutes only ever make the window longer, so a gap that fits the
  // core fits this too.

  /**
   * The raw column. Three states, all different:
   * - `undefined`: not loaded. Send nothing and leave the row alone.
   * - `null`: no snapshot taken, which means the booking INHERITS its service's
   *   catalogue pattern. Sending `[]` here would strip a real processing gap
   *   from the booking on its first save.
   * - an array: this booking's own gaps, `[]` included (it deliberately has none).
   */
  const bookingSnapshotRaw = detailQuery.data?.processing_time_blocks;
  const bookingBlocksKnown = bookingSnapshotRaw !== undefined;

  /**
   * The catalogue pattern for whichever service and option is selected right
   * now. Parsed, not trusted: the catalogue's blocks arrive as raw JSON like the
   * booking's own, and forwarding a malformed entry would turn a clean save into
   * a server-side schema rejection staff cannot act on.
   */
  const selectedTemplateBlocks = useMemo(() => {
    if (!selectedService) return [];
    return effectiveProcessingTemplate({
      parentBlocks: parseProcessingTimeBlocks(selectedService.processing_time_blocks),
      variantBlocks: parseProcessingTimeBlocks(
        variants.find((v) => v.id === variantId)?.processing_time_blocks,
      ),
    });
  }, [selectedService, variants, variantId]);

  /** Switching service or option means a different catalogue pattern applies. */
  const processingServiceChanged =
    !!target &&
    (serviceId !== target.serviceId || (variantId ?? null) !== (target.serviceVariantId ?? null));

  /**
   * The booking's OWN gaps as they stood when the sheet opened, resolved through
   * the null-means-inherit rule. Latched in state (not derived) for the same
   * reason `originalAddonIds` is a ref: after a save the detail query describes
   * the NEW booking, and Undo has to restore the old one. `null` = not resolved
   * yet, where sending nothing is the only safe answer.
   */
  useEffect(() => {
    if (!target || seededId !== target.id) return;
    if (originalProcessingBlocks != null || !bookingBlocksKnown) return;
    // A null snapshot needs the catalogue to resolve; wait for it rather than
    // latching an empty list that would later read as "this booking has none".
    if (bookingSnapshotRaw === null && !selectedService) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot latch once the detail (and, for a null snapshot, the catalogue) resolves
    setOriginalProcessingBlocks(
      bookingSnapshotRaw === null
        ? selectedTemplateBlocks
        : parseProcessingTimeBlocks(bookingSnapshotRaw),
    );
  }, [
    target,
    seededId,
    originalProcessingBlocks,
    bookingBlocksKnown,
    bookingSnapshotRaw,
    selectedService,
    selectedTemplateBlocks,
  ]);

  /**
   * Which pattern this booking should carry: its own while it stays on the same
   * service and option, otherwise the newly chosen one's template. A snapshot
   * belongs to the service it was taken from, so keeping it across a service
   * change would leave the old service's gap on the booking.
   */
  const sourceProcessingBlocks = useMemo(
    () => (processingServiceChanged ? selectedTemplateBlocks : (originalProcessingBlocks ?? [])),
    [processingServiceChanged, selectedTemplateBlocks, originalProcessingBlocks],
  );

  const processingFit = useMemo(
    () => fitProcessingBlocksToDuration(sourceProcessingBlocks, effectiveDuration ?? 0),
    [sourceProcessingBlocks, effectiveDuration],
  );

  /**
   * What to send, or null to leave the row alone. Only once the duration has
   * resolved AND we have either latched the booking's own gaps or are
   * deliberately replacing them because the service changed.
   */
  const processingBlocksToSend =
    !isVisit &&
    effectiveDuration != null &&
    (originalProcessingBlocks != null || processingServiceChanged)
      ? processingFit.blocks
      : null;

  /** What saving will do to the processing time, in words. Null when nothing changes. */
  const processingNotice = useMemo(() => {
    if (effectiveDuration == null) return null;
    // Switched to a service with no processing time at all: nothing to trim, but
    // the booking is still losing its gap. Say so rather than dropping it quietly.
    if (
      processingServiceChanged &&
      (originalProcessingBlocks?.length ?? 0) > 0 &&
      sourceProcessingBlocks.length === 0
    ) {
      return 'The service you picked has no processing time, so saving will remove this booking’s gap.';
    }
    return describeProcessingChange({
      removed: processingFit.removed.length,
      trimmed: processingFit.trimmed.length,
      serviceChanged: processingServiceChanged && sourceProcessingBlocks.length > 0,
    });
  }, [
    effectiveDuration,
    processingFit,
    processingServiceChanged,
    originalProcessingBlocks,
    sourceProcessingBlocks,
  ]);

  /**
   * Only worth showing when this booking has, or is losing, a processing gap.
   *
   * Never on a visit: its services each carry their own gaps, and the endpoint
   * fits them per service as it re-lays the visit. A panel describing the lead
   * service's gaps would be reporting one service's arithmetic as the visit's.
   */
  const showProcessingPanel =
    !isVisit &&
    effectiveDuration != null &&
    (sourceProcessingBlocks.length > 0 ||
      (processingServiceChanged && (originalProcessingBlocks?.length ?? 0) > 0));

  // Quick duration presets — current/baseline/default + common lengths. The
  // short ones lead so a 5 or 10 minute appointment is a tap, not eight
  // decrements (web parity: its preset row gained the same two).
  const durationPresets = [
    ...new Set(
      [
        // A visit's length comes from the services in it, so the single-service
        // catalogue length is not a preset for it.
        isVisit ? undefined : selectedService?.duration_minutes,
        baselineDuration ?? undefined,
        5,
        10,
        15,
        30,
        45,
        60,
        90,
        120,
      ].filter((d): d is number => d != null && d >= minDuration),
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
    // Wait for the duration to resolve rather than querying without one (the
    // server would answer for the catalogue default, not this booking).
    //
    // Disabled for a visit. The endpoint can only exclude ONE booking, so the
    // visit's other services would count as occupied against themselves and the
    // list would hide every slot the visit currently overlaps — including where
    // it already sits. The visit's live check does this properly (it excludes
    // every one of its own rows), so a slot list here would be a second, wrong
    // opinion. Visit mode uses a time picker and that check instead.
    enabled: !isVisit && !!target && serviceInCatalog && effectiveDuration != null,
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
    enabled:
      !isVisit &&
      mode === 'date' &&
      !!target &&
      serviceInCatalog &&
      !!serviceId &&
      !!practitionerId &&
      effectiveDuration != null,
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
    ((!isVisit &&
      (serviceId !== target.serviceId || variantId !== target.serviceVariantId)) ||
      practitionerId !== target.practitionerId ||
      date !== target.date ||
      minutes !== timeToMinutes(target.time) ||
      // Compare against what the form opened with, which for a row that carried
      // no end time is the catalogue duration it adopted — adopting one is not
      // a staff edit and must not arm Save on an untouched form.
      (effectiveDuration != null && effectiveDuration !== baselineDuration));

  /**
   * The length was deliberately changed, as opposed to merely carried.
   *
   * A visit's `total_duration_minutes` is an INSTRUCTION, not a description: the
   * server lays the services out to fill it, so re-asserting the span the form
   * happens to be holding lengthens the tail service by whatever dead time was in
   * it. Sending it only on a real edit means a move stays a move — and it is also
   * the safe answer when the opening plan never arrived, where the form is still
   * showing the rows' raw span.
   */
  const durationEdited =
    effectiveDuration != null && baselineDuration != null && effectiveDuration !== baselineDuration;

  // ---- The visit's service list (add / remove / swap) -----------------------

  /**
   * Offered only once the endpoint has resolved every row to a service. See the
   * opening plan above for why a partial list is withheld rather than shown.
   */
  const canEditVisitServices = isVisit && serviceLines != null && knownBookingIds.length > 0;

  /** A line's identity for change detection: which row, which service, which option. */
  const serviceLinesKey = (lines: VisitServiceLine[] | null) =>
    (lines ?? []).map((l) => `${l.bookingId ?? 'new'}:${l.serviceId}:${l.variantId ?? ''}`).join('|');

  const servicesChanged =
    canEditVisitServices && serviceLinesKey(serviceLines) !== serviceLinesKey(baselineServiceLines);

  /**
   * Only what this calendar actually offers may join the visit, plus whatever is
   * already on it — a service the calendar has since stopped offering must still
   * be listable, or the form could not show the visit it opened on.
   */
  const visitServiceOptions = useMemo(() => {
    if (!canEditVisitServices) return [];
    const onVisit = new Set((serviceLines ?? []).map((l) => l.serviceId));
    return services.filter(
      (s) =>
        onVisit.has(s.id) ||
        !practitionerId ||
        !offeredBy.has(s.id) ||
        offeredBy.get(s.id)!.has(practitionerId),
    );
  }, [canEditVisitServices, serviceLines, services, offeredBy, practitionerId]);

  /** "Cut & Finish – Long" for a line, from the catalogue rather than a snapshot. */
  const visitLineLabel = useCallback(
    (line: VisitServiceLine): string => {
      const service = services.find((s) => s.id === line.serviceId);
      if (!service) return 'Service';
      const variant = (service.variants ?? []).find((v) => v.id === line.variantId);
      return variant ? `${service.name} – ${variant.name}` : service.name;
    },
    [services],
  );

  const openServicePicker = (index: number | null) => {
    hapticSelect();
    setPickerLineIndex(index ?? -1);
    setPickerServiceId(index != null && index >= 0 ? (serviceLines?.[index]?.serviceId ?? null) : null);
    setMode('visitService');
  };

  /** Commit the picker's choice onto the line it was opened for, then return. */
  const commitServicePick = (serviceId: string, variantId: string | null) => {
    setServiceLines((current) => {
      if (!current) return current;
      const line: VisitServiceLine = {
        key: pickerLineIndex != null && pickerLineIndex >= 0 ? current[pickerLineIndex]!.key : nextVisitLineKey(),
        // Swapping keeps the ROW, so the endpoint re-services it rather than
        // cancelling one booking and inserting another (which would lose its
        // history, and its price snapshot with it).
        bookingId:
          pickerLineIndex != null && pickerLineIndex >= 0
            ? current[pickerLineIndex]!.bookingId
            : null,
        serviceId,
        variantId,
      };
      if (pickerLineIndex == null || pickerLineIndex < 0) return [...current, line];
      return current.map((l, i) => (i === pickerLineIndex ? line : l));
    });
    setPickerLineIndex(null);
    setPickerServiceId(null);
    setMode('form');
  };

  const removeServiceLine = (index: number) => {
    hapticSelect();
    setServiceLines((current) => (current ? current.filter((_, i) => i !== index) : current));
  };

  /** The booking's original start, for the "orig" marker on the slot list. */
  const originalTime = target ? minutesToTime(timeToMinutes(target.time)) : '';
  /** Date or time moved — the web picker highlights this as its own state. */
  const scheduleChanged =
    !!target && (date !== target.date || minutes !== timeToMinutes(target.time));

  // Debounced dry-run validation (450ms, web parity). Auth/availability errors
  // on the endpoint degrade to "unknown" — the PATCH still validates.
  // Duration unresolved (catalogue still loading): stay idle rather than
  // validate a guess. The effect re-runs once the adoption lands.
  // A visit has no service or variant of its own to check, and its length is the
  // whole span — the endpoint plans every service from those three facts.
  const canCheck = isVisit
    ? !!target && !!practitionerId && !!date && effectiveDuration != null
    : !!target && !!serviceId && !!practitionerId && !!date && effectiveDuration != null;
  const signature = !canCheck
    ? null
    : isVisit
      ? [
          'visit',
          visit!.groupBookingId,
          practitionerId,
          date,
          minutes,
          effectiveDuration,
          // The list is part of what the check judges: the services set the
          // visit's length, so a stale "valid" must not survive one changing.
          serviceLinesKey(serviceLines),
        ].join('|')
      : [
          target!.id,
          serviceId,
          variantId,
          practitionerId,
          date,
          minutes,
          effectiveDuration,
          // The blocks are part of what the dry run judges, and they can arrive
          // AFTER the rest is settled (the detail query resolving flips them from
          // "not loaded" to a real set), so a stale "valid" must not survive that.
          processingBlocksToSend ? JSON.stringify(processingBlocksToSend) : '',
        ].join('|');
  const validateMutate = validate.mutate;
  const visitScheduleAsync = visitSchedule.mutateAsync;
  const visitServicesAsync = visitServices.mutateAsync;

  /** What the services endpoint is asked for: the list, plus the schedule. */
  const visitServicesRequestBody = useCallback(
    () => ({
      services: (serviceLines ?? []).map((l) => ({
        ...(l.bookingId ? { booking_id: l.bookingId } : {}),
        service_id: l.serviceId,
        service_variant_id: l.variantId,
      })),
      // The visit this form was opened on. Leaving a service out is how it is
      // removed, so the endpoint refuses the whole request if the visit has
      // gained or lost one since.
      known_booking_ids: knownBookingIds,
      booking_date: date,
      booking_time: `${minutesToTime(minutes)}:00`,
      ...(reassignedPractitionerId ? { practitioner_id: reassignedPractitionerId } : {}),
      allow_outside_hours: true,
      // The dry run has to be asked the same question the PATCH will be, or the
      // two disagree and the visit is refused before it is ever attempted — the
      // exact failure web hit threading this through (R17-3).
      allow_during_breaks: true,
    }),
    [serviceLines, knownBookingIds, date, minutes, reassignedPractitionerId],
  );
  useEffect(() => {
    if (!target || !practitionerId || !date || !signature) return;
    if (!isVisit && !serviceId) return;
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      if (isVisit) {
        /**
         * The visit's OWN dry run, not N per-service checks. It plans every
         * service, excludes the visit's own rows from the overlap test (so a
         * service is never reported as clashing with the sibling it is about to
         * follow), and answers in the shape the save does — the live check and
         * the save cannot disagree.
         */
        void (async () => {
          try {
            // A visit whose SERVICES changed is planned by the services endpoint,
            // which lays the visit out from what it now holds. Its length then
            // follows the services rather than competing with them.
            if (servicesChanged) {
              const plan = await visitServicesAsync({
                dry_run: true,
                ...visitServicesRequestBody(),
              });
              if (checkSeq.current !== seq) return;
              setChecked({ sig: signature, result: { state: 'valid' } });
              if (typeof plan.total_minutes === 'number') {
                setVisitPlannedMinutes(plan.total_minutes);
              }
              return;
            }
            await visitScheduleAsync({
              dry_run: true,
              booking_date: date,
              booking_time: `${minutesToTime(minutes)}:00`,
              ...(reassignedPractitionerId ? { practitioner_id: reassignedPractitionerId } : {}),
              // Exactly what the save will send, or the check judges a request
              // the save would not make.
              ...(durationEdited ? { total_duration_minutes: effectiveDuration! } : {}),
            });
            if (checkSeq.current !== seq) return;
            setChecked({ sig: signature, result: { state: 'valid' } });
          } catch (e) {
            if (checkSeq.current !== seq) return;
            // A refusal (409), a rejected shape (400) or a stale visit (412) all
            // carry a sentence naming what blocked it. Anything else — auth, a
            // dropped connection, a 500 — is not something to report as "this
            // time is taken", so it degrades to unknown and the save re-checks.
            const refused =
              e instanceof ApiError && (e.status === 409 || e.status === 400 || e.status === 412);
            setChecked({
              sig: signature,
              result: refused
                ? { state: 'invalid', reason: (e as ApiError).message }
                : { state: 'unknown' },
            });
          }
        })();
        return;
      }
      validateMutate(
        {
          booking_date: date,
          booking_time: minutesToTime(minutes),
          ...(reassignedPractitionerId ? { practitioner_id: reassignedPractitionerId } : {}),
          ...(target.usesServiceItem
            ? { service_item_id: serviceId! }
            : { appointment_service_id: serviceId! }),
          duration_minutes: effectiveDuration,
          service_variant_id: requiresVariant ? variantId : null,
          // The same fitted blocks the save will send, so this dry run judges
          // exactly what the PATCH will persist.
          ...(processingBlocksToSend ? { processing_time_blocks: processingBlocksToSend } : {}),
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
    isVisit,
    serviceId,
    variantId,
    practitionerId,
    // Derived from `practitionerId` + `target`, both already here, so this adds
    // no re-runs — it keeps the dry run honest about what the save will send.
    reassignedPractitionerId,
    date,
    minutes,
    effectiveDuration,
    processingBlocksToSend,
    requiresVariant,
    signature,
    validateMutate,
    visitScheduleAsync,
    visitServicesAsync,
    visitServicesRequestBody,
    servicesChanged,
  ]);

  /**
   * What the visit actually looks like to the server, asked once on open.
   *
   * The rows can carry dead time an earlier per-service edit left behind, so the
   * span they occupy is not the span the visit HAS. Adopting the planned total as
   * both the value and the baseline keeps that correction from reading as a staff
   * edit, and `visitRelayNeeded` is what still lets them save it.
   */
  useEffect(() => {
    if (!isVisit || !target || seededId !== target.id) return;
    if (visitPlannedMinutes != null) return;
    const seededDuration = target.durationMinutes;
    let cancelled = false;
    void (async () => {
      try {
        const plan = await visitScheduleAsync({
          dry_run: true,
          booking_date: target.date,
          booking_time: `${target.time.slice(0, 5)}:00`,
          ...(target.practitionerId ? { practitioner_id: target.practitionerId } : {}),
        });
        if (cancelled || typeof plan.total_minutes !== 'number') return;
        setVisitPlannedMinutes(plan.total_minutes);
        setVisitRelayNeeded(plan.changed === true);
        /**
         * The service list, but only when EVERY row resolved to a service id.
         *
         * A partial list would be destructive: the request is declarative, so a
         * row missing from it is cancelled. A legacy row the endpoint could not
         * resolve therefore switches service editing off entirely rather than
         * quietly dropping that service on the first save.
         */
        const planned = plan.services ?? [];
        const lines = planned
          .filter((s) => s.id && s.service_id)
          .map((s) => ({
            key: nextVisitLineKey(),
            bookingId: s.id,
            serviceId: s.service_id!,
            variantId: s.service_variant_id ?? null,
          }));
        setKnownBookingIds(planned.map((s) => s.id).filter((id): id is string => Boolean(id)));
        if (lines.length > 0 && lines.length === planned.length) {
          setServiceLines(lines);
          setBaselineServiceLines(lines);
        }
        // Only if the staff member has not already moved the slider in the
        // meantime — their edit outranks the correction.
        setDuration((current) => (current === seededDuration ? plan.total_minutes : current));
        setBaselineDuration((current) =>
          current === seededDuration ? plan.total_minutes : current,
        );
      } catch {
        // The form still works from the rows' own span, and the save is checked
        // against the endpoint regardless.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisit, target, seededId, visitPlannedMinutes, visitScheduleAsync]);

  /**
   * Dead time the rows carry that saving will close, in words.
   *
   * Shown before the staff member commits, because it is a change they did not
   * ask for: the visit comes out shorter than it went in, and every service after
   * the hole moves earlier. It is also the repair for visits an earlier
   * per-service edit already damaged.
   */
  const visitRelayNotice = useMemo(() => {
    if (!visitRelayNeeded || !target) return null;
    // While the list is being rewritten the visit is re-laid regardless, and the
    // planned total now describes the NEW services — subtracting it from the old
    // span would report a "gap" that is really the edit in progress.
    if (servicesChanged) return null;
    const rawSpan = target.durationMinutes;
    const gap =
      rawSpan != null && visitPlannedMinutes != null ? rawSpan - visitPlannedMinutes : 0;
    if (gap > 0) {
      return `This visit has ${gap} minutes of dead time in it. Saving closes it, so the services run back to back.`;
    }
    return 'Saving will re-lay this visit so its services run back to back.';
  }, [visitRelayNeeded, servicesChanged, target, visitPlannedMinutes]);

  const check: CheckState = !canCheck
    ? { state: 'idle' }
    : checked.sig === signature
      ? checked.result
      : { state: 'checking' };

  const canSave =
    !!target &&
    !!practitionerId &&
    effectiveDuration != null &&
    // A visit has no single service, variant or add-on set to satisfy — those
    // controls are not offered while it is being edited.
    (isVisit || (!!serviceId && (!requiresVariant || !!variantId) && addonGroupsValid)) &&
    // Re-laying a visit that carries dead time is a real save even though no
    // field has been touched: it is the edit that closes the hole.
    (hasChanges || servicesChanged || (isVisit && visitRelayNeeded)) &&
    check.state !== 'invalid' &&
    check.state !== 'checking';

  async function handleSave() {
    if (!target || !practitionerId || effectiveDuration == null) return;
    setError(null);

    if (isVisit) {
      /**
       * One write for the whole visit. Every service is planned and checked
       * before any is written, and a write that fails part-way puts back the rows
       * that already landed — the visit either moves whole or not at all.
       */
      try {
        if (servicesChanged) {
          await visitServices.mutateAsync({
            ...visitServicesRequestBody(),
            ...(scheduleChanged ? { defer_modification_guest_notification: true } : {}),
          });
          hapticSuccess();
          if (scheduleChanged) {
            setSavedServiceChange(true);
            setMode('notify');
            return;
          }
          onClose();
          return;
        }
        await visitSchedule.mutateAsync({
          booking_date: date,
          booking_time: `${minutesToTime(minutes)}:00`,
          ...(reassignedPractitionerId ? { practitioner_id: reassignedPractitionerId } : {}),
          // Only on a real edit — see `durationEdited`. Omitted, every service
          // keeps its own length and the visit is simply re-laid, which is what
          // closes any dead time in it.
          ...(durationEdited ? { total_duration_minutes: effectiveDuration } : {}),
          // Staff editing a visit by hand have decided where it goes.
          allow_outside_hours: true,
          allow_during_breaks: true,
          // The server emails the guest once, against the visit's first service,
          // and only when the START moved. Hold it back so the staff member gets
          // the same Notify / Don't notify / Undo choice a drag gives them.
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
      return;
    }

    if (!serviceId) return;
    try {
      await modify.mutateAsync({
        booking_date: date,
        booking_time: `${minutesToTime(minutes)}:00`,
        ...(reassignedPractitionerId ? { practitioner_id: reassignedPractitionerId } : {}),
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
        // The booking's processing gaps, fitted to the new duration. Omitted
        // when unresolved, which leaves the row's stored snapshot alone.
        ...(processingBlocksToSend ? { processing_time_blocks: processingBlocksToSend } : {}),
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
      // A visit is notified ONCE, against its first service — the row the
      // endpoint would have emailed against had the send not been deferred. Any
      // other segment would either send nothing or tell the guest about one
      // service of the several that moved.
      { bookingId: visit?.leadBookingId ?? target.id },
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

    if (isVisit) {
      /**
       * A visit goes back through the same endpoint, so the undo is as
       * all-or-nothing as the save was. It restores the visit's original start
       * and calendar, and its length only if the save changed it — otherwise the
       * services keep the lengths they still have, which restores them exactly.
       *
       * Worth knowing where it is NOT exact: when the length WAS changed, the
       * total is restored but the server redistributes it by its own rule (growth
       * goes on the tail). A shrink that cascaded back into an earlier service
       * therefore comes back with those minutes on the last one. That is inherent
       * to editing a visit by one wall-clock number, not something the undo can
       * recover; the slot and the total are exact.
       */
      setUndoing(true);
      try {
        await visitSchedule.mutateAsync({
          booking_date: target.date,
          booking_time: `${target.time.slice(0, 5)}:00`,
          ...(target.practitionerId ? { practitioner_id: target.practitionerId } : {}),
          ...(durationEdited && baselineDuration != null
            ? { total_duration_minutes: baselineDuration }
            : {}),
          allow_outside_hours: true,
          // An undo must be able to put the booking back exactly where it was,
          // including onto a break it was already sitting over.
          allow_during_breaks: true,
          // SKIP, not defer: an undone change is not something to tell the guest
          // about, and no prompt follows this to decide otherwise.
          skip_booking_modification_guest_notification: true,
        });
        hapticSuccess();
        toast.success('Change undone.');
        onClose();
      } catch {
        hapticWarning();
        setUndoing(false);
        toast.error('Could not undo the change.');
      }
      return;
    }

    const restoreServiceId = target.serviceId ?? serviceId;
    const restorePractitionerId = target.practitionerId ?? practitionerId;
    const restoreDuration = baselineDuration;
    if (!restoreServiceId || !restorePractitionerId || restoreDuration == null) {
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
        // The length the form OPENED with: the booking's own, or the catalogue
        // duration adopted for a row that carried no end time. Never 30 —
        // undoing a change must not itself shrink the appointment.
        duration_minutes: restoreDuration,
        service_variant_id: target.serviceVariantId,
        ...(originalHadAddons
          ? { addons: originalAddonIds.current.map((addon_id) => ({ addon_id })) }
          : {}),
        // Undo restores the booking's OWN gaps, not whatever the save fitted.
        // Latched on open for the same reason the add-ons are: by now the detail
        // query describes the saved booking.
        ...(originalProcessingBlocks
          ? { processing_time_blocks: originalProcessingBlocks }
          : {}),
        // SKIP, not defer: an undone change is not something to tell the guest
        // about, and no prompt follows this to decide otherwise. (Both flags
        // suppress the send server-side; this one says why.)
        skip_booking_modification_guest_notification: true,
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

  /** Null while the duration is unresolved — the end is unknown, not 30 minutes out. */
  const endPreview =
    effectiveDuration == null
      ? null
      : minutesToTime((minutes + effectiveDuration) % (24 * 60));

  // ---- Notify step: the save landed, the guest email is still held back -------
  // Content-sized (no `fill`), matching the calendar's post-drag prompt — a
  // 90%-tall sheet for three buttons would be all empty space.
  if (target && seededId === target.id && mode === 'notify') {
    return (
      <Sheet visible onClose={onClose}>
        <Text variant="subheading">{isVisit ? 'Visit moved' : 'Booking moved'}</Text>
        <Text variant="caption" tone="muted">
          Let {target.guestName} know about the change?
        </Text>
        <View style={styles.noticeActions}>
          <Button label={`Notify ${target.guestName}`} fullWidth onPress={handleNotify} />
          <Button label="Don't notify" variant="secondary" fullWidth onPress={onClose} />
          {/* No Undo once the SERVICES changed — see `savedServiceChange`. */}
          {savedServiceChange ? (
            <Text variant="caption" tone="muted">
              This visit&rsquo;s services changed too, so there is nothing to undo in one step.
              Reopen it to make further changes.
            </Text>
          ) : (
            <Button
              label="Undo change"
              variant="ghost"
              fullWidth
              loading={undoing}
              onPress={() => void handleUndo()}
            />
          )}
        </View>
      </Sheet>
    );
  }

  // ---- Service step: choose what goes on (or off) a visit ---------------------
  // A STEP, not a nested sheet: opening a second modal from a visible one is
  // unreliable on iOS. The option list appears under the chosen service rather
  // than in a further step, for the same reason.
  if (target && seededId === target.id && mode === 'visitService') {
    const picked = pickerServiceId ? services.find((s) => s.id === pickerServiceId) : null;
    const pickedVariants = picked?.variants ?? [];
    return (
      <Sheet visible fill onClose={onClose}>
        <View style={styles.stepBody}>
          <Text variant="heading">
            {pickerLineIndex != null && pickerLineIndex >= 0 ? 'Change service' : 'Add a service'}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {pickerLineIndex != null && pickerLineIndex >= 0
              ? 'The visit keeps this slot; only what happens in it changes.'
              : 'Added to the end of the visit, which grows by its length.'}
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            <View style={styles.fieldBlock}>
              <Text variant="label" tone="secondary">
                Service
              </Text>
              <View style={styles.chipWrap}>
                {visitServiceOptions.map((svc) => (
                  <Chip
                    key={svc.id}
                    label={svc.name}
                    selected={svc.id === pickerServiceId}
                    onPress={() => {
                      hapticSelect();
                      const variants = svc.variants ?? [];
                      // Nothing to choose between: take it and go back.
                      if (variants.length === 0) {
                        commitServicePick(svc.id, null);
                        return;
                      }
                      setPickerServiceId(svc.id);
                    }}
                  />
                ))}
              </View>
            </View>

            {picked && pickedVariants.length > 0 ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Option
                </Text>
                <View style={styles.chipWrap}>
                  {pickedVariants.map((v) => (
                    <Chip
                      key={v.id}
                      label={`${v.name} (${v.duration_minutes}m)`}
                      onPress={() => {
                        hapticSelect();
                        commitServicePick(picked.id, v.id);
                      }}
                    />
                  ))}
                </View>
                <Text variant="caption" tone="muted">
                  A service brings its own length with it, so swapping one does not keep a
                  length set by hand.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setPickerLineIndex(null);
                setPickerServiceId(null);
                setMode('form');
              }}
              style={styles.actionButton}
            />
          </View>
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
            // A visit gets no green markers: the month endpoint answers for ONE
            // service and would mark days by whether that service fits, not the
            // whole visit. `null` leaves every future date selectable and the
            // visit's own check decides, which is the only thing that can.
            availableDates={isVisit ? null : availableDates}
            isLoading={isVisit ? false : monthQuery.isLoading}
            timeZone={timeZone}
            weekShortcuts
            availabilityHint={
              isVisit
                ? 'Pick a day, then set the start time. The whole visit is checked against it.'
                : 'Green dates can fit this appointment.'
            }
            // No slot list for a visit — see the availability query above.
            onContinue={() => setMode(isVisit ? 'form' : 'time')}
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
            {formatDayHeading(date)}
            {effectiveDuration != null ? ` · ${formatDuration(effectiveDuration)}` : ''}
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
              {isVisit ? 'Modify visit' : 'Modify booking'}
            </Text>
            <Text variant="title">{target.guestName}</Text>
            <Text variant="bodySmall" tone="muted">
              Now: {formatDayHeading(target.date)} · {target.time.slice(0, 5)}
              {target.durationMinutes != null
                ? ` · ${formatDuration(target.durationMinutes)}`
                : ''}
            </Text>
            {visit ? (
              <Text variant="caption" tone="muted">
                {visit.serviceCount} services, edited as one booking:{' '}
                {visit.serviceNames.join(', ')}.
              </Text>
            ) : null}
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            {catalogQuery.isLoading ? (
              <Text variant="bodySmall" tone="muted">
                Loading services…
              </Text>
            ) : null}

            {!isVisit && !serviceInCatalog ? (
              <Text variant="caption" tone="muted">
                The booked service is no longer in the catalogue — pick a service below to
                change it, or just adjust the time and duration.
              </Text>
            ) : null}

            {/* What the visit is MADE OF. Per-service duration editing stays
                withdrawn — changing one service's length and leaving the others
                where they were is what opened dead time inside a visit — but the
                services themselves can be added, removed and swapped, and the
                visit re-sequences behind whatever it ends up holding. */}
            {canEditVisitServices ? (
              <View style={styles.fieldBlock}>
                <Text variant="label" tone="secondary">
                  Services in this visit
                </Text>
                {(serviceLines ?? []).map((line, index) => (
                  <View
                    key={line.key}
                    style={[
                      styles.visitServiceRow,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Change ${visitLineLabel(line)}`}
                      onPress={() => openServicePicker(index)}
                      style={styles.visitServiceMain}>
                      <Text variant="bodyMedium" numberOfLines={2}>
                        {visitLineLabel(line)}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {line.bookingId ? 'Tap to change' : 'New service'}
                      </Text>
                    </Pressable>
                    {(serviceLines?.length ?? 0) > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${visitLineLabel(line)}`}
                        onPress={() => removeServiceLine(index)}
                        hitSlop={8}>
                        <Text variant="bodySmall" color={colors.danger}>
                          Remove
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                <Button
                  label="Add a service"
                  variant="secondary"
                  onPress={() => openServicePicker(null)}
                />
                {servicesChanged ? (
                  <Text variant="caption" color={colors.warning}>
                    Saving rewrites this visit&rsquo;s services. A service taken off is
                    cancelled, keeping its own history; one that has been paid for cannot be
                    removed here, and has to be cancelled instead.
                  </Text>
                ) : (
                  <Text variant="caption" tone="muted">
                    The services set how long the visit is. A visit has to keep at least one.
                  </Text>
                )}
              </View>
            ) : null}

            {/* Per-service editing is withdrawn on a visit, deliberately.
                Changing one service's length and leaving the others where they
                were is what opened dead time inside a visit; the whole visit's
                length is the control below, and the services re-sequence to
                stay back to back behind it. */}
            {!isVisit && services.length > 0 ? (
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

            {!isVisit && requiresVariant ? (
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

            {!isVisit && serviceInCatalog && hasAddonGroups ? (
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
                  ) : endPreview ? (
                    <Text variant="caption" tone="muted">
                      Ends at {endPreview}
                    </Text>
                  ) : null}
                </View>
                <Text variant="bodySmall" color={colors.brand}>
                  Change
                </Text>
              </Pressable>
            </View>

            {/* Manual nudge — the app keeps a by-hand start time, which the web
                picker has no equivalent of: staff sometimes need a time the
                availability engine won't offer (an overrun, a squeezed-in fit).

                A visit gets the OS time picker instead of the stepper: it has no
                slot list to jump from (see the availability query), so stepping
                would be the only way to move it and a four-hour move would be
                forty-eight taps. */}
            {isVisit ? (
              <View style={styles.pickerRow}>
                <Text variant="label" tone="secondary">
                  Start
                </Text>
                <TimePickerField
                  value={minutes}
                  onChange={setMinutes}
                  accessibilityLabel="New start time for the visit"
                />
              </View>
            ) : (
              <Stepper
                label="Start"
                value={selectedTime}
                onDecrement={() => setMinutes((m) => stepStartMinutes(m, -1))}
                onIncrement={() => setMinutes((m) => stepStartMinutes(m, 1))}
              />
            )}
            {/* While the service list is in play the length is READ-ONLY: the
                services set it, and two controls competing over one number would
                let a staff member ask for a visit shorter than the services they
                just chose. */}
            {servicesChanged ? (
              <View
                style={[
                  styles.processingPanel,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}>
                <Text variant="label" tone="secondary">
                  Visit length
                </Text>
                <Text variant="bodyMedium">
                  {visitPlannedMinutes != null ? formatDuration(visitPlannedMinutes) : '—'}
                </Text>
                <Text variant="caption" tone="muted">
                  Set by the services you picked. Save, then reopen to adjust it by hand.
                </Text>
              </View>
            ) : (
              <>
                <Stepper
                  label={isVisit ? 'Visit length' : 'Duration'}
                  value={duration == null ? '—' : formatDuration(duration)}
                  onDecrement={() =>
                    setDuration((d) =>
                      d == null ? d : Math.max(minDuration, d - DURATION_STEP_MINUTES),
                    )
                  }
                  onIncrement={() =>
                    setDuration((d) =>
                      d == null ? d : Math.min(MAX_DURATION_MINUTES, d + DURATION_STEP_MINUTES),
                    )
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
              </>
            )}
            <Text variant="caption" tone="muted">
              {endPreview ? `Ends at ${endPreview}. ` : ''}Hold − / + to change faster.
            </Text>
            {isVisit ? (
              <Text variant="caption" tone="muted">
                This is the whole visit, gaps included. Extra time goes on the last
                service; time taken off comes off the last service first, then the ones
                before it, and the services stay back to back.
              </Text>
            ) : null}
            {visitRelayNotice ? (
              <Text variant="caption" color={colors.warning}>
                {visitRelayNotice}
              </Text>
            ) : null}
            {addonTotals.durationMinutes > 0 || addonTotals.pricePence > 0 ? (
              <Text variant="caption" tone="muted">
                Includes add-ons
                {addonTotals.durationMinutes > 0
                  ? ` · +${addonTotals.durationMinutes} min`
                  : ''}
                {addonTotals.pricePence > 0
                  ? ` · +${formatPence(addonTotals.pricePence)}`
                  : ''}
                {effectiveDuration != null ? ` · ${formatDuration(effectiveDuration)} total` : ''}
              </Text>
            ) : null}

            {/* Processing time. Shown only when this booking has (or is losing)
                a gap, so an ordinary appointment never sees it. Saving trims or
                drops what no longer fits rather than being refused, and this
                says which before the staff member commits. */}
            {showProcessingPanel ? (
              <View style={[styles.processingPanel, { borderColor: colors.border }]}>
                <Text variant="label" tone="secondary">
                  Processing time
                </Text>
                <Text variant="caption" tone="muted">
                  {processingFit.blocks.length > 0
                    ? `The practitioner is free during ${describeProcessingGaps(processingFit.blocks)} of this appointment.`
                    : 'This appointment will have no processing gap.'}
                </Text>
                {processingNotice ? (
                  <Text variant="caption" color={colors.warning}>
                    {processingNotice}
                  </Text>
                ) : null}
              </View>
            ) : null}

          </ScrollView>

          {!hasChanges && !servicesChanged && !(isVisit && visitRelayNeeded) ? (
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
              label={isVisit ? 'Save whole visit' : 'Save changes'}
              onPress={() => void handleSave()}
              loading={isVisit ? visitSchedule.isPending : modify.isPending}
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
  // The visit's OS time picker sits on its label's row, matching RescheduleSheet.
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  visitServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  visitServiceMain: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  processingPanel: {
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
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

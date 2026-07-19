import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddonsStep } from '@/components/booking-wizard/AddonsStep';
import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';
import { BookingWizardHeader } from '@/components/booking-wizard/BookingWizardHeader';
import { GroupBookingFlow } from '@/components/booking-wizard/GroupBookingFlow';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import {
  MAX_MULTI_SERVICE_SEGMENTS,
  MultiServiceReviewStep,
} from '@/components/booking-wizard/MultiServiceReviewStep';
import { PractitionerStep } from '@/components/booking-wizard/PractitionerStep';
import { ServicePickerStep } from '@/components/booking-wizard/ServicePickerStep';
import { TimeSlotStep, venueLocalTime } from '@/components/booking-wizard/TimeSlotStep';
import { VariantStep } from '@/components/booking-wizard/VariantStep';
import { WizardStepIndicator } from '@/components/booking-wizard/WizardStepIndicator';
import { Button } from '@/components/ui/Button';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import { ApiError } from '@/lib/api/client';
import {
  type MultiServiceSegment,
  recomputeMultiServiceChain,
} from '@/lib/booking/multi-service-chain';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { useBookingFormVenue } from '@/lib/queries/useBookingFormVenue';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useMonthAvailability } from '@/lib/queries/useMonthAvailability';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import {
  readAndClearRebookBootstrap,
  resetRebookBootstrapGuard,
} from '@/lib/rebook-bootstrap';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing } from '@/theme/index';
import type { AppointmentSlot } from '@/types/appointment-availability';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
  type AppointmentCatalogVariant,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

type StepKey =
  | 'service'
  | 'practitioner'
  | 'variant'
  | 'addons'
  | 'date'
  | 'time'
  | 'multi_service'
  | 'guest'
  | 'confirm';

const STEP_LABELS: Record<StepKey, string> = {
  service: 'Service',
  practitioner: 'Practitioner',
  variant: 'Option',
  addons: 'Add-ons',
  date: 'Date',
  time: 'Time',
  multi_service: 'Services',
  guest: 'Guest',
  confirm: 'Confirm',
};

const EMPTY_GUEST: GuestDetails = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  special_requests: undefined,
};

type ServiceBookingFlowProps = {
  /** Called with the new booking id after a successful create. */
  onCreated: (bookingId: string) => void;
};

/**
 * Multi-step appointment/service booking wizard. Extracted verbatim from the
 * old NewBookingScreen so the (well-tested) service flow is unchanged; the
 * screen shell now renders this under the "Services" tab.
 */
export function ServiceBookingFlow({ onCreated }: ServiceBookingFlowProps) {
  const router = useRouter();
  const { venueId, timeZone, anyAvailableEnabled, isLinked } = useBookingFormVenue();
  const { ownerVenueId } = useLinkedVenueContext();
  const {
    guestId: guestIdParam,
    date: dateParam,
    practitionerId: practitionerIdParam,
    time: timeParam,
    intent: intentParam,
  } = useLocalSearchParams<{
    guestId?: string;
    date?: string;
    practitionerId?: string;
    time?: string;
    intent?: string;
  }>();
  // Walk-in entry point (?intent=walk-in) — start the source toggle on Walk-in.
  const isWalkInIntent = intentParam === 'walk-in';
  const prefilledGuestId =
    typeof guestIdParam === 'string' && guestIdParam.length > 0 ? guestIdParam : null;
  // Prefill from a calendar empty-slot tap (date / practitioner / time).
  const prefilledDate =
    typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const prefilledPractitionerId =
    typeof practitionerIdParam === 'string' && practitionerIdParam.length > 0
      ? practitionerIdParam
      : null;
  const prefilledTime =
    typeof timeParam === 'string' && /^\d{2}:\d{2}$/.test(timeParam) ? timeParam : null;

  // Catalog comes from the public, venue_id-keyed endpoint — for a linked venue
  // we pass its id, not our own. `include_hidden` (staff-only add-on groups) is
  // honoured only for an authenticated session on the SAME venue, so it's off
  // when booking into a linked venue.
  const catalogQuery = useAppointmentCatalog(venueId, { includeHidden: !isLinked });
  // Staff service list — the reliable source of each service's booking window
  // (min notice / same-day). The booking catalog omits min_booking_notice_hours
  // for legacy venues, so we read it from here for every venue type.
  const managedServicesQuery = useManagedServices();
  const prefillGuestQuery = useGuestDetail(prefilledGuestId);

  // Keyed step machine — navigate by step KEY, never by raw index. The active
  // step is the source of truth; the steps array is derived for the indicator
  // and for computing next/previous, so a mid-flow change to which steps exist
  // can never strand the user on a step missing its prerequisites.
  const [currentStepKey, setCurrentStepKey] = useState<StepKey>('service');
  const [selectedService, setSelectedService] = useState<AppointmentServiceOption | null>(null);
  // Whether THIS flow includes the practitioner-choice step. Captured at service
  // selection (true when 2+ staff offer it and it wasn't pre-scoped) and cleared
  // once a practitioner is chosen — deriving it from the live `selectedService`
  // is ambiguous (a real-practitioner pick looks identical to the initial row).
  const [needsPractitionerStep, setNeedsPractitionerStep] = useState(false);
  // Default to today (or the prefilled date) so the date page opens with a
  // selection and the Continue button is immediately enabled.
  const [selectedDate, setSelectedDate] = useState<string | null>(
    () => prefilledDate ?? calendarDateInTimeZone(new Date(), timeZone),
  );
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<AppointmentCatalogVariant | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [source, setSource] = useState<'phone' | 'walk-in'>(isWalkInIntent ? 'walk-in' : 'phone');
  // Staff "Require deposit" toggle (confirm step) + existing-contact flag — both
  // feed the create payload to match the web (`require_deposit`/`returning_guest`).
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [returningGuest, setReturningGuest] = useState(false);
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const [monthAnchor, setMonthAnchor] = useState<string>(prefilledDate ?? today);
  const [guest, setGuest] = useState<GuestDetails>(EMPTY_GUEST);
  const [guestPrefilled, setGuestPrefilled] = useState(false);
  const [rebookApplied, setRebookApplied] = useState(false);
  const [rebookContactReadOnly, setRebookContactReadOnly] = useState(false);
  // Multi-service (back-to-back) visit: the chained segments for ONE client.
  // null until a slot is picked (when the venue supports the multi-service step).
  const [multiServiceSegments, setMultiServiceSegments] = useState<MultiServiceSegment[] | null>(
    null,
  );
  const [multiServiceError, setMultiServiceError] = useState<string | null>(null);
  // Group mode (multiple distinct attendees) hands off to GroupBookingFlow.
  const [groupMode, setGroupMode] = useState(false);

  // Practitioners able to perform the selected service.
  const servicePractitioners: AppointmentCatalogPractitioner[] = useMemo(() => {
    if (!selectedService || !catalogQuery.data) return [];
    return catalogQuery.data.practitioners.filter((p) =>
      p.services.some((s) => s.id === selectedService.serviceId),
    );
  }, [selectedService, catalogQuery.data]);

  // Booking-window settings for the selected service (min notice / same-day).
  // The staff availability endpoint returns past + inside-notice slots, so the
  // time step filters with these. Prefer the managed-services value (present for
  // every venue type), fall back to the catalog, then the web default (1h /
  // same-day allowed). `?? ` preserves an explicit 0 (zero notice).
  const selectedCatalogService = useMemo(() => {
    if (!selectedService || !catalogQuery.data) return null;
    for (const p of catalogQuery.data.practitioners) {
      const svc = p.services.find((s) => s.id === selectedService.serviceId);
      if (svc) return svc;
    }
    return null;
  }, [selectedService, catalogQuery.data]);

  const bookingWindow = useMemo(() => {
    const managed = managedServicesQuery.data?.services.find(
      (s) => s.id === selectedService?.serviceId,
    );
    return {
      minNoticeHours:
        managed?.min_booking_notice_hours ??
        selectedCatalogService?.min_booking_notice_hours ??
        1,
      allowSameDay:
        managed?.allow_same_day_booking ??
        selectedCatalogService?.allow_same_day_booking ??
        true,
    };
  }, [managedServicesQuery.data, selectedService?.serviceId, selectedCatalogService]);

  const addonGroups = selectedService?.addonGroups ?? [];
  const hasAddons = addonGroups.length > 0;
  const serviceVariants = selectedService?.variants ?? [];
  const hasVariants = serviceVariants.length > 0;

  // The ordered steps for THIS flow. Derived from the current selection — used
  // only to render the indicator and to compute the next/previous KEY.
  const steps: StepKey[] = useMemo(() => {
    const includePractitioner = !!selectedService && needsPractitionerStep;
    // The multi-service review sits between Time and Guest. It only exists once a
    // slot has been chosen (segments seeded), so a single-service booking never
    // sees it unless the user chooses to add more.
    const includeMultiService = (multiServiceSegments?.length ?? 0) > 0;
    return [
      'service',
      ...(includePractitioner ? (['practitioner'] as StepKey[]) : []),
      ...(hasVariants ? (['variant'] as StepKey[]) : []),
      ...(hasAddons ? (['addons'] as StepKey[]) : []),
      'date',
      'time',
      ...(includeMultiService ? (['multi_service'] as StepKey[]) : []),
      'guest',
      'confirm',
    ];
  }, [selectedService, needsPractitionerStep, hasVariants, hasAddons, multiServiceSegments]);

  const goToStep = useCallback((key: StepKey) => setCurrentStepKey(key), []);

  /** Advance to the next step KEY after `from` in the active steps array. */
  const advanceFrom = useCallback(
    (from: StepKey) => {
      const index = steps.indexOf(from);
      const next = index >= 0 ? steps[index + 1] : undefined;
      if (next) setCurrentStepKey(next);
    },
    [steps],
  );

  // Walk-in "Start Now" (web parity: the staff walk-in button on the date/time
  // step). Books the chosen service at the current venue-local time
  // WITHOUT picking a slot — synthesise a slot at "now" and skip straight to the
  // (optional) guest step. The create posts source:'walk-in', so the server
  // stamps it "Started" and it lands on the calendar immediately.
  const startWalkInNow = useCallback(
    (todayIso: string) => {
      if (!selectedService) return;
      const nowTime = venueLocalTime(timeZone); // HH:mm in the venue timezone
      const duration =
        durationOverride ?? selectedVariant?.duration_minutes ?? selectedService.durationMinutes;
      // An "Any available" pick carries a sentinel id — resolve a concrete
      // practitioner so the booking targets a real column on the calendar.
      const practitionerId =
        selectedService.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
          ? selectedService.candidatePractitionerIds?.[0] ?? selectedService.practitionerId
          : selectedService.practitionerId;
      const nowSlot: AppointmentSlot = {
        practitioner_id: practitionerId,
        practitioner_name: selectedService.practitionerName ?? '',
        service_id: selectedService.serviceId,
        service_name: selectedService.serviceName,
        start_time: `${nowTime}:00`,
        duration_minutes: duration,
        price_pence: (selectedVariant?.price_pence ?? selectedService.pricePence) ?? null,
      };
      setMonthAnchor(todayIso);
      setSelectedDate(todayIso);
      setSelectedSlot(nowSlot);
      goToStep('guest');
    },
    [selectedService, selectedVariant, durationOverride, timeZone, goToStep],
  );

  // ── Multi-service (back-to-back) visit ────────────────────────────────────
  // The concrete practitioner the whole visit is with — resolved from the chosen
  // slot ("Any available" rows pick the slot's real practitioner). Used to offer
  // "Add another service" with that same practitioner only (server requires it).
  const visitPractitioner: AppointmentCatalogPractitioner | null = useMemo(() => {
    if (!catalogQuery.data || !selectedSlot) return null;
    return catalogQuery.data.practitioners.find((p) => p.id === selectedSlot.practitioner_id) ?? null;
  }, [catalogQuery.data, selectedSlot]);

  /** Build the first chain segment from the picked service + slot. */
  const seedMultiServiceChain = useCallback((): MultiServiceSegment[] | null => {
    if (!selectedService || !selectedSlot) return null;
    // create-multi-service has no per-service duration field: the server
    // re-derives each segment's length as the (variant-resolved) catalogue
    // duration + add-on minutes and 400s if our chain starts don't line up
    // (expectedStart = prev end + buffer). A staff `durationOverride` therefore
    // cannot be honoured here, so seed the chain from the server-reconstructable
    // duration — otherwise an overridden non-last segment fails to book, and an
    // overridden last/only segment silently books at natural length anyway.
    const baseDuration =
      selectedVariant?.duration_minutes ?? selectedService.durationMinutes;
    const chosenAddons = addonGroups
      .flatMap((g) => g.addons)
      .filter((a) => selectedAddonIds.includes(a.id));
    const addonMinutes = chosenAddons.reduce((s, a) => s + a.additional_duration_minutes, 0);
    const addonPence = chosenAddons.reduce((s, a) => s + a.additional_price_pence, 0);
    // The server validates each appended segment's start as prev end + prev buffer
    // using the REAL resolved buffer, so the first segment MUST carry its true
    // buffer (variant override wins, else the service's) — not a hardcoded 0, or a
    // first service with a non-zero buffer yields a 400 "must be consecutive".
    const bufferMinutes = selectedVariant?.buffer_minutes ?? selectedService.buffer_minutes ?? 0;
    const seg: MultiServiceSegment = {
      serviceId: selectedService.serviceId,
      serviceName: selectedService.serviceName,
      serviceVariantId: selectedVariant?.id ?? null,
      practitionerId: selectedSlot.practitioner_id,
      practitionerName: selectedSlot.practitioner_name ?? selectedService.practitionerName ?? '',
      startTime: selectedSlot.start_time.slice(0, 5),
      durationMinutes: baseDuration + addonMinutes,
      bufferMinutes,
      pricePence: (selectedVariant?.price_pence ?? selectedService.pricePence) ?? null,
      addonIds: selectedAddonIds.length ? selectedAddonIds : undefined,
      addonTotalPence: addonPence,
      addonTotalMinutes: addonMinutes,
    };
    return recomputeMultiServiceChain([seg], seg.startTime);
  }, [selectedService, selectedSlot, selectedVariant, addonGroups, selectedAddonIds]);

  /** Append another service (same practitioner) to the chain and recompute starts. */
  const addServiceToChain = useCallback(
    (serviceId: string) => {
      setMultiServiceError(null);
      setMultiServiceSegments((prev) => {
        if (!prev || prev.length === 0 || !visitPractitioner) return prev;
        // Defensive cap — the UI hides the toggle at MAX, but never append past it
        // (the server rejects services.length > 4).
        if (prev.length >= MAX_MULTI_SERVICE_SEGMENTS) return prev;
        const svc = visitPractitioner.services.find((s) => s.id === serviceId);
        if (!svc) {
          setMultiServiceError('That service is not offered by this practitioner.');
          return prev;
        }
        // A service with options needs a variant choice the append path can't
        // make; adding it with the base duration fails the server's consecutive
        // check. The review list already hides these — guard defensively too.
        if ((svc.variants?.length ?? 0) > 0) {
          setMultiServiceError('Services with options must be booked on their own.');
          return prev;
        }
        const nextSeg: MultiServiceSegment = {
          serviceId: svc.id,
          serviceName: svc.name,
          serviceVariantId: null,
          practitionerId: visitPractitioner.id,
          practitionerName: visitPractitioner.name,
          startTime: '00:00',
          durationMinutes: svc.duration_minutes,
          bufferMinutes: svc.buffer_minutes ?? 0,
          pricePence: svc.price_pence,
        };
        const firstStart = prev[0]!.startTime;
        return recomputeMultiServiceChain([...prev, nextSeg], firstStart);
      });
    },
    [visitPractitioner],
  );

  const removeServiceFromChain = useCallback((index: number) => {
    setMultiServiceError(null);
    setMultiServiceSegments((prev) => {
      if (!prev || prev.length <= 1) return prev;
      const firstStart = prev[0]!.startTime;
      const next = prev.filter((_, i) => i !== index);
      return recomputeMultiServiceChain(next, firstStart);
    });
  }, []);

  // Apply rebook bootstrap on mount (after catalog loads).
  const rebookApplyRef = useRef(false);
  useEffect(() => {
    if (rebookApplyRef.current || rebookApplied) return;

    void (async () => {
      const bootstrap = await readAndClearRebookBootstrap();
      if (!bootstrap) return;

      // Pre-fill guest details from the rebook payload.
      if (bootstrap.guest) {
        const g = bootstrap.guest;
        setGuest((prev) => ({
          ...prev,
          first_name: typeof g.firstName === 'string' ? g.firstName : '',
          last_name: typeof g.lastName === 'string' ? g.lastName : '',
          phone: typeof g.phone === 'string' ? g.phone : '',
          email: typeof g.email === 'string' ? g.email : '',
        }));
        setRebookContactReadOnly(true);
        setGuestPrefilled(true);
        // Rebooking a known guest is a returning guest.
        setReturningGuest(true);
      }

      // Pre-set initial date.
      if (bootstrap.initialDate && /^\d{4}-\d{2}-\d{2}$/.test(bootstrap.initialDate)) {
        setSelectedDate(bootstrap.initialDate);
        setMonthAnchor(bootstrap.initialDate);
      }

      // Pre-select service/variant/practitioner and jump ahead once catalog is ready.
      if (bootstrap.appointment) {
        const appt = bootstrap.appointment;
        const catalog = catalogQuery.data;
        if (catalog) {
          const practitioner = catalog.practitioners.find((p) => p.id === appt.practitionerId);
          const service = practitioner?.services.find((s) => s.id === appt.serviceId);
          if (practitioner && service) {
            const serviceOption: AppointmentServiceOption = {
              serviceId: service.id,
              serviceName: service.name,
              durationMinutes: service.duration_minutes,
              buffer_minutes: service.buffer_minutes,
              pricePence: service.price_pence,
              depositPence: service.deposit_pence ?? null,
              paymentRequirement: service.payment_requirement ?? null,
              practitionerId: practitioner.id,
              practitionerName: practitioner.name,
              addonGroups: service.addon_groups ?? [],
              variants: service.variants ?? [],
              locationType: service.location_type,
            };
            setSelectedService(serviceOption);
            // Apply variant if present and valid.
            const resolvedVariant =
              appt.variantId && service.variants
                ? service.variants.find((v) => v.id === appt.variantId) ?? null
                : null;
            if (resolvedVariant) setSelectedVariant(resolvedVariant);
            // Apply duration override if it differs from natural duration.
            if (appt.durationMinutes != null && appt.durationMinutes !== service.duration_minutes) {
              setDurationOverride(appt.durationMinutes);
            }
            // A specific practitioner is known, so skip the practitioner step.
            // Land on the variant step when the service has variants but the
            // rebook variant didn't resolve; otherwise jump to date & time.
            const landOn: StepKey =
              (service.variants ?? []).length > 0 && !resolvedVariant ? 'variant' : 'date';
            setCurrentStepKey(landOn);
          }
        } else {
          // Catalog still loading — re-run when it arrives (deps include
          // catalogQuery.data) instead of consuming the bootstrap now and
          // losing the appointment pre-select. The payload is cached by
          // readAndClearRebookBootstrap's module guard, so the re-read is safe.
          return;
        }
      }

      rebookApplyRef.current = true;
      setRebookApplied(true);
    })();
  }, [catalogQuery.data, rebookApplied]);

  // Clean up the guard when the wizard unmounts so a subsequent navigation starts fresh.
  useEffect(() => {
    return () => {
      resetRebookBootstrapGuard();
    };
  }, []);

  useEffect(() => {
    if (guestPrefilled || !prefillGuestQuery.data) {
      return;
    }
    const profile = prefillGuestQuery.data.guest;
    // React 19 lint flags setState-in-effect, but seeding once on async prefill is exactly
    // what effects are for here — no external system to subscribe to, no derivable initial value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuest({
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      phone: profile.phone ?? '',
      email: profile.email ?? '',
    });
    setGuestPrefilled(true);
    // Prefilled from an existing guest profile → returning guest.
    setReturningGuest(true);
  }, [prefillGuestQuery.data, guestPrefilled]);

  const handleBack = () => {
    // Multi-service review → drop back to slot selection, discarding the chain
    // (web parity; replaces the step's own former "Back" control).
    if (currentStepKey === 'multi_service') {
      setMultiServiceSegments(null);
      setMultiServiceError(null);
      goToStep('time');
      return;
    }
    const index = steps.indexOf(currentStepKey);
    if (index <= 0) {
      router.back();
      return;
    }
    const previous = steps[index - 1];
    if (previous) setCurrentStepKey(previous);
  };

  // "Book another" — front-desk staff take back-to-back bookings, so reset the
  // wizard to a clean step `service` state instead of navigating away (which
  // would unmount the whole flow). Clears every per-booking selection plus the
  // guest and returning/rebook flags; date + month + source fall back to their
  // initial defaults so the next booking starts exactly like a fresh open.
  const resetWizard = useCallback(() => {
    setSelectedService(null);
    setNeedsPractitionerStep(false);
    setSelectedSlot(null);
    setSelectedVariant(null);
    setSelectedAddonIds([]);
    setDurationOverride(null);
    setRequireDeposit(false);
    setReturningGuest(false);
    setGuest(EMPTY_GUEST);
    // Mark the deep-link prefill CONSUMED (true, not false) so the prefill
    // effect doesn't immediately re-seed the previous guest over the cleared
    // form when "Book another" was reached from a `?guestId=` deep link.
    setGuestPrefilled(true);
    setRebookContactReadOnly(false);
    setMultiServiceSegments(null);
    setMultiServiceError(null);
    setSelectedDate(calendarDateInTimeZone(new Date(), timeZone));
    setMonthAnchor(calendarDateInTimeZone(new Date(), timeZone));
    setSource(isWalkInIntent ? 'walk-in' : 'phone');
    setCurrentStepKey('service');
  }, [isWalkInIntent, timeZone]);

  const handleBookingCreated = (bookingId: string) => {
    // Non-PII funnel completion: how the booking was created, not who for.
    track(ANALYTICS_EVENTS.createBookingCompleted, {
      mode: 'appointment',
      source,
      hasVariant: !!selectedVariant,
      addonCount: selectedAddonIds.length,
    });
    onCreated(bookingId);
  };

  // Resolve the active step against prerequisites — never render a step whose
  // inputs are missing (e.g. after the steps array changed). Falls back to the
  // earliest step that supplies the missing prerequisite.
  let activeKey: StepKey = currentStepKey;
  if (!steps.includes(activeKey)) {
    activeKey = 'service';
  }
  if (activeKey !== 'service' && !selectedService) {
    activeKey = 'service';
  } else if (activeKey === 'confirm' && !selectedSlot) {
    activeKey = selectedDate ? 'time' : 'date';
  } else if (activeKey === 'multi_service' && !selectedSlot) {
    activeKey = selectedDate ? 'time' : 'date';
  } else if (activeKey === 'time' && !selectedDate) {
    activeKey = 'date';
  }

  const stepLabels = steps.map((key) => STEP_LABELS[key]);
  const stepNumber = Math.max(0, steps.indexOf(activeKey));
  // Past the first step the header arrow steps back a page; on step one it's
  // hidden so only the ✕ leaves the form.
  const canGoBack = stepNumber > 0;
  const selectedAddons = addonGroups
    .flatMap((group) => group.addons)
    .filter((addon) => selectedAddonIds.includes(addon.id));

  // Month availability for the date picker — hook runs unconditionally (before
  // the early returns below), gated via `enabled`.
  const [monthYear, monthMonth] = monthAnchor.split('-').map(Number);
  const monthQuery = useMonthAvailability({
    serviceId: selectedService?.serviceId ?? null,
    practitionerId: selectedService?.practitionerId ?? null,
    candidatePractitionerIds: selectedService?.candidatePractitionerIds,
    year: monthYear ?? new Date().getFullYear(),
    month: monthMonth ?? 1,
    variantId: selectedVariant?.id ?? null,
    addonIds: selectedAddonIds,
    durationMinutes: durationOverride,
    ownerVenueId,
    enabled: activeKey === 'date' && !!selectedService,
  });
  const availableDates = monthQuery.data ? new Set(monthQuery.data.available_dates) : null;
  // First bookable date in the loaded month (>= today), sorted — used to auto-
  // advance off an empty default and to gate "Continue". Mirrors the web flow,
  // which lands the user on the first day the engine can actually fit the
  // service rather than a disabled cell.
  const firstAvailableDate = useMemo(() => {
    if (!monthQuery.data) return null;
    const future = monthQuery.data.available_dates
      .filter((d) => d >= today)
      .sort();
    return future[0] ?? null;
  }, [monthQuery.data, today]);
  // True once the month has loaded and the current selection is not bookable —
  // either the default (today) on a no-availability day, or after a month change.
  const selectedDateUnavailable =
    availableDates !== null && (!selectedDate || !availableDates.has(selectedDate));

  // When the month's availability arrives and the current pick isn't bookable,
  // auto-advance to the first open date IN THIS month (never a date the user
  // can't see). If the month has none, leave the selection so the empty-state
  // hint shows and "Continue" stays gated; the user navigates months and this
  // re-runs. Web parity: open on the first day the service can be booked.
  useEffect(() => {
    if (activeKey !== 'date') return;
    // Only auto-advance the UNTOUCHED default (today). Once `selectedDate` is
    // anything else — whether the user tapped it or a prior auto-advance landed
    // it — never silently move it again, otherwise browsing to a month where
    // that date isn't bookable would clobber the user's pick.
    if (selectedDate !== today) return;
    if (!selectedDateUnavailable) return;
    if (!firstAvailableDate) return;
    if (firstAvailableDate === selectedDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDate(firstAvailableDate);
    setSelectedSlot(null);
  }, [activeKey, selectedDateUnavailable, firstAvailableDate, selectedDate, today]);

  if (!venueId) return null;

  // Group mode hands off entirely to the self-contained group sub-flow. It owns
  // its own state machine + create call; exiting returns to the single flow.
  if (groupMode) {
    return (
      <GroupBookingFlow
        catalog={catalogQuery.data}
        venueId={venueId}
        timeZone={timeZone}
        anyAvailableEnabled={anyAvailableEnabled}
        ownerVenueId={ownerVenueId}
        source={source}
        onCreated={(bookingId) => onCreated(bookingId)}
        onExitGroup={() => setGroupMode(false)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <BookingWizardHeader canGoBack={canGoBack} onBack={handleBack} />
      <WizardStepIndicator currentStep={stepNumber} labels={stepLabels} />

      {activeKey === 'service' ? (
        <>
          <ServicePickerStep
          catalog={catalogQuery.data}
          defaultPractitionerId={prefilledPractitionerId}
          errorMessage={
            catalogQuery.error instanceof ApiError
              ? catalogQuery.error.message
              : catalogQuery.error?.message
          }
          isError={catalogQuery.isError}
          isLoading={catalogQuery.isLoading}
          onRetry={() => void catalogQuery.refetch()}
          selectedServiceId={selectedService?.serviceId ?? null}
          initialDurationOverride={durationOverride}
          onSelect={(option, customDuration) => {
            setSelectedService(option);
            setSelectedSlot(null);
            setSelectedVariant(null);
            setSelectedAddonIds([]);
            // Custom duration is chosen here (web parity); variant services
            // defer it to the variant step and pass null.
            setDurationOverride(customDuration ?? null);
            setRequireDeposit(false);
            // Decide whether this flow runs the practitioner-choice step:
            // only when 2+ staff offer the service and it wasn't pre-scoped.
            const practitioners = catalogQuery.data
              ? catalogQuery.data.practitioners.filter((p) =>
                  p.services.some((s) => s.id === option.serviceId),
                )
              : [];
            const needsPractitioner = !prefilledPractitionerId && practitioners.length >= 2;
            setNeedsPractitionerStep(needsPractitioner);
            if (needsPractitioner) {
              goToStep('practitioner');
            } else if ((option.variants ?? []).length > 0) {
              goToStep('variant');
            } else if ((option.addonGroups ?? []).length > 0) {
              goToStep('addons');
            } else {
              goToStep('date');
            }
          }}
        />
          <Button
            label="Book for a group"
            variant="secondary"
            onPress={() => setGroupMode(true)}
            style={styles.groupButton}
          />
        </>
      ) : null}

      {activeKey === 'practitioner' && selectedService ? (
        <PractitionerStep
          practitioners={servicePractitioners}
          serviceOption={selectedService}
          allowAnyAvailable={anyAvailableEnabled}
          durationOverride={durationOverride}
          onSelect={(option) => {
            setSelectedService(option);
            // The practitioner-specific option can carry different variants
            // and add-on groups — clear dependent picks so stale selections
            // never ride along into the new flow.
            setSelectedVariant(null);
            setSelectedAddonIds([]);
            setSelectedSlot(null);
            if ((option.variants ?? []).length > 0) {
              goToStep('variant');
            } else if ((option.addonGroups ?? []).length > 0) {
              goToStep('addons');
            } else {
              goToStep('date');
            }
          }}
        />
      ) : null}

      {activeKey === 'variant' && selectedService ? (
        <VariantStep
          serviceName={selectedService.serviceName}
          variants={serviceVariants}
          selected={selectedVariant}
          initialDurationOverride={durationOverride}
          onSelect={(variant) => {
            setSelectedVariant(variant);
            setSelectedSlot(null);
          }}
          onContinue={(customDuration) => {
            setDurationOverride(customDuration);
            advanceFrom('variant');
          }}
        />
      ) : null}

      {activeKey === 'addons' ? (
        <AddonsStep
          groups={addonGroups}
          value={selectedAddonIds}
          onChange={setSelectedAddonIds}
          onContinue={() => advanceFrom('addons')}
        />
      ) : null}

      {activeKey === 'date' ? (
        <MonthDatePicker
          monthAnchor={monthAnchor}
          onChangeMonth={setMonthAnchor}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={(iso) => {
            setSelectedDate(iso);
            setSelectedSlot(null);
          }}
          availableDates={availableDates}
          isLoading={monthQuery.isLoading || monthQuery.isFetching}
          canContinue={!selectedDateUnavailable}
          onContinue={() => advanceFrom('date')}
          weekShortcuts
          source={source}
          timeZone={timeZone}
          onStartNow={startWalkInNow}
        />
      ) : null}

      {activeKey === 'time' && selectedService && selectedDate ? (
        <TimeSlotStep
          addonIds={selectedAddonIds}
          candidatePractitionerIds={selectedService.candidatePractitionerIds}
          date={selectedDate}
          durationMinutes={durationOverride}
          onContinue={() => {
            // Seed a 1-segment chain and route through the multi-service review,
            // so staff can append back-to-back services before guest details.
            const chain = seedMultiServiceChain();
            if (chain) {
              setMultiServiceSegments(chain);
              setMultiServiceError(null);
              goToStep('multi_service');
            } else {
              advanceFrom('time');
            }
          }}
          onSelectSlot={setSelectedSlot}
          ownerVenueId={ownerVenueId}
          practitionerId={selectedService.practitionerId}
          preferredTime={selectedDate === prefilledDate ? prefilledTime : null}
          selectedSlot={selectedSlot}
          serviceId={selectedService.serviceId}
          variantId={selectedVariant?.id ?? null}
          venueId={venueId}
          startNow={source === 'walk-in' && selectedDate === today}
          onStartNow={startWalkInNow}
          timeZone={timeZone}
          minBookingNoticeHours={bookingWindow.minNoticeHours}
          allowSameDayBooking={bookingWindow.allowSameDay}
        />
      ) : null}

      {activeKey === 'multi_service' && multiServiceSegments && multiServiceSegments.length > 0 ? (
        <MultiServiceReviewStep
          segments={multiServiceSegments}
          visitPractitioner={visitPractitioner}
          onAddService={addServiceToChain}
          onRemoveSegment={removeServiceFromChain}
          onContinue={() => advanceFrom('multi_service')}
          errorMessage={multiServiceError}
        />
      ) : null}

      {activeKey === 'guest' ? (
        <GuestDetailsStep
          isWalkIn={source === 'walk-in'}
          onChange={setGuest}
          onContinue={() => advanceFrom('guest')}
          onPickExistingContact={() => setReturningGuest(true)}
          onClearExistingContact={() => setReturningGuest(false)}
          readOnlyContact={rebookContactReadOnly}
          collectClientAddress={selectedService?.locationType === 'client_address'}
          value={guest}
        />
      ) : null}

      {activeKey === 'confirm' && selectedService && selectedDate && selectedSlot ? (
        <ConfirmStep
          addons={selectedAddons}
          date={selectedDate}
          durationOverride={durationOverride}
          guest={guest}
          onSuccess={handleBookingCreated}
          onBookAnother={resetWizard}
          ownerVenueId={ownerVenueId}
          service={selectedService}
          slot={selectedSlot}
          source={source}
          variant={selectedVariant}
          requireDeposit={requireDeposit}
          onChangeRequireDeposit={setRequireDeposit}
          returningGuest={returningGuest}
          phoneDefaultCountry="GB"
          venueId={venueId}
          collectClientAddress={selectedService?.locationType === 'client_address'}
          multiServiceSegments={
            multiServiceSegments && multiServiceSegments.length > 1 ? multiServiceSegments : null
          }
        />
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.base,
    paddingBottom: spacing.xl,
  },
  groupButton: {
    marginTop: spacing.sm,
  },
});

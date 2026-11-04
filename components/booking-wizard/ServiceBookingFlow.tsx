import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddonsStep } from '@/components/booking-wizard/AddonsStep';
import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';
import { BookingWizardHeader } from '@/components/booking-wizard/BookingWizardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { GroupBookingFlow } from '@/components/booking-wizard/GroupBookingFlow';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { MultiServiceReviewStep } from '@/components/booking-wizard/MultiServiceReviewStep';
import { optionForPractitioner, PractitionerStep } from '@/components/booking-wizard/PractitionerStep';
import { VisitPeopleStep } from '@/components/booking-wizard/VisitPeopleStep';
import {
  addressExclusionLine,
  choicesAsPersonChoices,
  leadingSamePersonCount,
  offersService,
  personFitsBusinesses,
  pruneLaterChoices,
  visitPersonMode,
  type StoredPersonChoice,
} from '@/lib/booking/visit-people';
import {
  layVisitSegments,
  segmentsFromVisitPlan,
  visitBusinessParts,
  type VisitPlanAsk,
} from '@/lib/booking/visit-plan';
import { chainAvailabilityPath } from '@/lib/queries/useChainAvailability';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { ServicePickerStep } from '@/components/booking-wizard/ServicePickerStep';
import { StaffPickerStep } from '@/components/booking-wizard/StaffPickerStep';
import { TimeSlotStep, venueLocalTime } from '@/components/booking-wizard/TimeSlotStep';
import { AvailabilityOverrideToggle } from '@/components/booking-wizard/AvailabilityOverrideControls';
import { OverrideTimeStep } from '@/components/booking-wizard/OverrideTimeStep';
import {
  AVAILABILITY_OVERRIDE_PAST_DATE_ERROR,
  chainCheckBodies,
  chainNoLongerFitsMessage,
  overrideDryRunBodies,
  prefixOverrideWarnings,
} from '@/lib/booking/availability-override';
import { segmentCustomDurationMinutes } from '@/lib/booking/multi-service-chain';
import { useValidateAppointmentSlot } from '@/lib/queries/useValidateAppointmentSlot';
import { VariantStep } from '@/components/booking-wizard/VariantStep';
import { WizardStepIndicator } from '@/components/booking-wizard/WizardStepIndicator';
import { Button } from '@/components/ui/Button';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import { ApiError, apiFetch } from '@/lib/api/client';
import {
  resolveAppointmentFlowOrdering,
  type AppointmentFlowOrdering,
} from '@/lib/booking/appointment-flow-order';
import { multiServiceSegmentCharge } from '@/lib/booking/appointment-online-charge';
import {
  type MultiServiceSegment,
  recomputeMultiServiceChain,
  segmentProcessing,
} from '@/lib/booking/multi-service-chain';
import { chainSpanMinutes, MAX_SERVICES_PER_VISIT, type ServiceChainSegmentParam } from '@/lib/booking/service-chain';
import { NO_STAFF_CALENDAR_NOTICE, staffCalendarNotice, staffVisitNotice } from '@/lib/booking/staff-calendar-notice';
import {
  APPOINTMENT_WIZARD_PHASES,
  appointmentWizardPhase,
} from '@/lib/booking/appointment-wizard-phase';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { defaultPhoneCountryForVenueCurrency } from '@/lib/phone/e164';
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
import { useDiaryScope } from '@/providers/ViewerAccessProvider';
import { catalogForDiary, ROLES_COPY } from '@/lib/roles/roles';
import { spacing } from '@/theme/index';
import type { AppointmentAvailabilityResponse, AppointmentSlot } from '@/types/appointment-availability';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
  type AppointmentCatalogVariant,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

type StepKey =
  | 'staff_pick'
  | 'service'
  | 'practitioner'
  | 'visit_people'
  | 'variant'
  | 'addons'
  | 'chain_options'
  | 'date'
  | 'time'
  | 'multi_service'
  | 'guest'
  | 'confirm';

/** Staff-first: who the booking is with, chosen before any service. */
type StaffPick =
  | { kind: 'any' }
  | { kind: 'practitioner'; practitioner: AppointmentCatalogPractitioner };

/** One service ticked on the picker, at its staff length. */
type ServicePick = { option: AppointmentServiceOption; durationOverride: number | null };

/**
 * Staff-first, a visit of several people (web split-visit plan 6.2, "Add a service with someone
 * else"): a person chosen before the one on screen, with the services ticked for them.
 */
type StaffFirstGroup = { pick: StaffPick; picks: ServicePick[] };

/**
 * A service after the first in a multi-service visit (web 2026-09-02's
 * `chainExtras`): its own option, variant and add-on choices, collected in turn
 * before the times. The first ticked service stays `selectedService`, so the
 * single-service code keeps working unchanged.
 */
type ChainExtra = {
  option: AppointmentServiceOption;
  variant: AppointmentCatalogVariant | null;
  addonIds: string[];
  durationOverride: number | null;
};

/** Where the chain-options step is in its walk over the extras. */
type ChainCursor = { index: number; phase: 'variant' | 'addons' };

/** What an extra still has to ask for; null when nothing. */
function chainExtraFirstPhase(extra: ChainExtra): 'variant' | 'addons' | null {
  if ((extra.option.variants ?? []).length > 0) return 'variant';
  if ((extra.option.addonGroups ?? []).length > 0) return 'addons';
  return null;
}

/** The first extra from `from` that has options to collect, with its first phase. */
function nextChainCursor(extras: ChainExtra[], from: number): ChainCursor | null {
  for (let i = from; i < extras.length; i += 1) {
    const phase = chainExtraFirstPhase(extras[i]!);
    if (phase) return { index: i, phase };
  }
  return null;
}

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
  const {
    venueId,
    timeZone,
    currency,
    anyAvailableEnabled,
    staffFirstEnabled,
    isLinked,
    isCollective,
    servicesLayout,
  } = useBookingFormVenue();
  // The phone picker's starting country (web parity: EUR venues → IE, else GB).
  const phoneDefaultCountry = defaultPhoneCountryForVenueCurrency(currency);
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
  // Other people's diaries (roles plan §5.11): the open scope, allowing everything, unless this
  // person is View only or Hidden.
  const diary = useDiaryScope();
  // A calendar this person may not book on is never preselected (the calendar does not send one;
  // a deep link or an older screen might).
  const prefilledPractitionerId =
    typeof practitionerIdParam === 'string' &&
    practitionerIdParam.length > 0 &&
    diary.allows(practitionerIdParam)
      ? practitionerIdParam
      : null;
  const prefilledTime =
    typeof timeParam === 'string' && /^\d{2}:\d{2}$/.test(timeParam) ? timeParam : null;

  // Catalog comes from the public, venue_id-keyed endpoint — for a linked venue
  // we pass its id, not our own. `include_hidden` (staff-only add-on groups) is
  // honoured only for an authenticated session on the SAME venue, so it's off
  // when booking into a linked venue. A collective is the exception (web
  // 2026-09-05): a member's session gets the hidden groups there too. (Web #178
  // withdrew the members' own services from that catalogue again: every
  // service a collective resolves is one of its combined offerings.)
  /**
   * Staff "Override availability" (web #187): book any service with anyone, on
   * any date from today and at any time, over anything, with the engine's
   * reasons shown rather than enforced. Off by default, per booking, never
   * sticky. With it on the catalogue lists every person with every service.
   */
  const [availabilityOverride, setAvailabilityOverride] = useState(false);
  /** The dry run's reasons for the chosen time, shown on the review step. */
  const [overrideWarnings, setOverrideWarnings] = useState<string[] | null>(null);
  const [overrideChecking, setOverrideChecking] = useState(false);
  const catalogQuery = useAppointmentCatalog(venueId, {
    includeHidden: !isLinked || isCollective,
    overrideAvailability: availabilityOverride,
  });
  /**
   * View only and Hidden (roles plan §5.11, §7.3): a new appointment goes only on this person's own
   * calendars, so the catalogue offers only those (the server refuses the rest, and "Any available"
   * already pools only them). Everyone else gets the catalogue exactly as loaded.
   */
  const bookableCatalog = useMemo(
    () => catalogForDiary(catalogQuery.data, diary),
    [catalogQuery.data, diary],
  );
  const validateSlot = useValidateAppointmentSlot();
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
  /**
   * Which question this session asks first. Pinned ONCE (see the render-time
   * adjustment below), so the steps are never rearranged under someone
   * part-way through. `null` until the venue is known — its `staff_first_booking_flow`
   * setting is what decides, and nothing renders before `venueId` exists.
   */
  const [ordering, setOrdering] = useState<AppointmentFlowOrdering | null>(null);
  const isStaffFirst = ordering === 'staff_first';
  /**
   * Staff-first only: the person chosen at the first step. `{ kind: 'any' }` is
   * the pooled option, distinct from "not chosen yet" (null) — a pooled pick
   * legitimately has no practitioner.
   */
  const [staffPick, setStaffPick] = useState<StaffPick | null>(null);
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
  /** The override's typed start, minutes since midnight; opens at the venue's clock, on a 5-minute step. */
  const [overrideMinutes, setOverrideMinutes] = useState<number>(() => {
    const [h, m] = venueLocalTime(timeZone).split(':').map(Number);
    return Math.round(((h ?? 9) * 60 + (m ?? 0)) / 5) * 5;
  });
  // Group mode (multiple distinct attendees) hands off to GroupBookingFlow.
  const [groupMode, setGroupMode] = useState(false);
  // Multi-service picker (web 2026-09-02): the ticks, in visit order, and the
  // services after the first with their options. Owned here rather than by the
  // picker so "Change services" returns with the choices still ticked.
  const [pendingServiceIds, setPendingServiceIds] = useState<string[]>([]);
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, number>>({});
  const [chainExtras, setChainExtras] = useState<ChainExtra[]>([]);
  const [chainCursor, setChainCursor] = useState<ChainCursor | null>(null);
  /**
   * A person per service (web split-visit plan 6.1): one entry per service of the visit, the first
   * then each extra, holding a calendar id, the "any available" id, or null until chosen. Null while
   * one person takes the whole visit, which is today's flow, unchanged.
   */
  const [visitPeople, setVisitPeople] = useState<StoredPersonChoice[] | null>(null);
  /** Staff-first: the people chosen before the one on screen, each with their services, in order (6.2). */
  const [staffFirstGroups, setStaffFirstGroups] = useState<StaffFirstGroup[]>([]);
  const accessToken = useAccessToken();

  // Practitioners able to perform the selected service — and, for a multi-service
  // visit, EVERY service in it: the whole visit is with one person.
  const servicePractitioners: AppointmentCatalogPractitioner[] = useMemo(() => {
    if (!selectedService || !bookableCatalog) return [];
    const wanted = [selectedService.serviceId, ...chainExtras.map((e) => e.option.serviceId)];
    return bookableCatalog.practitioners.filter((p) =>
      wanted.every((id) => p.services.some((s) => s.id === id)),
    );
  }, [selectedService, chainExtras, bookableCatalog]);

  /** The visit's services in order: the first, then each extra. */
  const visitServiceIds = useMemo(
    () => (selectedService ? [selectedService.serviceId, ...chainExtras.map((e) => e.option.serviceId)] : []),
    [selectedService, chainExtras],
  );
  /**
   * What the person step offers for these services (6.1). Staff-first chooses its people as it goes,
   * and a column tapped on the calendar keeps that person, so both stay one person.
   */
  const visitMode = useMemo(
    () =>
      isStaffFirst || prefilledPractitionerId
        ? ('single_service' as const)
        : visitPersonMode(bookableCatalog?.practitioners ?? [], visitServiceIds),
    [isStaffFirst, prefilledPractitionerId, bookableCatalog, visitServiceIds],
  );
  /** Several services with a person each: the server plans the times across people (8.3). */
  const perServiceActive = visitServiceIds.length > 1 && visitPeople != null;
  /** What the flow asked for each service of the visit, in order: its option, choices and length. */
  const visitAsks: VisitPlanAsk[] = useMemo(
    () =>
      selectedService
        ? [
            { option: selectedService, variant: selectedVariant, addonIds: selectedAddonIds, durationOverride },
            ...chainExtras.map((e) => ({
              option: e.option,
              variant: e.variant,
              addonIds: e.addonIds,
              durationOverride: e.durationOverride,
            })),
          ]
        : [],
    [selectedService, selectedVariant, selectedAddonIds, durationOverride, chainExtras],
  );
  /** A member business's name on a collective, for the review's headings and the money per business. */
  const businessNameOf = useCallback(
    (venueId: string) =>
      catalogQuery.data?.practitioners.find((p) => p.owning_venue_id === venueId)?.owning_venue_name ?? 'Another business',
    [catalogQuery.data],
  );

  /**
   * A collective booking on a calendar guests cannot book (web `staffCalendarNotice`, 2026-10-28):
   * the notes staff are told for the chosen calendar and service(s), and whether its venue can take
   * card payments at all. The confirm step shows the notes and, without cards, offers no deposit
   * or card hold.
   */
  const calendarNotice = useMemo(() => {
    if (!selectedService || !selectedSlot) return NO_STAFF_CALENDAR_NOTICE;
    const segments = multiServiceSegments && multiServiceSegments.length > 1 ? multiServiceSegments : null;
    // Each service's own calendar (8.9): a visit with a person per service has a calendar each.
    if (segments) return staffVisitNotice(catalogQuery.data, segments);
    const calendarId =
      selectedService.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
        ? selectedSlot.practitioner_id
        : selectedService.practitionerId;
    return staffCalendarNotice(catalogQuery.data, calendarId, [selectedService.serviceId]);
  }, [selectedService, selectedSlot, multiServiceSegments, catalogQuery.data]);

  // Booking-window settings for the selected service (min notice / same-day).
  // The staff availability endpoint returns past + inside-notice slots, so the
  // time step filters with these. Prefer the managed-services value (present for
  // every venue type), fall back to the catalog, then the web default (1h /
  // same-day allowed). `?? ` preserves an explicit 0 (zero notice).
  const selectedCatalogService = useMemo(() => {
    if (!selectedService || !bookableCatalog) return null;
    for (const p of bookableCatalog.practitioners) {
      const svc = p.services.find((s) => s.id === selectedService.serviceId);
      if (svc) return svc;
    }
    return null;
  }, [selectedService, bookableCatalog]);

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

  /**
   * Which practitioner the SERVICE LIST is scoped to. Staff-first scopes it to
   * the person just chosen (a pooled pick stays unscoped, so the list is the
   * union everyone offers); otherwise it is the calendar-tapped column, as before.
   */
  const serviceScopePractitionerId = isStaffFirst
    ? staffPick?.kind === 'practitioner'
      ? staffPick.practitioner.id
      : null
    : prefilledPractitionerId;

  const addonGroups = selectedService?.addonGroups ?? [];
  const hasAddons = addonGroups.length > 0;
  const serviceVariants = selectedService?.variants ?? [];
  const hasVariants = serviceVariants.length > 0;

  // The ordered steps for THIS flow. Derived from the current selection — used
  // only to render the indicator and to compute the next/previous KEY.
  const steps: StepKey[] = useMemo(() => {
    // Staff-first asked who FIRST, so the person is already settled and the
    // practitioner step (which sits after the service) has nothing left to ask.
    const includePractitioner = !isStaffFirst && !!selectedService && needsPractitionerStep && !visitPeople;
    // A person per service (6.1) takes the person step's place.
    const includeVisitPeople = !isStaffFirst && !!selectedService && !!visitPeople;
    // The multi-service review sits between Time and Guest. It only exists once a
    // slot has been chosen (segments seeded), so a single-service booking never
    // sees it unless the user chooses to add more.
    const includeMultiService = (multiServiceSegments?.length ?? 0) > 0;
    // The extras' options (variants, add-ons) are asked in turn, first extra
    // first, before the times — one step that walks them.
    const includeChainOptions = nextChainCursor(chainExtras, 0) !== null;
    return [
      ...(isStaffFirst ? (['staff_pick'] as StepKey[]) : []),
      'service',
      ...(includePractitioner ? (['practitioner'] as StepKey[]) : []),
      ...(includeVisitPeople ? (['visit_people'] as StepKey[]) : []),
      ...(hasVariants ? (['variant'] as StepKey[]) : []),
      ...(hasAddons ? (['addons'] as StepKey[]) : []),
      ...(includeChainOptions ? (['chain_options'] as StepKey[]) : []),
      'date',
      'time',
      ...(includeMultiService ? (['multi_service'] as StepKey[]) : []),
      'guest',
      'confirm',
    ];
  }, [
    isStaffFirst,
    selectedService,
    needsPractitionerStep,
    visitPeople,
    hasVariants,
    hasAddons,
    chainExtras,
    multiServiceSegments,
  ]);

  // Pin the ordering the first time the venue is known — its feature flag is the
  // deciding input, and `if (!venueId) return null` below means no step has been
  // shown yet, so this can never rearrange a flow in progress. Render-time
  // adjustment (the pattern used for seeding elsewhere), guarded to run once.
  if (ordering === null && venueId) {
    const resolved = resolveAppointmentFlowOrdering({
      flagEnabled: staffFirstEnabled,
      prefilledDate,
      prefilledTime,
      prefilledPractitionerId,
      isWalkIn: isWalkInIntent,
      // A pending rebook is read asynchronously and cannot be known here; the
      // rebook effect flips this back to service-first when it resolves one.
      rebookSeededAppointment: false,
    });
    setOrdering(resolved);
    if (resolved === 'staff_first') setCurrentStepKey('staff_pick');
  }

  const goToStep = useCallback((key: StepKey) => setCurrentStepKey(key), []);

  /**
   * The first service of the visit was chosen, with the extras that follow it.
   * Decides the practitioner step (only people who offer EVERY service count),
   * widens a pooled staff-first pick, seeds the extras' options walk, and moves
   * on: practitioner → the first service's option / add-ons → the extras'
   * options → date.
   */
  const chooseService = useCallback(
    (option: AppointmentServiceOption, customDuration: number | null, extras: ChainExtra[]) => {
      const wanted = [option.serviceId, ...extras.map((e) => e.option.serviceId)];
      const practitioners = bookableCatalog
        ? bookableCatalog.practitioners.filter((p) =>
            wanted.every((id) => p.services.some((s) => s.id === id)),
          )
        : [];
      // Staff-first already has the person. A named practitioner arrives
      // scoped by `dedupeCatalogServices`; a pooled pick has to be widened
      // to the sentinel here, exactly as the practitioner step does it.
      const resolved: AppointmentServiceOption =
        isStaffFirst && staffPick?.kind === 'any'
          ? {
              ...option,
              practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
              practitionerName: 'Any available',
              candidatePractitionerIds: practitioners.map((p) => p.id),
            }
          : option;
      setSelectedService(resolved);
      setSelectedSlot(null);
      setSelectedVariant(null);
      setSelectedAddonIds([]);
      setMultiServiceSegments(null);
      setMultiServiceError(null);
      // Custom duration is chosen here (web parity); variant services
      // defer it to the variant step and pass null.
      setDurationOverride(customDuration ?? null);
      setRequireDeposit(false);
      setChainExtras(extras);
      const cursor = nextChainCursor(extras, 0);
      setChainCursor(cursor);
      // Who does each service (web split-visit plan 6.1). Nobody offers every service: straight to
      // a person for each. Someone does, and someone else offers some: the one-person list, with
      // "Choose someone different for each service" under it. Staff-first and a tapped column keep
      // one person.
      const mode =
        isStaffFirst || prefilledPractitionerId
          ? 'single_service'
          : visitPersonMode(bookableCatalog?.practitioners ?? [], wanted);
      const perService = mode === 'per_service' || mode === 'unavailable';
      setVisitPeople(perService ? wanted.map(() => null) : null);
      // Decide whether this flow runs the practitioner-choice step:
      // only when 2+ staff offer every service and it wasn't pre-scoped.
      // Staff-first never does — the person came first.
      const needsPractitioner =
        !isStaffFirst &&
        !prefilledPractitionerId &&
        !perService &&
        (practitioners.length >= 2 || mode === 'choose');
      setNeedsPractitionerStep(needsPractitioner);
      if (perService) {
        goToStep('visit_people');
      } else if (needsPractitioner) {
        goToStep('practitioner');
      } else if ((resolved.variants ?? []).length > 0) {
        goToStep('variant');
      } else if ((resolved.addonGroups ?? []).length > 0) {
        goToStep('addons');
      } else if (cursor) {
        goToStep('chain_options');
      } else {
        goToStep('date');
      }
    },
    [bookableCatalog, isStaffFirst, staffPick, prefilledPractitionerId, goToStep],
  );

  /** Advance to the next step KEY after `from` in the active steps array. */
  const advanceFrom = useCallback(
    (from: StepKey) => {
      const index = steps.indexOf(from);
      const next = index >= 0 ? steps[index + 1] : undefined;
      if (next) setCurrentStepKey(next);
    },
    [steps],
  );

  /**
   * Build the visit's segments from the picked service + a start slot: the first
   * service as before, then every extra with its own variant, add-ons and staff
   * duration, lined up back to back (web's buildChainFromStart).
   */
  const buildChainFromSlot = useCallback((selectedSlot: AppointmentSlot): MultiServiceSegment[] | null => {
    if (!selectedService) return null;
    // A person per service: the visit exactly as the server planned this start (8.3).
    if (perServiceActive && selectedSlot.segments) {
      return segmentsFromVisitPlan(selectedSlot.segments, visitAsks);
    }
    /**
     * A person per service laid by hand (Start Now, Override; 7.1): service `index`'s person, "any
     * available" taking the first who offers it. Null with one person for the visit.
     */
    const personAt = (index: number, option: AppointmentServiceOption) => {
      if (!perServiceActive) return null;
      const choice = visitPeople?.[index] ?? null;
      const id =
        choice && choice !== ANY_AVAILABLE_PRACTITIONER_ID ? choice : option.candidatePractitionerIds?.[0] ?? null;
      const person = id ? bookableCatalog?.practitioners.find((p) => p.id === id) ?? null : null;
      return person
        ? { id: person.id, name: person.name, venueId: person.owning_venue_id ?? null }
        : null;
    };
    const firstPerson = personAt(0, selectedService);
    // Two lengths, because they genuinely differ.
    //
    // `naturalDuration` is what the SERVER re-derives — catalogue (or variant)
    // duration + add-on minutes. `create-multi-service` has no per-service
    // duration field and 400s if our chain starts don't line up with its own
    // arithmetic (expectedStart = prev end + buffer), so every chain of two or
    // more MUST be built from it.
    //
    // A one-segment chain is different, and this used to get it wrong. It never
    // reaches that route at all: the confirm step sends a single service through
    // POST /api/venue/bookings, which DOES carry `duration_minutes`. So the
    // booking was already made at the custom length while this review card
    // showed the catalogue one — staff set 90 minutes, saw "9:00am–9:30am", and
    // reasonably concluded the app had ignored them. Seed the working duration
    // from the override so the card tells the truth; a chain keeps it too, and
    // sends it per segment (`segmentCustomDurationMinutes`).
    const naturalBaseDuration =
      selectedVariant?.duration_minutes ?? selectedService.durationMinutes;
    const baseDuration = durationOverride ?? naturalBaseDuration;
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
      practitionerId: firstPerson?.id ?? selectedSlot.practitioner_id,
      practitionerName:
        firstPerson?.name ?? selectedSlot.practitioner_name ?? selectedService.practitionerName ?? '',
      ...(firstPerson?.venueId ? { venueId: firstPerson.venueId } : {}),
      startTime: selectedSlot.start_time.slice(0, 5),
      durationMinutes: baseDuration + addonMinutes,
      naturalDurationMinutes: naturalBaseDuration + addonMinutes,
      bufferMinutes,
      // The wait after this service (processing past its end, web #185): the
      // next segment starts behind it and the buffer, and the server checks
      // exactly that, so it is resolved at the length this segment books at.
      ...segmentProcessing({
        service: {
          durationMinutes: selectedService.durationMinutes,
          processingTimeBlocks: selectedService.processing_time_blocks,
        },
        variant: selectedVariant,
        segmentDurationMinutes: baseDuration + addonMinutes,
      }),
      pricePence: (selectedVariant?.price_pence ?? selectedService.pricePence) ?? null,
      addonIds: selectedAddonIds.length ? selectedAddonIds : undefined,
      addonTotalPence: addonPence,
      addonTotalMinutes: addonMinutes,
      addonNames: chosenAddons.map((a) => a.name),
      // Resolved per segment so the confirm step can total the visit. Variant
      // overrides win for the deposit, as they do for duration and price.
      // Add-on price is excluded from a deposit and rolled into a full payment,
      // matching the server's `resolveAppointmentServiceOnlineChargeWithAddons`.
      ...multiServiceSegmentCharge(
        {
          price_pence: (selectedVariant?.price_pence ?? selectedService.pricePence) ?? null,
          deposit_pence: selectedVariant?.deposit_pence ?? selectedService.depositPence,
          payment_requirement: selectedService.paymentRequirement,
        },
        addonPence,
      ),
    };
    const extras: MultiServiceSegment[] = chainExtras.map((extra, extraIndex) => {
      const { option, variant } = extra;
      const person = personAt(extraIndex + 1, option);
      const naturalBase = variant?.duration_minutes ?? option.durationMinutes;
      const base = extra.durationOverride ?? naturalBase;
      const chosen = (option.addonGroups ?? [])
        .flatMap((g) => g.addons)
        .filter((a) => extra.addonIds.includes(a.id));
      const extraAddonMinutes = chosen.reduce((sum, a) => sum + a.additional_duration_minutes, 0);
      const extraAddonPence = chosen.reduce((sum, a) => sum + a.additional_price_pence, 0);
      const price = (variant?.price_pence ?? option.pricePence) ?? null;
      return {
        serviceId: option.serviceId,
        serviceName: option.serviceName,
        serviceVariantId: variant?.id ?? null,
        practitionerId: person?.id ?? seg.practitionerId,
        practitionerName: person?.name ?? seg.practitionerName,
        ...(person?.venueId ? { venueId: person.venueId } : {}),
        startTime: '00:00',
        durationMinutes: base + extraAddonMinutes,
        naturalDurationMinutes: naturalBase + extraAddonMinutes,
        bufferMinutes: variant?.buffer_minutes ?? option.buffer_minutes ?? 0,
        ...segmentProcessing({
          service: {
            durationMinutes: option.durationMinutes,
            processingTimeBlocks: option.processing_time_blocks,
          },
          variant,
          segmentDurationMinutes: base + extraAddonMinutes,
        }),
        pricePence: price,
        addonIds: extra.addonIds.length ? extra.addonIds : undefined,
        addonTotalPence: extraAddonPence,
        addonTotalMinutes: extraAddonMinutes,
        addonNames: chosen.map((a) => a.name),
        ...multiServiceSegmentCharge(
          {
            price_pence: price,
            deposit_pence: variant?.deposit_pence ?? option.depositPence,
            payment_requirement: option.paymentRequirement,
          },
          extraAddonPence,
        ),
      };
    });
    // Several people: each service starts once the client is free, and after its person's buffer
    // when that person already had one (7.1). One person: back to back, as always.
    return perServiceActive
      ? layVisitSegments([seg, ...extras], seg.startTime)
      : recomputeMultiServiceChain([seg, ...extras], seg.startTime);
  }, [
    selectedService,
    selectedVariant,
    addonGroups,
    selectedAddonIds,
    durationOverride,
    chainExtras,
    perServiceActive,
    visitPeople,
    visitAsks,
    bookableCatalog,
  ]);

  /** Build the chain from the picked slot. */
  const seedMultiServiceChain = useCallback(
    (): MultiServiceSegment[] | null => (selectedSlot ? buildChainFromSlot(selectedSlot) : null),
    [selectedSlot, buildChainFromSlot],
  );

  /** Minutes a service books at, add-ons included, and the gap after it: the chain's own arithmetic. */
  const segmentLength = (
    option: AppointmentServiceOption,
    variant: AppointmentCatalogVariant | null,
    addonIds: string[],
    override: number | null,
  ) => {
    const durationMinutes =
      (override ?? variant?.duration_minutes ?? option.durationMinutes) +
      (option.addonGroups ?? [])
        .flatMap((g) => g.addons)
        .filter((a) => addonIds.includes(a.id))
        .reduce((sum, a) => sum + a.additional_duration_minutes, 0);
    return {
      durationMinutes,
      bufferMinutes: variant?.buffer_minutes ?? option.buffer_minutes ?? 0,
      processingTailMinutes: segmentProcessing({
        service: {
          durationMinutes: option.durationMinutes,
          processingTimeBlocks: option.processing_time_blocks,
        },
        variant,
        segmentDurationMinutes: durationMinutes,
      }).processingTailMinutes,
    };
  };

  /**
   * The `services` chain the day view carries once the visit has more than one
   * service: each segment with its variant, add-ons and staff duration, so the
   * server offers only the starts where the whole visit fits with one person.
   */
  const serviceChainParam: ServiceChainSegmentParam[] | null = useMemo(() => {
    if (!selectedService || chainExtras.length === 0) return null;
    // A person per service: each service names its own person (or "any"), so the server plans the
    // visit across people and says who and when for every service (8.3).
    const people = perServiceActive ? visitPeople : null;
    return [
      {
        service_id: selectedService.serviceId,
        ...(people?.[0] ? { practitioner_id: people[0] } : {}),
        variant_id: selectedVariant?.id ?? null,
        addon_ids: selectedAddonIds,
        duration_minutes: durationOverride,
      },
      ...chainExtras.map((e, i) => ({
        service_id: e.option.serviceId,
        ...(people?.[i + 1] ? { practitioner_id: people[i + 1] } : {}),
        variant_id: e.variant?.id ?? null,
        addon_ids: e.addonIds,
        duration_minutes: e.durationOverride,
      })),
    ];
  }, [selectedService, chainExtras, selectedVariant, selectedAddonIds, durationOverride, perServiceActive, visitPeople]);

  // The month route only knows one length: the visit as one block (web parity;
  // a green day can still show no times when breaks split it — the day view is exact).
  //
  // A person per service: the month stays approximate (8.3). It asks about the first person's first
  // service and the services after it with the same person, not the whole visit, which would grey
  // out days where the first person has time only for their own part.
  const monthLead =
    perServiceActive && visitPeople
      ? leadingSamePersonCount(choicesAsPersonChoices(visitPeople, ANY_AVAILABLE_PRACTITIONER_ID))
      : null;
  const chainSpanForMonth: number | null =
    serviceChainParam && selectedService && (monthLead == null || monthLead > 1)
      ? chainSpanMinutes([
          segmentLength(selectedService, selectedVariant, selectedAddonIds, durationOverride),
          ...chainExtras
            .slice(0, monthLead == null ? undefined : monthLead - 1)
            .map((e) => segmentLength(e.option, e.variant, e.addonIds, e.durationOverride)),
        ])
      : null;

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
      // A multi-service walk-in lines every segment up from now (web's
      // buildChainFromStart); a single service keeps the plain create path.
      if (chainExtras.length > 0) {
        setMultiServiceSegments(buildChainFromSlot(nowSlot));
        setMultiServiceError(null);
      }
      goToStep('guest');
    },
    [selectedService, selectedVariant, durationOverride, timeZone, goToStep, chainExtras, buildChainFromSlot],
  );

  // ── Multi-service (back-to-back) visit ────────────────────────────────────
  // The concrete practitioner the whole visit is with — resolved from the chosen
  // slot ("Any available" rows pick the slot's real practitioner). Used to offer
  // "Add another service" with that same practitioner only (server requires it).
  const visitPractitioner: AppointmentCatalogPractitioner | null = useMemo(() => {
    if (!bookableCatalog || !selectedSlot) return null;
    return bookableCatalog.practitioners.find((p) => p.id === selectedSlot.practitioner_id) ?? null;
  }, [bookableCatalog, selectedSlot]);


  /** "Change services": back to the picker with the visit's services still ticked. */
  const changeServices = useCallback(() => {
    setMultiServiceSegments(null);
    setMultiServiceError(null);
    setSelectedSlot(null);
    goToStep('service');
  }, [goToStep]);

  /**
   * Take the service at `index` of the visit out of what is chosen, so the
   * selection (`selectedService` then `chainExtras`, in visit order) stays the
   * visit the review shows: the times step, "Change services" and a one-service
   * booking all read it. The first service out makes the next one first, with
   * the same person.
   */
  const dropServiceFromSelection = useCallback(
    (index: number) => {
      const removedId =
        index === 0 ? selectedService?.serviceId : chainExtras[index - 1]?.option.serviceId;
      if (index === 0) {
        const [head, ...rest] = chainExtras;
        if (!head || !selectedService) return;
        // A person per service: the next service is already its own person's option.
        setSelectedService(
          visitPeople
            ? head.option
            : {
                ...head.option,
                practitionerId: selectedService.practitionerId,
                practitionerName: selectedService.practitionerName,
                candidatePractitionerIds: selectedService.candidatePractitionerIds,
              },
        );
        setSelectedVariant(head.variant);
        setSelectedAddonIds(head.addonIds);
        setDurationOverride(head.durationOverride);
        setChainExtras(rest);
      } else {
        setChainExtras((prev) => prev.filter((_, i) => i !== index - 1));
      }
      setPendingServiceIds((prev) =>
        prev[index] === removedId ? prev.filter((_, i) => i !== index) : prev,
      );
      setVisitPeople((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    },
    [selectedService, chainExtras, visitPeople],
  );

  /**
   * A person per service: the review's services changed (one removed), so the server is asked again
   * for the visit at the same start rather than the app re-laying the times (web
   * `replanVisitAtStart`, 6.1, G22). Each service keeps the person the review showed. Null when the
   * start no longer fits; 'unreachable' when the question could not be asked.
   */
  const replanVisitAtStart = useCallback(
    async (
      segments: MultiServiceSegment[],
      asks: VisitPlanAsk[],
    ): Promise<MultiServiceSegment[] | null | 'unreachable'> => {
      if (!venueId || !selectedDate || !accessToken) return 'unreachable';
      const start = segments[0]!.startTime.slice(0, 5);
      const chain: ServiceChainSegmentParam[] = segments.map((seg) => ({
        service_id: seg.serviceId,
        practitioner_id: seg.practitionerId,
        variant_id: seg.serviceVariantId ?? null,
        addon_ids: seg.addonIds ?? [],
        duration_minutes: segmentCustomDurationMinutes(seg),
      }));
      try {
        const data = await apiFetch<AppointmentAvailabilityResponse>(
          chainAvailabilityPath({ venueId, date: selectedDate, practitionerId: segments[0]!.practitionerId, chain }),
          { accessToken },
        );
        const slot = (data.practitioners ?? [])
          .flatMap((p) => p.slots)
          .find((sl) => sl.start_time.slice(0, 5) === start && Array.isArray(sl.segments));
        if (!slot?.segments) return null;
        return segmentsFromVisitPlan(slot.segments, asks);
      } catch {
        return 'unreachable';
      }
    },
    [venueId, selectedDate, accessToken],
  );

  /**
   * Re-check a changed visit with the server at its start (web
   * `validateMultiServiceChain`, split-visit plan G22): the same check the
   * override's Continue makes, each service told about the ones before it.
   * Under the override it answers with what it overrides instead of refusing.
   */
  const recheckChain = useCallback(
    async (
      chain: MultiServiceSegment[],
    ): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }> => {
      const bodies = chainCheckBodies({
        venueId: venueId ?? '',
        bookingDate: selectedDate ?? '',
        chain,
        override: availabilityOverride,
        customDurationOf: segmentCustomDurationMinutes,
      });
      const warnings: string[] = [];
      for (let i = 0; i < bodies.length; i += 1) {
        const res = await validateSlot.mutateAsync(bodies[i]!);
        if (!res.ok) return { ok: false, error: res.error ?? 'This time cannot be booked.' };
        warnings.push(...prefixOverrideWarnings(chain[i]!, res.warnings));
      }
      return { ok: true, warnings };
    },
    [venueId, selectedDate, availabilityOverride, validateSlot],
  );

  const removingRef = useRef(false);

  /**
   * Remove a service on the review step (split-visit plan G22). The rest is
   * laid out again from the visit's start and asked of the server; when it no
   * longer fits there, the times are shown again for the services as they now
   * are (web `showTimesAgainFor`), rather than leaving the review on a visit
   * that cannot be booked.
   */
  const removeServiceFromChain = useCallback(
    async (index: number) => {
      const prev = multiServiceSegments;
      if (!prev || prev.length <= 1 || index < 0 || index >= prev.length) return;
      // One change at a time: a second tap while the first is being checked waits.
      if (removingRef.current) return;
      removingRef.current = true;
      const firstStart = prev[0]!.startTime;
      const kept = prev.filter((_, i) => i !== index);
      // A person per service with two or more left: the server plans them again at the start.
      if (perServiceActive && kept.length > 1 && !availabilityOverride) {
        setMultiServiceError(null);
        const asks = visitAsks.filter((_, i) => i !== index);
        let planned: Awaited<ReturnType<typeof replanVisitAtStart>>;
        try {
          planned = await replanVisitAtStart(
            kept.map((seg, i) => (i === 0 ? { ...seg, startTime: firstStart } : seg)),
            asks,
          );
        } finally {
          removingRef.current = false;
        }
        if (planned === 'unreachable') {
          setMultiServiceError('Could not check this change. Try again.');
          return;
        }
        dropServiceFromSelection(index);
        if (!planned) {
          setSelectedSlot(null);
          setMultiServiceSegments(null);
          setMultiServiceError(chainNoLongerFitsMessage(firstStart));
          goToStep('time');
          return;
        }
        setMultiServiceSegments(planned);
        return;
      }
      const next = perServiceActive
        ? layVisitSegments(kept, firstStart)
        : recomputeMultiServiceChain(kept, firstStart);
      setMultiServiceError(null);
      let checked: Awaited<ReturnType<typeof recheckChain>>;
      try {
        checked = await recheckChain(next);
      } catch (e) {
        setMultiServiceError(
          e instanceof ApiError ? e.message : 'Could not check this change. Try again.',
        );
        return;
      } finally {
        removingRef.current = false;
      }
      dropServiceFromSelection(index);
      if (!checked.ok) {
        setSelectedSlot(null);
        setMultiServiceSegments(null);
        setOverrideWarnings(null);
        setMultiServiceError(chainNoLongerFitsMessage(firstStart));
        goToStep('time');
        return;
      }
      setMultiServiceSegments(next);
      if (availabilityOverride) setOverrideWarnings(checked.warnings);
      // A visit left with one service is booked as one, from the slot: it names
      // that service. So does a slot whose first service just went.
      const first = next[0]!;
      if (index === 0 || next.length === 1) {
        setSelectedSlot((slot) =>
          slot
            ? {
                ...slot,
                service_id: first.serviceId,
                service_name: first.serviceName,
                duration_minutes: first.durationMinutes,
                // A person per service: the service left is with its own person.
                practitioner_id: first.practitionerId,
                practitioner_name: first.practitionerName,
              }
            : slot,
        );
      }
    },
    [
      multiServiceSegments,
      recheckChain,
      dropServiceFromSelection,
      availabilityOverride,
      goToStep,
      perServiceActive,
      visitAsks,
      replanVisitAtStart,
    ],
  );

  /**
   * A person for one service of the visit (6.1). Later choices that no longer fit (their business
   * does not share an address with the one just chosen) are cleared.
   */
  const chooseVisitPerson = useCallback(
    (index: number, choice: string) => {
      const next = visitServiceIds.map((_, i) => (i === index ? choice : visitPeople?.[i] ?? null));
      setVisitPeople(
        pruneLaterChoices({
          people: bookableCatalog?.practitioners ?? [],
          serviceIds: visitServiceIds,
          choices: next,
          changedIndex: index,
          isCollective,
          anyId: ANY_AVAILABLE_PRACTITIONER_ID,
        }),
      );
    },
    [visitServiceIds, visitPeople, bookableCatalog, isCollective],
  );

  /**
   * Every service has its person: each service's options now come off its own person (an option
   * belongs to one business's service on a collective), so they are asked in turn, then the times.
   */
  const applyVisitPeople = useCallback(
    (firstBase: AppointmentServiceOption, extrasBase: ChainExtra[], chosen: string[]) => {
    const people = bookableCatalog?.practitioners ?? [];
    const optionFor = (base: AppointmentServiceOption, choice: string): AppointmentServiceOption => {
      if (choice === ANY_AVAILABLE_PRACTITIONER_ID) {
        const offering = people.filter((p) => offersService(p, base.serviceId));
        const seeded = (offering[0] && optionForPractitioner(base, offering[0])) || base;
        return {
          ...seeded,
          practitionerId: ANY_AVAILABLE_PRACTITIONER_ID,
          practitionerName: 'Any available',
          candidatePractitionerIds: offering.map((p) => p.id),
        };
      }
      const person = people.find((p) => p.id === choice);
      return (person && optionForPractitioner(base, person)) || base;
    };
    const first = optionFor(firstBase, chosen[0]!);
    const extras = extrasBase.map((e, i) => ({
      ...e,
      option: optionFor(e.option, chosen[i + 1]!),
      variant: null,
      addonIds: [],
    }));
    setVisitPeople(chosen);
    setSelectedService(first);
    setSelectedVariant(null);
    setSelectedAddonIds([]);
    setSelectedSlot(null);
    setMultiServiceSegments(null);
    setMultiServiceError(null);
    setChainExtras(extras);
    const cursor = nextChainCursor(extras, 0);
    setChainCursor(cursor);
    if ((first.variants ?? []).length > 0) {
      goToStep('variant');
    } else if ((first.addonGroups ?? []).length > 0) {
      goToStep('addons');
    } else if (cursor) {
      goToStep('chain_options');
    } else {
      goToStep('date');
    }
    },
    [bookableCatalog, goToStep],
  );

  const continueFromVisitPeople = useCallback(() => {
    if (!selectedService || !visitPeople || visitPeople.length !== visitServiceIds.length) return;
    if (visitPeople.some((c) => !c)) return;
    applyVisitPeople(selectedService, chainExtras, visitPeople as string[]);
  }, [selectedService, visitPeople, visitServiceIds, chainExtras, applyVisitPeople]);

  /** Services already with an earlier person of a staff-first visit (6.2). */
  const earlierVisitServiceIds = useMemo(
    () => staffFirstGroups.flatMap((g) => g.picks.map((p) => p.option.serviceId)),
    [staffFirstGroups],
  );
  const staffPickId = (pick: StaffPick) =>
    pick.kind === 'practitioner' ? pick.practitioner.id : ANY_AVAILABLE_PRACTITIONER_ID;

  /**
   * Staff-first, adding someone else (6.2): people who still offer something not in the visit and,
   * on a collective, whose business shares an address with every business already in it.
   */
  const staffForNextPerson = useMemo(() => {
    if (staffFirstGroups.length === 0) return null;
    const all = bookableCatalog?.practitioners ?? [];
    const inVisit = new Set(earlierVisitServiceIds);
    const venues = [
      ...new Set(
        staffFirstGroups
          .map((g) => (g.pick.kind === 'practitioner' ? g.pick.practitioner.owning_venue_id ?? null : null))
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const offering = all.filter((p) => p.services.some((s) => !inVisit.has(s.id)));
    const people = isCollective ? offering.filter((p) => personFitsBusinesses(p, venues)) : offering;
    const excluded = isCollective ? offering.filter((p) => !personFitsBusinesses(p, venues)) : [];
    const visitLines = staffFirstGroups.flatMap((g) =>
      g.picks.map(
        (p) => `${p.option.serviceName} with ${g.pick.kind === 'practitioner' ? g.pick.practitioner.name : 'Any available'}`,
      ),
    );
    return { people, visitLines, exclusionLine: addressExclusionLine(excluded.map((p) => p.name)) };
  }, [staffFirstGroups, earlierVisitServiceIds, bookableCatalog, isCollective]);

  /**
   * "Add a service with someone else" is offered once something is ticked for this person, while the
   * visit has room, and while someone else could still add a service to it (6.2).
   */
  const canAddSomeoneElse = (() => {
    if (!isStaffFirst || !staffPick || pendingServiceIds.length === 0) return false;
    if (pendingServiceIds.length + earlierVisitServiceIds.length >= MAX_SERVICES_PER_VISIT) return false;
    const inVisit = new Set([...earlierVisitServiceIds, ...pendingServiceIds]);
    const current = staffPickId(staffPick);
    return (bookableCatalog?.practitioners ?? []).some(
      (p) => p.id !== current && p.services.some((s) => !inVisit.has(s.id)),
    );
  })();

  /** The services ticked for this person join the visit, and the picker opens for the next person. */
  const addServiceWithSomeoneElse = useCallback(
    (picks: ServicePick[]) => {
      if (!staffPick || picks.length === 0) return;
      setStaffFirstGroups((prev) => [...prev, { pick: staffPick, picks }]);
      setPendingServiceIds([]);
      setPendingOverrides({});
      setStaffPick(null);
      setSelectedService(null);
      setChainExtras([]);
      setVisitPeople(null);
      goToStep('staff_pick');
    },
    [staffPick, goToStep],
  );

  /** Back from the picker part-way through a visit: the previous person's services, still ticked. */
  const backToPreviousPerson = useCallback(() => {
    const last = staffFirstGroups[staffFirstGroups.length - 1];
    if (!last) return;
    setStaffFirstGroups((prev) => prev.slice(0, -1));
    setStaffPick(last.pick);
    setPendingServiceIds(last.picks.map((p) => p.option.serviceId));
    const overrides: Record<string, number> = {};
    for (const p of last.picks) if (p.durationOverride != null) overrides[p.option.serviceId] = p.durationOverride;
    setPendingOverrides(overrides);
    goToStep('service');
  }, [staffFirstGroups, goToStep]);

  /**
   * Continue a staff-first visit of several people: services run in the order added, each person's
   * together (6.2). From here the path is service first's with a person per service: options per
   * service from its own person, then the times showing the whole plan.
   */
  const continueStaffFirstVisit = useCallback(
    (currentPicks: ServicePick[]) => {
      if (!staffPick) return;
      const groups = [...staffFirstGroups, { pick: staffPick, picks: currentPicks }];
      const all = groups.flatMap((g) => g.picks.map((p) => ({ ...p, person: staffPickId(g.pick) })));
      const [head, ...rest] = all;
      if (!head) return;
      setSelectedSlot(null);
      setMultiServiceSegments(null);
      setMultiServiceError(null);
      setDurationOverride(head.durationOverride);
      setRequireDeposit(false);
      setNeedsPractitionerStep(false);
      applyVisitPeople(
        head.option,
        rest.map((p) => ({ option: p.option, variant: null, addonIds: [], durationOverride: p.durationOverride })),
        all.map((p) => p.person),
      );
    },
    [staffPick, staffFirstGroups, applyVisitPeople],
  );

  /** A visit across businesses (only a collective's services span businesses): each with its money (7.1). */
  const visitParts = useMemo(
    () =>
      isCollective && multiServiceSegments && multiServiceSegments.length > 1
        ? visitBusinessParts(multiServiceSegments, businessNameOf)
        : null,
    [isCollective, multiServiceSegments, businessNameOf],
  );

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
          // The rebooked client (web roles plan §5.6): sent as guest_id so the booking joins
          // them, with their stored phone and email when the form has none.
          guest_id: typeof g.guestId === 'string' && g.guestId ? g.guestId : undefined,
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
        const catalog = bookableCatalog;
        if (catalog) {
          const practitioner = catalog.practitioners.find((p) => p.id === appt.practitionerId);
          const service = practitioner?.services.find((s) => s.id === appt.serviceId);
          if (practitioner && service) {
            const serviceOption: AppointmentServiceOption = {
              serviceId: service.id,
              serviceName: service.name,
              durationMinutes: service.duration_minutes,
              buffer_minutes: service.buffer_minutes,
              processing_time_blocks: service.processing_time_blocks,
              pricePence: service.price_pence,
              depositPence: service.deposit_pence ?? null,
              paymentRequirement: service.payment_requirement ?? null,
              practitionerId: practitioner.id,
              practitionerName: practitioner.name,
              addonGroups: service.addon_groups ?? [],
              variants: service.variants ?? [],
              locationType: service.location_type,
              anyAvailable: service.any_available,
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
            // A rebook knows BOTH answers, so it is service-first by definition
            // (web parity: `staffRebookBootstrap?.appointment` excludes the
            // reorder). Flipping here rather than at mount is forced by the
            // payload being read asynchronously; it happens before any step the
            // user could have acted on, and the jump below leaves no staff step
            // stranded behind them.
            setOrdering('service_first');
            setStaffPick(null);
            // A specific practitioner is known, so skip the practitioner step.
            // Land on the variant step when the service has variants but the
            // rebook variant didn't resolve; otherwise jump to date & time.
            const landOn: StepKey =
              (service.variants ?? []).length > 0 && !resolvedVariant ? 'variant' : 'date';
            setCurrentStepKey(landOn);
          }
        } else {
          // Catalog still loading — re-run when it arrives (deps include
          // bookableCatalog) instead of consuming the bootstrap now and
          // losing the appointment pre-select. The payload is cached by
          // readAndClearRebookBootstrap's module guard, so the re-read is safe.
          return;
        }
      }

      rebookApplyRef.current = true;
      setRebookApplied(true);
    })();
  }, [bookableCatalog, rebookApplied]);

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
      // "Book" from the client's profile joins the booking to that client (sent as guest_id).
      ...(prefilledGuestId ? { guest_id: prefilledGuestId } : {}),
    });
    setGuestPrefilled(true);
    // Prefilled from an existing guest profile → returning guest.
    setReturningGuest(true);
  }, [prefillGuestQuery.data, guestPrefilled, prefilledGuestId]);

  const handleBack = () => {
    // Multi-service review → drop back to slot selection, discarding the chain
    // (web parity; replaces the step's own former "Back" control).
    if (currentStepKey === 'multi_service') {
      setMultiServiceSegments(null);
      setMultiServiceError(null);
      goToStep('time');
      return;
    }
    // Staff-first, choosing the next person: back to the previous person's services (6.2).
    if (currentStepKey === 'staff_pick' && staffFirstGroups.length > 0) {
      backToPreviousPerson();
      return;
    }
    // A person per service: back to the one-person list it was opened from, or to the services.
    if (currentStepKey === 'visit_people') {
      setVisitPeople(null);
      goToStep(needsPractitionerStep ? 'practitioner' : 'service');
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
  /**
   * Tick or untick "Override availability". Ticking keeps what is chosen (every
   * choice is still bookable); unticking clears every choice, since a person,
   * service, date or time the engine would not offer must not survive with the
   * override off, and returns to the first step (web #187, §9).
   */
  const toggleAvailabilityOverride = useCallback(
    (next: boolean) => {
      setAvailabilityOverride(next);
      setOverrideWarnings(null);
      setMultiServiceError(null);
      if (next) return;
      setSelectedService(null);
      setNeedsPractitionerStep(false);
      setSelectedSlot(null);
      setSelectedVariant(null);
      setSelectedAddonIds([]);
      setDurationOverride(null);
      setMultiServiceSegments(null);
      setPendingServiceIds([]);
      setPendingOverrides({});
      setChainExtras([]);
      setChainCursor(null);
      setVisitPeople(null);
      setStaffFirstGroups([]);
      setStaffPick(null);
      setCurrentStepKey(isStaffFirst ? 'staff_pick' : 'service');
    },
    [isStaffFirst],
  );

  /**
   * The override's Continue: the typed time becomes the chain, laid out from
   * that start exactly as a walk-in is, and checked ONCE per service through the
   * dry run so the review step can say what it overrides (web
   * `continueWithOverrideTime`). A refusal the override cannot lift (an unknown
   * person or service, a length outside the limits) stays a refusal.
   */
  const continueWithOverrideTime = useCallback(async () => {
    if (!selectedService || !selectedDate) return;
    if (selectedDate < today) {
      setMultiServiceError(AVAILABILITY_OVERRIDE_PAST_DATE_ERROR);
      return;
    }
    const hm = `${String(Math.floor(overrideMinutes / 60)).padStart(2, '0')}:${String(overrideMinutes % 60).padStart(2, '0')}`;
    const duration =
      durationOverride ?? selectedVariant?.duration_minutes ?? selectedService.durationMinutes;
    const practitionerId =
      selectedService.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
        ? (selectedService.candidatePractitionerIds?.[0] ?? selectedService.practitionerId)
        : selectedService.practitionerId;
    const slot: AppointmentSlot = {
      practitioner_id: practitionerId,
      practitioner_name: selectedService.practitionerName ?? '',
      service_id: selectedService.serviceId,
      service_name: selectedService.serviceName,
      start_time: `${hm}:00`,
      duration_minutes: duration,
      price_pence: (selectedVariant?.price_pence ?? selectedService.pricePence) ?? null,
    };
    const chain = buildChainFromSlot(slot);
    if (!chain) return;
    setOverrideChecking(true);
    setMultiServiceError(null);
    try {
      const bodies = overrideDryRunBodies({
        venueId: venueId ?? '',
        bookingDate: selectedDate,
        chain,
        customDurationOf: segmentCustomDurationMinutes,
      });
      const collected: string[] = [];
      for (let i = 0; i < bodies.length; i += 1) {
        const res = await validateSlot.mutateAsync(bodies[i]!);
        if (!res.ok) {
          setMultiServiceError(res.error ?? 'This time cannot be booked.');
          return;
        }
        collected.push(...prefixOverrideWarnings(chain[i]!, res.warnings));
      }
      setOverrideWarnings(collected);
      setSelectedSlot(slot);
      setMultiServiceSegments(chain);
      goToStep('multi_service');
    } catch (e) {
      setMultiServiceError(
        e instanceof ApiError ? e.message : 'Could not check this time. Try again.',
      );
    } finally {
      setOverrideChecking(false);
    }
  }, [
    selectedService,
    selectedDate,
    today,
    overrideMinutes,
    durationOverride,
    selectedVariant,
    buildChainFromSlot,
    venueId,
    validateSlot,
    goToStep,
  ]);

  /** The booking this run made: the confirmation shows, and the back arrow goes. */
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  const resetWizard = useCallback(() => {
    setCreatedBookingId(null);
    setOverrideWarnings(null);
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
    setPendingServiceIds([]);
    setPendingOverrides({});
    setChainExtras([]);
    setChainCursor(null);
    setVisitPeople(null);
    setStaffFirstGroups([]);
    setSelectedDate(calendarDateInTimeZone(new Date(), timeZone));
    setMonthAnchor(calendarDateInTimeZone(new Date(), timeZone));
    setSource(isWalkInIntent ? 'walk-in' : 'phone');
    // Back to the FIRST step of whichever ordering this session is running.
    setStaffPick(null);
    setCurrentStepKey(isStaffFirst ? 'staff_pick' : 'service');
  }, [isWalkInIntent, timeZone, isStaffFirst]);

  const handleBookingCreated = (bookingId: string) => {
    setCreatedBookingId(bookingId);
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
    activeKey = steps[0] ?? 'service';
  }
  if (isStaffFirst && !staffPick && activeKey !== 'staff_pick') {
    // The service list is scoped to the chosen person, so it has nothing to show
    // until there is one.
    activeKey = 'staff_pick';
  } else if (activeKey !== 'service' && activeKey !== 'staff_pick' && !selectedService) {
    activeKey = 'service';
  } else if (activeKey === 'confirm' && !selectedSlot) {
    activeKey = selectedDate ? 'time' : 'date';
  } else if (activeKey === 'multi_service' && !selectedSlot) {
    activeKey = selectedDate ? 'time' : 'date';
  } else if (activeKey === 'time' && !selectedDate) {
    activeKey = 'date';
  } else if (activeKey === 'chain_options' && !chainCursor) {
    activeKey = 'date';
  }

  const stepNumber = Math.max(0, steps.indexOf(activeKey));
  // The indicator counts PHASES, not steps: the step list grows as choices are
  // made, and a denominator that grows under the reader is worse than none
  // (see `appointmentWizardPhase`). `stepNumber` still drives the back arrow,
  // which walks real steps.
  const phaseIndex = appointmentWizardPhase(activeKey);
  // Past the first step the header arrow steps back a page; on step one it's
  // hidden so only the ✕ leaves the form.
  // Not once the booking exists: back would reopen its filled-in details, one tap from a duplicate.
  // "Book another" starts afresh instead.
  const canGoBack =
    (stepNumber > 0 || (activeKey === 'staff_pick' && staffFirstGroups.length > 0)) && createdBookingId === null;
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
    // A multi-service visit asks the month for one block of the whole span.
    durationMinutes: chainSpanForMonth ?? durationOverride,
    ownerVenueId,
    // No availability calls at all with the override on: every date from today is open.
    enabled: activeKey === 'date' && !!selectedService && !availabilityOverride,
  });
  const availableDates =
    !availabilityOverride && monthQuery.data ? new Set(monthQuery.data.available_dates) : null;
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

  // View only and Hidden (§5.11) with no calendar of their own among these: say so, rather than
  // offer services that could only be booked on someone else's calendar.
  const noBookableCalendar =
    diary.restricted &&
    !!catalogQuery.data &&
    catalogQuery.data.practitioners.length > 0 &&
    (bookableCatalog?.practitioners.length ?? 0) === 0;
  if (noBookableCalendar) {
    return (
      <View style={styles.container}>
        <BookingWizardHeader canGoBack={canGoBack} onBack={handleBack} />
        <EmptyState
          title={ROLES_COPY['diary.no_calendar.title']}
          message={
            (diary.writable?.size ?? 0) === 0 ? ROLES_COPY['diary.no_calendar'] : ROLES_COPY['diary.none_here']
          }
        />
      </View>
    );
  }

  // Group mode hands off entirely to the self-contained group sub-flow. It owns
  // its own state machine + create call; exiting returns to the single flow.
  if (groupMode) {
    return (
      <GroupBookingFlow
        catalog={bookableCatalog}
        venueId={venueId}
        timeZone={timeZone}
        anyAvailableEnabled={anyAvailableEnabled}
        servicesLayout={servicesLayout}
        ownerVenueId={ownerVenueId}
        source={source}
        phoneDefaultCountry={phoneDefaultCountry}
        onCreated={(bookingId) => onCreated(bookingId)}
        onExitGroup={() => setGroupMode(false)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <BookingWizardHeader canGoBack={canGoBack} onBack={handleBack} />
      <WizardStepIndicator currentStep={phaseIndex} labels={[...APPOINTMENT_WIZARD_PHASES]} />

      {activeKey === 'staff_pick' ? (
        <StaffPickerStep
          catalog={bookableCatalog}
          isLoading={catalogQuery.isLoading}
          isError={catalogQuery.isError}
          errorMessage={
            catalogQuery.error instanceof ApiError
              ? catalogQuery.error.message
              : catalogQuery.error?.message
          }
          onRetry={() => void catalogQuery.refetch()}
          // No engine to pick for you while the override is on (web #187).
          allowAnyAvailable={anyAvailableEnabled && !availabilityOverride}
          nextPerson={staffForNextPerson}
          overrideToggle={
            <AvailabilityOverrideToggle
              checked={availabilityOverride}
              onChange={toggleAvailabilityOverride}
            />
          }
          selectedPractitionerId={
            staffPick?.kind === 'practitioner'
              ? staffPick.practitioner.id
              : staffPick?.kind === 'any'
                ? ANY_AVAILABLE_PRACTITIONER_ID
                : null
          }
          onSelect={(practitioner) => {
            // A different person offers a different catalogue, so nothing chosen
            // under the previous one may survive.
            setStaffPick(practitioner ? { kind: 'practitioner', practitioner } : { kind: 'any' });
            setSelectedService(null);
            setPendingServiceIds([]);
            setPendingOverrides({});
            setChainExtras([]);
            setChainCursor(null);
            setVisitPeople(null);
            setNeedsPractitionerStep(false);
            setSelectedVariant(null);
            setSelectedAddonIds([]);
            setSelectedSlot(null);
            setDurationOverride(null);
            setRequireDeposit(false);
            goToStep('service');
          }}
        />
      ) : null}

      {activeKey === 'service' ? (
        <>
          <ServicePickerStep
          catalog={bookableCatalog}
          layout={servicesLayout}
          defaultPractitionerId={serviceScopePractitionerId}
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
          overrideAvailability={availabilityOverride}
          // On a service-first venue this is the first step, so the tick box lives here.
          overrideToggle={
            !isStaffFirst ? (
              <AvailabilityOverrideToggle
                checked={availabilityOverride}
                onChange={toggleAvailabilityOverride}
              />
            ) : undefined
          }
          // Tick every service first (web 2026-09-02); the times then come from
          // the chain route, only where the whole visit fits with one person.
          selectionMode="multi"
          selectedServiceIds={pendingServiceIds}
          initialDurationOverrides={pendingOverrides}
          // Staff-first, a visit of several people (6.2): what earlier people have is not listed
          // again, and the visit's cap counts it.
          excludedServiceIds={earlierVisitServiceIds}
          maxPicks={MAX_SERVICES_PER_VISIT - earlierVisitServiceIds.length}
          onAddSomeoneElse={canAddSomeoneElse ? addServiceWithSomeoneElse : undefined}
          onToggleService={(option) =>
            setPendingServiceIds((prev) =>
              prev.includes(option.serviceId)
                ? prev.filter((id) => id !== option.serviceId)
                : [...prev, option.serviceId],
            )
          }
          onClearSelection={() => {
            setPendingServiceIds([]);
            setPendingOverrides({});
          }}
          onContinueSelection={(picks) => {
            const [first, ...rest] = picks;
            if (!first) return;
            if (staffFirstGroups.length > 0) {
              continueStaffFirstVisit(picks);
              return;
            }
            // Remember the pills so "Change services" brings them back.
            const overrides: Record<string, number> = {};
            for (const p of picks) {
              if (p.durationOverride != null) overrides[p.option.serviceId] = p.durationOverride;
            }
            setPendingOverrides(overrides);
            chooseService(
              first.option,
              first.durationOverride,
              rest.map((p) => ({
                option: p.option,
                variant: null,
                addonIds: [],
                durationOverride: p.durationOverride,
              })),
            );
          }}
          onSelect={(option, customDuration) => chooseService(option, customDuration, [])}
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
          allowAnyAvailable={anyAvailableEnabled && !availabilityOverride}
          overrideAvailability={availabilityOverride}
          durationOverride={durationOverride}
          // Someone else offers some of the services: a different person for each (6.1).
          onChooseEach={
            visitMode === 'choose'
              ? () => {
                  setVisitPeople(visitServiceIds.map(() => null));
                  goToStep('visit_people');
                }
              : undefined
          }
          onSelect={(option) => {
            setVisitPeople(null);
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
            } else if (chainCursor) {
              goToStep('chain_options');
            } else {
              goToStep('date');
            }
          }}
        />
      ) : null}

      {activeKey === 'visit_people' && selectedService && visitPeople ? (
        <VisitPeopleStep
          services={[
            { serviceId: selectedService.serviceId, serviceName: selectedService.serviceName },
            ...chainExtras.map((e) => ({ serviceId: e.option.serviceId, serviceName: e.option.serviceName })),
          ]}
          people={bookableCatalog?.practitioners ?? []}
          choices={visitServiceIds.map((_, i) => visitPeople[i] ?? null)}
          isCollective={isCollective}
          // No engine to pick for you while the override is on (web #187).
          allowAnyAvailable={anyAvailableEnabled && !availabilityOverride}
          onChoose={chooseVisitPerson}
          onContinue={continueFromVisitPeople}
          onChangeServices={() => {
            setVisitPeople(null);
            changeServices();
          }}
        />
      ) : null}

      {/* The extras' options, asked in turn (first extra first) before the times:
          the same variant / add-ons steps, pointed at the extra under the cursor. */}
      {activeKey === 'chain_options' && chainCursor && chainExtras[chainCursor.index] ? (
        (() => {
          const extra = chainExtras[chainCursor.index]!;
          const updateExtra = (patch: Partial<ChainExtra>) =>
            setChainExtras((prev) =>
              prev.map((e, i) => (i === chainCursor.index ? { ...e, ...patch } : e)),
            );
          const moveOn = () => {
            // Next phase of this extra, else the next extra with options, else the date.
            const next: ChainCursor | null =
              chainCursor.phase === 'variant' && (extra.option.addonGroups ?? []).length > 0
                ? { index: chainCursor.index, phase: 'addons' }
                : nextChainCursor(chainExtras, chainCursor.index + 1);
            setChainCursor(next);
            if (!next) advanceFrom('chain_options');
          };
          return chainCursor.phase === 'variant' ? (
            <VariantStep
              key={`chain-variant-${chainCursor.index}`}
              serviceName={extra.option.serviceName}
              variants={extra.option.variants ?? []}
              selected={extra.variant}
              initialDurationOverride={extra.durationOverride}
              onSelect={(variant) => updateExtra({ variant })}
              onContinue={(customDuration) => {
                updateExtra({ durationOverride: customDuration });
                moveOn();
              }}
            />
          ) : (
            <AddonsStep
              key={`chain-addons-${chainCursor.index}`}
              groups={extra.option.addonGroups ?? []}
              value={extra.addonIds}
              onChange={(ids) => updateExtra({ addonIds: ids })}
              onContinue={moveOn}
            />
          );
        })()
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
          isLoading={!availabilityOverride && (monthQuery.isLoading || monthQuery.isFetching)}
          isError={monthQuery.isError}
          errorMessage={
            monthQuery.error instanceof ApiError ? monthQuery.error.message : undefined
          }
          onRetry={() => void monthQuery.refetch()}
          canContinue={!selectedDateUnavailable}
          onContinue={() => advanceFrom('date')}
          weekShortcuts
          source={source}
          timeZone={timeZone}
          // The override covers "now": pick it on the time step.
          onStartNow={availabilityOverride ? undefined : startWalkInNow}
        />
      ) : null}

      {activeKey === 'time' && selectedService && selectedDate && availabilityOverride ? (
        <OverrideTimeStep
          date={selectedDate}
          minutes={overrideMinutes}
          onChangeMinutes={(next) => {
            setOverrideMinutes(next);
            setMultiServiceError(null);
          }}
          onContinue={() => void continueWithOverrideTime()}
          checking={overrideChecking}
          errorMessage={multiServiceError}
        />
      ) : activeKey === 'time' && selectedService && selectedDate ? (
        <>
          {/* The review's services changed and no longer fit at the visit's
              start (G22): say so above the times. */}
          {multiServiceError ? (
            <Text variant="bodySmall" tone="danger" testID="chain-times-again">
              {multiServiceError}
            </Text>
          ) : null}
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
            chain={serviceChainParam}
            startNow={source === 'walk-in' && selectedDate === today}
            onStartNow={startWalkInNow}
            timeZone={timeZone}
            minBookingNoticeHours={bookingWindow.minNoticeHours}
            allowSameDayBooking={bookingWindow.allowSameDay}
          />
        </>
      ) : null}

      {activeKey === 'multi_service' && multiServiceSegments && multiServiceSegments.length > 0 ? (
        <MultiServiceReviewStep
          segments={multiServiceSegments}
          date={selectedDate}
          visitPractitioner={visitPractitioner}
          onChangeServices={changeServices}
          onRemoveSegment={(index) => void removeServiceFromChain(index)}
          onContinue={() => advanceFrom('multi_service')}
          errorMessage={multiServiceError}
          overrideWarnings={availabilityOverride ? (overrideWarnings ?? []) : null}
          businessNameOf={isCollective ? businessNameOf : undefined}
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
          phoneDefaultCountry={phoneDefaultCountry}
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
          staffNotes={calendarNotice.notes}
          noCardPayments={calendarNotice.noCards}
          businessParts={visitParts}
          noCardVenueIds={calendarNotice.noCardVenueIds}
          returningGuest={returningGuest}
          phoneDefaultCountry={phoneDefaultCountry}
          venueId={venueId}
          collectClientAddress={selectedService?.locationType === 'client_address'}
          multiServiceSegments={
            multiServiceSegments && multiServiceSegments.length > 1 ? multiServiceSegments : null
          }
          overrideAvailability={availabilityOverride}
        />
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * No bottom padding. Each step either pins its "Continue" at the foot of this
   * column or ends its own scroll content with it, and `Screen` already reserves
   * the page padding plus the home-indicator strip beneath. Padding here only
   * added a third band of dead space and shortened every step's viewport.
   */
  container: {
    flex: 1,
    gap: spacing.sm,
  },
  groupButton: {
    marginTop: spacing.sm,
  },
});

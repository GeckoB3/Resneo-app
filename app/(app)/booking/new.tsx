import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddonsStep } from '@/components/booking-wizard/AddonsStep';
import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { PractitionerStep } from '@/components/booking-wizard/PractitionerStep';
import { RestaurantWalkInForm } from '@/components/booking-wizard/RestaurantWalkInForm';
import { ServicePickerStep } from '@/components/booking-wizard/ServicePickerStep';
import { TimeSlotStep } from '@/components/booking-wizard/TimeSlotStep';
import { VariantStep } from '@/components/booking-wizard/VariantStep';
import { WizardStepIndicator } from '@/components/booking-wizard/WizardStepIndicator';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { ApiError } from '@/lib/api/client';
import { useAppointmentCatalog } from '@/lib/queries/useAppointmentCatalog';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useMonthAvailability } from '@/lib/queries/useMonthAvailability';
import { useManagedServices } from '@/lib/queries/useServicesManage';
import {
  readAndClearRebookBootstrap,
  resetRebookBootstrapGuard,
} from '@/lib/rebook-bootstrap';
import { useVenueContext } from '@/providers/VenueProvider';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing } from '@/theme/index';
import type { AppointmentSlot } from '@/types/appointment-availability';
import {
  type AppointmentCatalogPractitioner,
  type AppointmentCatalogVariant,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

type StepKey = 'service' | 'practitioner' | 'variant' | 'addons' | 'date' | 'time' | 'guest' | 'confirm';

const STEP_LABELS: Record<StepKey, string> = {
  service: 'Service',
  practitioner: 'Practitioner',
  variant: 'Option',
  addons: 'Add-ons',
  date: 'Date',
  time: 'Time',
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

const APPOINTMENT_PLAN_TIERS = new Set(['appointments', 'light', 'plus']);
const APPOINTMENT_MODELS = new Set(['practitioner_appointment', 'unified_scheduling']);

function isAppointmentVenue(
  pricingTier: string | null | undefined,
  bookingModel: string | null | undefined,
): boolean {
  const tier = (pricingTier ?? '').toLowerCase().trim();
  if (APPOINTMENT_PLAN_TIERS.has(tier)) return true;
  if (bookingModel && APPOINTMENT_MODELS.has(bookingModel)) return true;
  return false;
}

/** Multi-step walk-in booking wizard for appointment venues (Phase 5A v1). */
export default function NewBookingScreen() {
  const router = useRouter();
  const { venue, isLoading: venueLoading, featureFlags } = useVenueContext();
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

  const venueId = venue?.id ?? null;
  const timeZone = venue?.timezone ?? 'Europe/London';
  const appointmentVenue = isAppointmentVenue(
    venue?.pricing_tier,
    venue?.booking_model ?? null,
  );
  const anyAvailableEnabled = Boolean(featureFlags?.resolved?.any_available_practitioner);

  const catalogQuery = useAppointmentCatalog(appointmentVenue ? venueId : null, { includeHidden: true });
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
    return [
      'service',
      ...(includePractitioner ? (['practitioner'] as StepKey[]) : []),
      ...(hasVariants ? (['variant'] as StepKey[]) : []),
      ...(hasAddons ? (['addons'] as StepKey[]) : []),
      'date',
      'time',
      'guest',
      'confirm',
    ];
  }, [selectedService, needsPractitionerStep, hasVariants, hasAddons]);

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
              pricePence: service.price_pence,
              depositPence: service.deposit_pence ?? null,
              practitionerId: practitioner.id,
              practitionerName: practitioner.name,
              addonGroups: service.addon_groups ?? [],
              variants: service.variants ?? [],
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

  const isRestaurantCatalogFailure = useMemo(() => {
    if (!catalogQuery.isError) {
      return false;
    }
    return catalogQuery.error instanceof ApiError && catalogQuery.error.status === 404;
  }, [catalogQuery.error, catalogQuery.isError]);

  const handleBack = () => {
    const index = steps.indexOf(currentStepKey);
    if (index <= 0) {
      router.back();
      return;
    }
    const previous = steps[index - 1];
    if (previous) setCurrentStepKey(previous);
  };

  const handleBookingCreated = (bookingId: string) => {
    router.replace(`/booking/${bookingId}` as Href);
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
  } else if (activeKey === 'time' && !selectedDate) {
    activeKey = 'date';
  }

  const stepLabels = steps.map((key) => STEP_LABELS[key]);
  const stepNumber = Math.max(0, steps.indexOf(activeKey));
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
    enabled: activeKey === 'date' && !!selectedService,
  });
  const availableDates = monthQuery.data ? new Set(monthQuery.data.available_dates) : null;

  if (venueLoading) {
    return (
      <Screen>
        <LoadingState message="Loading venue…" />
      </Screen>
    );
  }

  if (!venueId) {
    return (
      <Screen>
        <ErrorState message="Venue details are not available yet." />
      </Screen>
    );
  }

  if (!appointmentVenue || isRestaurantCatalogFailure) {
    return (
      <Screen scroll>
        <RestaurantWalkInForm onSuccess={handleBookingCreated} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepNumber} labels={stepLabels} />

        {activeKey === 'service' ? (
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
            onContinue={() => advanceFrom('date')}
            source={source}
            onChangeSource={setSource}
            timeZone={timeZone}
            onStartNow={(iso) => {
              setMonthAnchor(iso);
              setSelectedDate(iso);
              setSelectedSlot(null);
              goToStep('time');
            }}
          />
        ) : null}

        {activeKey === 'time' && selectedService && selectedDate ? (
          <TimeSlotStep
            addonIds={selectedAddonIds}
            candidatePractitionerIds={selectedService.candidatePractitionerIds}
            date={selectedDate}
            durationMinutes={durationOverride}
            onContinue={() => advanceFrom('time')}
            onSelectSlot={setSelectedSlot}
            ownerVenueId={ownerVenueId}
            practitionerId={selectedService.practitionerId}
            preferredTime={selectedDate === prefilledDate ? prefilledTime : null}
            selectedSlot={selectedSlot}
            serviceId={selectedService.serviceId}
            variantId={selectedVariant?.id ?? null}
            venueId={venueId}
            startNow={source === 'walk-in' && selectedDate === today}
            timeZone={timeZone}
            minBookingNoticeHours={bookingWindow.minNoticeHours}
            allowSameDayBooking={bookingWindow.allowSameDay}
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
            ownerVenueId={ownerVenueId}
            service={selectedService}
            slot={selectedSlot}
            source={source}
            variant={selectedVariant}
            requireDeposit={requireDeposit}
            onChangeRequireDeposit={setRequireDeposit}
            returningGuest={returningGuest}
            phoneDefaultCountry="GB"
          />
        ) : null}

        {activeKey !== 'confirm' ? (
          <Button label="Back" onPress={handleBack} variant="ghost" style={styles.backButton} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.base,
    paddingBottom: spacing.xl,
  },
  backButton: {
    marginTop: spacing.sm,
  },
});

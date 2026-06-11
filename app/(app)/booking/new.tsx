import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddonsStep } from '@/components/booking-wizard/AddonsStep';
import { ConfirmStep } from '@/components/booking-wizard/ConfirmStep';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
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
import {
  readAndClearRebookBootstrap,
  resetRebookBootstrapGuard,
} from '@/lib/rebook-bootstrap';
import { useVenueContext } from '@/providers/VenueProvider';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing } from '@/theme/index';
import type { AppointmentSlot } from '@/types/appointment-availability';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
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
  name: '',
  phone: '',
  email: '',
  dietary_notes: undefined,
  occasion: undefined,
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
  const { venue, isLoading: venueLoading } = useVenueContext();
  const { ownerVenueId } = useLinkedVenueContext();
  const {
    guestId: guestIdParam,
    date: dateParam,
    practitionerId: practitionerIdParam,
    time: timeParam,
  } = useLocalSearchParams<{
    guestId?: string;
    date?: string;
    practitionerId?: string;
    time?: string;
  }>();
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

  const catalogQuery = useAppointmentCatalog(appointmentVenue ? venueId : null, { includeHidden: true });
  const prefillGuestQuery = useGuestDetail(prefilledGuestId);

  const [stepIndex, setStepIndex] = useState(0);
  const [selectedService, setSelectedService] = useState<AppointmentServiceOption | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(prefilledDate);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<AppointmentCatalogVariant | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [durationOverride, setDurationOverride] = useState<number | null>(null);
  const [source, setSource] = useState<'phone' | 'walk-in'>('phone');
  const today = calendarDateInTimeZone(new Date(), timeZone);
  const [monthAnchor, setMonthAnchor] = useState<string>(prefilledDate ?? today);
  const [guest, setGuest] = useState<GuestDetails>(EMPTY_GUEST);
  const [guestPrefilled, setGuestPrefilled] = useState(false);
  const [rebookApplied, setRebookApplied] = useState(false);
  const [rebookContactReadOnly, setRebookContactReadOnly] = useState(false);

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
        const fullName = [g.firstName, g.lastName].filter(Boolean).join(' ').trim();
        setGuest((prev) => ({
          ...prev,
          name: fullName,
          phone: typeof g.phone === 'string' ? g.phone : '',
          email: typeof g.email === 'string' ? g.email : '',
        }));
        setRebookContactReadOnly(true);
        setGuestPrefilled(true);
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
            if (appt.variantId && service.variants) {
              const variant = service.variants.find((v) => v.id === appt.variantId);
              if (variant) setSelectedVariant(variant);
            }
            // Apply duration override if it differs from natural duration.
            if (appt.durationMinutes != null && appt.durationMinutes !== service.duration_minutes) {
              setDurationOverride(appt.durationMinutes);
            }
            // Jump to date step.
            const baseSteps: StepKey[] = ['service', 'date', 'time', 'guest', 'confirm'];
            const dateIndex = baseSteps.indexOf('date');
            setStepIndex(dateIndex);
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
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    // React 19 lint flags setState-in-effect, but seeding once on async prefill is exactly
    // what effects are for here — no external system to subscribe to, no derivable initial value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuest({
      name: fullName,
      phone: profile.phone ?? '',
      email: profile.email ?? '',
    });
    setGuestPrefilled(true);
  }, [prefillGuestQuery.data, guestPrefilled]);

  const isRestaurantCatalogFailure = useMemo(() => {
    if (!catalogQuery.isError) {
      return false;
    }
    return catalogQuery.error instanceof ApiError && catalogQuery.error.status === 404;
  }, [catalogQuery.error, catalogQuery.isError]);

  const handleBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const handleBookingCreated = (bookingId: string) => {
    router.replace(`/booking/${bookingId}` as Href);
  };

  const addonGroups = selectedService?.addonGroups ?? [];
  const hasAddons = addonGroups.length > 0;
  const serviceVariants = selectedService?.variants ?? [];
  const hasVariants = serviceVariants.length > 0;

  // Determine if a Practitioner step is needed: when the service has 2+ practitioners
  // AND the user hasn't already picked a specific one via a direct practitioner filter
  // (i.e., selectedService still has ANY_AVAILABLE or no candidatePractitionerIds).
  const servicePractitioners: AppointmentCatalogPractitioner[] = useMemo(() => {
    if (!selectedService || !catalogQuery.data) return [];
    return catalogQuery.data.practitioners.filter((p) =>
      p.services.some((s) => s.id === selectedService.serviceId),
    );
  }, [selectedService, catalogQuery.data]);

  // Show the practitioner step only when: service is selected, has 2+ practitioners,
  // and the currently selected option is "Any available" (pool) rather than a specific person.
  // This handles the case where the user arrives from ServicePickerStep without specifying a
  // practitioner (e.g. tapping "Any available") and we want them to explicitly choose.
  // When user already chose a specific practitioner in ServicePickerStep, skip this step.
  const needsPractitionerStep =
    servicePractitioners.length >= 2 &&
    selectedService !== null &&
    // If this is an ANY_AVAILABLE row we expose the practitioner step
    selectedService.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID;

  const steps: StepKey[] = [
    'service',
    ...(needsPractitionerStep ? (['practitioner'] as StepKey[]) : []),
    ...(hasVariants ? (['variant'] as StepKey[]) : []),
    ...(hasAddons ? (['addons'] as StepKey[]) : []),
    'date',
    'time',
    'guest',
    'confirm',
  ];
  const currentKey = steps[stepIndex] ?? 'service';
  const stepLabels = steps.map((key) => STEP_LABELS[key]);
  const selectedAddons = addonGroups
    .flatMap((group) => group.addons)
    .filter((addon) => selectedAddonIds.includes(addon.id));
  const goNext = () => setStepIndex((current) => Math.min(steps.length - 1, current + 1));

  // Month availability for the date picker — hook must run unconditionally
  // (before the early returns below), gated via `enabled`.
  const [monthYear, monthMonth] = monthAnchor.split('-').map(Number);
  const monthQuery = useMonthAvailability({
    serviceId: selectedService?.serviceId ?? null,
    practitionerId: selectedService?.practitionerId ?? null,
    candidatePractitionerIds: selectedService?.candidatePractitionerIds,
    year: monthYear ?? new Date().getFullYear(),
    month: monthMonth ?? 1,
    variantId: selectedVariant?.id ?? null,
    addonIds: selectedAddonIds,
    enabled: currentKey === 'date' && !!selectedService,
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
        <WizardStepIndicator currentStep={stepIndex} labels={stepLabels} />

        {currentKey === 'service' ? (
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
            onSelect={(option) => {
              setSelectedService(option);
              setSelectedSlot(null);
              setSelectedVariant(null);
              setSelectedAddonIds([]);
              setDurationOverride(null);
              setStepIndex(1);
            }}
          />
        ) : null}

        {currentKey === 'practitioner' && selectedService && servicePractitioners.length >= 2 ? (
          <PractitionerStep
            practitioners={servicePractitioners}
            serviceOption={selectedService}
            onSelect={(option) => {
              setSelectedService(option);
              setSelectedSlot(null);
              goNext();
            }}
          />
        ) : null}

        {currentKey === 'variant' && selectedService ? (
          <VariantStep
            serviceName={selectedService.serviceName}
            variants={serviceVariants}
            selected={selectedVariant}
            onSelect={(variant) => {
              setSelectedVariant(variant);
              setSelectedSlot(null);
            }}
            onContinue={goNext}
          />
        ) : null}

        {currentKey === 'addons' ? (
          <AddonsStep
            groups={addonGroups}
            value={selectedAddonIds}
            onChange={setSelectedAddonIds}
            onContinue={goNext}
          />
        ) : null}

        {currentKey === 'date' ? (
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
            onContinue={goNext}
          />
        ) : null}

        {currentKey === 'time' && selectedService && selectedDate ? (
          <TimeSlotStep
            addonIds={selectedAddonIds}
            baseDurationMinutes={selectedVariant?.duration_minutes ?? selectedService.durationMinutes}
            candidatePractitionerIds={selectedService.candidatePractitionerIds}
            date={selectedDate}
            durationMinutes={durationOverride}
            onChangeDuration={(minutes) => {
              setDurationOverride(minutes);
              setSelectedSlot(null);
            }}
            onContinue={goNext}
            onSelectSlot={setSelectedSlot}
            ownerVenueId={ownerVenueId}
            practitionerId={selectedService.practitionerId}
            preferredTime={selectedDate === prefilledDate ? prefilledTime : null}
            selectedSlot={selectedSlot}
            serviceId={selectedService.serviceId}
            variantId={selectedVariant?.id ?? null}
            venueId={venueId}
          />
        ) : null}

        {currentKey === 'guest' ? (
          <GuestDetailsStep
            onChange={setGuest}
            onContinue={goNext}
            readOnlyContact={rebookContactReadOnly}
            value={guest}
          />
        ) : null}

        {currentKey === 'confirm' && selectedService && selectedDate && selectedSlot ? (
          <ConfirmStep
            addons={selectedAddons}
            date={selectedDate}
            durationOverride={durationOverride}
            guest={guest}
            onChangeSource={setSource}
            onSuccess={handleBookingCreated}
            ownerVenueId={ownerVenueId}
            service={selectedService}
            slot={selectedSlot}
            source={source}
            variant={selectedVariant}
          />
        ) : null}

        {currentKey !== 'confirm' ? (
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

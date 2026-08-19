import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  BookingFlowConfirm,
  SelectableRow,
  StepHeading,
} from '@/components/booking-wizard/BookingFlowPrimitives';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { BookingWizardHeader } from '@/components/booking-wizard/BookingWizardHeader';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { WizardStepIndicator } from '@/components/booking-wizard/WizardStepIndicator';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import {
  addMinutesToTime,
  formatBookingDate,
  formatBookingTime,
  formatTimeRange,
  resourceDurationOptions,
  resourcePricePerSlotLabel,
  resourceTotalPence,
} from '@/lib/booking/booking-format';
import { formatDurationMinutes } from '@/lib/format';
import { normalizePhone } from '@/lib/phone/normalize';
import {
  readAndClearRebookBootstrap,
  resetRebookBootstrapGuard,
} from '@/lib/rebook-bootstrap';
import {
  useResourceAvailability,
  useResourceOptions,
} from '@/lib/queries/useBookableOfferings';
import { useResourceMonthAvailability } from '@/lib/queries/useResourceMonthAvailability';
import { useBookingFormVenue } from '@/lib/queries/useBookingFormVenue';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing } from '@/theme/index';
import type { ResourceOption, ResourceSlot } from '@/types/booking-offerings';

type StepKey = 'resource' | 'date' | 'duration' | 'time' | 'guest' | 'confirm';
const STEPS: StepKey[] = ['resource', 'date', 'duration', 'time', 'guest', 'confirm'];
const STEP_LABELS = ['Resource', 'Date', 'Length', 'Time', 'Guest', 'Confirm'];

const EMPTY_GUEST: GuestDetails = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  special_requests: undefined,
};

type ResourceBookingFlowProps = { onCreated: (bookingId: string) => void };

/** Book a time slot on a resource (web-parity resource flow). */
export function ResourceBookingFlow({ onCreated }: ResourceBookingFlowProps) {
  const router = useRouter();
  const { venueId, timeZone } = useBookingFormVenue();
  const { ownerVenueId } = useLinkedVenueContext();
  const { guestId: guestIdParam, resourceId: resourceIdParam } = useLocalSearchParams<{
    guestId?: string;
    resourceId?: string;
  }>();
  const prefilledGuestId =
    typeof guestIdParam === 'string' && guestIdParam.length > 0 ? guestIdParam : null;
  // "Book this resource" deep-links here with the resource pre-selected.
  const prefilledResourceId =
    typeof resourceIdParam === 'string' && resourceIdParam.length > 0 ? resourceIdParam : null;

  const today = calendarDateInTimeZone(new Date(), timeZone);

  const optionsQuery = useResourceOptions(venueId);
  const prefillGuestQuery = useGuestDetail(prefilledGuestId);

  const [step, setStep] = useState<StepKey>('resource');
  const [selectedResource, setSelectedResource] = useState<ResourceOption | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<string>(today);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ResourceSlot | null>(null);
  const [guest, setGuest] = useState<GuestDetails>(EMPTY_GUEST);
  const [guestPrefilled, setGuestPrefilled] = useState(false);
  const [returningGuest, setReturningGuest] = useState(false);
  // Phone vs walk-in — chosen on the guest step so a walk-in relaxes the phone
  // requirement before contact details (the toggle used to sit on confirm only).
  const [source, setSource] = useState<'phone' | 'walk-in'>('phone');
  const [resourcePrefilled, setResourcePrefilled] = useState(false);

  useEffect(() => {
    if (guestPrefilled || !prefillGuestQuery.data) return;
    const profile = prefillGuestQuery.data.guest;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuest({
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      phone: profile.phone ?? '',
      email: profile.email ?? '',
    });
    setGuestPrefilled(true);
    setReturningGuest(true);
  }, [prefillGuestQuery.data, guestPrefilled]);

  // Pre-select the deep-linked resource once the offerings load, then jump to the
  // date step. Runs once (guarded) so the user can still go Back to the picker.
  useEffect(() => {
    if (resourcePrefilled || !prefilledResourceId || !optionsQuery.data) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedResource(optionsQuery.data.resources.find((r) => r.id === prefilledResourceId) ?? null);
    setStep('date');
    setResourcePrefilled(true);
  }, [optionsQuery.data, prefilledResourceId, resourcePrefilled]);

  // Rebook bootstrap (resource surface) — pre-select the resource + duration and
  // pre-fill the guest, then land on the date step. Guarded module-level read so
  // it's consumed once; deep-link `?resourceId=` wins if both are present.
  const rebookApplyRef = useRef(false);
  useEffect(() => {
    if (rebookApplyRef.current || resourcePrefilled || prefilledResourceId) return;
    if (!optionsQuery.data) return;
    void (async () => {
      const bootstrap = await readAndClearRebookBootstrap();
      if (!bootstrap) {
        rebookApplyRef.current = true;
        return;
      }
      if (bootstrap.guest) {
        const g = bootstrap.guest;
        setGuest((prev) => ({
          ...prev,
          first_name: typeof g.firstName === 'string' ? g.firstName : prev.first_name,
          last_name: typeof g.lastName === 'string' ? g.lastName : prev.last_name,
          phone: typeof g.phone === 'string' ? g.phone : prev.phone,
          email: typeof g.email === 'string' ? g.email : prev.email,
        }));
        setGuestPrefilled(true);
        setReturningGuest(true);
      }
      const resourceBootstrap = bootstrap.resource;
      if (resourceBootstrap && optionsQuery.data) {
        const match = optionsQuery.data.resources.find((r) => r.id === resourceBootstrap.resourceId);
        if (match) {
          setSelectedResource(match);
          // Honour the prior duration only if it's a valid option for this resource.
          const options = resourceDurationOptions(
            match.min_booking_minutes,
            match.max_booking_minutes,
            match.slot_interval_minutes,
          );
          const wanted = resourceBootstrap.durationMinutes;
          if (wanted != null && options.includes(wanted)) {
            setDurationMinutes(wanted);
          }
          if (bootstrap.initialDate && /^\d{4}-\d{2}-\d{2}$/.test(bootstrap.initialDate)) {
            setSelectedDate(bootstrap.initialDate);
            setMonthAnchor(bootstrap.initialDate);
          }
          setStep('date');
          setResourcePrefilled(true);
        }
      }
      rebookApplyRef.current = true;
    })();
  }, [optionsQuery.data, prefilledResourceId, resourcePrefilled]);

  // Clean up the one-shot guard when the flow unmounts so a later open is fresh.
  useEffect(() => {
    return () => {
      resetRebookBootstrapGuard();
    };
  }, []);

  const resources = optionsQuery.data?.resources ?? [];
  const durationOptions = useMemo(
    () =>
      selectedResource
        ? resourceDurationOptions(
            selectedResource.min_booking_minutes,
            selectedResource.max_booking_minutes,
            selectedResource.slot_interval_minutes,
          )
        : [],
    [selectedResource],
  );

  const availabilityQuery = useResourceAvailability(venueId, {
    date: selectedDate,
    resourceId: selectedResource?.id ?? null,
    durationMinutes,
  });
  const slots = useMemo(() => {
    if (!selectedResource) return [];
    return availabilityQuery.data?.resources.find((r) => r.id === selectedResource.id)?.slots ?? [];
  }, [availabilityQuery.data, selectedResource]);

  // Month-level availability dots for the date step. The date is chosen before a
  // duration, so query in "any valid duration" mode (web parity); once a length
  // is picked the time step does the precise per-slot filtering.
  const [resMonthYear, resMonthMonth] = monthAnchor.split('-').map(Number);
  const monthAvailabilityQuery = useResourceMonthAvailability({
    venueId,
    resourceId: selectedResource?.id ?? null,
    year: resMonthYear ?? new Date().getFullYear(),
    month: resMonthMonth ?? 1,
    durationMinutes: null,
    enabled: step === 'date' && !!selectedResource,
  });
  const resourceAvailableDates = monthAvailabilityQuery.data
    ? new Set(monthAvailabilityQuery.data.available_dates)
    : null;

  const endTime =
    selectedSlot && durationMinutes ? addMinutesToTime(selectedSlot.start_time, durationMinutes) : null;
  const totalPence =
    selectedResource && durationMinutes
      ? resourceTotalPence(
          selectedResource.price_per_slot_pence,
          durationMinutes,
          selectedResource.slot_interval_minutes,
        )
      : null;

  const goBack = () => {
    const index = STEPS.indexOf(step);
    if (index <= 0) {
      router.back();
      return;
    }
    setStep(STEPS[index - 1]!);
  };

  const stepIndex = Math.max(0, STEPS.indexOf(step));
  // Header arrow steps back a page (hidden on the first step); the ✕ exits.
  const chrome = <BookingWizardHeader canGoBack={stepIndex > 0} onBack={goBack} />;

  // ----- resource step -----
  if (step === 'resource') {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        {optionsQuery.isLoading ? (
          <LoadingState message="Loading resources…" />
        ) : optionsQuery.isError ? (
          <ErrorState message="Couldn't load resources." onRetry={() => void optionsQuery.refetch()} />
        ) : resources.length === 0 ? (
          <EmptyState title="No resources available" message="There are no bookable resources set up." />
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <StepHeading title="Book a resource" />
            {resources.map((r) => (
              <SelectableRow
                key={r.id}
                title={r.name}
                subtitle={r.resource_type}
                trailing={resourcePricePerSlotLabel(r.price_per_slot_pence, r.slot_interval_minutes)}
                selected={selectedResource?.id === r.id}
                onPress={() => {
                  setSelectedResource(r);
                  setSelectedDate(null);
                  setDurationMinutes(null);
                  setSelectedSlot(null);
                  setStep('date');
                }}
              />
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // ----- date step -----
  if (step === 'date' && selectedResource) {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <MonthDatePicker
          title="Pick a date"
          availabilityHint="Choose a day, then pick a length and time."
          monthAnchor={monthAnchor}
          onChangeMonth={setMonthAnchor}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={(iso) => {
            setSelectedDate(iso);
            setSelectedSlot(null);
          }}
          availableDates={resourceAvailableDates}
          isLoading={monthAvailabilityQuery.isLoading || monthAvailabilityQuery.isFetching}
          canContinue={!!selectedDate}
          onContinue={() => setStep('duration')}
          weekShortcuts
          timeZone={timeZone}
        />
      </View>
    );
  }

  // ----- duration step -----
  if (step === 'duration' && selectedResource) {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <StepHeading title="How long do you need it?" subtitle={selectedResource.name} />
          <View style={styles.chips}>
            {durationOptions.map((minutes) => (
              <Chip
                key={minutes}
                label={formatDurationMinutes(minutes)}
                selected={durationMinutes === minutes}
                onPress={() => {
                  setDurationMinutes(minutes);
                  setSelectedSlot(null);
                }}
              />
            ))}
          </View>
          <Button
            label="Continue"
            fullWidth
            disabled={!durationMinutes}
            onPress={() => setStep('time')}
          />
        </ScrollView>
      </View>
    );
  }

  // ----- time step -----
  if (step === 'time' && selectedResource && selectedDate && durationMinutes) {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <StepHeading
            title="Choose a start time"
            subtitle={`${selectedResource.name} · ${formatBookingDate(selectedDate)} · ${formatDurationMinutes(durationMinutes)}`}
          />
          {availabilityQuery.isLoading || availabilityQuery.isFetching ? (
            <LoadingState message="Finding available times…" />
          ) : availabilityQuery.isError ? (
            <ErrorState
              message="Couldn't load times."
              onRetry={() => void availabilityQuery.refetch()}
            />
          ) : slots.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              No available times for this day and length. Try a shorter length or another day.
            </Text>
          ) : (
            <View style={styles.chips}>
              {slots.map((slot) => (
                <Chip
                  key={slot.start_time}
                  label={formatBookingTime(slot.start_time)}
                  selected={selectedSlot?.start_time === slot.start_time}
                  onPress={() => setSelectedSlot(slot)}
                />
              ))}
            </View>
          )}
          <Button
            label="Continue"
            fullWidth
            disabled={!selectedSlot}
            onPress={() => setStep('guest')}
          />
        </ScrollView>
      </View>
    );
  }

  // ----- guest step -----
  if (step === 'guest') {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <GuestDetailsStep
          value={guest}
          onChange={setGuest}
          onContinue={() => setStep('confirm')}
          isWalkIn={source === 'walk-in'}
          source={source}
          onSourceChange={setSource}
          onPickExistingContact={() => setReturningGuest(true)}
          onClearExistingContact={() => setReturningGuest(false)}
        />
      </View>
    );
  }

  // ----- confirm step -----
  if (step === 'confirm' && selectedResource && selectedDate && selectedSlot && durationMinutes && endTime) {
    const resource = selectedResource;
    const slot = selectedSlot;
    const hasDeposit =
      resource.payment_requirement === 'deposit' && (resource.deposit_amount_pence ?? 0) > 0;
    const first = guest.first_name.trim();
    const last = guest.last_name.trim();
    const comment = (guest.special_requests ?? '').trim();

    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <BookingFlowConfirm
          source={source}
          onSourceChange={setSource}
          headerTitle={resource.name}
          headerSubtitle={resource.resource_type ?? undefined}
          rows={[
            { label: 'Date', value: formatBookingDate(selectedDate) },
            { label: 'Time', value: formatTimeRange(slot.start_time, endTime) },
            { label: 'Length', value: formatDurationMinutes(durationMinutes) },
          ]}
          totalPence={totalPence}
          depositPence={hasDeposit ? resource.deposit_amount_pence : null}
          paymentRequirement={resource.payment_requirement}
          cardHoldFeePerUnitPence={resource.deposit_amount_pence}
          guestName={[first, last].filter(Boolean).join(' ')}
          successTitle="Resource booking confirmed"
          successSubtitle={`${resource.name} on ${formatBookingDate(selectedDate)}, ${formatTimeRange(slot.start_time, endTime)}.`}
          buildPayload={({ source, requireDeposit, overrideCompliance }) => ({
            booking_date: selectedDate,
            booking_time: slot.start_time.slice(0, 5),
            booking_end_time: endTime,
            party_size: 1,
            resource_id: resource.id,
            first_name: first,
            last_name: last,
            phone: normalizePhone(guest.phone, 'GB'),
            email: guest.email.trim() || undefined,
            ...(comment ? { dietary_notes: comment } : {}),
            source,
            ...(hasDeposit && requireDeposit && source !== 'walk-in' ? { require_deposit: true } : {}),
            ...(returningGuest ? { returning_guest: true } : {}),
            ...(ownerVenueId ? { owner_venue_id: ownerVenueId } : {}),
            ...(overrideCompliance ? { override_compliance: true } : {}),
          })}
          onCreated={(bookingId) => {
            track(ANALYTICS_EVENTS.createBookingCompleted, { mode: 'resource' });
            onCreated(bookingId);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {chrome}
      <WizardStepIndicator currentStep={0} labels={STEP_LABELS} />
      <EmptyState
        title="Start again"
        message="Pick a resource to continue."
        actionLabel="Choose a resource"
        onAction={() => setStep('resource')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No bottom padding — see the note in ServiceBookingFlow.
  container: { flex: 1, gap: spacing.base },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

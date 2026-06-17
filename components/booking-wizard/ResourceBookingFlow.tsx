import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  BookingFlowConfirm,
  SelectableRow,
  StepHeading,
} from '@/components/booking-wizard/BookingFlowPrimitives';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
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
  useResourceAvailability,
  useResourceOptions,
} from '@/lib/queries/useBookableOfferings';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { useVenueContext } from '@/providers/VenueProvider';
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
  const { venue } = useVenueContext();
  const { ownerVenueId } = useLinkedVenueContext();
  const { guestId: guestIdParam } = useLocalSearchParams<{ guestId?: string }>();
  const prefilledGuestId =
    typeof guestIdParam === 'string' && guestIdParam.length > 0 ? guestIdParam : null;

  const venueId = venue?.id ?? null;
  const timeZone = venue?.timezone ?? 'Europe/London';
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

  // ----- resource step -----
  if (step === 'resource') {
    return (
      <View style={styles.container}>
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
        <Button label="Back" onPress={goBack} variant="ghost" style={styles.back} />
      </View>
    );
  }

  // ----- date step -----
  if (step === 'date' && selectedResource) {
    return (
      <View style={styles.container}>
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
          availableDates={null}
          canContinue={!!selectedDate}
          onContinue={() => setStep('duration')}
          timeZone={timeZone}
        />
        <Button label="Back" onPress={goBack} variant="ghost" style={styles.back} />
      </View>
    );
  }

  // ----- duration step -----
  if (step === 'duration' && selectedResource) {
    return (
      <View style={styles.container}>
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
        <Button label="Back" onPress={goBack} variant="ghost" style={styles.back} />
      </View>
    );
  }

  // ----- time step -----
  if (step === 'time' && selectedResource && selectedDate && durationMinutes) {
    return (
      <View style={styles.container}>
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
        <Button label="Back" onPress={goBack} variant="ghost" style={styles.back} />
      </View>
    );
  }

  // ----- guest step -----
  if (step === 'guest') {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <GuestDetailsStep
          value={guest}
          onChange={setGuest}
          onContinue={() => setStep('confirm')}
          onPickExistingContact={() => setReturningGuest(true)}
          onClearExistingContact={() => setReturningGuest(false)}
        />
        <Button label="Back" onPress={goBack} variant="ghost" style={styles.back} />
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
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <BookingFlowConfirm
          headerTitle={resource.name}
          headerSubtitle={resource.resource_type ?? undefined}
          rows={[
            { label: 'Date', value: formatBookingDate(selectedDate) },
            { label: 'Time', value: formatTimeRange(slot.start_time, endTime) },
            { label: 'Length', value: formatDurationMinutes(durationMinutes) },
          ]}
          totalPence={totalPence}
          depositPence={hasDeposit ? resource.deposit_amount_pence : null}
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
  container: { flex: 1, gap: spacing.base, paddingBottom: spacing.xl },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  back: { marginTop: spacing.sm },
});

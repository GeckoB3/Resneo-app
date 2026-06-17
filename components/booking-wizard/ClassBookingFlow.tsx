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
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import {
  formatBookingDate,
  formatBookingTime,
  offeringPriceLabel,
  remainingLabel,
} from '@/lib/booking/booking-format';
import { formatDurationMinutes } from '@/lib/format';
import { normalizePhone } from '@/lib/phone/normalize';
import { useClassOfferings } from '@/lib/queries/useBookableOfferings';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';
import type { ClassAvailabilitySlot, ClassOfferingSummary } from '@/types/booking-offerings';

type StepKey = 'class' | 'date' | 'session' | 'guest' | 'confirm';
const STEPS: StepKey[] = ['class', 'date', 'session', 'guest', 'confirm'];
const STEP_LABELS = ['Class', 'Date', 'Session', 'Guest', 'Confirm'];
const MAX_SPOTS = 10;

const EMPTY_GUEST: GuestDetails = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  special_requests: undefined,
};

type ClassBookingFlowProps = { onCreated: (bookingId: string) => void };

/** Book a guest onto a scheduled class session (web-parity class flow). */
export function ClassBookingFlow({ onCreated }: ClassBookingFlowProps) {
  const router = useRouter();
  const { venue } = useVenueContext();
  const { ownerVenueId } = useLinkedVenueContext();
  const { guestId: guestIdParam } = useLocalSearchParams<{ guestId?: string }>();
  const prefilledGuestId =
    typeof guestIdParam === 'string' && guestIdParam.length > 0 ? guestIdParam : null;

  const venueId = venue?.id ?? null;
  const timeZone = venue?.timezone ?? 'Europe/London';
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const offeringsQuery = useClassOfferings(venueId, { from: today });
  const prefillGuestQuery = useGuestDetail(prefilledGuestId);

  const [step, setStep] = useState<StepKey>('class');
  const [selectedClass, setSelectedClass] = useState<ClassOfferingSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<string>(today);
  const [selectedInstance, setSelectedInstance] = useState<ClassAvailabilitySlot | null>(null);
  const [spots, setSpots] = useState(1);
  const [guest, setGuest] = useState<GuestDetails>(EMPTY_GUEST);
  const [guestPrefilled, setGuestPrefilled] = useState(false);
  const [returningGuest, setReturningGuest] = useState(false);

  // Prefill guest from a ?guestId deep link (book-for-this-contact).
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

  const classes = offeringsQuery.data?.classes ?? [];
  const instances = useMemo(() => offeringsQuery.data?.instances ?? [], [offeringsQuery.data]);

  const selectedClassDates = useMemo(
    () => (selectedClass ? new Set(selectedClass.dates) : null),
    [selectedClass],
  );
  const sessionsForDate = useMemo(() => {
    if (!selectedClass || !selectedDate) return [];
    return instances
      .filter(
        (i) =>
          i.class_type_id === selectedClass.class_type_id &&
          i.instance_date === selectedDate &&
          i.remaining > 0,
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [instances, selectedClass, selectedDate]);

  // When a date has exactly one session, treat it as chosen automatically.
  const effectiveInstance =
    selectedInstance ?? (sessionsForDate.length === 1 ? sessionsForDate[0] ?? null : null);
  const remaining = effectiveInstance?.remaining ?? 0;
  const maxSpots = Math.max(1, Math.min(remaining, MAX_SPOTS));
  const safeSpots = Math.min(Math.max(1, spots), maxSpots);

  const goBack = () => {
    const index = STEPS.indexOf(step);
    if (index <= 0) {
      router.back();
      return;
    }
    setStep(STEPS[index - 1]!);
  };

  const stepIndex = Math.max(0, STEPS.indexOf(step));

  // ----- class step -----
  if (step === 'class') {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        {offeringsQuery.isLoading ? (
          <LoadingState message="Loading classes…" />
        ) : offeringsQuery.isError ? (
          <ErrorState message="Couldn't load classes." onRetry={() => void offeringsQuery.refetch()} />
        ) : classes.length === 0 ? (
          <EmptyState
            title="No classes available"
            message="There are no bookable classes scheduled in the next 90 days."
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <StepHeading title="Choose a class" />
            {classes.map((c) => (
              <SelectableRow
                key={c.class_type_id}
                title={c.class_name}
                accentColour={c.colour}
                subtitle={c.instructor_name ? `with ${c.instructor_name}` : c.description}
                meta={`${c.session_count} session${c.session_count === 1 ? '' : 's'} available`}
                trailing={offeringPriceLabel(c.price_pence, c.payment_requirement, c.deposit_amount_pence, {
                  fromPrefix: true,
                })}
                selected={selectedClass?.class_type_id === c.class_type_id}
                onPress={() => {
                  setSelectedClass(c);
                  setSelectedDate(null);
                  setSelectedInstance(null);
                  setSpots(1);
                  // Open the calendar on the first month that has a session.
                  setMonthAnchor(c.dates[0] ?? today);
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
  if (step === 'date' && selectedClass) {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <MonthDatePicker
          title="Pick a date"
          availabilityHint="Green dates have a scheduled class."
          monthAnchor={monthAnchor}
          onChangeMonth={setMonthAnchor}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={(iso) => {
            setSelectedDate(iso);
            setSelectedInstance(null);
            setSpots(1);
          }}
          availableDates={selectedClassDates}
          canContinue={!!selectedDate}
          onContinue={() => setStep('session')}
          timeZone={timeZone}
        />
        <Button label="Back" onPress={goBack} variant="ghost" style={styles.back} />
      </View>
    );
  }

  // ----- session + spots step -----
  if (step === 'session' && selectedClass && selectedDate) {
    const multiple = sessionsForDate.length > 1;
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <StepHeading
            title={multiple ? 'Choose a session' : 'Confirm session'}
            subtitle={`${selectedClass.class_name} · ${formatBookingDate(selectedDate)}`}
          />
          {sessionsForDate.map((s) => (
            <SelectableRow
              key={s.instance_id}
              title={formatBookingTime(s.start_time)}
              subtitle={s.instructor_name ? `with ${s.instructor_name}` : null}
              meta={`${formatDurationMinutes(s.duration_minutes)} · ${remainingLabel(s.remaining)}`}
              selected={effectiveInstance?.instance_id === s.instance_id}
              onPress={() => {
                setSelectedInstance(s);
                setSpots((prev) => Math.min(prev, Math.max(1, Math.min(s.remaining, MAX_SPOTS))));
              }}
            />
          ))}

          {effectiveInstance && maxSpots > 1 ? (
            <View style={styles.spotsBlock}>
              <Stepper
                label="Spots"
                value={String(safeSpots)}
                onDecrement={() => setSpots((p) => Math.max(1, p - 1))}
                onIncrement={() => setSpots((p) => Math.min(maxSpots, p + 1))}
              />
              <Text variant="caption" tone="muted">
                {remainingLabel(remaining)}
              </Text>
            </View>
          ) : null}

          <Button
            label="Continue"
            fullWidth
            disabled={!effectiveInstance}
            onPress={() => {
              setSelectedInstance(effectiveInstance);
              setStep('guest');
            }}
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
  if (step === 'confirm' && effectiveInstance && selectedClass) {
    const inst = effectiveInstance;
    const hasDeposit =
      inst.payment_requirement === 'deposit' && (inst.deposit_amount_pence ?? 0) > 0;
    const totalPence = inst.price_pence != null ? inst.price_pence * safeSpots : null;
    const first = guest.first_name.trim();
    const last = guest.last_name.trim();
    const comment = (guest.special_requests ?? '').trim();

    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <BookingFlowConfirm
          headerTitle={selectedClass.class_name}
          headerSubtitle={`${formatDurationMinutes(inst.duration_minutes)}${inst.instructor_name ? ` · with ${inst.instructor_name}` : ''}`}
          rows={[
            { label: 'Date', value: formatBookingDate(inst.instance_date) },
            { label: 'Time', value: formatBookingTime(inst.start_time) },
            { label: 'Spots', value: String(safeSpots) },
          ]}
          totalPence={totalPence}
          depositPence={hasDeposit ? inst.deposit_amount_pence : null}
          guestName={[first, last].filter(Boolean).join(' ')}
          successTitle="Class booking confirmed"
          successSubtitle={`${selectedClass.class_name} on ${formatBookingDate(inst.instance_date)} at ${formatBookingTime(inst.start_time)}.`}
          buildPayload={({ source, requireDeposit, overrideCompliance }) => ({
            booking_date: inst.instance_date,
            booking_time: inst.start_time.slice(0, 5),
            party_size: safeSpots,
            class_instance_id: inst.instance_id,
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
            track(ANALYTICS_EVENTS.createBookingCompleted, { mode: 'class' });
            onCreated(bookingId);
          }}
        />
      </View>
    );
  }

  // Fallback — a prerequisite went missing; send the user back to the start.
  return (
    <View style={styles.container}>
      <WizardStepIndicator currentStep={0} labels={STEP_LABELS} />
      <EmptyState
        title="Start again"
        message="Pick a class to continue."
        actionLabel="Choose a class"
        onAction={() => setStep('class')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.base, paddingBottom: spacing.xl },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  spotsBlock: { gap: spacing.xs, paddingVertical: spacing.sm },
  back: { marginTop: spacing.sm },
});

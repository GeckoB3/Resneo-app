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
import { BookingWizardHeader } from '@/components/booking-wizard/BookingWizardHeader';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { WizardStepIndicator } from '@/components/booking-wizard/WizardStepIndicator';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import {
  formatBookingDate,
  formatBookingTime,
  formatTimeRange,
  offeringPriceLabel,
  remainingLabel,
} from '@/lib/booking/booking-format';
import { formatPence } from '@/lib/format';
import { normalizePhone } from '@/lib/phone/normalize';
import { useBookingFormVenue } from '@/lib/queries/useBookingFormVenue';
import { useEventOfferings } from '@/lib/queries/useBookableOfferings';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { useLinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { EventAvailabilitySlot, EventOfferingSummary } from '@/types/booking-offerings';

type StepKey = 'event' | 'date' | 'tickets' | 'guest' | 'confirm';
const STEPS: StepKey[] = ['event', 'date', 'tickets', 'guest', 'confirm'];
const STEP_LABELS = ['Event', 'Date', 'Tickets', 'Guest', 'Confirm'];

const EMPTY_GUEST: GuestDetails = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  special_requests: undefined,
};

type EventBookingFlowProps = { onCreated: (bookingId: string) => void };

/** Book event tickets onto a scheduled occurrence (web-parity event flow). */
export function EventBookingFlow({ onCreated }: EventBookingFlowProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { venueId, timeZone } = useBookingFormVenue();
  const { ownerVenueId } = useLinkedVenueContext();
  const { guestId: guestIdParam } = useLocalSearchParams<{ guestId?: string }>();
  const prefilledGuestId =
    typeof guestIdParam === 'string' && guestIdParam.length > 0 ? guestIdParam : null;

  const today = calendarDateInTimeZone(new Date(), timeZone);

  const offeringsQuery = useEventOfferings(venueId, { from: today });
  const prefillGuestQuery = useGuestDetail(prefilledGuestId);

  const [step, setStep] = useState<StepKey>('event');
  const [selectedEvent, setSelectedEvent] = useState<EventOfferingSummary | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<string>(today);
  const [selectedOccurrence, setSelectedOccurrence] = useState<EventAvailabilitySlot | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [guest, setGuest] = useState<GuestDetails>(EMPTY_GUEST);
  const [guestPrefilled, setGuestPrefilled] = useState(false);
  const [returningGuest, setReturningGuest] = useState(false);
  // Phone vs walk-in — chosen on the guest step so a walk-in relaxes the phone
  // requirement before contact details (the toggle used to sit on confirm only).
  const [source, setSource] = useState<'phone' | 'walk-in'>('phone');

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

  const events = offeringsQuery.data?.events ?? [];
  const instances = useMemo(() => offeringsQuery.data?.instances ?? [], [offeringsQuery.data]);

  const selectedEventDates = useMemo(
    () => (selectedEvent ? new Set(selectedEvent.dates) : null),
    [selectedEvent],
  );
  const occurrencesForDate = useMemo(() => {
    if (!selectedEvent || !selectedDate) return [];
    return instances
      .filter(
        (o) =>
          o.series_key === selectedEvent.series_key &&
          o.event_date === selectedDate &&
          o.remaining_capacity > 0,
      )
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [instances, selectedEvent, selectedDate]);

  const effectiveOccurrence =
    selectedOccurrence ?? (occurrencesForDate.length === 1 ? occurrencesForDate[0] ?? null : null);
  const ticketTypes = useMemo(
    () => [...(effectiveOccurrence?.ticket_types ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [effectiveOccurrence],
  );
  const totalTickets = ticketTypes.reduce((sum, tt) => sum + (quantities[tt.id] ?? 0), 0);
  const totalPence = ticketTypes.reduce(
    (sum, tt) => sum + (quantities[tt.id] ?? 0) * tt.price_pence,
    0,
  );

  const setQty = (id: string, value: number) =>
    setQuantities((prev) => ({ ...prev, [id]: value }));

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

  // ----- event step -----
  if (step === 'event') {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        {offeringsQuery.isLoading ? (
          <LoadingState message="Loading events…" />
        ) : offeringsQuery.isError ? (
          <ErrorState message="Couldn't load events." onRetry={() => void offeringsQuery.refetch()} />
        ) : events.length === 0 ? (
          <EmptyState
            title="No events available"
            message="There are no bookable events scheduled in the next 90 days."
          />
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <StepHeading title="Choose an event" />
            {events.map((e) => (
              <SelectableRow
                key={e.series_key}
                title={e.event_name}
                subtitle={e.description}
                meta={`${e.occurrence_count} date${e.occurrence_count === 1 ? '' : 's'} available`}
                trailing={offeringPriceLabel(e.from_price_pence, e.payment_requirement, e.deposit_amount_pence, {
                  fromPrefix: true,
                })}
                selected={selectedEvent?.series_key === e.series_key}
                onPress={() => {
                  setSelectedEvent(e);
                  setSelectedDate(null);
                  setSelectedOccurrence(null);
                  setQuantities({});
                  // Open the calendar on the first month that has an occurrence.
                  setMonthAnchor(e.dates[0] ?? today);
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
  if (step === 'date' && selectedEvent) {
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <MonthDatePicker
          title="Pick a date"
          availabilityHint="Green dates have an event scheduled."
          monthAnchor={monthAnchor}
          onChangeMonth={setMonthAnchor}
          today={today}
          selectedDate={selectedDate}
          onSelectDate={(iso) => {
            setSelectedDate(iso);
            setSelectedOccurrence(null);
            setQuantities({});
          }}
          availableDates={selectedEventDates}
          canContinue={!!selectedDate}
          onContinue={() => setStep('tickets')}
          timeZone={timeZone}
        />
      </View>
    );
  }

  // ----- tickets step -----
  if (step === 'tickets' && selectedEvent && selectedDate) {
    const multiple = occurrencesForDate.length > 1;
    return (
      <View style={styles.container}>
        {chrome}
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <StepHeading
            title="Select tickets"
            subtitle={`${selectedEvent.event_name} · ${formatBookingDate(selectedDate)}`}
          />

          {multiple ? (
            <View style={styles.subList}>
              <Text variant="label" tone="secondary">
                Choose a time
              </Text>
              {occurrencesForDate.map((o) => (
                <SelectableRow
                  key={o.event_id}
                  title={formatTimeRange(o.start_time, o.end_time)}
                  meta={remainingLabel(o.remaining_capacity, 'ticket')}
                  selected={effectiveOccurrence?.event_id === o.event_id}
                  onPress={() => {
                    setSelectedOccurrence(o);
                    setQuantities({});
                  }}
                />
              ))}
            </View>
          ) : null}

          {effectiveOccurrence && ticketTypes.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              This event has no ticket types set up.
            </Text>
          ) : null}

          {effectiveOccurrence
            ? ticketTypes.map((tt) => (
                <View key={tt.id} style={styles.ticketRow}>
                  <Stepper
                    label={tt.price_pence > 0 ? `${tt.name} · ${formatPence(tt.price_pence)}` : `${tt.name} · Free`}
                    value={String(quantities[tt.id] ?? 0)}
                    onDecrement={() => setQty(tt.id, Math.max(0, (quantities[tt.id] ?? 0) - 1))}
                    onIncrement={() => setQty(tt.id, Math.min(tt.remaining, (quantities[tt.id] ?? 0) + 1))}
                  />
                  <Text variant="caption" tone="muted">
                    {remainingLabel(tt.remaining, 'ticket')}
                  </Text>
                </View>
              ))
            : null}

          {totalTickets > 0 ? (
            <Card>
              <View style={styles.summaryLine}>
                <Text variant="bodyMedium">Tickets</Text>
                <Text variant="bodyMedium">{totalTickets}</Text>
              </View>
              {totalPence > 0 ? (
                <View style={[styles.summaryLine, { borderTopColor: colors.border }, styles.summaryTotal]}>
                  <Text variant="label">Total</Text>
                  <Text variant="label" tone="brand">
                    {formatPence(totalPence)}
                  </Text>
                </View>
              ) : null}
            </Card>
          ) : null}

          <Button
            label="Continue"
            fullWidth
            disabled={!effectiveOccurrence || totalTickets < 1}
            onPress={() => {
              setSelectedOccurrence(effectiveOccurrence);
              setStep('guest');
            }}
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
  if (step === 'confirm' && effectiveOccurrence && selectedEvent && totalTickets > 0) {
    const occ = effectiveOccurrence;
    const lines = ticketTypes
      .filter((tt) => (quantities[tt.id] ?? 0) > 0)
      .map((tt) => ({ tt, quantity: quantities[tt.id]! }));
    const ticketSummary = lines.map((l) => `${l.quantity} × ${l.tt.name}`).join(', ');
    const hasDeposit =
      occ.payment_requirement === 'deposit' && (occ.deposit_amount_pence ?? 0) > 0;
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
          headerTitle={selectedEvent.event_name}
          headerSubtitle={formatTimeRange(occ.start_time, occ.end_time)}
          rows={[
            { label: 'Date', value: formatBookingDate(occ.event_date) },
            { label: 'Time', value: formatBookingTime(occ.start_time) },
            { label: 'Tickets', value: ticketSummary || String(totalTickets) },
          ]}
          totalPence={totalPence > 0 ? totalPence : null}
          // Same as the class flow: the server charges the per-person deposit per
          // TICKET (`depPerPerson * partySize`), so the quoted figure must multiply.
          depositPence={hasDeposit ? (occ.deposit_amount_pence ?? 0) * totalTickets : null}
          paymentRequirement={occ.payment_requirement}
          cardHoldFeePerUnitPence={occ.deposit_amount_pence}
          cardHoldUnits={totalTickets}
          guestName={[first, last].filter(Boolean).join(' ')}
          successTitle="Event booking confirmed"
          successSubtitle={`${totalTickets} ticket${totalTickets === 1 ? '' : 's'} for ${selectedEvent.event_name} on ${formatBookingDate(occ.event_date)}.`}
          buildPayload={({ source, requireDeposit, overrideCompliance }) => ({
            booking_date: occ.event_date,
            booking_time: occ.start_time.slice(0, 5),
            party_size: totalTickets,
            experience_event_id: occ.event_id,
            ticket_lines: lines.map((l) => ({
              ticket_type_id: l.tt.id,
              label: l.tt.name,
              quantity: l.quantity,
              unit_price_pence: l.tt.price_pence,
            })),
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
            track(ANALYTICS_EVENTS.createBookingCompleted, { mode: 'event' });
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
        message="Pick an event to continue."
        actionLabel="Choose an event"
        onAction={() => setStep('event')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No bottom padding — see the note in ServiceBookingFlow.
  container: { flex: 1, gap: spacing.base },
  list: { gap: spacing.md, paddingBottom: spacing.lg },
  subList: { gap: spacing.sm },
  ticketRow: { gap: spacing.xs },
  summaryLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTotal: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.md },
});

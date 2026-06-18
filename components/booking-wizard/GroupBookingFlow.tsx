import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AddonsStep } from '@/components/booking-wizard/AddonsStep';
import type { GuestDetails } from '@/components/booking-wizard/GuestDetailsStep';
import { GuestDetailsStep } from '@/components/booking-wizard/GuestDetailsStep';
import { MonthDatePicker } from '@/components/booking-wizard/MonthDatePicker';
import { PractitionerStep } from '@/components/booking-wizard/PractitionerStep';
import { ServicePickerStep } from '@/components/booking-wizard/ServicePickerStep';
import { TimeSlotStep } from '@/components/booking-wizard/TimeSlotStep';
import { VariantStep } from '@/components/booking-wizard/VariantStep';
import { WizardStepIndicator } from '@/components/booking-wizard/WizardStepIndicator';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { ANALYTICS_EVENTS, track } from '@/lib/analytics';
import { ApiError } from '@/lib/api/client';
import {
  buildGroupPayload,
  type GroupPerson,
  groupTotalPence,
} from '@/lib/booking/multi-service-chain';
import { formatPence } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { normalizePhone } from '@/lib/phone/normalize';
import { calendarDateInTimeZone } from '@/lib/queries/useBookingsList';
import { useCreateGroupBooking } from '@/lib/queries/useCreateGroupBooking';
import { useMonthAvailability } from '@/lib/queries/useMonthAvailability';
import { spacing, radius } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentSlot } from '@/types/appointment-availability';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogPractitioner,
  type AppointmentCatalogResponse,
  type AppointmentCatalogVariant,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

/** Max distinct attendees in one group — matches the server (`people.min(1).max(10)`). */
export const MAX_GROUP_PEOPLE = 10;

type GroupStep =
  | 'review'
  | 'label'
  | 'service'
  | 'variant'
  | 'addons'
  | 'practitioner'
  | 'date'
  | 'time'
  | 'organiser'
  | 'confirm';

const STEP_LABELS = ['Group', 'Add person', 'Details', 'Confirm'];

/** Map the per-attendee sub-step to one of the four indicator buckets. */
function indicatorIndex(step: GroupStep): number {
  if (step === 'review') return 0;
  if (step === 'organiser') return 2;
  if (step === 'confirm') return 3;
  return 1;
}

const EMPTY_GUEST: GuestDetails = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  special_requests: undefined,
};

type GroupBookingFlowProps = {
  catalog: AppointmentCatalogResponse | undefined;
  venueId: string;
  timeZone: string;
  anyAvailableEnabled: boolean;
  ownerVenueId?: string | null;
  /** 'phone' | 'walk-in' — the group create posts this source. */
  source: 'phone' | 'walk-in';
  onCreated: (bookingId: string) => void;
  /** Leave group mode (back to the single-booking flow's service picker). */
  onExitGroup: () => void;
};

/**
 * Self-contained group-booking sub-flow: builds N distinct attendees (each with
 * their own service / variant / add-ons / practitioner / slot) reusing the same
 * step components as the single-booking flow, then posts ONE create-group call.
 *
 * Kept separate from `ServiceBookingFlow` to avoid ballooning that file with a
 * second state machine (risk #9 — two criticals in one flow). The whole group is
 * one server call; partial-failure rollback is the server's responsibility.
 */
export function GroupBookingFlow({
  catalog,
  venueId,
  timeZone,
  anyAvailableEnabled,
  ownerVenueId,
  source,
  onCreated,
  onExitGroup,
}: GroupBookingFlowProps) {
  const { colors } = useTheme();
  const createGroup = useCreateGroupBooking();
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const [step, setStep] = useState<GroupStep>('review');
  const [people, setPeople] = useState<GroupPerson[]>([]);

  // ----- in-progress attendee (the one currently being built) -----
  const [draftLabel, setDraftLabel] = useState('');
  const [draftService, setDraftService] = useState<AppointmentServiceOption | null>(null);
  const [draftVariant, setDraftVariant] = useState<AppointmentCatalogVariant | null>(null);
  const [draftAddonIds, setDraftAddonIds] = useState<string[]>([]);
  const [draftDate, setDraftDate] = useState<string>(today);
  const [draftMonthAnchor, setDraftMonthAnchor] = useState<string>(today);
  const [draftSlot, setDraftSlot] = useState<AppointmentSlot | null>(null);
  const [needsPractitioner, setNeedsPractitioner] = useState(false);

  const [organiser, setOrganiser] = useState<GuestDetails>(EMPTY_GUEST);
  const [returningGuest, setReturningGuest] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);

  const servicePractitioners: AppointmentCatalogPractitioner[] = useMemo(() => {
    if (!draftService || !catalog) return [];
    return catalog.practitioners.filter((p) =>
      p.services.some((s) => s.id === draftService.serviceId),
    );
  }, [draftService, catalog]);

  const draftAddonGroups = draftService?.addonGroups ?? [];
  const draftVariants = draftService?.variants ?? [];
  const draftSelectedAddons = draftAddonGroups
    .flatMap((g) => g.addons)
    .filter((a) => draftAddonIds.includes(a.id));

  // Any at-home (`client_address`) attendee makes the organiser step collect a
  // visit address (web parity — the server marks it mandatory for those services).
  const collectClientAddress = useMemo(
    () => people.some((p) => p.locationType === 'client_address'),
    [people],
  );

  const [my, mm] = draftMonthAnchor.split('-').map(Number);
  const monthQuery = useMonthAvailability({
    serviceId: draftService?.serviceId ?? null,
    practitionerId: draftService?.practitionerId ?? null,
    candidatePractitionerIds: draftService?.candidatePractitionerIds,
    year: my ?? new Date().getFullYear(),
    month: mm ?? 1,
    variantId: draftVariant?.id ?? null,
    addonIds: draftAddonIds,
    ownerVenueId,
    enabled: step === 'date' && !!draftService,
  });
  const availableDates = monthQuery.data ? new Set(monthQuery.data.available_dates) : null;

  const resetDraft = useCallback(() => {
    setDraftLabel('');
    setDraftService(null);
    setDraftVariant(null);
    setDraftAddonIds([]);
    setDraftSlot(null);
    setDraftDate(today);
    setDraftMonthAnchor(today);
    setNeedsPractitioner(false);
  }, [today]);

  const startNewPerson = useCallback(() => {
    resetDraft();
    setDraftLabel(`Guest ${people.length + 1}`);
    setStep('label');
  }, [people.length, resetDraft]);

  /** Commit the in-progress attendee to the group and return to the review. */
  const commitDraft = useCallback(() => {
    if (!draftService || !draftSlot) return;
    // "Any available" resolves to the slot's concrete practitioner.
    const practitionerId =
      draftService.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
        ? draftSlot.practitioner_id
        : draftService.practitionerId;
    const practitionerName =
      draftService.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
        ? draftSlot.practitioner_name
        : draftService.practitionerName;
    const basePrice = (draftVariant ? draftVariant.price_pence : draftService.pricePence) ?? null;
    const addonTotalPence = draftSelectedAddons.reduce((s, a) => s + a.additional_price_pence, 0);
    const addonTotalMinutes = draftSelectedAddons.reduce(
      (s, a) => s + a.additional_duration_minutes,
      0,
    );
    const baseDuration = draftVariant ? draftVariant.duration_minutes : draftService.durationMinutes;
    const person: GroupPerson = {
      label: draftLabel.trim() || `Guest ${people.length + 1}`,
      serviceId: draftService.serviceId,
      serviceName: draftService.serviceName,
      serviceVariantId: draftVariant?.id ?? null,
      practitionerId,
      practitionerName: practitionerName ?? '',
      bookingDate: draftDate,
      bookingTime: draftSlot.start_time,
      durationMinutes: baseDuration + addonTotalMinutes,
      pricePence: basePrice,
      addonIds: draftAddonIds.length ? draftAddonIds : undefined,
      addonTotalPence,
      locationType: draftService.locationType,
    };
    setPeople((prev) => [...prev, person]);
    resetDraft();
    setStep('review');
  }, [
    draftService,
    draftSlot,
    draftVariant,
    draftSelectedAddons,
    draftLabel,
    draftDate,
    draftAddonIds,
    people.length,
    resetDraft,
  ]);

  const removePerson = useCallback((index: number) => {
    setPeople((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const buildPayload = useCallback(
    (overrideCompliance?: boolean) => {
      const comment = (organiser.special_requests ?? '').trim();
      const base = buildGroupPayload({
        venueId,
        contact: {
          first_name: organiser.first_name,
          last_name: organiser.last_name,
          phone: normalizePhone(organiser.phone, 'GB'),
          email: organiser.email,
          dietary_notes: comment || undefined,
        },
        source,
        people,
        // At-home attendees: thread the visit address collected on the organiser
        // step (buildGroupPayload drops empty fields via clientAddressPayloadFields).
        address: collectClientAddress
          ? {
              client_address_line1: organiser.address_line1,
              client_address_line2: organiser.address_line2,
              client_address_city: organiser.address_city,
              client_address_postcode: organiser.address_postcode,
            }
          : null,
      });
      return {
        ...base,
        // create-group has no owner_venue_id/returning_guest/override params in
        // its schema today; thread them only if the backend later accepts them.
        ...(ownerVenueId ? { owner_venue_id: ownerVenueId } : {}),
        ...(returningGuest ? { returning_guest: true } : {}),
        ...(overrideCompliance ? { override_compliance: true } : {}),
      };
    },
    [organiser, venueId, source, people, ownerVenueId, returningGuest, collectClientAddress],
  );

  const handleCreate = useCallback(
    (overrideCompliance?: boolean) => {
      setSubmitError(null);
      setComplianceError(null);
      // create-group requires the organiser's first + last name.
      if (!organiser.first_name.trim() || !organiser.last_name.trim()) {
        hapticWarning();
        setSubmitError("Enter the organiser's first and last name.");
        return;
      }
      createGroup.mutate(buildPayload(overrideCompliance), {
        onSuccess: (res) => {
          hapticSuccess();
          // ── Stripe in-app capture extension point (DEFERRED) ───────────────
          // When `res.requires_deposit && res.client_secret && res.stripe_account_id`,
          // the web advances to a Stripe PaymentSheet (`@stripe/stripe-react-native`)
          // before showing success. We keep the payment-link model here: the
          // backend emails the deposit link. Wire the PaymentSheet here when
          // Stripe Connect is provisioned for the app (see ConfirmStep note).
          const primary = res.primary_booking_id ?? res.booking_ids[0];
          track(ANALYTICS_EVENTS.createBookingCompleted, {
            mode: 'group',
            source,
            partySize: people.length,
          });
          if (primary) onCreated(primary);
        },
        onError: (error) => {
          const apiError = error instanceof ApiError ? error : null;
          const body = apiError?.body as { error?: string; message?: string } | null | undefined;
          if (apiError?.status === 409 && body?.error === 'COMPLIANCE_REQUIREMENT_UNMET') {
            hapticWarning();
            setComplianceError(body?.message ?? 'A compliance requirement is unmet for an attendee.');
            return;
          }
          hapticWarning();
          setSubmitError(apiError ? apiError.message : 'Could not create the group booking.');
        },
      });
    },
    [createGroup, buildPayload, onCreated, source, people.length],
  );

  // ===================== render =====================
  const stepIndex = indicatorIndex(step);

  // ----- review (group home) -----
  if (step === 'review') {
    const total = groupTotalPence(people);
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text variant="heading">Group booking</Text>
          <Text variant="bodySmall" tone="muted">
            Add each attendee with their own service and time, then enter the organiser&apos;s
            contact details.
          </Text>

          {people.length === 0 ? (
            <Card>
              <Text variant="bodyMedium" tone="muted">
                No attendees yet. Add the first person to get started.
              </Text>
            </Card>
          ) : (
            <Card>
              {people.map((p, index) => (
                <View
                  key={`${p.label}-${index}`}
                  style={[
                    styles.personRow,
                    index > 0
                      ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                      : null,
                  ]}>
                  <View style={styles.personMain}>
                    <Text variant="bodyMedium">{p.label}</Text>
                    <Text variant="caption" tone="muted">
                      {p.serviceName} · {p.practitionerName} · {p.bookingTime.slice(0, 5)}
                      {p.pricePence != null ? ` · ${formatPence(p.pricePence)}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${p.label}`}
                    hitSlop={8}
                    onPress={() => {
                      hapticSelect();
                      removePerson(index);
                    }}
                    style={({ pressed }) => [styles.removeBtn, { opacity: pressed ? 0.6 : 1 }]}>
                    <Text variant="bodySmall" tone="danger">
                      Remove
                    </Text>
                  </Pressable>
                </View>
              ))}
              {total > 0 ? (
                <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                  <Text variant="label">Total</Text>
                  <Text variant="label" tone="brand">
                    {formatPence(total)}
                  </Text>
                </View>
              ) : null}
            </Card>
          )}

          {people.length < MAX_GROUP_PEOPLE ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                hapticSelect();
                startNewPerson();
              }}
              style={({ pressed }) => [
                styles.addToggle,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text variant="bodyMedium" tone="brand">
                + Add{people.length === 0 ? ' the first person' : ' another person'}
              </Text>
            </Pressable>
          ) : (
            <Text variant="caption" tone="muted">
              You can book up to {MAX_GROUP_PEOPLE} people in one group.
            </Text>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <Button
            label="Continue to organiser details"
            fullWidth
            disabled={people.length === 0}
            onPress={() => setStep('organiser')}
          />
          <Button label="Switch to single booking" variant="ghost" onPress={onExitGroup} />
        </View>
      </View>
    );
  }

  // ----- attendee label -----
  if (step === 'label') {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text variant="heading">Who is this for?</Text>
          <Text variant="bodySmall" tone="muted">
            Give this attendee a name so you can tell them apart on the calendar.
          </Text>
          <Input
            label="Attendee name"
            value={draftLabel}
            onChangeText={setDraftLabel}
            placeholder="e.g. Jordan, or Guest 2"
            autoCapitalize="words"
          />
        </ScrollView>
        <View style={styles.actions}>
          <Button
            label="Choose a service"
            fullWidth
            disabled={!draftLabel.trim()}
            onPress={() => setStep('service')}
          />
          <Button label="Back" variant="ghost" onPress={() => setStep('review')} />
        </View>
      </View>
    );
  }

  // ----- attendee service -----
  if (step === 'service') {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ServicePickerStep
          catalog={catalog}
          isLoading={false}
          isError={false}
          selectedServiceId={draftService?.serviceId ?? null}
          initialDurationOverride={null}
          onSelect={(option) => {
            setDraftService(option);
            setDraftVariant(null);
            setDraftAddonIds([]);
            setDraftSlot(null);
            const practitioners = catalog
              ? catalog.practitioners.filter((p) =>
                  p.services.some((s) => s.id === option.serviceId),
                )
              : [];
            const needs = practitioners.length >= 2;
            setNeedsPractitioner(needs);
            if (needs) setStep('practitioner');
            else if ((option.variants ?? []).length > 0) setStep('variant');
            else if ((option.addonGroups ?? []).length > 0) setStep('addons');
            else setStep('date');
          }}
        />
        <Button label="Back" variant="ghost" onPress={() => setStep('label')} style={styles.back} />
      </View>
    );
  }

  // ----- attendee practitioner -----
  if (step === 'practitioner' && draftService) {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <PractitionerStep
          practitioners={servicePractitioners}
          serviceOption={draftService}
          allowAnyAvailable={anyAvailableEnabled}
          durationOverride={null}
          onSelect={(option) => {
            setDraftService(option);
            setDraftVariant(null);
            setDraftAddonIds([]);
            setDraftSlot(null);
            if ((option.variants ?? []).length > 0) setStep('variant');
            else if ((option.addonGroups ?? []).length > 0) setStep('addons');
            else setStep('date');
          }}
        />
        <Button label="Back" variant="ghost" onPress={() => setStep('service')} style={styles.back} />
      </View>
    );
  }

  // ----- attendee variant -----
  if (step === 'variant' && draftService) {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <VariantStep
          serviceName={draftService.serviceName}
          variants={draftVariants}
          selected={draftVariant}
          initialDurationOverride={null}
          onSelect={(variant) => {
            setDraftVariant(variant);
            setDraftSlot(null);
          }}
          onContinue={() => {
            if (draftAddonGroups.length > 0) setStep('addons');
            else setStep('date');
          }}
        />
        <Button
          label="Back"
          variant="ghost"
          onPress={() => setStep(needsPractitioner ? 'practitioner' : 'service')}
          style={styles.back}
        />
      </View>
    );
  }

  // ----- attendee add-ons -----
  if (step === 'addons') {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <AddonsStep
          groups={draftAddonGroups}
          value={draftAddonIds}
          onChange={setDraftAddonIds}
          onContinue={() => setStep('date')}
        />
        <Button
          label="Back"
          variant="ghost"
          onPress={() => setStep(draftVariants.length > 0 ? 'variant' : needsPractitioner ? 'practitioner' : 'service')}
          style={styles.back}
        />
      </View>
    );
  }

  // ----- attendee date -----
  if (step === 'date' && draftService) {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <MonthDatePicker
          monthAnchor={draftMonthAnchor}
          onChangeMonth={setDraftMonthAnchor}
          today={today}
          selectedDate={draftDate}
          onSelectDate={(iso) => {
            setDraftDate(iso);
            setDraftSlot(null);
          }}
          availableDates={availableDates}
          isLoading={monthQuery.isLoading || monthQuery.isFetching}
          canContinue={!!draftDate}
          onContinue={() => setStep('time')}
          weekShortcuts
          timeZone={timeZone}
        />
        <Button
          label="Back"
          variant="ghost"
          onPress={() =>
            setStep(
              draftAddonGroups.length > 0
                ? 'addons'
                : draftVariants.length > 0
                  ? 'variant'
                  : needsPractitioner
                    ? 'practitioner'
                    : 'service',
            )
          }
          style={styles.back}
        />
      </View>
    );
  }

  // ----- attendee time -----
  if (step === 'time' && draftService && draftDate) {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <TimeSlotStep
          addonIds={draftAddonIds}
          candidatePractitionerIds={draftService.candidatePractitionerIds}
          date={draftDate}
          durationMinutes={null}
          onContinue={commitDraft}
          onSelectSlot={setDraftSlot}
          ownerVenueId={ownerVenueId}
          practitionerId={draftService.practitionerId}
          selectedSlot={draftSlot}
          serviceId={draftService.serviceId}
          variantId={draftVariant?.id ?? null}
          venueId={venueId}
          timeZone={timeZone}
        />
        <Button label="Back" variant="ghost" onPress={() => setStep('date')} style={styles.back} />
      </View>
    );
  }

  // ----- organiser details -----
  if (step === 'organiser') {
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <GuestDetailsStep
          isWalkIn={source === 'walk-in'}
          value={organiser}
          onChange={setOrganiser}
          onContinue={() => setStep('confirm')}
          onPickExistingContact={() => setReturningGuest(true)}
          onClearExistingContact={() => setReturningGuest(false)}
          collectClientAddress={collectClientAddress}
        />
        <Button label="Back" variant="ghost" onPress={() => setStep('review')} style={styles.back} />
      </View>
    );
  }

  // ----- confirm -----
  if (step === 'confirm') {
    const fullName = [organiser.first_name.trim(), organiser.last_name.trim()]
      .filter(Boolean)
      .join(' ');
    const total = groupTotalPence(people);
    return (
      <View style={styles.container}>
        <WizardStepIndicator currentStep={stepIndex} labels={STEP_LABELS} />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text variant="heading">Review &amp; confirm</Text>
          <Card>
            <Text variant="subheading">
              {people.length} {people.length === 1 ? 'attendee' : 'attendees'}
            </Text>
            <Text variant="bodySmall" tone="muted">
              Organiser: {fullName || '—'}
            </Text>
            <View style={styles.confirmList}>
              {people.map((p, index) => (
                <View key={`${p.label}-${index}`} style={styles.confirmRow}>
                  <Text variant="bodySmall">
                    {p.label} · {p.serviceName}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {p.bookingTime.slice(0, 5)}
                  </Text>
                </View>
              ))}
            </View>
            {total > 0 ? (
              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                <Text variant="label">Total</Text>
                <Text variant="label" tone="brand">
                  {formatPence(total)}
                </Text>
              </View>
            ) : null}
          </Card>

          {complianceError ? (
            <View style={[styles.noticeBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="bodySmall" tone="danger">
                {complianceError}
              </Text>
              <Button
                label="Book anyway (admin override)"
                variant="secondary"
                fullWidth
                loading={createGroup.isPending}
                onPress={() => handleCreate(true)}
              />
            </View>
          ) : null}

          {submitError ? (
            <Text variant="bodySmall" tone="danger">
              {submitError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Button
            label="Create group booking"
            fullWidth
            loading={createGroup.isPending}
            onPress={() => handleCreate()}
          />
          <Button label="Back" variant="ghost" onPress={() => setStep('organiser')} />
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.base, paddingBottom: spacing.xl },
  scroll: { gap: spacing.base, paddingBottom: spacing.lg },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  personMain: { flex: 1, gap: 2 },
  removeBtn: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addToggle: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  confirmList: { gap: spacing.xs, marginTop: spacing.sm },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  noticeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  actions: { gap: spacing.sm },
  back: { marginTop: spacing.sm },
});

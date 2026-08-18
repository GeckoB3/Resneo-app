import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ComplianceWarningNotice } from '@/components/compliance/ComplianceWarningNotice';
import {
  StaffCardHoldToggle,
  StaffRequireChargeCheckbox,
} from '@/components/booking-wizard/StaffChargeControls';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  resolveAppointmentServiceOnlineCharge,
  resolveVisitCardHoldTotal,
  resolveVisitChargeTotal,
} from '@/lib/booking/appointment-online-charge';
import {
  buildMultiServicePayload,
  chainTotalMinutes,
  chainTotalPence,
  type MultiServiceSegment,
} from '@/lib/booking/multi-service-chain';
import {
  STAFF_CARD_HOLD_LINK_SENT_LINE,
  resolveStaffEntityCardHold,
  staffCardHoldFeeLine,
} from '@/lib/booking/card-hold';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { normalizePhone } from '@/lib/phone/normalize';
import { useCreateBooking, type ComplianceBookingWarning } from '@/lib/queries/useCreateBooking';
import { useCreateMultiServiceBooking } from '@/lib/queries/useCreateMultiServiceBooking';
import { useFeatureFlags } from '@/lib/queries/useVenueSettings';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentSlot } from '@/types/appointment-availability';
import {
  ANY_AVAILABLE_PRACTITIONER_ID,
  type AppointmentCatalogAddon,
  type AppointmentCatalogVariant,
  type AppointmentServiceOption,
} from '@/types/appointment-catalog';

import type { GuestDetails } from './GuestDetailsStep';

type BookingSource = 'phone' | 'walk-in';

type ConfirmStepProps = {
  service: AppointmentServiceOption;
  date: string;
  slot: AppointmentSlot;
  guest: GuestDetails;
  variant?: AppointmentCatalogVariant | null;
  addons?: AppointmentCatalogAddon[];
  /** Staff base-duration override (minutes). */
  durationOverride?: number | null;
  /** Phone bookings are slot-validated server-side; walk-ins skip the gate.
   *  Chosen on the date+time step; shown read-only here. */
  source: BookingSource;
  ownerVenueId?: string | null;
  onSuccess: (bookingId: string) => void;
  /** Reset the wizard to step 1 for a back-to-back booking (front-desk flow). */
  onBookAnother?: () => void;
  /** Staff "Require deposit" toggle state (only shown when the service has a deposit). */
  requireDeposit?: boolean;
  onChangeRequireDeposit?: (value: boolean) => void;
  /** True when an existing/known contact was picked — sends `returning_guest`. */
  returningGuest?: boolean;
  /** Default dialling country for phone normalisation (matches the web). */
  phoneDefaultCountry?: string;
  /** Effective venue id — required for the multi-service create endpoint. */
  venueId?: string | null;
  /** When the chosen service is at-home, send the collected client address. */
  collectClientAddress?: boolean;
  /**
   * The full chained segments when this is a multi-service (back-to-back) visit
   * (length > 1). When set, the confirm posts ONE create-multi-service call
   * instead of the single-booking create. null/undefined → single booking.
   */
  multiServiceSegments?: MultiServiceSegment[] | null;
};

interface BookingConfirmation {
  booking_id: string;
  payment_url?: string;
  requires_deposit?: boolean;
  deposit_amount_pence?: number;
  /** Card hold requested at create (§7.6): the confirmation shows the card-request line. */
  card_hold_requested?: boolean;
  card_hold_fee_pence?: number | null;
  cancellation_notice_hours?: number;
  compliance_warnings?: ComplianceBookingWarning[];
  service_name: string;
  guest_name: string;
  date_label: string;
  time_label: string;
  practitioner_name: string;
}

const formatMoney = (pence: number): string => formatPence(pence) ?? '—';

function formatSummaryDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatSummaryTime(startTime: string): string {
  const [hours, minutes] = startTime.slice(0, 5).split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutes}${suffix}`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" tone="muted" style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

/** Inline confirmation view shown after a booking is created. */
function BookingConfirmationView({
  confirmation,
  onViewBooking,
  onBookAnother,
}: {
  confirmation: BookingConfirmation;
  onViewBooking: () => void;
  onBookAnother?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.confirmationContainer}
      showsVerticalScrollIndicator={false}>
      <View style={styles.confirmationHeader}>
        <Text variant="heading">Booking confirmed</Text>
        <Text variant="bodyMedium" tone="muted">
          The appointment has been created successfully.
        </Text>
      </View>

      <Card>
        <View style={[styles.serviceHeader, { borderBottomColor: colors.border }]}>
          <Text variant="subheading">{confirmation.service_name}</Text>
          <Text variant="bodySmall" tone="muted">
            {confirmation.practitioner_name}
          </Text>
        </View>
        <SummaryRow label="Guest" value={confirmation.guest_name} />
        <SummaryRow label="Date" value={confirmation.date_label} />
        <SummaryRow label="Time" value={confirmation.time_label} />

        {confirmation.card_hold_requested ? (
          <View style={[styles.depositNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall" tone="brand">
              Card hold
              {confirmation.card_hold_fee_pence != null && confirmation.card_hold_fee_pence > 0
                ? ` · ${staffCardHoldFeeLine(confirmation.card_hold_fee_pence).toLowerCase()}`
                : ''}
            </Text>
            <Text variant="caption" tone="muted">
              {STAFF_CARD_HOLD_LINK_SENT_LINE} No payment is taken.
            </Text>
          </View>
        ) : confirmation.requires_deposit && confirmation.deposit_amount_pence != null && confirmation.deposit_amount_pence > 0 ? (
          <View style={[styles.depositNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="bodySmall" tone="brand">
              Deposit required: {formatMoney(confirmation.deposit_amount_pence)}
            </Text>
            {confirmation.payment_url ? (
              <Text variant="caption" tone="muted">
                A payment link has been sent to the guest.
              </Text>
            ) : null}
          </View>
        ) : null}

        {confirmation.cancellation_notice_hours != null && confirmation.cancellation_notice_hours > 0 ? (
          <Text variant="caption" tone="muted" style={styles.cancellationNote}>
            Cancellation notice: {confirmation.cancellation_notice_hours}h before appointment.
          </Text>
        ) : null}
      </Card>

      <ComplianceWarningNotice warnings={confirmation.compliance_warnings} />

      <View style={styles.confirmationActions}>
        <Button label="View booking" fullWidth onPress={onViewBooking} />
        {onBookAnother ? (
          <Button
            label="Book another"
            variant="secondary"
            fullWidth
            onPress={onBookAnother}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Step 5 — review the summary and submit the appointment. */
export function ConfirmStep({
  service,
  date,
  slot,
  guest,
  variant = null,
  addons = [],
  durationOverride = null,
  source,
  ownerVenueId,
  onSuccess,
  onBookAnother,
  requireDeposit = false,
  onChangeRequireDeposit,
  returningGuest = false,
  phoneDefaultCountry = 'GB',
  venueId,
  collectClientAddress = false,
  multiServiceSegments = null,
}: ConfirmStepProps) {
  const { colors } = useTheme();
  const createBooking = useCreateBooking();
  const createMultiService = useCreateMultiServiceBooking();
  const isMultiService = (multiServiceSegments?.length ?? 0) > 1;
  const isAdmin = useStaffMe().data?.staff?.role === 'admin';
  const first_name = guest.first_name.trim();
  const last_name = guest.last_name.trim();
  const fullName = [first_name, last_name].filter(Boolean).join(' ');
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // For "Any available" rows the booking targets the slot's real practitioner.
  const practitionerId =
    service.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
      ? slot.practitioner_id
      : service.practitionerId;
  const practitionerName =
    service.practitionerId === ANY_AVAILABLE_PRACTITIONER_ID
      ? slot.practitioner_name
      : service.practitionerName;

  const addonsPrice = addons.reduce((sum, a) => sum + a.additional_price_pence, 0);
  const addonsDuration = addons.reduce((sum, a) => sum + a.additional_duration_minutes, 0);
  const basePrice = (variant ? variant.price_pence : service.pricePence) ?? 0;
  const baseDuration =
    durationOverride ?? (variant ? variant.duration_minutes : service.durationMinutes);
  const baseDeposit = variant ? variant.deposit_pence : service.depositPence;
  // A multi-service visit totals across all chained segments; a single booking
  // totals just this service (+ its add-ons).
  const totalPrice = isMultiService
    ? chainTotalPence(multiServiceSegments!)
    : basePrice + addonsPrice;
  const totalDuration = isMultiService
    ? chainTotalMinutes(multiServiceSegments!)
    : baseDuration + addonsDuration;
  /**
   * What this booking asks for online, across the WHOLE visit.
   *
   * This used to be `baseDeposit > 0` on the selected service alone, which was
   * wrong twice over. On a chain it read only the first segment, so a visit
   * whose deposit sat on the second service showed no control at all and could
   * not be booked without charging; when it did show, the amount was the first
   * service's rather than the visit's. And keying off `deposit_pence` skipped
   * `full_payment` services entirely, because they carry their amount in
   * `price_pence`: staff had no way to take a pay-in-full booking without
   * charging for it.
   *
   * Card-hold fees stay out of this total. No money is due at booking for them
   * and they have their own toggle.
   */
  const singleCharge = resolveAppointmentServiceOnlineCharge({
    price_pence: basePrice,
    deposit_pence: baseDeposit,
    payment_requirement: service.paymentRequirement,
  });
  const visitCharge = isMultiService
    ? resolveVisitChargeTotal(multiServiceSegments!)
    : {
        amountPence:
          singleCharge && singleCharge.chargeLabel !== 'card_hold' ? singleCharge.amountPence : 0,
        chargeLabel:
          singleCharge?.chargeLabel === 'full_payment'
            ? ('full_payment' as const)
            : ('deposit' as const),
      };
  const hasDeposit = visitCharge.amountPence > 0;
  const chargeNoun = visitCharge.chargeLabel === 'full_payment' ? 'payment' : 'deposit';
  const depositLabel = hasDeposit ? formatMoney(visitCharge.amountPence) : null;

  // Card hold (spec §7.6/D6): default on, walk-ins included. On a single
  // booking the fee is the (variant-adjusted) deposit_pence column, add-ons
  // excluded, and it REPLACES "Require deposit" — a single service resolves to
  // one charge or the other, never both.
  //
  // A chain can carry both at once, so it totals its hold segments and shows
  // both controls. Sending nothing here used to leave the route's default (on)
  // standing, which meant a chain containing one card-hold service always held
  // a card and staff had no way to say otherwise.
  const cardHoldFlagEnabled = Boolean(
    useFeatureFlags().data?.resolved?.card_hold_deposits,
  );
  const chainCardHoldPence = isMultiService
    ? resolveVisitCardHoldTotal(multiServiceSegments!)
    : 0;
  const staffCardHold = isMultiService
    ? cardHoldFlagEnabled && chainCardHoldPence > 0
      ? { feePence: chainCardHoldPence }
      : null
    : resolveStaffEntityCardHold({
        paymentRequirement: service.paymentRequirement,
        feePerUnitPence: baseDeposit,
        cardHoldFlagEnabled,
      });
  const [requireCardHold, setRequireCardHold] = useState(true);

  // The web folds the appointment's free-text comment into `dietary_notes`
  // (DetailsStep maps "Comments or requests" → dietary_notes). Mirror that: the
  // mobile "Comments or requests" box is that field, so it must NOT be silently
  // dropped — send it under `dietary_notes` like the web.
  const comment = (guest.special_requests ?? '').trim();

  // At-home (`client_address`) services: thread the address collected in the
  // guest step, mirroring the web's `clientAddressPayloadFields`.
  const addressFields =
    collectClientAddress && guest.address_line1?.trim()
      ? {
          client_address_line1: guest.address_line1.trim(),
          ...(guest.address_line2?.trim() ? { client_address_line2: guest.address_line2.trim() } : {}),
          ...(guest.address_city?.trim() ? { client_address_city: guest.address_city.trim() } : {}),
          ...(guest.address_postcode?.trim()
            ? { client_address_postcode: guest.address_postcode.trim() }
            : {}),
        }
      : {};

  const buildPayload = (overrideCompliance?: boolean) => ({
    booking_date: date,
    booking_time: slot.start_time.slice(0, 5),
    party_size: 1,
    first_name,
    last_name,
    phone: normalizePhone(guest.phone, phoneDefaultCountry),
    email: guest.email.trim() || undefined,
    practitioner_id: practitionerId,
    appointment_service_id: service.serviceId,
    ...(variant ? { service_variant_id: variant.id } : {}),
    ...(addons.length ? { addons: addons.map((a) => ({ addon_id: a.id })) } : {}),
    ...(durationOverride != null ? { duration_minutes: durationOverride } : {}),
    ...(comment ? { dietary_notes: comment } : {}),
    // Staff "Require deposit": send when the service has a deposit and the toggle
    // is on (the web sends require_deposit under the same condition). Walk-ins
    // never charge a deposit. The card-hold toggle rides `require_card_hold`
    // (walk-ins included). Independent spreads rather than an either/or: a
    // single service only ever resolves to one of the two, but writing it as a
    // choice hid the second one from every caller that can carry both.
    ...(staffCardHold ? { require_card_hold: requireCardHold } : {}),
    ...(hasDeposit && requireDeposit && source !== 'walk-in' ? { require_deposit: true } : {}),
    // Existing-contact / rebook → flag as a returning guest (web parity).
    ...(returningGuest ? { returning_guest: true } : {}),
    source,
    ...(ownerVenueId ? { owner_venue_id: ownerVenueId } : {}),
    ...(overrideCompliance ? { override_compliance: true } : {}),
    ...addressFields,
  });

  /** Build the create-multi-service body from the chained segments. */
  const buildMultiPayload = () =>
    buildMultiServicePayload({
      venueId: venueId ?? '',
      bookingDate: date,
      contact: {
        first_name,
        last_name,
        phone: normalizePhone(guest.phone, phoneDefaultCountry),
        email: guest.email.trim() || undefined,
        dietary_notes: comment || undefined,
      },
      source,
      segments: multiServiceSegments ?? [],
      // Both toggles' values used to be dropped here, so each was a silent
      // no-op on every chain: the deposit was charged whatever the catalogue
      // said, and the hold defaulted on because the route treats an omitted
      // `require_card_hold` as true.
      charges: { requireDeposit, ...(staffCardHold ? { requireCardHold } : {}) },
      address: collectClientAddress
        ? {
            client_address_line1: guest.address_line1,
            client_address_line2: guest.address_line2,
            client_address_city: guest.address_city,
            client_address_postcode: guest.address_postcode,
          }
        : null,
    });

  const handleCreateError = (error: unknown) => {
    const apiError = error instanceof ApiError ? error : null;
    const body = apiError?.body as { error?: string; message?: string } | null | undefined;
    const errorCode = body?.error;
    if (apiError?.status === 409 && errorCode === 'COMPLIANCE_REQUIREMENT_UNMET') {
      hapticWarning();
      const detail = body?.message ?? 'A compliance requirement is unmet for this guest.';
      setComplianceError(detail);
      return;
    }
    hapticWarning();
    // Inline (not Alert.alert — a no-op on react-native-web): the message
    // stays visible above the button while the user adjusts and retries.
    setSubmitError(apiError ? apiError.message : 'Could not create booking. Please try again.');
  };

  const handleConfirm = (overrideCompliance?: boolean) => {
    setComplianceError(null);
    setSubmitError(null);

    if (isMultiService) {
      // The create-multi-service route requires first + last name (unlike the
      // single create). Guard so staff get an inline prompt, not a raw 400.
      if (!first_name || !last_name) {
        hapticWarning();
        setSubmitError('Enter a first and last name for a multi-service visit.');
        return;
      }
      createMultiService.mutate(buildMultiPayload(), {
        onSuccess: (res) => {
          hapticSuccess();
          // ── Stripe in-app capture extension point (DEFERRED) ───────────────
          // The multi-service create returns `client_secret` + `stripe_account_id`
          // when a deposit/full payment is owed; the web advances to a Stripe
          // PaymentSheet here. We keep the payment-link model (backend emails the
          // link). Wire `@stripe/stripe-react-native` PaymentSheet here once
          // Stripe Connect is provisioned for the app — see the single-create note.
          const primary = res.primary_booking_id ?? res.booking_ids[0];
          if (!primary) {
            setSubmitError('Could not create booking. Please try again.');
            return;
          }
          setConfirmation({
            booking_id: primary,
            requires_deposit: res.requires_deposit,
            deposit_amount_pence: res.total_deposit_pence,
            // Card-hold chains (spec D7): pure setup mode shows the card-request
            // notice; a mixed payment_with_setup chain keeps the deposit notice
            // (money IS taken there, so "no payment" copy would mislead).
            card_hold_requested: res.payment_mode === 'setup',
            card_hold_fee_pence: res.card_hold_fee_pence ?? null,
            cancellation_notice_hours: res.cancellation_notice_hours,
            service_name: `${multiServiceSegments!.length} services`,
            guest_name: fullName,
            date_label: formatSummaryDate(date),
            time_label: formatSummaryTime(multiServiceSegments![0]!.startTime),
            practitioner_name: multiServiceSegments![0]!.practitionerName ?? '',
          });
        },
        onError: handleCreateError,
      });
      return;
    }

    createBooking.mutate(buildPayload(overrideCompliance), {
      onSuccess: (response) => {
        hapticSuccess();
        // ── Stripe in-app capture extension point (DEFERRED) ─────────────────
        // When `response.client_secret` + `stripe_account_id` are returned (an
        // online deposit/full payment), the web presents a Stripe PaymentSheet
        // before confirming. We keep the payment-link model: the backend emails
        // `payment_url`. To enable in-app capture, present
        // `@stripe/stripe-react-native` PaymentSheet here, then fall through to
        // setConfirmation on payment success. Gated on Stripe Connect config
        // (publishable key + connected-account id) not provisioned in this env.
        setConfirmation({
          booking_id: response.booking_id,
          payment_url: response.payment_url,
          requires_deposit: response.requires_deposit,
          deposit_amount_pence: response.deposit_amount_pence,
          card_hold_requested: response.card_hold_requested,
          card_hold_fee_pence: staffCardHold?.feePence ?? null,
          cancellation_notice_hours: response.cancellation_notice_hours,
          compliance_warnings: response.compliance_warnings,
          service_name: `${service.serviceName}${variant ? ` · ${variant.name}` : ''}`,
          guest_name: fullName,
          date_label: formatSummaryDate(date),
          time_label: formatSummaryTime(slot.start_time),
          practitioner_name: practitionerName ?? '',
        });
      },
      onError: handleCreateError,
    });
  };

  // Show inline confirmation once booking is created.
  if (confirmation) {
    return (
      <BookingConfirmationView
        confirmation={confirmation}
        onViewBooking={() => onSuccess(confirmation.booking_id)}
        onBookAnother={onBookAnother}
      />
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContainer}
      showsVerticalScrollIndicator={false}>
      <Text variant="heading">Review &amp; confirm</Text>
      <Card>
        <View style={[styles.serviceHeader, { borderBottomColor: colors.border }]}>
          <Text variant="subheading">
            {isMultiService
              ? `${multiServiceSegments!.length} services`
              : `${service.serviceName}${variant ? ` · ${variant.name}` : ''}`}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {totalDuration} min · {practitionerName}
          </Text>
        </View>
        {isMultiService ? (
          <View style={[styles.addonsBlock, { borderTopColor: 'transparent', paddingTop: 0 }]}>
            {multiServiceSegments!.map((seg, i) => (
              <View key={`${seg.serviceId}-${i}`} style={styles.addonLine}>
                <Text variant="bodySmall">
                  {formatSummaryTime(seg.startTime)} · {seg.serviceName}
                </Text>
                {seg.pricePence != null ? (
                  <Text variant="bodySmall" tone="muted">
                    {formatMoney(seg.pricePence)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        <SummaryRow label="Date" value={formatSummaryDate(date)} />
        {!isMultiService ? (
          <SummaryRow label="Time" value={formatSummaryTime(slot.start_time)} />
        ) : null}
        <SummaryRow label="Guest" value={fullName || '—'} />
        {guest.phone.trim() ? <SummaryRow label="Phone" value={guest.phone.trim()} /> : null}
        {guest.email.trim() ? <SummaryRow label="Email" value={guest.email.trim()} /> : null}
        {comment ? <SummaryRow label="Comments" value={comment} /> : null}

        {addons.length > 0 && !isMultiService ? (
          <View style={[styles.addonsBlock, { borderTopColor: colors.border }]}>
            <Text variant="caption" tone="muted">
              Add-ons
            </Text>
            {addons.map((addon) => (
              <View key={addon.id} style={styles.addonLine}>
                <Text variant="bodySmall">{addon.name}</Text>
                {addon.additional_price_pence > 0 ? (
                  <Text variant="bodySmall" tone="muted">
                    +{formatMoney(addon.additional_price_pence)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {totalPrice > 0 ? (
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text variant="label">Total</Text>
            <Text variant="label" tone="brand">
              {formatMoney(totalPrice)}
            </Text>
          </View>
        ) : null}
        {/* Money now and the no-show fee are separate lines: a chain can owe
            both, and labelling one total "No-show fee" because a hold exists
            somewhere in the visit would misstate what is being collected. */}
        {depositLabel ? (
          <View style={styles.depositRow}>
            <Text variant="caption" tone="muted">
              {chargeNoun === 'payment' ? 'Pay now' : 'Deposit'}
            </Text>
            <Text variant="bodySmall">{depositLabel}</Text>
          </View>
        ) : null}
        {staffCardHold ? (
          <View style={styles.depositRow}>
            <Text variant="caption" tone="muted">
              No-show fee
            </Text>
            <Text variant="bodySmall">{formatMoney(staffCardHold.feePence)}</Text>
          </View>
        ) : null}
      </Card>

      {staffCardHold ? (
        <StaffCardHoldToggle
          checked={requireCardHold}
          onChange={setRequireCardHold}
          feePence={staffCardHold.feePence}
        />
      ) : null}

      {hasDeposit && source !== 'walk-in' && onChangeRequireDeposit ? (
        <StaffRequireChargeCheckbox
          checked={requireDeposit}
          onChange={onChangeRequireDeposit}
          chargeLabel={visitCharge.chargeLabel}
          amountPence={visitCharge.amountPence}
        />
      ) : null}

      {complianceError ? (
        <View style={[styles.complianceBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="bodySmall" tone="danger">
            {complianceError}
          </Text>
          {isAdmin && !isMultiService ? (
            <Button
              label="Book anyway (admin override)"
              variant="secondary"
              fullWidth
              onPress={() => handleConfirm(true)}
              loading={createBooking.isPending}
            />
          ) : (
            <Text variant="caption" tone="muted">
              {isMultiService
                ? 'Collect the required record or send the form, then create the visit.'
                : 'Ask an admin to override, or collect the required record or send the form first.'}
            </Text>
          )}
        </View>
      ) : null}

      {submitError ? (
        <Text variant="bodySmall" tone="danger">
          {submitError}
        </Text>
      ) : null}

      <Button
        label={isMultiService ? 'Create visit' : 'Create booking'}
        fullWidth
        loading={createBooking.isPending || createMultiService.isPending}
        onPress={() => handleConfirm()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContainer: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  confirmationContainer: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  confirmationHeader: {
    gap: spacing.xs,
  },
  confirmationActions: {
    gap: spacing.md,
  },
  serviceHeader: {
    gap: 2,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.base,
    marginBottom: spacing.sm,
  },
  rowLabel: {
    flexShrink: 0,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  addonsBlock: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addonLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  depositNotice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  cancellationNote: {
    marginTop: spacing.sm,
  },
  complianceBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.md,
  },
});

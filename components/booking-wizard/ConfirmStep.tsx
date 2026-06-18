import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  buildMultiServicePayload,
  chainTotalMinutes,
  chainTotalPence,
  type MultiServiceSegment,
} from '@/lib/booking/multi-service-chain';
import { formatPence } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { normalizePhone } from '@/lib/phone/normalize';
import { useCreateBooking } from '@/lib/queries/useCreateBooking';
import { useCreateMultiServiceBooking } from '@/lib/queries/useCreateMultiServiceBooking';
import { fonts, radius, spacing } from '@/theme/index';
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
  cancellation_notice_hours?: number;
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
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
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

        {confirmation.requires_deposit && confirmation.deposit_amount_pence != null && confirmation.deposit_amount_pence > 0 ? (
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
  const hasDeposit = baseDeposit != null && baseDeposit > 0;
  const depositLabel = hasDeposit ? formatMoney(baseDeposit!) : null;

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
    // never charge a deposit.
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
          cancellation_notice_hours: response.cancellation_notice_hours,
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
        {depositLabel ? (
          <View style={styles.depositRow}>
            <Text variant="caption" tone="muted">
              Deposit
            </Text>
            <Text variant="bodySmall">{depositLabel}</Text>
          </View>
        ) : null}
      </Card>
      <View style={styles.sourceBlock}>
        <Text variant="label" tone="secondary">
          Booking type
        </Text>
        <Text variant="bodyMedium">{source === 'walk-in' ? 'Walk-in' : 'Phone'}</Text>
        <Text variant="caption" tone="muted">
          {source === 'phone'
            ? 'The slot is re-checked when you book.'
            : 'Walk-ins can be booked outside normal hours.'}
        </Text>
      </View>

      {hasDeposit && source !== 'walk-in' && onChangeRequireDeposit ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: requireDeposit }}
          accessibilityLabel={`Require deposit ${depositLabel ?? ''}`}
          onPress={() => {
            hapticSelect();
            onChangeRequireDeposit(!requireDeposit);
          }}
          style={({ pressed }) => [
            styles.depositToggle,
            {
              backgroundColor: requireDeposit ? colors.surfaceRaised : colors.surface,
              borderColor: requireDeposit ? colors.brand : colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}>
          <View
            style={[
              styles.check,
              {
                borderColor: requireDeposit ? colors.brand : colors.borderStrong,
                backgroundColor: requireDeposit ? colors.brand : 'transparent',
              },
            ]}>
            {requireDeposit ? (
              <Text style={[styles.checkMark, { color: colors.onBrand }]}>✓</Text>
            ) : null}
          </View>
          <Text variant="bodyMedium" style={styles.depositToggleLabel}>
            Require deposit{depositLabel ? ` (${depositLabel})` : ''}
          </Text>
        </Pressable>
      ) : null}

      {complianceError ? (
        <View style={[styles.complianceBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text variant="bodySmall" tone="danger">
            {complianceError}
          </Text>
          <Button
            label="Book anyway (admin override)"
            variant="secondary"
            fullWidth
            onPress={() => handleConfirm(true)}
            loading={createBooking.isPending}
          />
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
    gap: spacing.lg,
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
    gap: spacing.xs,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    gap: 2,
    marginBottom: spacing.md,
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
  sourceBlock: {
    gap: spacing.sm,
  },
  depositToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  depositToggleLabel: {
    flex: 1,
    minWidth: 0,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    fontSize: 13,
    fontFamily: fonts.bold,
    lineHeight: 16,
  },
  complianceBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.md,
  },
});

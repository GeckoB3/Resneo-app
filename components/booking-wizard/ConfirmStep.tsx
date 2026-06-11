import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useCreateBooking } from '@/lib/queries/useCreateBooking';
import { splitGuestName } from '@/lib/validation/walk-in-guest';
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
  /** Phone bookings are slot-validated server-side; walk-ins skip the gate. */
  source: BookingSource;
  onChangeSource: (source: BookingSource) => void;
  ownerVenueId?: string | null;
  onSuccess: (bookingId: string) => void;
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
}: {
  confirmation: BookingConfirmation;
  onViewBooking: () => void;
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

      <Button label="View booking" fullWidth onPress={onViewBooking} />
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
  onChangeSource,
  ownerVenueId,
  onSuccess,
}: ConfirmStepProps) {
  const { colors } = useTheme();
  const createBooking = useCreateBooking();
  const { first_name, last_name } = splitGuestName(guest.name);
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
  const totalPrice = basePrice + addonsPrice;
  const totalDuration = baseDuration + addonsDuration;
  const depositLabel = baseDeposit && baseDeposit > 0 ? formatMoney(baseDeposit) : null;

  const buildPayload = (overrideCompliance?: boolean) => ({
    booking_date: date,
    booking_time: slot.start_time.slice(0, 5),
    party_size: 1,
    first_name,
    last_name,
    phone: guest.phone.trim(),
    email: guest.email.trim() || undefined,
    practitioner_id: practitionerId,
    appointment_service_id: service.serviceId,
    ...(variant ? { service_variant_id: variant.id } : {}),
    ...(addons.length ? { addons: addons.map((a) => ({ addon_id: a.id })) } : {}),
    ...(durationOverride != null ? { duration_minutes: durationOverride } : {}),
    ...(guest.dietary_notes ? { dietary_notes: guest.dietary_notes } : {}),
    ...(guest.occasion ? { occasion: guest.occasion } : {}),
    ...(guest.special_requests ? { special_requests: guest.special_requests } : {}),
    source,
    ...(ownerVenueId ? { owner_venue_id: ownerVenueId } : {}),
    ...(overrideCompliance ? { override_compliance: true } : {}),
  });

  const handleConfirm = (overrideCompliance?: boolean) => {
    setComplianceError(null);
    setSubmitError(null);
    createBooking.mutate(buildPayload(overrideCompliance), {
      onSuccess: (response) => {
        hapticSuccess();
        setConfirmation({
          booking_id: response.booking_id,
          payment_url: response.payment_url,
          requires_deposit: response.requires_deposit,
          deposit_amount_pence: response.deposit_amount_pence,
          cancellation_notice_hours: response.cancellation_notice_hours,
          service_name: `${service.serviceName}${variant ? ` · ${variant.name}` : ''}`,
          guest_name: guest.name.trim(),
          date_label: formatSummaryDate(date),
          time_label: formatSummaryTime(slot.start_time),
          practitioner_name: practitionerName ?? '',
        });
      },
      onError: (error) => {
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
      },
    });
  };

  // Show inline confirmation once booking is created.
  if (confirmation) {
    return (
      <BookingConfirmationView
        confirmation={confirmation}
        onViewBooking={() => onSuccess(confirmation.booking_id)}
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
            {service.serviceName}
            {variant ? ` · ${variant.name}` : ''}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {totalDuration} min · {practitionerName}
          </Text>
        </View>
        <SummaryRow label="Date" value={formatSummaryDate(date)} />
        <SummaryRow label="Time" value={formatSummaryTime(slot.start_time)} />
        <SummaryRow label="Guest" value={guest.name.trim()} />
        <SummaryRow label="Phone" value={guest.phone.trim()} />
        {guest.email.trim() ? <SummaryRow label="Email" value={guest.email.trim()} /> : null}
        {guest.occasion ? <SummaryRow label="Occasion" value={guest.occasion} /> : null}
        {guest.dietary_notes ? (
          <SummaryRow label="Dietary notes" value={guest.dietary_notes} />
        ) : null}
        {guest.special_requests ? (
          <SummaryRow label="Requests" value={guest.special_requests} />
        ) : null}

        {addons.length > 0 ? (
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
        <Segmented
          options={[
            { value: 'phone', label: 'Phone' },
            { value: 'walk-in', label: 'Walk-in' },
          ]}
          value={source}
          onChange={onChangeSource}
        />
        <Text variant="caption" tone="muted">
          {source === 'phone'
            ? 'The slot is re-checked when you book.'
            : 'Walk-ins can be booked outside normal hours.'}
        </Text>
      </View>

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
        label="Create booking"
        fullWidth
        loading={createBooking.isPending}
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
  complianceBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.md,
  },
});

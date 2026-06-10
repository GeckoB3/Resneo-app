import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
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

  const handleConfirm = () => {
    createBooking.mutate(
      {
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
        source,
        ...(ownerVenueId ? { owner_venue_id: ownerVenueId } : {}),
      },
      {
        onSuccess: (response) => {
          hapticSuccess();
          if (response.payment_url) {
            Alert.alert('Booking created', 'A deposit payment link was sent to the guest.');
          }
          onSuccess(response.booking_id);
        },
        onError: (error) => {
          const message = error instanceof ApiError ? error.message : 'Could not create booking';
          Alert.alert('Booking failed', message);
        },
      },
    );
  };

  return (
    <View style={styles.container}>
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

      <Button
        label="Create booking"
        fullWidth
        loading={createBooking.isPending}
        onPress={handleConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
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
  sourceBlock: {
    gap: spacing.sm,
  },
});

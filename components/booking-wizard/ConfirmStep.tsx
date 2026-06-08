import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { hapticSuccess } from '@/lib/haptics';
import { useCreateBooking } from '@/lib/queries/useCreateBooking';
import { splitGuestName } from '@/lib/validation/walk-in-guest';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { AppointmentSlot } from '@/types/appointment-availability';
import type { AppointmentServiceOption } from '@/types/appointment-catalog';

import type { GuestDetails } from './GuestDetailsStep';

type ConfirmStepProps = {
  service: AppointmentServiceOption;
  date: string;
  slot: AppointmentSlot;
  guest: GuestDetails;
  ownerVenueId?: string | null;
  onSuccess: (bookingId: string) => void;
};

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
export function ConfirmStep({ service, date, slot, guest, ownerVenueId, onSuccess }: ConfirmStepProps) {
  const { colors } = useTheme();
  const createBooking = useCreateBooking();
  const { first_name, last_name } = splitGuestName(guest.name);

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
        practitioner_id: service.practitionerId,
        appointment_service_id: service.serviceId,
        source: 'walk-in',
        ...(ownerVenueId ? { owner_venue_id: ownerVenueId } : {}),
      },
      {
        onSuccess: (response) => {
          hapticSuccess();
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
          <Text variant="subheading">{service.serviceName}</Text>
          <Text variant="bodySmall" tone="muted">
            {service.durationMinutes} min · {service.practitionerName}
          </Text>
        </View>
        <SummaryRow label="Date" value={formatSummaryDate(date)} />
        <SummaryRow label="Time" value={formatSummaryTime(slot.start_time)} />
        <SummaryRow label="Guest" value={guest.name.trim()} />
        <SummaryRow label="Phone" value={guest.phone.trim()} />
        {guest.email.trim() ? <SummaryRow label="Email" value={guest.email.trim()} /> : null}
      </Card>
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
});

import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { bookingDetailActions } from '@/lib/booking/booking-status-actions';
import {
  bookingModelShortLabel,
  isTableReservationBooking,
} from '@/lib/booking/infer-booking-row-model';
import { partySizeLabel } from '@/lib/booking/terminology';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';

type BookingDetailContentProps = {
  booking: BookingDetail;
  isAppointmentVenue?: boolean;
  onStatusChange: (status: BookingStatus) => void;
  actionLoading?: boolean;
};

const TERMINAL_STATUSES = new Set<BookingStatus>(['Cancelled', 'Completed', 'No-Show']);

function formatGuestName(booking: BookingDetail): string {
  const guest = booking.guest;
  if (guest) {
    const parts = [guest.first_name, guest.last_name].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }
  }
  return 'Guest';
}

function formatBookingWhen(date: string, time: string, endTime?: string | null): string {
  try {
    const parsed = parseISO(`${date}T${time.slice(0, 5)}:00`);
    const start = format(parsed, 'EEEE d MMMM · HH:mm');
    if (endTime?.trim()) {
      return `${start} – ${endTime.slice(0, 5)}`;
    }
    return start;
  } catch {
    return `${date} · ${time.slice(0, 5)}`;
  }
}

function formatDeposit(depositPence: number | null | undefined): string | null {
  if (depositPence == null || depositPence <= 0) {
    return null;
  }
  return `£${(depositPence / 100).toFixed(2)}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function NoteBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) {
    return null;
  }
  return (
    <View style={styles.noteBlock}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="bodySmall">{value}</Text>
    </View>
  );
}

export function BookingDetailContent({
  booking,
  isAppointmentVenue = false,
  onStatusChange,
  actionLoading = false,
}: BookingDetailContentProps) {
  const { colors } = useTheme();
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);

  const guestName = formatGuestName(booking);
  const isTable = isTableReservationBooking(booking);
  const actions = bookingDetailActions(booking.status, isTable);
  const depositLabel = formatDeposit(booking.deposit_amount_pence);
  const tableNames = (booking.table_assignments ?? []).map((t) => t.name).join(', ');
  const modelLabel = booking.inferred_booking_model
    ? bookingModelShortLabel(booking.inferred_booking_model)
    : null;
  const visitCount = booking.guest?.visit_count ?? 0;
  const partyLabel = partySizeLabel(booking.party_size, {
    isAppointment: isAppointmentVenue,
    isTableReservation: isTable,
  });
  const canReschedule = !TERMINAL_STATUSES.has(booking.status);

  const hasNotes =
    !!booking.special_requests?.trim() ||
    !!booking.dietary_notes?.trim() ||
    !!booking.internal_notes?.trim() ||
    !!booking.guest?.customer_profile_notes?.trim();

  const handleActionPress = (target: BookingStatus, label: string, destructive?: boolean) => {
    if (destructive) {
      Alert.alert(label, `Mark this booking as ${label.toLowerCase()}?`, [
        { text: 'Keep booking', style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => onStatusChange(target) },
      ]);
      return;
    }
    onStatusChange(target);
  };

  return (
    <View style={styles.container}>
      {/* Guest header */}
      <Card>
        <View style={styles.headerRow}>
          <Avatar name={guestName} size={48} />
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text variant="subheading" style={styles.guestName} numberOfLines={1}>
                {guestName}
              </Text>
              <StatusPill status={booking.status} />
            </View>
            {booking.guest?.phone ? (
              <Text variant="bodySmall" tone="secondary">
                {booking.guest.phone}
              </Text>
            ) : null}
            {booking.guest?.email ? (
              <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
                {booking.guest.email}
              </Text>
            ) : null}
            {visitCount > 0 ? (
              <Text variant="caption" tone="muted">
                {visitCount} previous visit{visitCount === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* When + details */}
      <Card>
        <Text variant="overline" tone="muted">
          {isAppointmentVenue ? 'Appointment' : 'Booking'}
        </Text>
        <Text variant="subheading" style={styles.when}>
          {formatBookingWhen(booking.booking_date, booking.booking_time, booking.booking_end_time)}
        </Text>
        <View style={[styles.details, { borderTopColor: colors.border }]}>
          <DetailRow label="Party" value={partyLabel} />
          {booking.service_variant_name ? (
            <DetailRow label="Service" value={booking.service_variant_name} />
          ) : null}
          {modelLabel ? <DetailRow label="Type" value={modelLabel} /> : null}
          {booking.area_name ? <DetailRow label="Area" value={booking.area_name} /> : null}
          {tableNames ? <DetailRow label="Table" value={tableNames} /> : null}
          {depositLabel ? (
            <DetailRow
              label="Deposit"
              value={`${depositLabel}${booking.deposit_status ? ` · ${booking.deposit_status}` : ''}`}
            />
          ) : null}
        </View>
      </Card>

      {/* Notes */}
      <Card>
        <Text variant="label">Notes</Text>
        {hasNotes ? (
          <View style={styles.notes}>
            <NoteBlock label="Special requests" value={booking.special_requests} />
            <NoteBlock label="Dietary" value={booking.dietary_notes} />
            <NoteBlock label="Internal" value={booking.internal_notes} />
            <NoteBlock label="Guest profile" value={booking.guest?.customer_profile_notes} />
          </View>
        ) : (
          <Text variant="bodySmall" tone="muted" style={styles.notes}>
            No notes for this booking.
          </Text>
        )}
      </Card>

      {/* Actions */}
      <View style={styles.actions}>
        {actions.map((action) => (
          <Button
            key={`${action.target}-${action.label}`}
            label={action.label}
            fullWidth
            loading={actionLoading}
            onPress={() => handleActionPress(action.target, action.label, action.destructive)}
            variant={action.variant === 'primary' ? 'primary' : action.variant === 'danger' ? 'danger' : 'secondary'}
          />
        ))}
        {canReschedule ? (
          <Button
            label="Reschedule"
            variant="secondary"
            fullWidth
            onPress={() =>
              setRescheduleTarget({
                id: booking.id,
                guestName,
                date: booking.booking_date,
                time: booking.booking_time,
              })
            }
          />
        ) : null}
      </View>

      <RescheduleSheet target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  guestName: {
    flex: 1,
  },
  when: {
    marginTop: spacing.xs,
  },
  details: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.base,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  notes: {
    marginTop: spacing.sm,
  },
  noteBlock: {
    gap: 2,
    marginBottom: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

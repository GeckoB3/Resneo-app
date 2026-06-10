import { format, parseISO } from 'date-fns';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DepositSheet, type DepositTarget } from '@/components/bookings/DepositSheet';
import { EditBookingSheet, type EditBookingTarget } from '@/components/bookings/EditBookingSheet';
import { GuestMessageSheet, type GuestMessageTarget } from '@/components/messaging/GuestMessageSheet';
import { RescheduleSheet, type RescheduleTarget } from '@/components/calendar/RescheduleSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { bookingDetailActions } from '@/lib/booking/booking-status-actions';
import {
  bookingTimelineEventsForDisplay,
  formatTimelineEventTime,
} from '@/lib/booking/booking-timeline';
import {
  bookingModelShortLabel,
  isTableReservationBooking,
} from '@/lib/booking/infer-booking-row-model';
import { partySizeLabel } from '@/lib/booking/terminology';
import { formatPence, formatPositivePence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useResendConfirmation,
  useSendBookingMessage,
  useSetBookingAttendance,
} from '@/lib/queries/useBookingMutations';
import { useGuestDetail } from '@/lib/queries/useGuestDetail';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingDetail, BookingStatus } from '@/types/booking-detail';

type BookingDetailContentProps = {
  booking: BookingDetail;
  isAppointmentVenue?: boolean;
  /** Gates admin-only actions (e.g. deposit refunds). */
  isAdmin?: boolean;
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

const formatDeposit = formatPositivePence;

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

/** Other visits for this guest — loaded lazily on first expand. */
function GuestHistoryCard({
  guestId,
  currentBookingId,
}: {
  guestId: string;
  currentBookingId: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const detail = useGuestDetail(expanded ? guestId : null, { bookingHistoryLimit: 10 });

  const history = (detail.data?.booking_history ?? [])
    .filter((row) => row.id !== currentBookingId)
    .slice(0, 5);

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Guest history"
        onPress={() => setExpanded((cur) => !cur)}
        style={styles.cardHeaderRow}>
        <Text variant="label">Guest history</Text>
        <Text variant="title" tone="muted">
          {expanded ? '▾' : '›'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.historyBody}>
          {detail.isLoading ? (
            <Text variant="bodySmall" tone="muted">
              Loading…
            </Text>
          ) : history.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              No other bookings for this guest.
            </Text>
          ) : (
            history.map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPress={() => router.push(`/booking/${row.id}` as Href)}
                style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                <View style={styles.historyText}>
                  <Text variant="bodySmall" numberOfLines={1}>
                    {row.detail_label || row.kind_label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {row.booking_date}
                    {row.booking_time ? ` · ${row.booking_time.slice(0, 5)}` : ''}
                  </Text>
                </View>
                <StatusPill status={row.status} />
              </Pressable>
            ))
          )}
          <Button
            label="View contact"
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/client/${guestId}` as Href)}
          />
        </View>
      ) : null}
    </Card>
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
  isAdmin = false,
  onStatusChange,
  actionLoading = false,
}: BookingDetailContentProps) {
  const { colors } = useTheme();
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null);
  const [messageTarget, setMessageTarget] = useState<GuestMessageTarget | null>(null);
  const [depositTarget, setDepositTarget] = useState<DepositTarget | null>(null);
  const [editTarget, setEditTarget] = useState<EditBookingTarget | null>(null);
  const resend = useResendConfirmation(booking.id);
  const sendMessage = useSendBookingMessage(booking.id);
  const attendance = useSetBookingAttendance(booking.id);

  const openEdit = () =>
    setEditTarget({
      id: booking.id,
      guestFirstName: booking.guest?.first_name ?? '',
      guestLastName: booking.guest?.last_name ?? '',
      guestPhone: booking.guest?.phone ?? '',
      guestEmail: booking.guest?.email ?? '',
      specialRequests: booking.special_requests ?? '',
      dietaryNotes: booking.dietary_notes ?? '',
      occasion: booking.occasion ?? '',
      internalNotes: booking.internal_notes ?? '',
    });

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

  const primaryAction = actions.find((a) => a.kind === 'primary');
  const revertAction = actions.find((a) => a.kind === 'revert');
  const destructiveActions = actions.filter((a) => a.kind === 'destructive');
  const timelineEvents = bookingTimelineEventsForDisplay(booking.events ?? []);

  const guestEmail = booking.guest?.email?.trim();
  const guestPhone = booking.guest?.phone?.trim();
  const canMessage = !!guestEmail || !!guestPhone;
  const canResend = !!guestEmail;
  const hasDeposit = booking.deposit_amount_pence != null;
  const showManage = canMessage || canResend || hasDeposit;

  // Add-on snapshots + price breakdown (variant/base price + add-ons).
  const addons = booking.addons ?? [];
  const addonsTotal =
    booking.addons_total_price_pence ??
    addons.reduce((sum, addon) => sum + addon.price_pence_at_booking, 0);
  const basePrice = booking.service_variant_price_pence ?? null;
  const totalPrice = basePrice != null ? basePrice + addonsTotal : addons.length ? addonsTotal : null;

  // Attendance — mirrors the web pills/actions.
  const guestConfirmed = !!booking.guest_attendance_confirmed_at;
  const staffConfirmed = !!booking.staff_attendance_confirmed_at;
  const arrived = !!booking.client_arrived_at;
  const attendanceRelevant = !TERMINAL_STATUSES.has(booking.status) || booking.status === 'Completed';

  const toggleAttendance = (field: 'staff_attendance_confirmed' | 'client_arrived', next: boolean) => {
    attendance.mutate(
      { [field]: next },
      {
        onSuccess: () => hapticSuccess(),
        onError: (error) => {
          hapticWarning();
          Alert.alert(
            'Could not update',
            error instanceof ApiError ? error.message : 'Please try again.',
          );
        },
      },
    );
  };

  const handleResend = () => {
    Alert.alert('Resend confirmation', 'Re-send the booking confirmation to the guest?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resend',
        onPress: () =>
          resend.mutate(undefined, {
            onSuccess: () => {
              hapticSuccess();
              Alert.alert('Confirmation resent');
            },
            onError: (error) => {
              hapticWarning();
              Alert.alert(
                'Could not resend',
                error instanceof ApiError ? error.message : 'Please try again.',
              );
            },
          }),
      },
    ]);
  };

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

        {addons.length > 0 ? (
          <View style={[styles.details, { borderTopColor: colors.border }]}>
            <Text variant="caption" tone="muted">
              Add-ons
            </Text>
            {addons.map((addon, index) => (
              <View key={addon.id ?? `${addon.addon_id}-${index}`} style={styles.detailRow}>
                <Text variant="bodySmall" numberOfLines={1} style={styles.addonName}>
                  {addon.addon_name_snapshot}
                  {addon.duration_minutes_at_booking > 0
                    ? ` (+${addon.duration_minutes_at_booking}m)`
                    : ''}
                </Text>
                <Text variant="bodySmall" tone="secondary">
                  {addon.price_pence_at_booking > 0
                    ? `+${formatPence(addon.price_pence_at_booking)}`
                    : 'Free'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {totalPrice != null && totalPrice > 0 ? (
          <View style={[styles.details, { borderTopColor: colors.border }]}>
            <View style={styles.detailRow}>
              <Text variant="label">Total</Text>
              <Text variant="label" tone="brand">
                {formatPence(totalPrice)}
              </Text>
            </View>
          </View>
        ) : null}

        {attendanceRelevant && (guestConfirmed || staffConfirmed || arrived) ? (
          <View style={styles.attendancePills}>
            {guestConfirmed ? <Badge label="Guest confirmed" tone="success" /> : null}
            {staffConfirmed ? <Badge label="Staff confirmed" tone="success" /> : null}
            {arrived ? <Badge label="Arrived" tone="accent" /> : null}
          </View>
        ) : null}
      </Card>

      {/* Notes */}
      <Card>
        <View style={styles.cardHeaderRow}>
          <Text variant="label">Notes</Text>
          <Button label="Edit" variant="ghost" size="sm" onPress={openEdit} />
        </View>
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

      {/* Guest history — other visits, lazy-loaded */}
      {booking.guest_id ? (
        <GuestHistoryCard guestId={booking.guest_id} currentBookingId={booking.id} />
      ) : null}

      {/* Activity timeline */}
      {timelineEvents.length > 0 ? (
        <Card>
          <Text variant="label">Activity</Text>
          <View style={styles.timeline}>
            {timelineEvents.map((event) => (
              <View key={event.id} style={styles.timelineRow}>
                <View style={styles.timelineMarker}>
                  <View style={[styles.timelineDot, { backgroundColor: colors.accent }]} />
                </View>
                <View style={styles.timelineBody}>
                  <Text variant="bodySmall">{event.title}</Text>
                  {event.detail ? (
                    <Text variant="caption" tone="muted">
                      {event.detail}
                    </Text>
                  ) : null}
                  <Text variant="caption" tone="muted">
                    {formatTimelineEventTime(event.created_at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* Actions — primary forward, reschedule, undo, then destructive */}
      <View style={styles.actions}>
        {primaryAction ? (
          <Button
            label={primaryAction.label}
            variant="primary"
            fullWidth
            loading={actionLoading}
            onPress={() => handleActionPress(primaryAction.target, primaryAction.label)}
          />
        ) : null}
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
        {revertAction ? (
          <Button
            label={revertAction.label}
            variant="ghost"
            fullWidth
            loading={actionLoading}
            onPress={() => handleActionPress(revertAction.target, revertAction.label)}
          />
        ) : null}
        {destructiveActions.map((action) => (
          <Button
            key={`${action.target}-${action.label}`}
            label={action.label}
            variant="danger"
            fullWidth
            loading={actionLoading}
            onPress={() => handleActionPress(action.target, action.label, action.destructive)}
          />
        ))}
      </View>

      {/* Manage — attendance, guest communications + deposit */}
      {showManage || attendanceRelevant ? (
        <Card>
          <Text variant="label">Manage</Text>
          <View style={styles.manage}>
            {attendanceRelevant && booking.status !== 'Completed' ? (
              <View style={styles.attendanceRow}>
                <Button
                  label={staffConfirmed ? 'Unconfirm attendance' : 'Confirm attendance'}
                  variant="secondary"
                  size="sm"
                  style={styles.attendanceBtn}
                  loading={attendance.isPending}
                  onPress={() => toggleAttendance('staff_attendance_confirmed', !staffConfirmed)}
                />
                <Button
                  label={arrived ? 'Undo arrived' : 'Mark arrived'}
                  variant="secondary"
                  size="sm"
                  style={styles.attendanceBtn}
                  loading={attendance.isPending}
                  onPress={() => toggleAttendance('client_arrived', !arrived)}
                />
              </View>
            ) : null}
            {canMessage ? (
              <Button
                label="Message guest"
                variant="secondary"
                fullWidth
                onPress={() =>
                  setMessageTarget({
                    id: booking.id,
                    guestName,
                    email: booking.guest?.email,
                    phone: booking.guest?.phone,
                  })
                }
              />
            ) : null}
            {canResend ? (
              <Button
                label="Resend confirmation"
                variant="secondary"
                fullWidth
                loading={resend.isPending}
                onPress={handleResend}
              />
            ) : null}
            {hasDeposit ? (
              <Button
                label="Deposit"
                variant="secondary"
                fullWidth
                onPress={() =>
                  setDepositTarget({
                    id: booking.id,
                    guestName,
                    amountPence: booking.deposit_amount_pence,
                    status: booking.deposit_status,
                    canRefund: isAdmin,
                  })
                }
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      <RescheduleSheet target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} />
      <GuestMessageSheet
        target={messageTarget}
        onSend={(input) => sendMessage.mutateAsync(input)}
        sending={sendMessage.isPending}
        onClose={() => setMessageTarget(null)}
      />
      <DepositSheet target={depositTarget} onClose={() => setDepositTarget(null)} />
      <EditBookingSheet target={editTarget} onClose={() => setEditTarget(null)} />
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
  timeline: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timelineMarker: {
    width: 12,
    alignItems: 'center',
    paddingTop: 4,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineBody: {
    flex: 1,
    gap: 1,
  },
  manage: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addonName: {
    flex: 1,
    minWidth: 0,
  },
  attendancePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  attendanceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  attendanceBtn: {
    flex: 1,
  },
  historyBody: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});

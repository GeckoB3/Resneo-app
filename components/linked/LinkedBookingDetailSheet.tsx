import { format, parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { MetaChip } from '@/components/ui/MetaChip';
import { QuickAction } from '@/components/ui/QuickAction';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { ApiError } from '@/lib/api/client';
import { hapticSelect } from '@/lib/haptics';
import { LinkedComplianceSection } from '@/components/linked/LinkedComplianceSection';
import { linkedBookingLabel } from '@/lib/linked/linked-calendar-view';
import { pingLinkedBookingView, useUpdateLinkedBooking } from '@/lib/queries/useLinkedCalendar';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useToast } from '@/providers/ToastProvider';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type {
  LinkedBooking,
  LinkedBookingStatus,
  LinkedVenueCalendar,
} from '@/types/linked-venues';

const BOOKING_STATUSES: LinkedBookingStatus[] = [
  'Pending',
  'Booked',
  'Confirmed',
  'Seated',
  'Completed',
  'No-Show',
  'Cancelled',
];

/** "Seated" is restaurant wording — appointment venues display "Started". */
const STATUS_LABEL: Record<string, string> = { Seated: 'Started' };

function fmtTime(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

function dateLabelFor(date: string, time: string): string {
  try {
    return format(parseISO(`${date}T${fmtTime(time)}:00`), 'EEEE d MMMM');
  } catch {
    return date;
  }
}

/** One label/value row in a detail card. */
function DetailRow({
  label,
  value,
  isFirst = false,
}: {
  label: string;
  value: React.ReactNode;
  isFirst?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.detailRow,
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
      ]}>
      <Text variant="bodySmall" tone="muted">
        {label}
      </Text>
      <View style={styles.detailValue}>{value}</View>
    </View>
  );
}

/**
 * The expanded detail for a LINKED venue's booking — a rich, grant-gated panel
 * that mirrors the web (which reuses its own booking detail for linked bookings):
 * an identity hero, the appointment at a glance, contact quick-actions, guest +
 * internal notes, and inline management (status, reschedule, note, cancel) when
 * the link grants it. Read-only links show the same detail without the controls.
 *
 *  · `time_only`           → busy/free only; no client or service detail.
 *  · `full_details`+`none` → full read-only detail (contact actions still work).
 *  · `edit_existing`       → can change status / reschedule / add a note.
 *  · `create_edit_cancel`  → the above plus Cancel booking.
 *
 * All writes go through the dedicated cross-venue endpoint (audited for both
 * venues). Fires the `viewed_booking` audit ping on open.
 */
export function LinkedBookingDetailSheet({
  venue,
  booking,
  visible,
  onClose,
  onSaved,
}: {
  venue: LinkedVenueCalendar | null;
  booking: LinkedBooking | null;
  visible: boolean;
  onClose: () => void;
  /** Called after a successful edit/cancel so the host can refetch. */
  onSaved?: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const accessToken = useAccessToken();
  const update = useUpdateLinkedBooking();

  const [date, setDate] = useState('');
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [status, setStatus] = useState<string>('Pending');
  const [note, setNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const bookingId = booking?.id;

  // Seed the editable fields from the booking on open + fire the view ping.
  useEffect(() => {
    if (!visible || !booking) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed form when sheet opens
    setDate(booking.bookingDate);
    setTimeMinutes(timeToMinutes(fmtTime(booking.bookingTime)));
    setStatus(booking.status);
    setNote('');
    setCancelOpen(false);
    pingLinkedBookingView(booking.id, accessToken);
  }, [visible, bookingId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeOnly = venue?.visibility === 'time_only';
  const action = venue?.action ?? 'none';
  const canEdit =
    !timeOnly &&
    (action === 'edit_existing' || action === 'create_edit_cancel') &&
    !!booking?.editable &&
    booking?.status !== 'Cancelled';
  const canCancel = action === 'create_edit_cancel' && booking?.status !== 'Cancelled';

  const time = minutesToTime(timeMinutes);

  const hasChanges = useMemo(() => {
    if (!booking) return false;
    return (
      date !== booking.bookingDate ||
      time !== fmtTime(booking.bookingTime) ||
      status !== booking.status ||
      note.trim() !== ''
    );
  }, [booking, date, time, status, note]);

  // edit_existing can set any non-Cancelled status (keeping the current one even
  // if it's already Cancelled); create_edit_cancel can also set Cancelled.
  const statusOptions = BOOKING_STATUSES.filter(
    (s) => canCancel || s !== 'Cancelled' || s === booking?.status,
  );

  if (!booking || !venue) return null;

  const venueName = venue.venueName;
  const title = timeOnly ? 'Busy' : linkedBookingLabel(booking);
  const practitionerName =
    venue.practitioners.find((p) => p.id === booking.practitionerId)?.name ?? null;
  const guestPhone = booking.guestPhone?.trim() || null;
  const guestEmail = booking.guestEmail?.trim() || null;
  const timeRange = booking.bookingEndTime
    ? `${fmtTime(booking.bookingTime)}–${fmtTime(booking.bookingEndTime)}`
    : fmtTime(booking.bookingTime);
  const durationMinutes = booking.bookingEndTime
    ? timeToMinutes(fmtTime(booking.bookingEndTime)) - timeToMinutes(fmtTime(booking.bookingTime))
    : null;
  const serviceLabel = booking.serviceName?.trim() || null;
  // Without the PII grant the heading already shows the service, so only the
  // practitioner is left to add here.
  const serviceLine = [serviceLabel === title ? null : serviceLabel, practitionerName]
    .filter(Boolean)
    .join(' · ');

  const save = (overrideStatus?: string) => {
    const changes: Record<string, unknown> = {};
    if (date !== booking.bookingDate) changes.booking_date = date;
    if (time !== fmtTime(booking.bookingTime)) changes.booking_time = time;
    const finalStatus = overrideStatus ?? status;
    if (finalStatus !== booking.status) changes.status = finalStatus;
    if (note.trim()) changes.special_requests = note.trim();
    if (Object.keys(changes).length === 0) {
      toast.error('Make a change before saving.');
      return;
    }
    update.mutate(
      { bookingId: booking.id, changes: changes as never },
      {
        onSuccess: () => {
          toast.success(overrideStatus === 'Cancelled' ? 'Booking cancelled.' : 'Changes saved.');
          setCancelOpen(false);
          onSaved?.();
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to save changes.'),
      },
    );
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose} maxHeight="92%">
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Hero — identity, then the appointment at a glance, then contact */}
          <Card padded={false} style={styles.hero}>
            <View style={[styles.heroAccent, { backgroundColor: colors.warning }]} />
            <View style={styles.heroInner}>
              <View style={styles.headerRow}>
                <Avatar name={title} size={48} />
                <View style={styles.headerText}>
                  <Text variant="heading" numberOfLines={1}>
                    {title}
                  </Text>
                  <View style={styles.chipRow}>
                    <Badge label={`Linked · ${venueName}`} tone="warning" />
                    {!timeOnly && !canEdit ? (
                      <View style={styles.lockRow}>
                        <SymbolView
                          name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
                          tintColor={colors.textMuted}
                          size={11}
                        />
                        <Text variant="caption" tone="muted">
                          View only
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <StatusPill status={booking.status} />
              </View>

              <View style={[styles.heroBlock, { borderTopColor: colors.border }]}>
                <Text variant="overline" tone="muted">
                  {dateLabelFor(booking.bookingDate, booking.bookingTime)}
                </Text>
                <Text variant="title" style={styles.heroTime}>
                  {timeRange}
                </Text>
                {!timeOnly && serviceLine ? (
                  <Text variant="bodyMedium" tone="secondary">
                    {serviceLine}
                  </Text>
                ) : null}
                <View style={styles.metaRow}>
                  {durationMinutes != null && durationMinutes > 0 ? (
                    <MetaChip
                      icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                      label={`${durationMinutes} min`}
                    />
                  ) : null}
                  {!timeOnly && typeof booking.partySize === 'number' ? (
                    <MetaChip
                      icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
                      label={`${booking.partySize}`}
                    />
                  ) : null}
                  {!timeOnly && booking.depositStatus ? (
                    <MetaChip
                      icon={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }}
                      label={`Deposit: ${booking.depositStatus}`}
                    />
                  ) : null}
                </View>
              </View>

              {!timeOnly && (guestPhone || guestEmail) ? (
                <View style={[styles.heroBlock, { borderTopColor: colors.border }]}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickActions}>
                    {guestPhone ? (
                      <QuickAction
                        icon={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                        label="Call"
                        onPress={() => void Linking.openURL(`tel:${guestPhone.replace(/\s+/g, '')}`)}
                      />
                    ) : null}
                    {guestPhone ? (
                      <QuickAction
                        icon={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
                        label="Text"
                        onPress={() => void Linking.openURL(`sms:${guestPhone.replace(/\s+/g, '')}`)}
                      />
                    ) : null}
                    {guestEmail ? (
                      <QuickAction
                        icon={{ ios: 'envelope.fill', android: 'mail', web: 'mail' }}
                        label="Email"
                        onPress={() => void Linking.openURL(`mailto:${guestEmail}`)}
                      />
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          </Card>

          {timeOnly ? (
            <View style={[styles.notice, { backgroundColor: colors.surface }]}>
              <Text variant="caption" tone="muted">
                {`${venueName} shares time blocks only. Client and service detail are not visible on this link.`}
              </Text>
            </View>
          ) : (
            <>
              {/* Contact details (read) */}
              {guestPhone || guestEmail ? (
                <Card padded={false} style={styles.card}>
                  {guestPhone ? (
                    <DetailRow
                      label="Phone"
                      isFirst
                      value={<Text variant="bodySmall">{guestPhone}</Text>}
                    />
                  ) : null}
                  {guestEmail ? (
                    <DetailRow
                      label="Email"
                      isFirst={!guestPhone}
                      value={<Text variant="bodySmall">{guestEmail}</Text>}
                    />
                  ) : null}
                </Card>
              ) : null}

              {/* Notes (read) */}
              {booking.specialRequests?.trim() || booking.internalNotes?.trim() ? (
                <Card style={styles.notesCard}>
                  {booking.specialRequests?.trim() ? (
                    <View style={styles.notesBlock}>
                      <Text variant="overline" tone="muted">
                        Guest notes
                      </Text>
                      <Text variant="bodySmall">{booking.specialRequests}</Text>
                    </View>
                  ) : null}
                  {booking.internalNotes?.trim() ? (
                    <View style={styles.notesBlock}>
                      <Text variant="overline" tone="muted">
                        Internal notes
                      </Text>
                      <Text variant="bodySmall">{booking.internalNotes}</Text>
                    </View>
                  ) : null}
                </Card>
              ) : null}

              {/* Compliance, read through the link (web 2026-09-05): only when the
                  link shares full details and personal data, since a compliance
                  record is the most sensitive thing a guest row carries. The
                  route gates on the owner's plan and answers a note otherwise. */}
              {!timeOnly && venue?.pii && booking.guestId ? (
                <LinkedComplianceSection bookingId={booking.id} />
              ) : null}

              {/* Manage (editable links) */}
              {canEdit ? (
                <Card style={styles.manageCard}>
                  <Text variant="overline" tone="muted">
                    Manage booking
                  </Text>

                  <View style={styles.field}>
                    <Text variant="label" tone="secondary">
                      Status
                    </Text>
                    <View style={styles.statusWrap}>
                      {statusOptions.map((s) => (
                        <Button
                          key={s}
                          label={STATUS_LABEL[s] ?? s}
                          size="sm"
                          variant={s === status ? 'primary' : 'secondary'}
                          onPress={() => {
                            hapticSelect();
                            setStatus(s);
                          }}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.fieldRow}>
                    <Text variant="label" tone="secondary">
                      Date
                    </Text>
                    <DatePickerField value={date} onChange={setDate} accessibilityLabel="Booking date" />
                  </View>
                  <View style={styles.fieldRow}>
                    <Text variant="label" tone="secondary">
                      Time
                    </Text>
                    <TimePickerField
                      value={timeMinutes}
                      onChange={setTimeMinutes}
                      accessibilityLabel="Booking time"
                    />
                  </View>

                  <Input
                    label="Add a note"
                    optional
                    value={note}
                    onChangeText={setNote}
                    placeholder="Visible to both venues"
                    multiline
                    numberOfLines={2}
                    maxLength={2000}
                  />

                  <Button
                    label="Save changes"
                    variant="primary"
                    fullWidth
                    disabled={!hasChanges}
                    loading={update.isPending && !cancelOpen}
                    onPress={() => save()}
                  />
                  <Text variant="caption" tone="muted" style={styles.auditNote}>
                    Changes are recorded in the cross-venue audit log visible to both venues.
                  </Text>
                </Card>
              ) : (
                <View
                  style={[
                    styles.notice,
                    { backgroundColor: colors.infoSurface, borderColor: colors.info, borderWidth: 1 },
                  ]}>
                  <Text variant="caption" color={colors.info}>
                    {`Linked read-only access — contact ${venueName} or ask them to adjust link permissions if you need to make changes.`}
                  </Text>
                </View>
              )}

              {canCancel ? (
                <Button
                  label="Cancel booking"
                  variant="danger"
                  fullWidth
                  disabled={update.isPending}
                  onPress={() => setCancelOpen(true)}
                />
              ) : null}
            </>
          )}

          <Button label="Close" variant="secondary" fullWidth onPress={onClose} />
        </ScrollView>
      </Sheet>

      <ConfirmSheet
        visible={cancelOpen}
        title={`Cancel this booking in ${venueName}?`}
        message="The booking is set to Cancelled in the linked venue and recorded in the cross-venue audit log."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        destructive
        loading={update.isPending}
        onConfirm={() => save('Cancelled')}
        onClose={() => setCancelOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
    paddingBottom: spacing.base,
  },
  hero: {
    overflow: 'hidden',
  },
  heroAccent: {
    height: 4,
  },
  heroInner: {
    padding: spacing.base,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  heroTime: {
    fontVariant: ['tabular-nums'],
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  quickActions: {
    gap: spacing.lg,
    paddingVertical: spacing.xs,
  },
  card: {
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailValue: {
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  notesCard: {
    gap: spacing.md,
  },
  notesBlock: {
    gap: spacing.xs,
  },
  manageCard: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statusWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  auditNote: {
    marginTop: spacing.xs,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
});

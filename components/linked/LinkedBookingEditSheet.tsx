import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { minutesToTime, timeToMinutes } from '@/components/calendar/grid-layout';
import { ApiError } from '@/lib/api/client';
import { pingLinkedBookingView, useUpdateLinkedBooking } from '@/lib/queries/useLinkedCalendar';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { hapticSelect } from '@/lib/haptics';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { LinkedBooking, LinkedBookingStatus } from '@/types/linked-venues';

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

/**
 * Edit a linked-venue booking — date, time, status, optional note. Mirrors the
 * web `EditLinkedBookingModal`. "Cancel booking" is offered only when the link
 * grants `create_edit_cancel`; `edit_existing` can change everything else but
 * not cancel. Changes are recorded in the cross-venue audit log. Fires the
 * `viewed_booking` audit ping on open.
 */
export function LinkedBookingEditSheet({
  venueName,
  booking,
  canCancel,
  visible,
  onClose,
  onSaved,
}: {
  venueName: string;
  booking: LinkedBooking | null;
  /** True only when the link grants `create_edit_cancel` (§5.3). */
  canCancel: boolean;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const accessToken = useAccessToken();
  const update = useUpdateLinkedBooking();

  const [date, setDate] = useState('');
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [status, setStatus] = useState<string>('Pending');
  const [notes, setNotes] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);

  const bookingId = booking?.id;

  // Seed the form from the booking on open and fire the view ping. Seeding
  // local form state when the sheet (re)opens is the accepted pattern here.
  useEffect(() => {
    if (!visible || !booking) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed form when sheet opens
    setDate(booking.bookingDate);
    setTimeMinutes(timeToMinutes(fmtTime(booking.bookingTime)));
    setStatus(booking.status);
    setNotes('');
    pingLinkedBookingView(booking.id, accessToken);
  }, [visible, bookingId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const time = minutesToTime(timeMinutes);

  const hasChanges = useMemo(() => {
    if (!booking) return false;
    return (
      date !== booking.bookingDate ||
      time !== fmtTime(booking.bookingTime) ||
      status !== booking.status ||
      notes.trim() !== ''
    );
  }, [booking, date, time, status, notes]);

  // Cancelled bookings can't be re-cancelled; otherwise full management may set
  // any status. edit_existing keeps the current status (which may itself be
  // Cancelled if the owner already cancelled it) but can never choose Cancelled.
  const statusOptions = BOOKING_STATUSES.filter(
    (s) => canCancel || s !== 'Cancelled' || s === booking?.status,
  );

  if (!booking) return null;

  const save = (overrideStatus?: string) => {
    const changes: Record<string, unknown> = {};
    if (date !== booking.bookingDate) changes.booking_date = date;
    if (time !== fmtTime(booking.bookingTime)) changes.booking_time = time;
    const finalStatus = overrideStatus ?? status;
    if (finalStatus !== booking.status) changes.status = finalStatus;
    if (notes.trim()) changes.special_requests = notes.trim();
    if (Object.keys(changes).length === 0) {
      toast.error('Make a change before saving.');
      return;
    }
    update.mutate(
      { bookingId: booking.id, changes: changes as never },
      {
        onSuccess: () => {
          toast.success(
            overrideStatus === 'Cancelled' ? 'Booking cancelled.' : 'Changes saved.',
          );
          setCancelOpen(false);
          onSaved();
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : 'Failed to save changes.'),
      },
    );
  };

  return (
    <>
      <Sheet visible={visible} onClose={onClose}>
        <View style={styles.container}>
          <Text variant="subheading">{`Edit booking in ${venueName}`}</Text>
          <Text variant="bodySmall" tone="secondary">
            Changes are recorded in the cross-venue audit log visible to both venues.
          </Text>

          <View style={styles.fieldRow}>
            <Text variant="label" tone="secondary">
              Date
            </Text>
            <DatePickerField
              value={date}
              onChange={setDate}
              accessibilityLabel="Booking date"
            />
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

          <View style={styles.field}>
            <Text variant="label" tone="secondary">
              Status
            </Text>
            <View style={styles.statusWrap}>
              {statusOptions.map((s) => {
                const active = s === status;
                return (
                  <Button
                    key={s}
                    label={STATUS_LABEL[s] ?? s}
                    size="sm"
                    variant={active ? 'primary' : 'secondary'}
                    onPress={() => {
                      hapticSelect();
                      setStatus(s);
                    }}
                  />
                );
              })}
            </View>
          </View>

          <Input
            label="Add a note"
            optional
            value={notes}
            onChangeText={setNotes}
            placeholder="Visible to both venues"
            multiline
            numberOfLines={2}
            maxLength={2000}
          />

          <View style={styles.actions}>
            {canCancel ? (
              <Button
                label="Cancel booking"
                variant="danger"
                disabled={update.isPending || booking.status === 'Cancelled'}
                onPress={() => setCancelOpen(true)}
              />
            ) : (
              <View style={styles.spacer} />
            )}
            <View style={styles.actionsRight}>
              <Button
                label="Close"
                variant="secondary"
                disabled={update.isPending}
                onPress={onClose}
              />
              <Button
                label="Save changes"
                variant="primary"
                disabled={!hasChanges}
                loading={update.isPending && !cancelOpen}
                onPress={() => save()}
              />
            </View>
          </View>
        </View>
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
  container: {
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  actionsRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
});

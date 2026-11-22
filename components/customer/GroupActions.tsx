import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RescheduleSheet } from '@/components/customer/RescheduleSheet';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { useCustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import {
  groupCancelLines,
  useCancelGroup,
  type CustomerGroup,
  type CustomerGroupPerson,
} from '@/lib/queries/useCustomerGroup';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

type Props = {
  /** The row the screen was opened on, which may be a person the business has cancelled. */
  bookingId: string;
  group: CustomerGroup;
};

type CancelTarget = { kind: 'person'; person: CustomerGroupPerson } | { kind: 'everyone' };

function badgeOf(status: string): { label: string; tone: BadgeTone } {
  if (status === 'Cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (status === 'No-Show') return { label: 'Missed', tone: 'neutral' };
  if (status === 'Pending') return { label: 'Awaiting payment', tone: 'warning' };
  if (status === 'Confirmed') return { label: 'Confirmed', tone: 'success' };
  if (status === 'Completed') return { label: 'Completed', tone: 'neutral' };
  if (status === 'Seated') return { label: 'In progress', tone: 'brand' };
  return { label: 'Booked', tone: 'brand' };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * A group booking: several people booked together at one business (web QA 2026-11-21 PUBLIC-19).
 *
 * Every person is listed by name with their service, staff, time and status. Each person has their
 * own "Change" (the single-booking reschedule, for that person's appointment) and "Cancel" (that
 * person only; everyone else stays booked), and "Cancel everyone" shows when more than one person
 * can still be cancelled. Before a cancel the client reads what it does to that person's deposit
 * or card hold, in the server's words, as the web's `GuestGroupPanel` shows them.
 */
export function GroupActions({ bookingId, group }: Props) {
  const toast = useToast();
  const cancel = useCancelGroup(bookingId);
  const [target, setTarget] = useState<CancelTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; lines: string[] } | null>(null);
  const [changeId, setChangeId] = useState<string | null>(null);

  const live = group.state === 'live';
  const consequences =
    target?.kind === 'everyone' ? group.cancel_everyone.consequences : target ? target.person.cancel.consequences : [];

  const confirmCancel = () => {
    if (!target) return;
    setError(null);
    cancel.mutate(target.kind === 'everyone' ? { everyone: true } : { booking_ids: target.person.cancel.booking_ids }, {
      onSuccess: (result) => {
        setTarget(null);
        setNotice({ message: result.message, lines: groupCancelLines(result) });
        toast.success(result.message);
      },
      onError: (e) => setError(messageOf(e, 'We could not cancel. Please try again.')),
    });
  };

  return (
    <>
      {notice ? (
        <Card testID="group-notice">
          <Text variant="bodyMedium" accessibilityRole="alert">
            {notice.message}
          </Text>
          {notice.lines.map((line) => (
            <Text key={line} variant="bodySmall" tone="secondary" style={styles.gap}>
              {line}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card testID="group-card">
        <Text variant="overline" tone="secondary">
          YOUR GROUP BOOKING
        </Text>
        {!live ? (
          <Text variant="body" style={styles.gap}>
            Every appointment in this group is cancelled.
          </Text>
        ) : null}
        {group.people.map((person) => (
          <View key={person.label} style={styles.person} testID="group-person">
            <Text variant="bodyMedium">{person.label}</Text>
            {person.appointments.map((a) => {
              const badge = badgeOf(a.status);
              return (
                <View key={a.booking_id} style={styles.appointment}>
                  <View style={styles.appointmentText}>
                    <Text variant="body">{a.service_name}</Text>
                    <Text variant="bodySmall" tone="secondary">
                      {a.staff_name ? `with ${a.staff_name}, ` : ''}
                      {formatDayHeading(a.booking_date)}, {a.start_time} to {a.end_time}
                    </Text>
                  </View>
                  <Badge label={badge.label} tone={badge.tone} />
                </View>
              );
            })}
            {person.state === 'live' && person.change.available && person.change.booking_id ? (
              <Button
                label={`Change ${person.label}'s appointment`}
                variant="secondary"
                onPress={() => {
                  setNotice(null);
                  setChangeId(person.change.booking_id);
                }}
                style={styles.gap}
              />
            ) : person.state === 'live' && person.change.message ? (
              <Text variant="bodySmall" tone="secondary" style={styles.gap} testID="group-change-blocked">
                {person.change.message}
              </Text>
            ) : null}
            {person.state === 'live' && person.cancel.available ? (
              <Button
                label={`Cancel ${person.label}'s appointment`}
                variant="danger"
                onPress={() => {
                  setNotice(null);
                  setError(null);
                  setTarget({ kind: 'person', person });
                }}
                style={styles.gap}
              />
            ) : person.state === 'live' && person.cancel.message ? (
              <Text variant="bodySmall" tone="secondary" style={styles.gap}>
                {person.cancel.message}
              </Text>
            ) : null}
          </View>
        ))}
        {live && group.cancel_everyone.available ? (
          <Button
            label="Cancel everyone"
            variant="danger"
            onPress={() => {
              setNotice(null);
              setError(null);
              setTarget({ kind: 'everyone' });
            }}
            style={styles.gap}
          />
        ) : null}
      </Card>

      <Sheet visible={target !== null} onClose={() => setTarget(null)}>
        <View style={styles.sheet} testID="group-cancel-sheet">
          <Text variant="subheading">
            {target?.kind === 'everyone' ? 'Cancel everyone?' : target ? `Cancel ${target.person.label}'s appointment?` : ''}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {target?.kind === 'everyone'
              ? 'Every appointment in your group that has not started is cancelled. This cannot be undone.'
              : 'Everyone else in your group stays booked. This cannot be undone.'}
          </Text>
          {consequences.map((line) => (
            <Text key={line} variant="bodySmall">
              {line}
            </Text>
          ))}
          {error ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Yes, cancel" variant="danger" loading={cancel.isPending} onPress={confirmCancel} />
          <Button label="Keep" variant="secondary" disabled={cancel.isPending} onPress={() => setTarget(null)} />
        </View>
      </Sheet>

      {changeId ? <GroupPersonReschedule bookingId={changeId} onClose={() => setChangeId(null)} /> : null}
    </>
  );
}

/**
 * The single-booking reschedule, for one person's appointment. The signed-in client owns every
 * row of their group, so the person's own booking is read and moved through the usual routes.
 */
function GroupPersonReschedule({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const detail = useCustomerBookingDetail(bookingId);
  if (!detail.data) {
    return (
      <Sheet visible onClose={onClose}>
        <View style={styles.sheet}>
          {detail.isError ? (
            <Text variant="bodySmall">We could not open this appointment. Please try again.</Text>
          ) : (
            <LoadingState message="Opening the appointment…" />
          )}
        </View>
      </Sheet>
    );
  }
  return <RescheduleSheet booking={detail.data} visible onClose={onClose} />;
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.sm },
  person: { marginTop: spacing.base, gap: 4 },
  appointment: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  appointmentText: { flex: 1 },
  sheet: { gap: spacing.md, padding: spacing.base },
});

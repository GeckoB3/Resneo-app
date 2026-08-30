import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import type { CustomerBookingDetail } from '@/lib/queries/useCustomerBookings';
import { spacing } from '@/theme/index';

type Props = { booking: CustomerBookingDetail };

/**
 * What the booking is, when, and where.
 *
 * `location.type` is honoured rather than assumed. An appointment can be at the
 * CUSTOMER's address or online, and a screen that always printed the venue's
 * address would send a mobile practitioner's client to the wrong place.
 */
export function BookingDetailBody({ booking }: Props) {
  return (
    <View style={styles.stack}>
      <Card>
        <Text variant="overline" tone="secondary">
          {statusLabel(booking.status)}
        </Text>
        <Text variant="subheading" style={styles.gap}>
          {titleFor(booking)}
        </Text>
        <Text variant="body" tone="secondary">
          {formatDayHeading(booking.booking_date)} at {booking.booking_time.slice(0, 5)}
          {booking.booking_end_time ? ` to ${booking.booking_end_time.slice(0, 5)}` : ''}
        </Text>
        {booking.practitioner_name ? (
          <Text variant="bodySmall" tone="secondary">
            With {booking.practitioner_name}
          </Text>
        ) : null}
        {booking.part_of_course ? (
          /*
            Said before any action is offered. A course is many bookings sharing
            a group, and changing this one changes this one; somebody who read
            "change booking" as "move my course" would find the other sessions
            still where they were.
          */
          <Text variant="bodySmall" tone="secondary" style={styles.gap}>
            This is one session of a course. Changing it affects this session only.
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text variant="overline" tone="secondary">
          WHERE
        </Text>
        <Text variant="body" style={styles.gap}>
          {whereLine(booking)}
        </Text>
        {booking.location.address ? (
          <Text variant="bodySmall" tone="secondary">
            {booking.location.address}
          </Text>
        ) : null}
        {booking.location.map_url ? (
          <Button
            label="Open in maps"
            variant="secondary"
            onPress={() => void Linking.openURL(booking.location.map_url as string)}
            style={styles.gap}
          />
        ) : null}
        {booking.venue_phone ? (
          <Button
            label="Call the venue"
            variant="secondary"
            onPress={() => void Linking.openURL(`tel:${booking.venue_phone}`)}
            style={styles.gap}
          />
        ) : null}
      </Card>

      {formsCard(booking)}

      {booking.deposit_amount_pence ? (
        <Card>
          <Text variant="overline" tone="secondary">
            DEPOSIT
          </Text>
          <Text variant="body" style={styles.gap}>
            {formatPence(booking.deposit_amount_pence)}{' '}
            {booking.deposit_paid ? 'paid' : 'not yet paid'}
          </Text>
        </Card>
      ) : null}

      {booking.notes.length > 0 ? (
        <Card>
          <Text variant="overline" tone="secondary">
            WHAT YOU TOLD THEM
          </Text>
          {booking.notes.map((note) => (
            <View key={note.label} style={styles.gap}>
              <Text variant="caption" tone="muted">
                {note.label}
              </Text>
              <Text variant="body">{note.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/**
 * The forms card, with the three honest states the web is careful to preserve.
 *
 * `compliance_forms_checked === false` means the lookup FAILED, so an empty
 * list carries no information. Rendering nothing in that case would tell
 * somebody with an unsigned waiver that they are ready to go, and they would
 * find out at the door.
 */
function formsCard(booking: CustomerBookingDetail) {
  if (booking.compliance_forms_checked === false) {
    return (
      <Card>
        <Text variant="overline" tone="secondary">
          FORMS
        </Text>
        <Text variant="body" style={styles.gap}>
          We could not check whether this booking needs a form. Please check with the venue.
        </Text>
      </Card>
    );
  }

  if (booking.compliance_forms.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        BEFORE YOU ARRIVE
      </Text>
      {booking.compliance_forms.map((form) => (
        <Button
          key={form.url}
          label={form.name}
          variant="secondary"
          onPress={() => void Linking.openURL(form.url)}
          style={styles.gap}
        />
      ))}
    </Card>
  );
}

function titleFor(booking: CustomerBookingDetail): string {
  return (
    booking.appointment_service_name ??
    booking.event_name ??
    booking.class_type_name ??
    booking.resource_name ??
    booking.venue_name ??
    'Your booking'
  );
}

function whereLine(booking: CustomerBookingDetail): string {
  if (booking.location.type === 'online') return 'Online';
  if (booking.location.type === 'client_address') return 'At your address';
  return booking.venue_name ?? 'At the venue';
}

function statusLabel(status: string): string {
  if (status === 'cancelled' || status === 'canceled') return 'CANCELLED';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'no_show') return 'MISSED';
  return 'BOOKED';
}

const styles = StyleSheet.create({
  stack: { gap: spacing.base },
  gap: { marginTop: spacing.xs },
});

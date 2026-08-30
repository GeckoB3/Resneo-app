import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { venueNameFor, type CustomerHome } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

type Props = { home: CustomerHome };

/**
 * What is next, and anything standing in its way.
 *
 * The forms line is the part that carries a real obligation, and it has three
 * states rather than two. `next_booking_forms_checked` is false when the web's
 * lookup FAILED, and an empty list then means "we do not know", not "nothing to
 * do". Collapsing those two would tell a customer with an unsigned waiver that
 * they are ready to go, and they would discover otherwise at the door. The web
 * went out of its way to carry that distinction; throwing it away on this side
 * would waste the effort and reintroduce the bug.
 */
export function NextBookingCard({ home }: Props) {
  const booking = home.next_booking;

  if (!booking) {
    return (
      <Card>
        <Text variant="subheading">Nothing booked</Text>
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          When you book with a venue that uses ResNeo, it will show up here.
        </Text>
      </Card>
    );
  }

  const { service, practitioner } = home.next_booking_appointment;
  const venue = venueNameFor(home, booking.venue_id);

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        NEXT BOOKING
      </Text>
      <Text variant="subheading" style={styles.gap}>
        {service ?? venue}
      </Text>
      <Text variant="body" tone="secondary">
        {formatDayHeading(booking.booking_date)} at {shortTime(booking.booking_time)}
      </Text>
      <Text variant="bodySmall" tone="secondary">
        {practitioner ? `${practitioner} at ${venue}` : venue}
      </Text>

      {formsLine(home) ? (
        <View style={styles.notice}>
          <Text variant="bodySmall">{formsLine(home)}</Text>
        </View>
      ) : null}
    </Card>
  );
}

/** The three honest states of the forms check, or null when there is nothing to say. */
function formsLine(home: CustomerHome): string | null {
  if (!home.next_booking_forms_checked) {
    // Never silently reassuring. Saying nothing here would read as "all clear".
    return 'We could not check whether this booking needs a form. Please check with the venue.';
  }
  const count = home.next_booking_form_links.length;
  if (count === 1) {
    return 'This booking needs a form completed before you arrive.';
  }
  if (count > 1) {
    return `This booking needs ${count} forms completed before you arrive.`;
  }
  if (home.later_bookings_needing_forms > 0) {
    const n = home.later_bookings_needing_forms;
    return n === 1
      ? 'One of your later bookings needs a form.'
      : `${n} of your later bookings need forms.`;
  }
  return null;
}

/** "14:30:00" to "14:30". The seconds are noise on a card. */
function shortTime(time: string): string {
  return time.slice(0, 5);
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.xs },
  notice: { marginTop: spacing.sm },
});

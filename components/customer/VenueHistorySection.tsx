import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatDayHeading } from '@/lib/dates/venue-dates';
import { formatPence } from '@/lib/format';
import type { CustomerHome, CustomerVenueHistory } from '@/lib/queries/useCustomerHome';
import { spacing } from '@/theme/index';

type Props = { home: CustomerHome };

/**
 * The venues this customer has been to, and a way back to each.
 *
 * **This is the answer to an empty hub**, and it is the web's answer too rather
 * than something invented here. A customer with nothing booked is very rarely a
 * customer with no history: they have been to a salon twice and simply have no
 * appointment right now. A first-run banner would tell that person nothing,
 * while this tells them where they go and offers the one action they want.
 *
 * A genuinely new account, with no bookings and no venues, renders nothing here
 * and falls through to the "nothing booked" card above, which is the honest
 * state for somebody who arrived before their first booking.
 */
export function VenueHistorySection({ home }: Props) {
  const history = home.venue_history ?? [];
  if (history.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        VENUES YOU HAVE BOOKED WITH
      </Text>

      {history.map((entry) => (
        <View key={entry.venue.id} style={styles.row}>
          <Text variant="bodyMedium">{entry.venue.name}</Text>
          <Text variant="bodySmall" tone="secondary">
            {visitsLine(entry)}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {entry.next_booking
              ? `Next: ${formatDayHeading(entry.next_booking.booking_date)}`
              : 'Nothing booked at the moment.'}
          </Text>
          {entry.deposits_paid_minor > 0 ? (
            /*
              "Deposits paid", never "spent". The figure sums paid deposits only
              and excludes the payments ledger, so calling it spend would tell
              somebody who paid in full that ResNeo had lost most of it.
            */
            <Text variant="caption" tone="muted">
              {formatPence(entry.deposits_paid_minor)} in deposits paid
            </Text>
          ) : null}

          {entry.rebook_href ? (
            <Button
              label="Book again"
              variant="secondary"
              size="sm"
              onPress={() => void Linking.openURL(absolute(entry.rebook_href as string))}
              style={styles.action}
            />
          ) : null}
        </View>
      ))}

      {home.venue_history_hidden > 0 ? (
        // Said out loud rather than silently truncated: a customer who counts
        // three venues and knows they have five should be told, not left to
        // wonder which two are missing.
        <Text variant="caption" tone="muted" style={styles.action}>
          {home.venue_history_hidden === 1
            ? 'One more venue is not shown here.'
            : `${home.venue_history_hidden} more venues are not shown here.`}
        </Text>
      ) : null}
    </Card>
  );
}

/** How many times, and since when, when the server knows. */
function visitsLine(entry: CustomerVenueHistory): string {
  const visits = entry.visits === 1 ? '1 booking' : `${entry.visits} bookings`;
  if (!entry.first_booked_at) return visits;
  return `${visits} since ${formatDayHeading(entry.first_booked_at.slice(0, 10))}`;
}

/**
 * The rebook link, as something a browser can open.
 *
 * The server sends a site-relative path. Opening it needs an absolute URL, and
 * this app has no native booking flow to route it to instead: booking is done
 * on the venue's own page, which is where the web portal sends people too.
 */
function absolute(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return `https://www.resneo.com${href.startsWith('/') ? '' : '/'}${href}`;
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.base, gap: 2 },
  action: { marginTop: spacing.sm },
});

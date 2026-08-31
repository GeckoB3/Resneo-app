import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useCustomerVenueRelationships } from '@/lib/queries/useCustomerVenues';
import { spacing } from '@/theme/index';

/**
 * Which venues may send offers, shown per venue.
 *
 * **Read only, and that is a limitation rather than a design.**
 * `PATCH /api/account/marketing-preferences` identifies the relationship by
 * `guest_id`, and `GET /api/v1/me/venues` does not return one, so the app can
 * see the answer and cannot change it. Adding `guest_id` to that response is a
 * one-line additive web change and would make this section editable; making it
 * belongs to the web repo rather than being smuggled in from here.
 *
 * Shown anyway, because consent to be marketed at is exactly the thing people
 * want to check, and pointing at where it can be changed is more use than
 * hiding it. Per venue, because that is who the consent was given to: one
 * switch would be a lie in both directions.
 */
export function MarketingConsentSection() {
  const { data } = useCustomerVenueRelationships();

  const venues = data?.venues ?? [];
  if (venues.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        OFFERS FROM VENUES
      </Text>
      {venues.map((venue) => (
        <View key={venue.venue_id} style={styles.row}>
          <Text variant="body" style={styles.name}>
            {venue.venue_name ?? 'Venue'}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {consentLabel(venue.marketing_consent, venue.marketing_opt_out)}
          </Text>
        </View>
      ))}
      <Text variant="caption" tone="muted" style={styles.note}>
        To change any of these, please use the ResNeo website. Each venue asks separately, so
        changing one does not affect the others.
      </Text>
    </Card>
  );
}

/**
 * What the two flags mean together.
 *
 * An opt-out WINS over a consent, because it is the later and more explicit
 * instruction: somebody who consented once and then asked to stop should read
 * "no", not "yes".
 */
function consentLabel(consent: boolean | null, optOut: boolean | null): string {
  if (optOut === true) return 'No offers';
  return consent === true ? 'Offers on' : 'No offers';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  name: { flex: 1 },
  note: { marginTop: spacing.base },
});

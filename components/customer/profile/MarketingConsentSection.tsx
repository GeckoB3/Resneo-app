import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useSetMarketingConsent } from '@/lib/queries/useCustomerAccount';
import { useCustomerVenueRelationships } from '@/lib/queries/useCustomerVenues';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Which venues may send offers, one switch per venue.
 *
 * **Per venue, because that is who the consent was given to.** A single switch
 * would be a lie in both directions: off would not stop a venue the customer
 * never opted out of, and on would opt them in to venues they never agreed to
 * hear from.
 *
 * This is the control for actual marketing. The "what we send you" matrix above
 * is account-level and governs a much narrower set, which is why the two are
 * labelled to say so rather than both being called marketing.
 *
 * It shipped read-only in C4, because the PATCH route identifies a relationship
 * by `guest_id` and the venues route did not return one. The web added the
 * field on 2026-08-31 and the switch followed.
 */
export function MarketingConsentSection() {
  const toast = useToast();
  const { data } = useCustomerVenueRelationships();
  const setConsent = useSetMarketingConsent();

  const venues = data?.venues ?? [];
  if (venues.length === 0) return null;

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        OFFERS FROM VENUES
      </Text>
      <Text variant="caption" tone="muted" style={styles.gap}>
        Each venue asks separately, so turning one off does not affect the others.
      </Text>
      {venues.map((venue) => {
        const on = isOptedIn(venue.marketing_consent, venue.marketing_opt_out);
        return (
          <View key={venue.venue_id} style={styles.row}>
            <Text variant="body" style={styles.name}>
              {venue.venue_name ?? 'Venue'}
            </Text>
            <Switch
              value={on}
              disabled={setConsent.isPending}
              accessibilityLabel={`Offers from ${venue.venue_name ?? 'this venue'}`}
              onValueChange={(next) =>
                setConsent.mutate(
                  { guestId: venue.guest_id, consent: next },
                  {
                    onError: () =>
                      toast.error('Could not save that. Please try again.'),
                  },
                )
              }
            />
          </View>
        );
      })}
    </Card>
  );
}

/**
 * Whether this venue may currently send offers.
 *
 * An opt-out WINS over a consent, because it is the later and more explicit
 * instruction: somebody who consented once and then asked to stop should see
 * the switch off, not on.
 */
function isOptedIn(consent: boolean | null, optOut: boolean | null): boolean {
  if (optOut === true) return false;
  return consent === true;
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
  gap: { marginTop: spacing.xs },
});

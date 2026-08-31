import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { useRemoveCard, useSavedCards } from '@/lib/queries/useCustomerAccount';
import { useCustomerVenueRelationships } from '@/lib/queries/useCustomerVenues';
import { useCustomerPurchase } from '@/lib/queries/useCustomerPurchase';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

/**
 * Cards saved at a venue.
 *
 * **Per venue, with a picker, because that is how they are stored.** Every
 * venue is its own Stripe connected account, so there is no such thing as "my
 * cards" across ResNeo; a card saved at the salon is invisible to the gym, and
 * a combined list would imply otherwise.
 */
export function SavedCardsSection() {
  const toast = useToast();
  const { data: venuesData } = useCustomerVenueRelationships();
  const venues = venuesData?.venues ?? [];
  const [venueId, setVenueId] = useState<string | null>(null);

  const activeVenueId = venueId ?? venues[0]?.venue_id ?? null;
  const activeVenue = venues.find((v) => v.venue_id === activeVenueId);

  const { data, isLoading } = useSavedCards(activeVenueId);
  const remove = useRemoveCard(activeVenueId);
  const purchase = useCustomerPurchase();

  /** A pending removal, held with the server's own warning once it answers. */
  const [pending, setPending] = useState<{ id: string; message: string } | null>(null);

  if (venues.length === 0) return null;

  const cards = data?.payment_methods ?? [];

  return (
    <Card>
      <Text variant="overline" tone="secondary">
        SAVED CARDS
      </Text>

      {venues.length > 1 ? (
        <Segmented
          options={venues.map((v) => ({ value: v.venue_id, label: v.venue_name ?? 'Venue' }))}
          value={activeVenueId ?? ''}
          onChange={(v) => setVenueId(v)}
          wrapLabels
        />
      ) : null}

      {isLoading ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          Loading…
        </Text>
      ) : cards.length === 0 ? (
        <Text variant="bodySmall" tone="secondary" style={styles.gap}>
          No card saved with {activeVenue?.venue_name ?? 'this venue'}.
        </Text>
      ) : (
        cards.map((card) => (
          <View key={card.id} style={styles.row}>
            <Text variant="body" style={styles.name}>
              {cardLabel(card.brand, card.last4)}
            </Text>
            <Button
              label="Remove"
              variant="secondary"
              size="sm"
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(
                  { paymentMethodId: card.id },
                  {
                    onSuccess: (outcome) => {
                      if (outcome.status === 'removed') {
                        toast.success('Card removed.');
                      } else {
                        /*
                          The server says this card pays for something. Its
                          message names WHAT, so it is shown as sent rather than
                          reworded: a summary here would be guessing at which
                          membership, and getting that wrong about a recurring
                          payment is worse than saying nothing.
                        */
                        setPending({ id: card.id, message: outcome.message });
                      }
                    },
                    onError: () => toast.error('Could not remove that card.'),
                  },
                )
              }
            />
          </View>
        ))
      )}

      {activeVenueId ? (
        <Button
          label="Add a card"
          variant="secondary"
          loading={purchase.isPending}
          onPress={() =>
            purchase.mutate(
              {
                kind: 'save_card',
                venueId: activeVenueId,
                venueName: activeVenue?.venue_name ?? 'this venue',
              },
              {
                onSuccess: (outcome) => {
                  if (outcome.status === 'succeeded') toast.success('Card saved.');
                  else if (outcome.status === 'failed') toast.error(outcome.message);
                },
                onError: () => toast.error('Could not start that. Please try again.'),
              },
            )
          }
          style={styles.gap}
        />
      ) : null}

      <ConfirmSheet
        visible={pending !== null}
        title="Remove this card?"
        message={pending?.message ?? ''}
        confirmLabel="Remove anyway"
        cancelLabel="Keep it"
        loading={remove.isPending}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (!target) return;
          remove.mutate(
            { paymentMethodId: target.id, acknowledge: true },
            {
              onSuccess: () => toast.success('Card removed.'),
              onError: () => toast.error('Could not remove that card.'),
            },
          );
        }}
      />
    </Card>
  );
}

/** "Visa ending 4242", or something true when Stripe told us less. */
function cardLabel(brand: string | null, last4: string | null): string {
  const name = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card';
  return last4 ? `${name} ending ${last4}` : name;
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
  gap: { marginTop: spacing.sm },
});

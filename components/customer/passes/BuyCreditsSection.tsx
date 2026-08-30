import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { nameById } from '@/components/customer/passes/lookup';
import { formatPence } from '@/lib/format';
import { useCustomerPurchase } from '@/lib/queries/useCustomerPurchase';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

export interface CreditProduct {
  id: string;
  name: string;
  venue_id: string;
  credits_count: number | null;
  price_pence: number | null;
}

type Props = {
  products: CreditProduct[];
  venues: { id: string; name: string }[] | undefined;
};

/**
 * Credit packs the customer can buy, scoped by the server to venues they have
 * actually been to.
 *
 * **A success here means "paid", not "you have them yet."** The credits are
 * granted server-side from the Stripe webhook rather than by a second call from
 * this app, because the card is charged by the time the sheet closes and a
 * client that lost its connection in between would leave somebody paid up with
 * nothing bought. So the message says the credits are on their way, and the
 * list refreshes when they land, rather than claiming a total that is not there
 * yet.
 */
export function BuyCreditsSection({ products, venues }: Props) {
  const toast = useToast();
  const purchase = useCustomerPurchase();

  if (products.length === 0) return null;

  return (
    <View style={styles.list}>
      <Text variant="overline" tone="secondary">
        BUY MORE
      </Text>
      {products.map((product) => (
        <Card key={product.id}>
          <Text variant="bodyMedium">{product.name}</Text>
          <Text variant="bodySmall" tone="secondary">
            {nameById(venues, product.venue_id)}
          </Text>
          <Text variant="bodySmall" tone="secondary" style={styles.gap}>
            {packLine(product)}
          </Text>
          <Button
            label={product.price_pence ? `Buy for ${formatPence(product.price_pence)}` : 'Buy'}
            loading={purchase.isPending}
            onPress={() =>
              purchase.mutate(
                {
                  kind: 'credits',
                  venueId: product.venue_id,
                  venueName: nameById(venues, product.venue_id),
                  productId: product.id,
                },
                {
                  onSuccess: (outcome) => {
                    if (outcome.status === 'succeeded') {
                      toast.success('Paid. Your credits will appear here shortly.');
                    } else if (outcome.status === 'failed') {
                      toast.error(outcome.message);
                    }
                    // A cancellation says nothing. The customer closed the sheet
                    // on purpose and does not need to be told what they just did.
                  },
                  onError: () => toast.error('Could not start the payment. Please try again.'),
                },
              )
            }
            style={styles.gap}
          />
        </Card>
      ))}
    </View>
  );
}

/** What the pack contains, when the server says. Silent rather than guessing. */
function packLine(product: CreditProduct): string {
  const n = product.credits_count;
  if (!n || n <= 0) return 'Class credits';
  return n === 1 ? '1 class credit' : `${n} class credits`;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, marginTop: spacing.base },
  gap: { marginTop: spacing.sm },
});

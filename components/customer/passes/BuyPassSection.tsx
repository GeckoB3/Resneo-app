import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { nameById } from '@/components/customer/passes/lookup';
import { formatPence } from '@/lib/format';
import { useCustomerPurchase } from '@/lib/queries/useCustomerPurchase';
import type { PurchaseKind } from '@/lib/payments/customer-purchase';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';

export interface BuyableProduct {
  id: string;
  name: string;
  venue_id: string;
  /** Absent for a membership, whose recurring price lives in Stripe. */
  price_pence?: number | null;
}

type Props = {
  heading: string;
  kind: Extract<PurchaseKind, 'membership' | 'course'>;
  products: BuyableProduct[];
  venues: { id: string; name: string }[] | undefined;
  /** What the customer gets, said before they pay. */
  note: string;
};

/**
 * Memberships and courses a customer can buy.
 *
 * One component for both, because the difference between them is a route and a
 * noun; the purchase engine already handles which is a SetupIntent and which is
 * paid now, and duplicating this to say "course" twice would be two places to
 * fix the next copy problem.
 *
 * Both were built and tested in C3 and never surfaced: the engine handled all
 * four kinds, and only credits had a screen. This is that gap closed.
 *
 * **A membership shows no price**, and that is deliberate rather than missing.
 * The catalogue carries a `stripe_price_id` rather than an amount, because a
 * recurring price can have intervals and trials the table does not model.
 * Printing a number the server did not give would be inventing one, about
 * money, on something that then charges every month.
 */
export function BuyPassSection({ heading, kind, products, venues, note }: Props) {
  const toast = useToast();
  const purchase = useCustomerPurchase();

  if (products.length === 0) return null;

  return (
    <View style={styles.list}>
      <Text variant="overline" tone="secondary">
        {heading}
      </Text>
      {products.map((product) => (
        <Card key={product.id}>
          <Text variant="bodyMedium">{product.name}</Text>
          <Text variant="bodySmall" tone="secondary">
            {nameById(venues, product.venue_id)}
          </Text>
          <Button
            label={buyLabel(product)}
            loading={purchase.isPending}
            onPress={() =>
              purchase.mutate(
                {
                  kind,
                  venueId: product.venue_id,
                  venueName: nameById(venues, product.venue_id),
                  productId: product.id,
                },
                {
                  onSuccess: (outcome) => {
                    if (outcome.status === 'succeeded') {
                      // "Paid", never "you have it". The membership or place is
                      // created server-side from the Stripe webhook, so it may
                      // not exist for a second or two yet.
                      toast.success('Paid. This will appear here shortly.');
                    } else if (outcome.status === 'failed') {
                      toast.error(outcome.message);
                    }
                  },
                  onError: () => toast.error('Could not start the payment. Please try again.'),
                },
              )
            }
            style={styles.gap}
          />
        </Card>
      ))}
      <Text variant="caption" tone="muted">
        {note}
      </Text>
    </View>
  );
}

/** Names the price when there is one, and does not pretend otherwise. */
function buyLabel(product: BuyableProduct): string {
  return product.price_pence ? `Buy for ${formatPence(product.price_pence)}` : 'Buy';
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, marginTop: spacing.base },
  gap: { marginTop: spacing.sm },
});

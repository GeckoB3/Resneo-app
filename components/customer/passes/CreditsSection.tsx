import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Text } from '@/components/ui/Text';
import { BuyCreditsSection } from '@/components/customer/passes/BuyCreditsSection';
import { expiryPhrase } from '@/components/customer/passes/passes-copy';
import { useCredits } from '@/lib/queries/useCustomerPasses';
import { nameById } from '@/components/customer/passes/lookup';
import { spacing } from '@/theme/index';

/**
 * Class credits the customer holds, per venue.
 *
 * Expiry is stated whenever there is one, because a credit that quietly expires
 * is money the customer paid and did not get to use, and the date is the only
 * thing that lets them plan around it.
 */
export function CreditsSection() {
  const { data, isLoading, isError, refetch } = useCredits();

  if (isLoading) return <LoadingState message="Loading your credits…" />;
  if (isError) {
    return (
      <ErrorState message="Could not load your credits." onRetry={() => void refetch()} />
    );
  }

  const balances = (data?.balances ?? []).filter((b) => b.credits_remaining > 0);

  const forSale = data?.purchase_catalog?.products ?? [];
  const catalogVenues = data?.purchase_catalog?.venues ?? data?.venues;

  if (balances.length === 0) {
    return (
      <View style={styles.list}>
        <EmptyState
          title="No class credits"
          message="Credits you buy from a venue will appear here, with anything you have left."
        />
        {/* Still offered with none held: somebody looking at an empty credits
            tab is very often looking for how to get some. */}
        <BuyCreditsSection products={forSale} venues={catalogVenues} />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {balances.map((balance) => (
        <Card key={balance.id}>
          <Text variant="bodyMedium">{nameById(data?.venues, balance.venue_id)}</Text>
          <Text variant="body" tone="secondary">
            {balance.credits_remaining}{' '}
            {balance.credits_remaining === 1 ? 'credit left' : 'credits left'}
          </Text>
          {balance.expires_at ? (
            <Text variant="caption" tone="muted">
              Use by {expiryPhrase(balance.expires_at)}
            </Text>
          ) : null}
        </Card>
      ))}
      <BuyCreditsSection products={forSale} venues={catalogVenues} />
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.sm } });

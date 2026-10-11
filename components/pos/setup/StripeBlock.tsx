import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { StatusLine } from '@/components/pos/setup/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { setupT } from '@/lib/pos/setup/copy';
import { useStripeConnect, useStripeConnectLink } from '@/lib/queries/useBillingStatus';
import { useVenueContext } from '@/providers/VenueProvider';
import { spacing } from '@/theme/index';

export type StripeState = 'none' | 'pending' | 'done';

/**
 * Stripe's state for taking cards (design 6.3 W3): not connected (no account, or its details not
 * sent yet), checking (details sent, charges not on yet), or connected. Read again whenever the app
 * comes back to the front, which is how the owner comes back from Stripe's own pages.
 */
export function useStripeState(): { state: StripeState; loading: boolean; refetch: () => void } {
  const query = useStripeConnect(true);
  const { refetch: refetchVenue } = useVenueContext();
  const refetchStripe = query.refetch;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void refetchStripe();
      refetchVenue();
    });
    return () => sub.remove();
  }, [refetchStripe, refetchVenue]);
  const status = query.data ?? null;
  const state: StripeState = !status ? 'none' : status.charges_enabled ? 'done' : status.details_submitted ? 'pending' : 'none';
  return { state, loading: query.isLoading, refetch: () => void refetchStripe() };
}

/**
 * The Stripe part of W3 and of "Get this phone ready": "First, connect Stripe" with the button
 * (Stripe's own pages open in the in-app browser, as Plan & payments does), "Stripe is checking your
 * details", or "Stripe is connected". Only an admin can connect.
 */
export function StripeBlock({ isAdmin, title = true }: { isAdmin: boolean; title?: boolean }) {
  const { state, loading, refetch } = useStripeState();
  const link = useStripeConnectLink();
  const { refetch: refetchVenue } = useVenueContext();
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (state === 'done') return <StatusLine tone="done">{setupT('setup.cards.stripe.done')}</StatusLine>;
  if (state === 'pending') return <StatusLine tone="info">{setupT('setup.cards.stripe.pending')}</StatusLine>;

  const connect = () => {
    setError(null);
    link.mutate(undefined, {
      onSuccess: ({ url }) => {
        void WebBrowser.openBrowserAsync(url)
          .catch(() => Linking.openURL(url))
          .catch(() => setError(setupT('app.setup.cards.stripe.failed')))
          .finally(() => {
            refetch();
            refetchVenue();
          });
      },
      onError: () => setError(setupT('app.setup.cards.stripe.failed')),
    });
  };

  return (
    <View style={styles.stack}>
      {title ? (
        <Text variant="subheading" accessibilityRole="header">
          {setupT('setup.cards.stripe.none.title')}
        </Text>
      ) : null}
      <Text variant="bodySmall" tone="secondary">
        {setupT('setup.cards.stripe.none.body')}
      </Text>
      {isAdmin ? (
        <Button label={setupT('setup.cards.stripe.none.button')} onPress={connect} loading={link.isPending} fullWidth />
      ) : (
        <Text variant="caption" tone="muted">
          {setupT('app.setup.cards.stripe.adminOnly')}
        </Text>
      )}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
});

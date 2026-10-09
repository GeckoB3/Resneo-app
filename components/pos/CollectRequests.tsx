import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money, posStyles, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { getStripePublishableKey } from '@/lib/env';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { cardAppAvailable } from '@/lib/pos/pos-enabled';
import type { PosT } from '@/lib/pos/copy';
import { useCollectRequests, usePosBootstrap, usePosEnabled } from '@/lib/queries/usePos';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosCollectRequest } from '@/types/pos';

/**
 * "Waiting for you" (POS plan §4.36 "Who is told"; UX spec §13.8, §23.5): sales the web till sent
 * to this person's phone, or to any phone. Pushes can be late or lost, so the list is read on Today,
 * whenever the app comes to the foreground and every 20 seconds while it is shown. Only a phone
 * that can take a card here asks (POS on, card payments in person, `take_payment`, the Terminal
 * SDK); everywhere else nothing is asked and nothing shows.
 *
 * - `CollectRequestsCard` on Today; hidden when empty.
 * - `CollectRequestsBanner` across the staff app, above every tab, so a request is never missed.
 */

/** Whether this phone can take a card for a sale sent from the web till. */
export function useCanCollectHere(): boolean {
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap({ enabled: posEnabled });
  return (
    posEnabled &&
    cardAppAvailable({
      bootstrap: boot.data,
      terminalAvailable: isTerminalSdkAvailable(),
      publishableKey: Boolean(getStripePublishableKey()),
    })
  );
}

/** `app.collect.row`, with who sent it. */
export function collectRowText(r: PosCollectRequest, t: PosT): string {
  return t('app.collect.row', {
    amount: money(r.amount_pence),
    saleNo: r.sale_no,
    staffName: r.sent_by_name ?? t('app.collect.someone'),
  });
}

export function collectHref(r: Pick<PosCollectRequest, 'payment_id'>): Href {
  return `/checkout/collect/${r.payment_id}` as Href;
}

function useWaitingForMe(): PosCollectRequest[] {
  const canCollect = useCanCollectHere();
  const q = useCollectRequests({ enabled: canCollect });
  const { refetch } = q;
  // Read again whenever the app comes back to the foreground: the push may never have arrived.
  useEffect(() => {
    if (!canCollect) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => sub.remove();
  }, [canCollect, refetch]);
  return canCollect ? (q.data?.requests ?? []) : [];
}

function RequestRow({ r, onPress }: { r: PosCollectRequest; onPress: () => void }) {
  const t = usePosT();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={collectRowText(r, t)}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.flex}>
        <Text variant="bodyMedium">{collectRowText(r, t)}</Text>
        <Text variant="caption" tone="muted">
          {[r.client_name, t('app.collect.row.expires', { seconds: r.seconds_left })].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {r.for_anyone ? <Badge label={t('app.collect.row.any')} tone="brand" /> : null}
    </Pressable>
  );
}

/** "Waiting for you" on Today. Hidden when nothing is waiting. */
export function CollectRequestsCard() {
  const t = usePosT();
  const router = useRouter();
  const requests = useWaitingForMe();
  if (requests.length === 0) return null;
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="label">{t('app.collect.list.title')}</Text>
        {requests.map((r) => (
          <RequestRow key={r.payment_id} r={r} onPress={() => router.push(collectHref(r))} />
        ))}
      </View>
    </Card>
  );
}

/** A slim banner above every staff screen while a request waits for this phone. */
export function CollectRequestsBanner() {
  const t = usePosT();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const requests = useWaitingForMe();
  const first = requests[0];
  // Not over the screen that is taking one already.
  if (!first || pathname.startsWith('/checkout/collect')) return null;
  return (
    <Pressable
      onPress={() => router.push(collectHref(first))}
      accessibilityRole="button"
      accessibilityLabel={`${t('app.collect.list.title')}: ${collectRowText(first, t)}`}
      style={[styles.banner, { paddingTop: insets.top + spacing.xs, backgroundColor: colors.brand }]}>
      <Text variant="label" color={colors.onColor}>
        {t('app.collect.list.title')}
      </Text>
      <Text variant="bodySmall" color={colors.onColor}>
        {collectRowText(first, t)}
        {requests.length > 1 ? ` (+${requests.length - 1})` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  banner: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm, gap: spacing.xxs },
});

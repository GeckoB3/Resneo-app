import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { collectHref, useCanCollectHere } from '@/components/pos/CollectRequests';
import { money, usePosT } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { hapticWarning } from '@/lib/haptics';
import { registerCollectPrompt } from '@/lib/push/collect-prompt';
import { useCollectRequests } from '@/lib/queries/usePos';
import { useVenue } from '@/lib/queries/useVenue';
import { openOverlayCount } from '@/lib/ui/open-overlays';
import { useAppLock } from '@/providers/AppLockProvider';
import { spacing } from '@/theme/index';

/**
 * The in-app prompt for a sale the web till sent to this phone while the app is open (owner,
 * 2026-10-10; POS plan §4.36). The push arrives, the phone buzzes and plays the sound, and this
 * sheet offers it at once: "Take £45.00", who sent it from which till and for whom, then "Take
 * payment" (opens the collect screen) or "Not now" (the "Waiting for you" banner stays).
 *
 * It never takes over the screen by itself, and it stays out of the way: not while a sheet or other
 * full-screen window is open (a payment in progress, a client holding the phone for a tip), not on
 * the collect screen, not while the app is locked, and not for another venue's request. Then the
 * phone's own notification banner shows instead, as before. Either way the push makes the request
 * list read again at once, so the banner and Today don't wait for their 20-second poll.
 *
 * A request someone else took, or that ended, before staff answer is gone from the list, so the
 * prompt closes by itself.
 */
export function CollectRequestPrompt() {
  const t = usePosT();
  const router = useRouter();
  const pathname = usePathname();
  const canCollect = useCanCollectHere();
  const requests = useCollectRequests({ enabled: canCollect });
  const venue = useVenue();
  const { isLocked } = useAppLock();
  // The payment the last push offered. It shows only while it is still waiting for this phone.
  const [pending, setPending] = useState<string | null>(null);

  // What the push handler needs to decide, read at the moment the push arrives.
  const live = useRef({ canCollect, pathname, isLocked, venueId: venue.data?.id ?? null, refetch: requests.refetch });
  useEffect(() => {
    live.current = { canCollect, pathname, isLocked, venueId: venue.data?.id ?? null, refetch: requests.refetch };
  });

  useEffect(
    () =>
      registerCollectPrompt((paymentId, venueId) => {
        const now = live.current;
        if (!now.canCollect) return false;
        // The list reads again at once, whether or not the prompt shows.
        void now.refetch();
        if (now.isLocked) return false;
        if (venueId && now.venueId && venueId !== now.venueId) return false;
        if (now.pathname.startsWith('/checkout/collect')) return false;
        if (openOverlayCount() > 0) return false;
        hapticWarning();
        setPending(paymentId);
        return true;
      }),
    [],
  );

  // Gone from the list (taken elsewhere, sent to someone else, ended), the app locked meanwhile, or
  // the collect screen opened another way: nothing shows.
  const request = pending ? (requests.data?.requests.find((r) => r.payment_id === pending) ?? null) : null;
  const visible = request != null && !isLocked && !pathname.startsWith('/checkout/collect');

  return (
    <Sheet visible={visible} onClose={() => setPending(null)}>
      {visible && request ? (
        <View style={styles.stack} accessibilityLiveRegion="polite">
          <Text variant="label">{t('app.collect.list.title')}</Text>
          <Text variant="title">{t('app.collect.title', { amount: money(request.amount_pence) })}</Text>
          <Text variant="bodySmall" tone="muted">
            {t('app.collect.for', {
              saleNo: request.sale_no,
              till: request.till_name ?? t('app.collect.desk'),
              staffName: request.sent_by_name ?? t('app.collect.someone'),
            })}
          </Text>
          {request.client_name ? <Text variant="bodyMedium">{t('app.collect.client', { clientName: request.client_name })}</Text> : null}
          {request.for_anyone ? (
            <View style={styles.badge}>
              <Badge label={t('app.collect.row.any')} tone="brand" />
            </View>
          ) : null}
          <View style={styles.buttons}>
            <Button
              label={t('app.collect.prompt.take')}
              size="lg"
              onPress={() => {
                setPending(null);
                router.push(collectHref(request));
              }}
              fullWidth
            />
            <Button label={t('app.collect.prompt.later')} variant="ghost" onPress={() => setPending(null)} fullWidth />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, paddingBottom: spacing.md },
  badge: { flexDirection: 'row' },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});

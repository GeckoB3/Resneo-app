import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { SetupSection, StatusLine } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { setupT } from '@/lib/pos/setup/copy';
import { settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { SM_COPY } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery } from '@/lib/pos/settings-more/hooks';
import { shT, type ShopSetCopyId } from '@/lib/pos/settings-more/shop-copy';
import type { ShopAdminView } from '@/lib/pos/settings-more/types';
import { useFeatureSwitches } from '@/lib/queries/useFeatureSwitches';
import { spacing } from '@/theme/index';

/** Online shop settings, where the shop's own checklist, policies and delivery are set. */
export const SHOP_SETTINGS_HREF = '/checkout-settings/shop';

type CheckKey = keyof ShopAdminView['readiness']['checks'];

/** The shop's opening checklist, in the web's order (`set.shop.check.*`). */
const CHECKS: { key: CheckKey; label: ShopSetCopyId }[] = [
  { key: 'legal', label: 'set.shop.check.legal' },
  { key: 'policies', label: 'set.shop.check.policies' },
  { key: 'cards', label: 'set.shop.check.cards' },
  { key: 'plan', label: 'set.shop.check.plan' },
  { key: 'products', label: 'set.shop.check.products' },
  { key: 'fulfilment', label: 'set.shop.check.fulfilment' },
];

/**
 * W10, "Your online shop" (design 6.3): only once the shop is on. Nothing is asked here: the
 * shop's own opening checklist shows what is done and what is left, and "Set up my shop" opens
 * Online shop settings for the policies, collection and delivery. The list is read again on coming
 * back. "Later" skips it; the card keeps it until the shop is open.
 */
export function ShopStep({ data }: { data: SetupData }) {
  const router = useRouter();
  const runner = useStepRunner('shop', data);
  const switches = useFeatureSwitches();
  const query = useSettingsQuery<ShopAdminView>(settingsMoreKeys.shop, settingsMorePaths.shopSettings);
  const refetch = query.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const view = query.data ?? null;
  const collective = switches.data?.venue?.collective_name?.trim() || null;

  return (
    <SetupFrame
      screen="shop"
      data={data}
      title={setupT('setup.shop.title')}
      intro={setupT('setup.shop.body')}
      footer={
        <SetupButtons
          onContinue={() => void runner.proceed()}
          onSkip={() => void runner.skip()}
          skipLabel={setupT('setup.shop.later')}
          busy={runner.busy}
          error={runner.error}
        />
      }>
      {collective && view?.shop_url ? <Notice>{setupT('setup.shop.collective', { collective, link: view.shop_url })}</Notice> : null}
      {query.isError && !view ? (
        <ErrorState message={settingsErrorMessage(query.error, SM_COPY['common.loadError'])} onRetry={() => void refetch()} />
      ) : !view ? (
        <DetailSkeleton />
      ) : (
        <SetupSection>
          {view.readiness.open ? <StatusLine tone="done">{setupT('app.setup.shop.open')}</StatusLine> : null}
          <View style={styles.list}>
            {CHECKS.map((check) => (
              <StatusLine key={check.key} tone={view.readiness.checks[check.key] ? 'done' : 'warn'}>
                {shT(check.label)}
              </StatusLine>
            ))}
          </View>
          <Button
            label={setupT('setup.shop.go')}
            variant="secondary"
            fullWidth
            onPress={() => router.push(SHOP_SETTINGS_HREF as Href)}
            disabled={runner.busy !== null}
          />
        </SetupSection>
      )}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});

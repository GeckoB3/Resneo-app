import { useQueryClient } from '@tanstack/react-query';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/pos/parts';
import { ChoiceCard, ChoiceGroup, SetupSection, StatusLine } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { TickRow } from '@/components/pos/switches/parts';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { shopCanOpenNow, shopSettingsWrite, shopTemplatesOffered } from '@/lib/pos/setup/answers';
import { setupT } from '@/lib/pos/setup/copy';
import { errorBody, isStaleWrite, settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { SM_COPY } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery, useSettingsSend } from '@/lib/pos/settings-more/hooks';
import { shT, type ShopSetCopyId } from '@/lib/pos/settings-more/shop-copy';
import type { ShopAdminView } from '@/lib/pos/settings-more/types';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useFeatureSwitches } from '@/lib/queries/useFeatureSwitches';
import { useToast } from '@/providers/ToastProvider';
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
 * W10, "Your online shop" (design 6.3): only once the shop is on. The shop's own opening checklist
 * shows what is done and what is left, and "Set up my shop" opens Online shop settings for the
 * policies, collection and delivery. The list is read again on coming back.
 *
 * While the shop is shut, "Open your shop now?" (owner, 2026-10-17, as the web): "Yes, open my shop"
 * once every line holds, chosen for the owner then, as they asked for an online shop in W1; or "Not
 * yet", which says where to open it later. Policies not written yet can come from our templates (the
 * ones Online shop settings offers), sent with the opening in one save through the shop's own route,
 * which checks the shop as it will be. "Skip for now" saves nothing.
 */
export function ShopStep({ data }: { data: SetupData }) {
  const router = useRouter();
  const runner = useStepRunner('shop', data);
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  const send = useSettingsSend();
  const toast = useToast();
  const switches = useFeatureSwitches();
  const query = useSettingsQuery<ShopAdminView>(settingsMoreKeys.shop, settingsMorePaths.shopSettings);
  const refetch = query.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const [useTemplates, setUseTemplates] = useState(true);
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const view = query.data ?? null;
  const collective = switches.data?.venue?.collective_name?.trim() || null;

  // Switched on, the shop opens by itself once its checklist holds, so the question is not asked.
  const switchedOn = view?.settings.shop_open === true;
  const open = view?.readiness.open === true;
  const offerTemplates = view !== null && shopTemplatesOffered(view);
  const canOpen = view !== null && shopCanOpenNow(view, useTemplates);
  const openNow = canOpen && openChoice !== false;
  const busy = runner.busy !== null;

  const onContinue = () => {
    void runner.proceed(async () => {
      if (!view) return null;
      const body = shopSettingsWrite(view, { useTemplates, open: openNow });
      if (Object.keys(body).length === 0) return null;
      try {
        const fresh = await send<ShopAdminView>(settingsMorePaths.shopSettings, 'PATCH', { ...body, version: view.settings.version });
        queryClient.setQueryData(settingsMoreKeys.shop(accessToken), fresh);
        // The shop's settings share Checkout settings' version: the other screens read it again.
        void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.settings(accessToken) });
        if (body.shop_open) toast.success(shT('set.shop.status.open'));
        return null;
      } catch (e) {
        if (isStaleWrite(e)) {
          // The refusal carries the fresh view: show it, so the owner sees what changed first.
          const b = errorBody<Partial<ShopAdminView> & { error?: unknown; code?: unknown }>(e);
          if (b?.settings && b.readiness) {
            const { error: _error, code: _code, ...rest } = b;
            queryClient.setQueryData(settingsMoreKeys.shop(accessToken), rest as ShopAdminView);
          } else {
            void refetch();
          }
          return SM_COPY['err.POS_SETTINGS_STALE'];
        }
        return settingsErrorMessage(e);
      }
    });
  };

  const intro = open ? null : view?.readiness.canOpen && !switchedOn ? setupT('setup.shop.ready') : setupT('setup.shop.body');

  return (
    <SetupFrame
      screen="shop"
      data={data}
      title={setupT('setup.shop.title')}
      intro={intro}
      footer={
        <SetupButtons
          onContinue={onContinue}
          onSkip={open ? null : () => void runner.skip()}
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
        <>
          <SetupSection>
            {open ? <StatusLine tone="done">{setupT('app.setup.shop.open')}</StatusLine> : null}
            <View style={styles.list}>
              {CHECKS.map((check) => (
                <StatusLine key={check.key} tone={view.readiness.checks[check.key] ? 'done' : 'warn'}>
                  {shT(check.label)}
                </StatusLine>
              ))}
            </View>
            {!open ? (
              <Button
                label={setupT('setup.shop.go')}
                variant="secondary"
                fullWidth
                onPress={() => router.push(SHOP_SETTINGS_HREF as Href)}
                disabled={busy}
              />
            ) : null}
          </SetupSection>

          {offerTemplates ? (
            <TickRow
              title={setupT('setup.shop.templates')}
              detail={setupT('app.setup.shop.templates.note')}
              checked={useTemplates}
              onChange={setUseTemplates}
              disabled={busy}
            />
          ) : null}

          {!switchedOn ? (
            <ChoiceGroup label={setupT('setup.shop.open.title')}>
              <ChoiceCard
                title={setupT('setup.shop.open.yes')}
                note={setupT(canOpen ? 'setup.shop.open.yes.note' : 'setup.shop.open.yes.notReady')}
                selected={openNow}
                onPress={() => setOpenChoice(true)}
                disabled={busy || !canOpen}
              />
              <ChoiceCard
                title={setupT('setup.shop.open.no')}
                note={setupT('app.setup.shop.open.no.note')}
                selected={!openNow}
                onPress={() => setOpenChoice(false)}
                disabled={busy}
              />
            </ChoiceGroup>
          ) : null}
        </>
      )}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
});

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { TickRow } from '@/components/pos/switches/parts';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { isLoyaltyEnabled, isShopEnabled, isVouchersEnabled } from '@/lib/pos/pos-enabled';
import {
  extrasToSwitchOn,
  knowsSellProducts,
  productsWithShop,
  sellProductsFact,
  shopNeedsProducts,
  usageAnswerFrom,
  extraStateOf,
  type UsageAnswer,
  type ExtraState,
} from '@/lib/pos/setup/answers';
import { setupT, type SetupCopyId } from '@/lib/pos/setup/copy';
import { extrasForSentence } from '@/lib/pos/switches/model';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { useSaveCheckoutSettings } from '@/lib/queries/useCheckoutSettings';
import { applySwitchResult, useFeatureSwitches, useSetFeatureSwitch } from '@/lib/queries/useFeatureSwitches';
import { useToast } from '@/providers/ToastProvider';
import { spacing } from '@/theme/index';
import type { PosFeatureSwitchesResponse, PosSwitchExtraKey } from '@/types/pos-switches';

const EXTRAS: { key: 'vouchers' | 'loyalty' | 'shop'; title: SetupCopyId; note: SetupCopyId }[] = [
  { key: 'vouchers', title: 'setup.use.vouchers', note: 'setup.use.vouchers.note' },
  { key: 'loyalty', title: 'setup.use.loyalty', note: 'setup.use.loyalty.note' },
  { key: 'shop', title: 'setup.use.shop', note: 'setup.use.shop.note' },
];

/**
 * W1, "What will you use Checkout for?" (design 6.3, drawn as B2). Taking payment for appointments
 * is always included. "Sell products" sets the fourth simple-mode switch (OB3); each extra the dial
 * offers is a tick, switched on through Part 5's route when ticked (one at a time, each at the
 * version the last answer gave). An extra already on stays ticked: switching one off is Checkout
 * settings' job, with its warnings. An extra that could not come on is named, and set-up carries on.
 * While the online shop is on, or ticked now, "Sell products" stays ticked (the shop sells the
 * venue's products; owner decision, Part 4), and what is saved is the owner's choice or the shop's.
 */
export function UseStep({ data }: { data: SetupData }) {
  const runner = useStepRunner('use', data);
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  const toast = useToast();
  const saveSettings = useSaveCheckoutSettings();
  const switchesQuery = useFeatureSwitches();
  const setSwitch = useSetFeatureSwitch({ deferApply: true });
  const res = switchesQuery.data ?? null;
  const settings = data.settings.settings;
  const sellProducts = sellProductsFact(settings, data.status.answers);
  const [use, setUse] = useState<UsageAnswer>(() =>
    usageAnswerFrom({
      answers: data.status.answers,
      sellProducts,
      extrasOn: { vouchers: isVouchersEnabled(data.venue), loyalty: isLoyaltyEnabled(data.venue), shop: isShopEnabled(data.venue) },
    }),
  );

  const stateOf = (key: 'vouchers' | 'loyalty' | 'shop'): ExtraState => extraStateOf(res, key);
  const shopHoldsProducts = shopNeedsProducts(use, stateOf('shop'));

  const onContinue = () => {
    const answer: UsageAnswer = {
      ...use,
      products: productsWithShop(use, stateOf('shop')),
      // What is on is what the answer says, whatever the ticks were before the switches loaded.
      vouchers: use.vouchers || stateOf('vouchers') === 'on',
      loyalty: use.loyalty || stateOf('loyalty') === 'on',
      shop: use.shop || stateOf('shop') === 'on',
    };
    void runner.proceed(async () => {
      if (knowsSellProducts(settings) && settings.sell_products_enabled !== answer.products) {
        const saved = await saveSettings({ sell_products_enabled: answer.products });
        if (!saved.ok) return saved.message;
      }
      const toSwitch = extrasToSwitchOn(answer, res);
      if (toSwitch.length > 0 && res) {
        let current: PosFeatureSwitchesResponse = res;
        const missed: PosSwitchExtraKey[] = [];
        for (const feature of toSwitch) {
          try {
            const result = await setSwitch.mutateAsync({
              feature,
              on: true,
              client_request_id: newPaymentAttemptId(),
              version: current.switches[feature]?.version ?? 0,
            });
            if (result?.switches) current = result.switches;
          } catch {
            missed.push(feature);
          }
        }
        // The venue moves now, so the extras' screens and More's rows follow at once.
        if (current !== res) applySwitchResult(queryClient, accessToken, current);
        if (missed.length > 0) toast.error(setupT('app.setup.use.failed', { extras: extrasForSentence(missed) }));
      }
      return null;
    }, { use: answer });
  };

  return (
    <SetupFrame
      screen="use"
      data={data}
      title={setupT('setup.use.title')}
      intro={setupT('setup.use.help')}
      footer={
        <SetupButtons
          continueLabel={setupT('setup.use.continue')}
          onContinue={onContinue}
          busy={runner.busy}
          error={runner.error}
        />
      }>
      <View style={styles.list}>
        <TickRow
          title={setupT('setup.use.appointments')}
          detail={setupT('setup.use.appointments.note')}
          checked
          disabled
          onChange={() => undefined}
        />
        <TickRow
          title={setupT('setup.use.products')}
          detail={shopHoldsProducts ? setupT('setup.use.products.shopNote') : setupT('setup.use.products.note')}
          checked={use.products || shopHoldsProducts}
          disabled={shopHoldsProducts || runner.busy !== null}
          onChange={(products) => setUse((u) => ({ ...u, products }))}
        />
        {EXTRAS.map((extra) => {
          const state = stateOf(extra.key);
          if (state === 'hidden') return null;
          const on = state === 'on';
          return (
            <TickRow
              key={extra.key}
              title={setupT(extra.title)}
              detail={on ? setupT('app.setup.use.on') : state === 'paused' ? setupT('app.setup.use.paused') : setupT(extra.note)}
              checked={on || (state === 'offered' && use[extra.key])}
              disabled={state !== 'offered' || runner.busy !== null}
              onChange={(next) => setUse((u) => ({ ...u, [extra.key]: next }))}
            />
          );
        })}
      </View>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
});

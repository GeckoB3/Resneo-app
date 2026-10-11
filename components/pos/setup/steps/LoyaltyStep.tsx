import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { money } from '@/components/pos/parts';
import { ChoiceCard, ChoiceGroup, SetupSection } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { LoyaltyStamps } from '@/components/pos/settings-more/loyalty/LoyaltyStamps';
import { useLoyaltyPut } from '@/components/pos/settings-more/loyalty/useLoyaltyPut';
import { TickRow } from '@/components/pos/switches/parts';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { setupT } from '@/lib/pos/setup/copy';
import { currencySymbol, penceToText, textToPence } from '@/lib/pos/settings-form';
import { isStaleWrite, settingsErrorMessage, settingsMorePaths } from '@/lib/pos/settings-more/api';
import { SM_COPY } from '@/lib/pos/settings-more/copy';
import { settingsMoreKeys, useSettingsQuery } from '@/lib/pos/settings-more/hooks';
import { rewardText } from '@/lib/pos/settings-more/loyalty-copy';
import type { LoyaltyProgrammeResponse, LoyaltyRewardKind } from '@/lib/pos/settings-more/types';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

const MIN_STAMPS = 2;
const MAX_STAMPS = 20;

/**
 * W9, "Set up your loyalty card" (design 6.3, drawn as B11): only once the loyalty card is on. How
 * many visits fill a card, the reward (a free service, money off or a percentage off), which visits
 * count, that the card starts today, and the card as clients will see it. Saved through `PUT
 * /api/venue/pos/loyalty/programme`, every field at the first save, as Loyalty card set-up does.
 */
export function LoyaltyStep({ data }: { data: SetupData }) {
  const query = useSettingsQuery<LoyaltyProgrammeResponse>(settingsMoreKeys.loyalty, settingsMorePaths.loyaltyProgramme);
  const loaded = query.data?.programme && Array.isArray(query.data.services) ? query.data : null;
  if (query.isError && !loaded) {
    return (
      <SetupFrame screen="loyalty" data={data} title={setupT('setup.loy.title')}>
        <ErrorState message={settingsErrorMessage(query.error, SM_COPY['common.loadError'])} onRetry={() => void query.refetch()} />
      </SetupFrame>
    );
  }
  if (!loaded) {
    return (
      <SetupFrame screen="loyalty" data={data} title={setupT('setup.loy.title')}>
        <DetailSkeleton />
      </SetupFrame>
    );
  }
  return <LoyaltyForm data={data} loaded={loaded} />;
}

function LoyaltyForm({ data, loaded }: { data: SetupData; loaded: LoyaltyProgrammeResponse }) {
  const { colors } = useTheme();
  const runner = useStepRunner('loyalty', data);
  const queryClient = useQueryClient();
  const accessToken = useAccessToken();
  const put = useLoyaltyPut();
  const source = loaded.programme;
  const services = loaded.services;
  const [stamps, setStamps] = useState(source.stamps_needed || 6);
  const [kind, setKind] = useState<LoyaltyRewardKind>(source.reward_kind);
  const [serviceId, setServiceId] = useState<string | null>(source.reward_service_item_ids?.[0] ?? null);
  const [amountText, setAmountText] = useState(source.reward_amount_pence != null ? penceToText(source.reward_amount_pence) : '');
  const [percentText, setPercentText] = useState(source.reward_percent_bps != null ? String(source.reward_percent_bps / 100) : '');
  const [allServices, setAllServices] = useState(source.qualifying_service_item_ids === null);
  const [chosen, setChosen] = useState<string[]>(source.qualifying_service_item_ids ?? []);

  const amountPence = textToPence(amountText);
  const percentNumber = Number(percentText.trim().replace(',', '.'));
  const percentBps = percentText.trim() && Number.isFinite(percentNumber) ? Math.round(percentNumber * 100) : null;
  const rewardService = services.find((s) => s.id === serviceId) ?? null;
  const preview = rewardText(
    {
      reward_kind: kind,
      reward_service_name: rewardService?.name ?? null,
      reward_amount_pence: amountPence,
      reward_percent_bps: percentBps,
    },
    money,
  );

  const onContinue = () => {
    let problem: string | null = null;
    if (kind === 'free_service' && !serviceId) problem = setupT('app.setup.loy.reward.chooseService');
    if (kind === 'amount' && (amountPence === null || amountPence <= 0)) problem = setupT('app.setup.loy.reward.amountInvalid');
    if (kind === 'percent' && (percentBps === null || percentBps < 100 || percentBps > 10_000)) problem = setupT('app.setup.loy.reward.percentInvalid');
    if (!allServices && chosen.length === 0) problem = setupT('app.setup.loy.services.none');
    if (problem) {
      runner.setError(problem);
      return;
    }
    void runner.proceed(async () => {
      try {
        const next = await put({
          name: source.name,
          stamps_needed: stamps,
          qualifying_service_item_ids: allServices ? null : chosen,
          reward_kind: kind,
          reward_service_item_ids: kind === 'free_service' && serviceId ? [serviceId] : null,
          reward_amount_pence: kind === 'amount' ? amountPence : null,
          reward_percent_bps: kind === 'percent' ? percentBps : null,
          reward_valid_days: source.reward_valid_days,
          // A new card starts today (design 6.3); one already running keeps its date.
          started_on: source.set_up ? source.started_on : loaded.today,
          reward_email_enabled: source.reward_email_enabled,
          version: source.version,
        });
        queryClient.setQueryData(settingsMoreKeys.loyalty(accessToken), next);
        return null;
      } catch (e) {
        if (isStaleWrite(e)) {
          void queryClient.invalidateQueries({ queryKey: settingsMoreKeys.loyalty(accessToken) });
          return SM_COPY['err.POS_SETTINGS_STALE'];
        }
        return settingsErrorMessage(e);
      }
    });
  };

  const busy = runner.busy !== null;
  const previewCount = Math.min(2, stamps);
  const clearError = () => runner.setError(null);

  return (
    <SetupFrame
      screen="loyalty"
      data={data}
      title={setupT('setup.loy.title')}
      footer={<SetupButtons onContinue={onContinue} onSkip={() => void runner.skip()} busy={runner.busy} error={runner.error} />}>
      <Stepper
        label={setupT('setup.loy.stamps')}
        value={setupT('app.setup.loy.visits', { count: stamps })}
        onDecrement={() => setStamps((n) => Math.max(MIN_STAMPS, n - 1))}
        onIncrement={() => setStamps((n) => Math.min(MAX_STAMPS, n + 1))}
      />

      <ChoiceGroup label={setupT('setup.loy.reward.title')}>
        <ChoiceCard title={setupT('setup.loy.reward.free')} selected={kind === 'free_service'} onPress={() => setKind('free_service')} disabled={busy} />
        {kind === 'free_service' ? (
          <SetupSection title={setupT('setup.loy.reward.service')}>
            {services.map((s) => (
              <ChoiceCard
                key={s.id}
                title={s.name}
                note={money(s.price_pence)}
                selected={serviceId === s.id}
                onPress={() => {
                  setServiceId(s.id);
                  clearError();
                }}
                disabled={busy}
              />
            ))}
          </SetupSection>
        ) : null}
        <ChoiceCard title={setupT('setup.loy.reward.amount')} selected={kind === 'amount'} onPress={() => setKind('amount')} disabled={busy} />
        {kind === 'amount' ? (
          <Input
            label={setupT('setup.loy.reward.amountLabel')}
            value={amountText}
            onChangeText={(text) => {
              setAmountText(text);
              clearError();
            }}
            keyboardType="decimal-pad"
            editable={!busy}
            leftIcon={
              <Text variant="body" tone="muted">
                {currencySymbol(data.settings.venue?.currency)}
              </Text>
            }
          />
        ) : null}
        <ChoiceCard title={setupT('setup.loy.reward.percent')} selected={kind === 'percent'} onPress={() => setKind('percent')} disabled={busy} />
        {kind === 'percent' ? (
          <Input
            label={setupT('setup.loy.reward.percentLabel')}
            value={percentText}
            onChangeText={(text) => {
              setPercentText(text);
              clearError();
            }}
            keyboardType="decimal-pad"
            editable={!busy}
            rightSlot={
              <Text variant="body" tone="muted">
                %
              </Text>
            }
          />
        ) : null}
      </ChoiceGroup>

      <ChoiceGroup label={setupT('setup.loy.services.title')}>
        <ChoiceCard title={setupT('setup.loy.services.all')} selected={allServices} onPress={() => setAllServices(true)} disabled={busy} />
        <ChoiceCard title={setupT('setup.loy.services.some')} selected={!allServices} onPress={() => setAllServices(false)} disabled={busy} />
        {!allServices ? (
          <View style={styles.list}>
            {services.map((s) => (
              <TickRow
                key={s.id}
                title={s.name}
                checked={chosen.includes(s.id)}
                onChange={(on) => {
                  setChosen((list) => (on ? [...list, s.id] : list.filter((id) => id !== s.id)));
                  clearError();
                }}
                disabled={busy}
              />
            ))}
          </View>
        ) : null}
      </ChoiceGroup>

      <Text variant="bodySmall" tone="secondary">
        {setupT('setup.loy.start')}
      </Text>

      <View style={styles.stack}>
        <Text variant="label">{setupT('setup.loy.preview')}</Text>
        <View style={[styles.card, { borderColor: colors.brandBorder, backgroundColor: colors.brandSubtle }]}>
          <Text variant="overline" tone="brand">
            {data.settings.venue?.name || data.venue.name}
          </Text>
          <LoyaltyStamps count={previewCount} needed={stamps} />
          <Text variant="bodySmall">{preview}</Text>
        </View>
      </View>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  list: { gap: spacing.sm },
  card: { gap: spacing.sm, borderWidth: 1, borderRadius: radius.card, padding: spacing.base },
});

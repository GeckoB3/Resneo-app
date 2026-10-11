import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSettingsT } from '@/components/pos/settings/SettingsParts';
import { ChoiceCard, ChoiceGroup } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { TickRow } from '@/components/pos/switches/parts';
import { Text } from '@/components/ui/Text';
import { tippingPolicyTemplate, type SettingsCopyId } from '@/lib/pos/settings-copy';
import { tipRuleFrom, tipsAnswerFrom, tipsSettingsFor, type TipsAnswer } from '@/lib/pos/setup/answers';
import { setupT, type SetupCopyId } from '@/lib/pos/setup/copy';
import { useSaveCheckoutSettings } from '@/lib/queries/useCheckoutSettings';
import { usePosBootstrap } from '@/lib/queries/usePos';
import { spacing } from '@/theme/index';
import type { PosTipRule } from '@/types/pos-settings';

const ANSWERS: { value: TipsAnswer; title: SetupCopyId }[] = [
  { value: 'yes', title: 'setup.tips.yes' },
  { value: 'no', title: 'setup.tips.no' },
  { value: 'unsure', title: 'setup.tips.unsure' },
];

const RULES: { value: PosTipRule; title: SetupCopyId }[] = [
  { value: 'pro_rata_services', title: 'setup.tips.share.pro_rata' },
  { value: 'equal_performers', title: 'setup.tips.share.equal' },
  { value: 'operator', title: 'setup.tips.share.operator' },
];

/**
 * W4, "Do your clients leave tips?" (design 6.3, drawn as B5): one question instead of a card of
 * eight settings. "Yes" turns tips on, asks how they are shared (a one-calendar business reads
 * "Tips go to you." instead) and offers the tipping policy template when there is none yet; "No"
 * and "Not sure yet" leave tips off. The suggestions keep their defaults.
 */
export function TipsStep({ data }: { data: SetupData }) {
  const runner = useStepRunner('tips', data);
  const saveSettings = useSaveCheckoutSettings();
  const boot = usePosBootstrap();
  const { t, words } = useSettingsT();
  const settings = data.settings.settings;
  const [tips, setTips] = useState<TipsAnswer | null>(() => tipsAnswerFrom(data.status.answers, settings));
  const [rule, setRule] = useState<PosTipRule>(() => tipRuleFrom(settings));
  const hasPolicy = Boolean(settings.tipping_policy?.trim());
  const [policy, setPolicy] = useState(!hasPolicy);
  // One team calendar: tips go to the one person who does the services.
  const solo = (boot.data?.operators ?? []).filter((o) => o.calendar_id).length <= 1;

  const onContinue = () => {
    if (!tips) return;
    const venueName = settings.trading_name?.trim() || data.settings.venue?.name || data.venue.name;
    const template =
      tips === 'yes' && policy && !hasPolicy
        ? tippingPolicyTemplate(venueName, words.client, t(`set.tips.policy.rule.${solo ? settings.tip_allocation_rule : rule}` as SettingsCopyId))
        : null;
    void runner.proceed(async () => {
      const partial = tipsSettingsFor({ tips, rule, solo, policy: template, current: settings });
      if (Object.keys(partial).length === 0) return null;
      const saved = await saveSettings(partial);
      return saved.ok ? null : saved.message;
    }, { tips });
  };

  return (
    <SetupFrame
      screen="tips"
      data={data}
      title={setupT('setup.tips.title')}
      footer={
        <SetupButtons
          onContinue={onContinue}
          onSkip={() => void runner.skip()}
          busy={runner.busy}
          continueDisabled={!tips}
          error={runner.error}
        />
      }>
      <ChoiceGroup>
        {ANSWERS.map((answer) => (
          <ChoiceCard
            key={answer.value}
            title={setupT(answer.title)}
            selected={tips === answer.value}
            onPress={() => setTips(answer.value)}
            disabled={runner.busy !== null}
          />
        ))}
      </ChoiceGroup>

      {tips === 'unsure' ? (
        <Text variant="bodySmall" tone="secondary">
          {setupT('app.setup.tips.unsure.note')}
        </Text>
      ) : null}

      {tips === 'yes' ? (
        <View style={styles.stack}>
          {solo ? (
            <Text variant="bodyMedium">{setupT('setup.tips.share.solo')}</Text>
          ) : (
            <ChoiceGroup label={setupT('setup.tips.share.title')}>
              {RULES.map((r) => (
                <ChoiceCard
                  key={r.value}
                  title={setupT(r.title)}
                  selected={rule === r.value}
                  onPress={() => setRule(r.value)}
                  disabled={runner.busy !== null}
                />
              ))}
            </ChoiceGroup>
          )}
          <Text variant="bodySmall" tone="secondary">
            {setupT('setup.tips.note')}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {setupT('setup.tips.suggest')}
          </Text>
          {hasPolicy ? (
            <Text variant="caption" tone="muted">
              {setupT('app.setup.tips.policy.exists')}
            </Text>
          ) : (
            <TickRow
              title={setupT('setup.tips.policy')}
              detail={setupT('setup.tips.policy.note')}
              checked={policy}
              onChange={setPolicy}
              disabled={runner.busy !== null}
            />
          )}
        </View>
      ) : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
});

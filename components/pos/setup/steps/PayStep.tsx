import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard, ChoiceGroup } from '@/components/pos/setup/parts';
import { SetupButtons, SetupFrame, type SetupData } from '@/components/pos/setup/SetupFrame';
import { useStepRunner } from '@/components/pos/setup/useStepRunner';
import { TickRow } from '@/components/pos/switches/parts';
import { Input } from '@/components/ui/Input';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { cashSettingsFor, floatFromText, payAnswerFrom, paymentTypeWrites, type PayAnswer } from '@/lib/pos/setup/answers';
import { setupT } from '@/lib/pos/setup/copy';
import { currencySymbol, penceToText } from '@/lib/pos/settings-form';
import { settingsPaths, useSaveCheckoutSettings, useSettingsPaymentTypes, useSettingsWrite } from '@/lib/queries/useCheckoutSettings';
import { usePosBootstrap } from '@/lib/queries/usePos';
import { spacing } from '@/theme/index';

/**
 * W2, "How do your clients pay?" (design 6.3, drawn as B3). Each way of taking money is a tick;
 * "Bank transfer" and "Another card machine" keep the matching payment types on or switch them off
 * (never deleted, design 6.4). With cash ticked: "Yes, help me count it" turns on Count cash in till
 * sessions with the usual float; "No, just record it" turns it off. Card leads to W3.
 *
 * The payment types are read once the POS bootstrap has answered, as the bootstrap is what gives a
 * new venue its suggested types.
 */
export function PayStep({ data }: { data: SetupData }) {
  const runner = useStepRunner('pay', data);
  const boot = usePosBootstrap();
  const types = useSettingsPaymentTypes({ enabled: Boolean(boot.data) });
  const write = useSettingsWrite();
  const saveSettings = useSaveCheckoutSettings();
  const settings = data.settings.settings;
  const initial = useMemo(
    () => (types.data ? payAnswerFrom({ answers: data.status.answers, paymentTypes: types.data, settings }) : null),
    [data.status.answers, settings, types.data],
  );
  const [edits, setEdits] = useState<Partial<PayAnswer>>({});
  const [floatText, setFloatText] = useState<string | null>(null);

  const pay: PayAnswer | null = initial ? { ...initial, ...edits } : null;
  const set = (patch: Partial<PayAnswer>) => setEdits((e) => ({ ...e, ...patch }));
  const shownFloat = floatText ?? (pay?.float_pence != null ? penceToText(pay.float_pence) : '');
  const nothing = pay ? !pay.card && !pay.cash && !pay.transfer && !pay.other_machine : true;

  const onContinue = () => {
    if (!pay || !types.data) return;
    const float = pay.count_cash ? (floatText !== null ? floatFromText(floatText) : pay.float_pence) : null;
    if (float !== null && Number.isNaN(float)) {
      runner.setError(setupT('setup.pay.cash.float.bad'));
      return;
    }
    const answer: PayAnswer = { ...pay, count_cash: pay.cash ? pay.count_cash : null, float_pence: pay.cash && pay.count_cash ? float : null };
    const list = types.data;
    void runner.proceed(async () => {
      const { update, create } = paymentTypeWrites(answer, list);
      for (const row of update) {
        const r = await write(settingsPaths.paymentType(row.id), 'PATCH', { is_active: row.is_active, version: row.version });
        if (!r.ok) return r.message;
      }
      for (const name of create) {
        const r = await write(settingsPaths.paymentTypes, 'POST', { name, requires_reference: false });
        if (!r.ok) return r.message;
      }
      if (update.length > 0 || create.length > 0) void types.refetch();
      const cash = cashSettingsFor(answer, settings);
      if (Object.keys(cash).length > 0) {
        const saved = await saveSettings(cash);
        if (!saved.ok) return saved.message;
      }
      return null;
    }, { pay: answer });
  };

  return (
    <SetupFrame
      screen="pay"
      data={data}
      title={setupT('setup.pay.title')}
      intro={setupT('setup.pay.help')}
      footer={
        <SetupButtons
          onContinue={onContinue}
          onSkip={() => void runner.skip()}
          busy={runner.busy}
          continueDisabled={!pay || nothing}
          error={runner.error}
        />
      }>
      {!pay ? (
        <DetailSkeleton />
      ) : (
        <View style={styles.stack}>
          <TickRow title={setupT('setup.pay.card')} checked={pay.card} onChange={(card) => set({ card })} />
          <TickRow title={setupT('setup.pay.cash')} checked={pay.cash} onChange={(cash) => set({ cash })} />
          <TickRow title={setupT('setup.pay.transfer')} checked={pay.transfer} onChange={(transfer) => set({ transfer })} />
          <TickRow
            title={setupT('setup.pay.otherMachine')}
            detail={setupT('setup.pay.otherMachine.note')}
            checked={pay.other_machine}
            onChange={(other_machine) => set({ other_machine })}
          />
          {pay.cash ? (
            <ChoiceGroup label={setupT('setup.pay.cash.count.title')}>
              <ChoiceCard
                title={setupT('setup.pay.cash.count.yes')}
                note={setupT('setup.pay.cash.count.yes.note')}
                selected={pay.count_cash === true}
                onPress={() => set({ count_cash: true })}
              />
              {pay.count_cash === true ? (
                <Input
                  label={setupT('setup.pay.cash.float')}
                  value={shownFloat}
                  onChangeText={(text) => {
                    setFloatText(text);
                    runner.setError(null);
                  }}
                  keyboardType="decimal-pad"
                  leftIcon={
                    <Text variant="body" tone="muted">
                      {currencySymbol(data.settings.venue?.currency)}
                    </Text>
                  }
                />
              ) : null}
              <ChoiceCard
                title={setupT('setup.pay.cash.count.no')}
                selected={pay.count_cash === false}
                onPress={() => set({ count_cash: false })}
              />
            </ChoiceGroup>
          ) : null}
        </View>
      )}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
});

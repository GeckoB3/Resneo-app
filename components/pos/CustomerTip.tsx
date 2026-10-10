import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, money, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { checkPaymentAmount, parseMoneyInput, tipBasePence, tipConfig, tipSuggestions } from '@/lib/pos/sale-math';
import { spacing } from '@/theme/index';
import type { PosSale, PosTipSettings } from '@/types/pos';

/**
 * The customer-facing tip screen (UX spec §3.18, §13.3, §23.5; owner 2026-10-10). Tap to Pay and
 * the WisePad 3 ask for no tip themselves, so the phone asks, and it asks the client, not staff:
 *
 * 1. once the card reader is ready, staff see `app.tip.handTo` and hand the phone over;
 * 2. the client sees the total, the venue's suggestions as large buttons with "No tip" the same
 *    size and nothing chosen for them, "Another amount" when the venue allows one, and `Pay {total}`;
 * 3. the card is then read straight away, so the client taps without handing the phone back first.
 *
 * Staff's way out is the small Cancel under it, which brings back the card screen.
 */

export type CustomerTipInput = {
  sale: Pick<PosSale, 'lines' | 'total_pence'>;
  tipSettings: PosTipSettings | null | undefined;
  /** What this card payment takes before the tip. */
  amountPence: number;
  /** What is left to pay, for the amount check (the amount itself for a sale sent to a phone). */
  balancePence: number;
  maxPaymentPence: number | null;
  venueName: string;
  /** The client's first name, for the hand-over line; null for a sale without one. */
  clientName: string | null;
};

export function CustomerTipScreen({
  input,
  onChoose,
  onCancel,
}: {
  input: CustomerTipInput;
  onChoose: (tipPence: number) => void;
  onCancel: () => void;
}) {
  const t = usePosT();
  const tips = useMemo(() => tipConfig(input.tipSettings), [input.tipSettings]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [custom, setCustom] = useState('');

  const base = tipBasePence(input.sale, tips.base, input.amountPence);
  const suggestions = tipSuggestions({ basePence: base, percents: tips.percents, amounts: tips.amounts, thresholdPence: tips.thresholdPence });
  const customPence = parseMoneyInput(custom);
  const tip = custom !== '' ? customPence : chosen;
  const ceiling = checkPaymentAmount({
    amountPence: input.amountPence,
    balancePence: input.balancePence,
    maxPaymentPence: input.maxPaymentPence,
    tipPence: tip ?? 0,
  });
  const options = [
    ...suggestions.map((s) => ({
      pence: s.amountPence,
      label: s.kind === 'percent' ? t('tip.preset', { percent: s.percent, amount: money(s.amountPence) }) : t('tip.preset.amount', { amount: money(s.amountPence) }),
    })),
    { pence: 0, label: t('tip.noTip') },
  ];

  return (
    <View style={posStyles.stack} accessibilityViewIsModal>
      <Text variant="title">{t('app.tip.title')}</Text>
      <Text variant="heading">{t('app.tip.total', { amount: money(input.amountPence) })}</Text>
      <Text variant="bodySmall" tone="muted">
        {tips.base === 'services' ? t('tip.base.services', { amount: money(base) }) : t('tip.base.total', { amount: money(base) })}
      </Text>
      {/* Every choice the same size, "No tip" included, and none chosen for them. */}
      <View style={styles.grid}>
        {options.map((o) => {
          const selected = custom === '' && chosen === o.pence;
          return (
            <View key={o.label} style={styles.cell}>
              <Button
                label={o.label}
                size="lg"
                variant={selected ? 'primary' : 'secondary'}
                accessibilityState={{ selected }}
                onPress={() => {
                  setCustom('');
                  setChosen(o.pence);
                }}
                fullWidth
              />
            </View>
          );
        })}
      </View>
      {tips.customAllowed ? (
        <Input
          label={t('tip.custom')}
          accessibilityLabel={t('tip.custom')}
          value={custom}
          onChangeText={setCustom}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
      ) : null}
      {ceiling === 'above_ceiling' ? <ErrorLine message={t('err.ceiling', { max: money(input.maxPaymentPence ?? 0), venue: input.venueName })} /> : null}
      <Button
        label={t('app.tip.pay', { amount: money(input.amountPence + (tip ?? 0)) })}
        size="lg"
        disabled={tip == null || ceiling !== null}
        onPress={() => onChoose(tip ?? 0)}
        fullWidth
      />
      <Button label={t('app.card.cancel')} variant="ghost" size="sm" onPress={onCancel} fullWidth />
    </View>
  );
}

/**
 * Asks the client for a tip from inside a card payment: `ask()` shows staff the hand-over line,
 * then the client's screen, and resolves the tip (null when staff or the client cancelled).
 */
export function useCustomerTipPrompt(input: CustomerTipInput | null) {
  const t = usePosT();
  const [stage, setStage] = useState<'handTo' | 'choose' | null>(null);
  const resolver = useRef<((tip: number | null) => void) | null>(null);

  const finish = useCallback((tip: number | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    setStage(null);
    resolve?.(tip);
  }, []);

  const ask = useCallback(
    () =>
      new Promise<number | null>((resolve) => {
        resolver.current = resolve;
        setStage('handTo');
      }),
    [],
  );

  /** Clears the question (staff cancelled, or the screen went away). */
  const reset = useCallback(() => {
    if (resolver.current) finish(null);
  }, [finish]);

  let view: ReactNode = null;
  if (input && stage === 'handTo') {
    view = (
      <View style={posStyles.stack}>
        <Text variant="title">{money(input.amountPence)}</Text>
        <Text variant="bodyMedium">
          {input.clientName ? t('app.tip.handTo', { clientName: input.clientName }) : t('app.tip.handTo.anon')}
        </Text>
        <Button label={t('app.tip.ready')} onPress={() => setStage('choose')} fullWidth />
        <Button label={t('app.card.cancel')} variant="ghost" onPress={() => finish(null)} fullWidth />
      </View>
    );
  } else if (input && stage === 'choose') {
    view = <CustomerTipScreen input={input} onChoose={(tip) => finish(tip)} onCancel={() => finish(null)} />;
  }

  return { ask, view, active: stage !== null, facing: stage === 'choose', reset };
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '47%', flexGrow: 1 },
});

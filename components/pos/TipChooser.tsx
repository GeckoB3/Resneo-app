import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips, ErrorLine, money, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { checkPaymentAmount, parseMoneyInput, tipBasePence, tipConfig, tipSuggestions } from '@/lib/pos/sale-math';
import type { PosSale, PosTipSettings } from '@/types/pos';

/**
 * The app's own tip screen before a card payment (UX spec §3.18, §13.3, §13.4; `app.tip.title`):
 * Tap to Pay and the WisePad 3 ask for no tip themselves, so the phone asks first. The venue's
 * suggestions on the tip base (services or the whole bill), "No tip", and a typed amount when the
 * venue allows one. Used by the payment sheet and by the screen for a sale sent from the web till.
 */
export function TipChooser({
  sale,
  tipSettings,
  amountPence,
  balancePence,
  maxPaymentPence,
  venueName,
  onContinue,
  onBack,
  backLabel,
}: {
  sale: Pick<PosSale, 'lines' | 'total_pence'>;
  tipSettings: PosTipSettings | null | undefined;
  amountPence: number;
  /** What is left to pay, for the amount check (the amount itself for a sale sent to a phone). */
  balancePence: number;
  maxPaymentPence: number | null;
  venueName: string;
  onContinue: (tipPence: number) => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const t = usePosT();
  const tips = useMemo(() => tipConfig(tipSettings), [tipSettings]);
  const [cardTip, setCardTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');

  const tipBase = tipBasePence(sale, tips.base, amountPence);
  const suggestions = tipSuggestions({
    basePence: tipBase,
    percents: tips.percents,
    amounts: tips.amounts,
    thresholdPence: tips.thresholdPence,
  });
  const customTipPence = parseMoneyInput(customTip);
  const cardTipPence = cardTip ?? 0;
  const ceiling = checkPaymentAmount({
    amountPence,
    balancePence,
    maxPaymentPence,
    tipPence: cardTipPence,
  });

  return (
    <View style={posStyles.stack}>
      <Text variant="bodySmall" tone="muted">
        {tips.base === 'services' ? t('tip.base.services', { amount: money(tipBase) }) : t('tip.base.total', { amount: money(tipBase) })}
      </Text>
      <ChoiceChips
        options={[
          ...suggestions.map((s) => ({
            value: String(s.amountPence),
            label:
              s.kind === 'percent'
                ? t('tip.preset', { percent: s.percent, amount: money(s.amountPence) })
                : t('tip.preset.amount', { amount: money(s.amountPence) }),
          })),
          { value: '0', label: t('tip.noTip') },
        ]}
        value={cardTip != null && customTip === '' ? String(cardTip) : null}
        onChange={(v) => {
          setCustomTip('');
          setCardTip(Number(v));
        }}
      />
      {tips.customAllowed ? (
        <Input
          label={t('tip.custom')}
          accessibilityLabel={t('tip.custom')}
          value={customTip}
          onChangeText={(v) => {
            setCustomTip(v);
            setCardTip(parseMoneyInput(v));
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
      ) : null}
      {ceiling === 'above_ceiling' ? <ErrorLine message={t('err.ceiling', { max: money(maxPaymentPence ?? 0), venue: venueName })} /> : null}
      <Button
        label={t('app.pay.withTip', { amount: money(amountPence + cardTipPence) })}
        disabled={cardTip == null || (customTip !== '' && customTipPence == null) || ceiling !== null}
        onPress={() => onContinue(cardTipPence)}
        fullWidth
      />
      <Button label={backLabel ?? t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
    </View>
  );
}

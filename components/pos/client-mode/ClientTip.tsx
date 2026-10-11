import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ClientButton, ClientFrame, ClientText, CLIENT_TEXT_SCALE } from '@/components/pos/client-mode/ClientFrame';
import { money, usePosT } from '@/components/pos/parts';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { checkPaymentAmount, tipBasePence, tipConfig, tipSuggestions } from '@/lib/pos/sale-math';
import { clientColors, fonts, radius, spacing } from '@/theme/index';
import type { PosSale, PosTipSettings } from '@/types/pos';

/** What the client's tip screen needs (the same input as the older `CustomerTipScreen`). */
export type ClientTipInput = {
  sale: Pick<PosSale, 'lines' | 'total_pence'>;
  tipSettings: PosTipSettings | null | undefined;
  /** What this card payment takes before the tip. */
  amountPence: number;
  /** What is left to pay, for the amount check. */
  balancePence: number;
  maxPaymentPence: number | null;
  venueName: string;
  clientName: string | null;
  logoUrl?: string | null;
};

type Option = { key: string; pence: number; main: string; sub: string | null; a11y: string };

/**
 * S2, the client's tip (research §6.3): the bill, the venue's suggestions in ascending order with
 * "No tip" as an equal option, nothing chosen for them, "Another amount" when the venue allows one,
 * and a pinned teal "Pay {total}" that names the final total. Staff's way out is the corner close.
 */
export function ClientTip({
  input,
  initialTip = null,
  onChoose,
  onStaffClose,
}: {
  input: ClientTipInput;
  /** A tip already chosen (changing it after a decline): shown selected. */
  initialTip?: number | null;
  onChoose: (tipPence: number) => void;
  onStaffClose: () => void;
}) {
  const t = usePosT();
  const { fontScale } = useWindowDimensions();
  const tips = useMemo(() => tipConfig(input.tipSettings), [input.tipSettings]);
  const base = tipBasePence(input.sale, tips.base, input.amountPence);
  const options: Option[] = useMemo(() => {
    const suggestions = tipSuggestions({
      basePence: base,
      percents: tips.percents,
      amounts: tips.amounts,
      thresholdPence: tips.thresholdPence,
    })
      .slice()
      .sort((a, b) => a.amountPence - b.amountPence);
    const list: Option[] = suggestions.map((s) =>
      s.kind === 'percent'
        ? {
            key: `p${s.percent}`,
            pence: s.amountPence,
            main: `${s.percent}%`,
            sub: money(s.amountPence),
            a11y: t('app.tip.option.a11y', { percent: s.percent, amount: money(s.amountPence) }),
          }
        : { key: `a${s.amountPence}`, pence: s.amountPence, main: money(s.amountPence), sub: null, a11y: money(s.amountPence) },
    );
    list.push({ key: 'none', pence: 0, main: t('tip.noTip'), sub: null, a11y: t('tip.noTip') });
    return list;
  }, [base, tips, t]);

  const presetMatch = initialTip != null ? options.find((o) => o.pence === initialTip) ?? null : null;
  const [chosen, setChosen] = useState<string | null>(presetMatch?.key ?? null);
  const [custom, setCustom] = useState<number | null>(initialTip != null && !presetMatch ? initialTip : null);
  const [keypad, setKeypad] = useState(false);

  const tip = custom != null ? custom : options.find((o) => o.key === chosen)?.pence ?? null;
  const ceiling =
    tip == null
      ? null
      : checkPaymentAmount({
          amountPence: input.amountPence,
          balancePence: input.balancePence,
          maxPaymentPence: input.maxPaymentPence,
          tipPence: tip,
        });

  if (keypad) {
    return (
      <ClientCustomTip
        input={input}
        start={custom ?? 0}
        onBack={() => setKeypad(false)}
        onAdd={(pence) => {
          setCustom(pence);
          setChosen(null);
          setKeypad(false);
        }}
        onStaffClose={onStaffClose}
      />
    );
  }

  const oneColumn = options.length !== 4 || fontScale > 1.35;
  const billLine =
    input.amountPence < input.sale.total_pence
      ? t('app.tip.part', { amount: money(input.amountPence) })
      : t('app.tip.bill', { amount: money(input.amountPence) });
  // The basis only when it differs from what they are paying (services-only tips).
  const basisLine =
    base !== input.amountPence ? (tips.base === 'services' ? t('tip.base.services', { amount: money(base) }) : null) : null;

  return (
    <ClientFrame
      venueName={input.venueName}
      logoUrl={input.logoUrl}
      onStaffClose={onStaffClose}
      staffCloseLabel={t('app.client.stop.a11y')}
      screenKey="tip"
      footer={
        <>
          <ClientText role="small" accessibilityLiveRegion="polite">
            {tip == null ? ' ' : tip > 0 ? t('app.tip.summary', { bill: money(input.amountPence), tip: money(tip) }) : t('app.tip.summary.none')}
          </ClientText>
          {ceiling === 'above_ceiling' ? (
            <ClientText role="small" color={clientColors.error}>
              {t('err.ceiling', { max: money(input.maxPaymentPence ?? 0), venue: input.venueName })}
            </ClientText>
          ) : null}
          <ClientButton
            label={tip == null ? t('app.tip.choose') : t('app.tip.pay', { amount: money(input.amountPence + tip) })}
            accessibilityLabel={
              tip != null && tip > 0
                ? t('app.tip.pay.a11y', { total: money(input.amountPence + tip), tip: money(tip) })
                : undefined
            }
            disabled={tip == null || ceiling !== null}
            onPress={() => {
              if (tip != null && ceiling === null) onChoose(tip);
            }}
            testID="client-tip-pay"
          />
        </>
      }>
      <View style={styles.head}>
        <ClientText role="question" accessibilityRole="header">
          {t('app.tip.title')}
        </ClientText>
        <ClientText role="small">{t('tip.cv.optional')}</ClientText>
        <ClientText role="body">{billLine}</ClientText>
        {basisLine ? <ClientText role="small">{basisLine}</ClientText> : null}
      </View>
      <View style={[styles.grid, oneColumn ? styles.oneColumn : null]} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = custom == null && chosen === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => {
                hapticSelect();
                setCustom(null);
                setChosen(o.key);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={o.a11y}
              style={({ pressed }) => [
                styles.option,
                oneColumn ? styles.optionFull : styles.optionHalf,
                selected ? styles.optionSelected : null,
                pressed && !selected ? { backgroundColor: clientColors.bg } : null,
              ]}>
              {selected ? (
                <View style={styles.check}>
                  <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} weight="bold" tintColor={clientColors.onAccent} />
                </View>
              ) : null}
              <ClientText role="option" color={selected ? clientColors.onAccent : undefined}>
                {o.main}
              </ClientText>
              {o.sub ? (
                <ClientText role="optionSub" color={selected ? clientColors.onAccent : undefined}>
                  {o.sub}
                </ClientText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {tips.customAllowed ? (
        custom != null ? (
          <Pressable
            onPress={() => setKeypad(true)}
            accessibilityRole="radio"
            accessibilityState={{ checked: true }}
            accessibilityLabel={`${t('app.tip.custom.chosen', { amount: money(custom) })}. ${t('tip.goesTo.change')}`}
            style={[styles.option, styles.optionFull, styles.optionSelected, styles.customRow]}>
            <ClientText role="option" color={clientColors.onAccent}>
              {t('app.tip.custom.chosen', { amount: money(custom) })}
            </ClientText>
            <ClientText role="optionSub" color={clientColors.onAccent}>
              {t('tip.goesTo.change')}
            </ClientText>
          </Pressable>
        ) : (
          <ClientButton label={t('tip.custom')} tone="outline" onPress={() => setKeypad(true)} />
        )
      ) : null}
    </ClientFrame>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/**
 * S2b, another amount: typed as on a till (5, 0, 0 shows £5.00) on our own keypad, so no system
 * keyboard covers the button. A tip over half the bill asks "Is that right?" first.
 */
export function ClientCustomTip({
  input,
  start,
  onBack,
  onAdd,
  onStaffClose,
}: {
  input: ClientTipInput;
  start: number;
  onBack: () => void;
  onAdd: (pence: number) => void;
  onStaffClose: () => void;
}) {
  const t = usePosT();
  const { height } = useWindowDimensions();
  const [pence, setPence] = useState(start);
  const [checking, setChecking] = useState(false);
  const keyHeight = height < 700 ? 56 : 64;
  const ceiling = checkPaymentAmount({
    amountPence: input.amountPence,
    balancePence: input.balancePence,
    maxPaymentPence: input.maxPaymentPence,
    tipPence: pence,
  });

  const press = (key: (typeof KEYS)[number]) => {
    if (key === '') return;
    hapticSelect();
    setChecking(false);
    if (key === 'del') return setPence((p) => Math.floor(p / 10));
    setPence((p) => (p >= 1_000_000 ? p : p * 10 + Number(key)));
  };

  const add = () => {
    if (pence <= 0 || ceiling !== null) return;
    if (pence * 2 > input.amountPence && !checking) return setChecking(true);
    onAdd(pence);
  };

  return (
    <ClientFrame
      venueName={input.venueName}
      logoUrl={input.logoUrl}
      onStaffClose={onStaffClose}
      staffCloseLabel={t('app.client.stop.a11y')}
      screenKey="custom"
      footer={
        checking ? (
          <>
            <ClientText role="body" color={clientColors.text}>
              {t('app.tip.custom.check', { tip: money(pence), bill: money(input.amountPence) })}
            </ClientText>
            <ClientButton label={t('app.tip.custom.yes')} onPress={() => onAdd(pence)} />
            <ClientButton label={t('app.tip.custom.change')} tone="outline" onPress={() => setChecking(false)} />
          </>
        ) : (
          <ClientButton
            label={t('app.tip.custom.add', { amount: money(pence) })}
            disabled={pence <= 0 || ceiling !== null}
            onPress={add}
            testID="client-tip-custom-add"
          />
        )
      }>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('app.tip.custom.back')} style={styles.back} hitSlop={8}>
        <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} tintColor={clientColors.textSecondary} />
        <Text maxFontSizeMultiplier={CLIENT_TEXT_SCALE} style={styles.backLabel}>
          {t('app.tip.custom.back')}
        </Text>
      </Pressable>
      <ClientText role="question" accessibilityRole="header">
        {t('app.tip.custom.title')}
      </ClientText>
      <ClientText role="hero" accessibilityLiveRegion="polite" testID="client-tip-custom-amount">
        {money(pence)}
      </ClientText>
      <ClientText role="body">{t('app.tip.custom.total', { amount: money(input.amountPence + pence) })}</ClientText>
      {ceiling === 'above_ceiling' ? (
        <ClientText role="small" color={clientColors.error}>
          {t('err.ceiling', { max: money(input.maxPaymentPence ?? 0), venue: input.venueName })}
        </ClientText>
      ) : null}
      <View style={styles.keypad}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <View key={`blank-${i}`} style={[styles.key, { minHeight: keyHeight }]} />
          ) : (
            <Pressable
              key={key}
              onPress={() => press(key)}
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? t('app.tip.custom.delete') : key}
              style={({ pressed }) => [styles.key, { minHeight: keyHeight }, pressed ? { backgroundColor: clientColors.pressedFill } : null]}>
              {key === 'del' ? (
                <SymbolView name={{ ios: 'delete.left', android: 'backspace', web: 'backspace' }} size={26} tintColor={clientColors.text} />
              ) : (
                <Text maxFontSizeMultiplier={1.4} style={styles.keyLabel}>
                  {key}
                </Text>
              )}
            </Pressable>
          ),
        )}
      </View>
    </ClientFrame>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  oneColumn: { flexDirection: 'column' },
  option: {
    minHeight: 96,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: clientColors.optionBorder,
    backgroundColor: clientColors.option,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.xxs,
  },
  optionHalf: { flexBasis: '47%', flexGrow: 1 },
  optionFull: { alignSelf: 'stretch', minHeight: 80 },
  optionSelected: { backgroundColor: clientColors.accent, borderColor: clientColors.accent },
  customRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, alignSelf: 'flex-start' },
  backLabel: { fontFamily: fonts.semibold, fontSize: 17, color: clientColors.textSecondary },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  key: { flexBasis: '31%', flexGrow: 1, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  keyLabel: { fontFamily: fonts.semibold, fontSize: 28, color: clientColors.text },
});

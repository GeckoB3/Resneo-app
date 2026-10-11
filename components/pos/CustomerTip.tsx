import { useCallback, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ClientText, ClientVenue } from '@/components/pos/client-mode/ClientFrame';
import { ClientTip, type ClientTipInput } from '@/components/pos/client-mode/ClientTip';
import { money, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSelect } from '@/lib/haptics';
import { clientColors, radius, spacing } from '@/theme/index';

/**
 * The customer-facing tip (UX spec §3.18, §13.3, §23.5; owner 2026-10-10; redesigned in the POS
 * test round 2026-10-11, research `part3-tip-research.md`). Tap to Pay and the WisePad 3 ask for no
 * tip themselves, so the phone asks, and it asks the client, not staff:
 *
 * 1. once the card reader is ready, staff see the hand-over card (`app.tip.handTo`) with a navy
 *    preview of what the client will see, and press "Hand over";
 * 2. the phone turns into client mode (`ClientTip`): the bill, the venue's suggestions in ascending
 *    order with "No tip" the same size and nothing chosen for them, "Another amount" when the venue
 *    allows one, and "Pay {total}";
 * 3. the card is then read straight away, so the client taps without handing the phone back first.
 *
 * Staff's way out is the corner close, which asks before stopping (the card panel's stop panel).
 */

export type CustomerTipInput = ClientTipInput;

/** The client's tip screen on its own (kept for callers and tests that show just this step). */
export function CustomerTipScreen({
  input,
  onChoose,
  onCancel,
}: {
  input: CustomerTipInput;
  onChoose: (tipPence: number) => void;
  onCancel: () => void;
}) {
  return <ClientTip input={input} onChoose={onChoose} onStaffClose={onCancel} />;
}

/**
 * Asks the client for a tip from inside a card payment: `ask()` shows staff the hand-over card,
 * then the client's screen, and resolves the tip (null when staff stopped it). The card panel draws
 * the client's screen while `stage` is 'choose' and calls `choose` with their answer.
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

  /** Starts the question. `clientHolds` skips the hand-over when the client already has the phone. */
  const ask = useCallback(
    (opts: { clientHolds?: boolean } = {}) =>
      new Promise<number | null>((resolve) => {
        resolver.current = resolve;
        setStage(opts.clientHolds ? 'choose' : 'handTo');
      }),
    [],
  );

  /** Clears the question (staff stopped, or the screen went away). */
  const reset = useCallback(() => {
    if (resolver.current) finish(null);
  }, [finish]);

  let handToView: ReactNode = null;
  if (input && stage === 'handTo') {
    handToView = (
      <View style={posStyles.stack}>
        <Text variant="heading">
          {input.clientName ? t('app.tip.handTo', { clientName: input.clientName }) : t('app.tip.handTo.anon')}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {t('app.tip.handTo.hint')}
        </Text>
        {/* A preview of what the client will see, in client navy. */}
        <View style={styles.preview} accessible accessibilityLabel={`${input.venueName}. ${t('app.tip.bill', { amount: money(input.amountPence) })}`}>
          <ClientVenue name={input.venueName} logoUrl={input.logoUrl} />
          <View style={styles.previewAmount}>
            <ClientText role="small" color={clientColors.textTertiary} center={false}>
              {t('app.client.preview.bill')}
            </ClientText>
            <ClientText role="result" numberOfLines={1} adjustsFontSizeToFit center={false}>
              {money(input.amountPence)}
            </ClientText>
          </View>
        </View>
        <Button
          label={t('app.tip.ready')}
          size="lg"
          onPress={() => {
            hapticSelect();
            setStage('choose');
          }}
          fullWidth
        />
        <Button label={t('app.card.cancel')} variant="ghost" onPress={() => finish(null)} fullWidth />
      </View>
    );
  }

  return {
    ask,
    stage,
    /** The staff hand-over card while staff still hold the phone. */
    handToView,
    /** The client's answer, from the client screen. */
    choose: finish,
    reset,
    active: stage !== null,
    facing: stage === 'choose',
  };
}

const styles = StyleSheet.create({
  preview: {
    backgroundColor: clientColors.bg,
    borderRadius: radius.surface,
    minHeight: 168,
    padding: spacing.lg,
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  previewAmount: { gap: spacing.xxs },
});

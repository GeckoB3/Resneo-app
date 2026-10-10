import { useCallback, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { posErrorMessage } from '@/lib/pos/api';
import { answerCardConsent, readCardConsent } from '@/lib/pos/card-consent';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { spacing } from '@/theme/index';

/**
 * Saving a card on the phone, asked of the client (UX spec §13.4 "Saving a card on the phone";
 * plan §4.4.5, D18; web `card-consent` route). With cards on file on and a client on the sale,
 * before a Tap to Pay or WisePad 3 card is read:
 *
 * 1. staff see `app.saveCard.handTo` and hand the phone over;
 * 2. the client sees `app.saveCard.title`, the consent words (the server's `reader.consent.text`
 *    with the venue's name, sent back word for word with the answer) and two buttons of equal size,
 *    `app.saveCard.agree` and `app.saveCard.decline`;
 * 3. then `app.saveCard.handBack`, and the card is read as usual.
 *
 * When the client already holds the phone (they have just chosen a tip, `CustomerTip.tsx`), the
 * question is asked straight away and nobody is told to hand the phone back: they tap their card
 * next, and the card screen says thank you at the end.
 *
 * The question is only asked when the server says this payment can save a card (`can_save`). A
 * refusal to set the card up says so and the payment goes ahead without saving it.
 */

type Step = { paymentId: string; saleId: string; text: string; stage: 'handTo' | 'ask' | 'saving'; handedOver: boolean };
export type ConsentAnswer = 'agreed' | 'declined' | null;

export function useCardConsentPrompt(clientName: string) {
  const t = usePosT();
  const accessToken = useAccessToken();
  const [step, setStep] = useState<Step | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((answer: ConsentAnswer) => void) | null>(null);

  const finish = useCallback((answer: ConsentAnswer, after: string | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    setStep(null);
    setNote(after);
    resolve?.(answer);
  }, []);

  /** Asks, when this payment can save a card; resolves the client's answer (null when not asked). */
  const ask = useCallback(
    async (saleId: string, paymentId: string, opts: { handedOver?: boolean } = {}): Promise<ConsentAnswer> => {
      setNote(null);
      setError(null);
      if (!accessToken) return null;
      const info = await readCardConsent(accessToken, saleId, paymentId);
      if (!info) return null;
      return new Promise<ConsentAnswer>((resolve) => {
        resolver.current = resolve;
        const handedOver = opts.handedOver === true;
        setStep({ paymentId, saleId, text: info.consent_text, stage: handedOver ? 'ask' : 'handTo', handedOver });
      });
    },
    [accessToken],
  );

  const answer = useCallback(
    async (agreed: boolean) => {
      if (!step || !accessToken) return;
      setStep({ ...step, stage: 'saving' });
      try {
        const res = await answerCardConsent(accessToken, step.saleId, step.paymentId, { agreed, consentText: step.text });
        finish(res.card_save_status === 'agreed' ? 'agreed' : 'declined', step.handedOver ? null : t('app.saveCard.handBack'));
      } catch (e) {
        // "We couldn't set this card up to be saved. The payment can still go ahead."
        setError(null);
        finish(null, step.handedOver ? posErrorMessage(e, '') || null : posErrorMessage(e, t('app.saveCard.handBack')));
      }
    },
    [accessToken, finish, step, t],
  );

  /** Clears the question (the collector gave up, or staff cancelled). */
  const reset = useCallback(() => {
    if (resolver.current) finish(null, null);
    setNote(null);
    setError(null);
  }, [finish]);

  let view: ReactNode = null;
  if (step?.stage === 'handTo') {
    view = (
      <View style={posStyles.stack}>
        <Text variant="bodyMedium">{t('app.saveCard.handTo', { clientName })}</Text>
        <Button label={t('app.saveCard.ready')} onPress={() => setStep({ ...step, stage: 'ask' })} fullWidth />
      </View>
    );
  } else if (step) {
    view = (
      <View style={posStyles.stack} accessibilityViewIsModal>
        <Text variant="title">{t('app.saveCard.title')}</Text>
        <Text variant="bodyMedium">{step.text}</Text>
        <ErrorLine message={error} />
        {/* Two buttons of equal size and weight: neither answer is pushed (UX spec §13.4). */}
        <View style={styles.pair}>
          <View style={styles.half}>
            <Button
              label={t('app.saveCard.agree')}
              variant="secondary"
              size="lg"
              disabled={step.stage === 'saving'}
              onPress={() => void answer(true)}
              fullWidth
            />
          </View>
          <View style={styles.half}>
            <Button
              label={t('app.saveCard.decline')}
              variant="secondary"
              size="lg"
              disabled={step.stage === 'saving'}
              onPress={() => void answer(false)}
              fullWidth
            />
          </View>
        </View>
      </View>
    );
  }

  return { ask, view, note, active: step !== null, reset };
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});

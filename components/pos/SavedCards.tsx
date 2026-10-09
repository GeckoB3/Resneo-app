import { useRef, useState } from 'react';
import { View } from 'react-native';

import { ErrorLine, money, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posPaths } from '@/lib/pos/api';
import { cardBrandName, savedCardConsentLine, savedCardLabel } from '@/lib/pos/card-methods';
import { canPos } from '@/lib/pos/pos-enabled';
import { useGuestSavedCards, usePosBootstrap, usePosEnabled, useRemoveSavedCard } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';
import { useVenueContext } from '@/providers/VenueProvider';
import type { PosPayment, PosSale, PosSavedCard } from '@/types/pos';

/**
 * Card on file in the app (POS plan §4.4.5, D18, P7-8; UX spec §3.19.5, §4.3, §13.4 "Card on file").
 *
 * - `SavedCardMethods`: one button per saved card of the sale's client in the payment sheet, with
 *   when and where they agreed. Shown when cards on file are on, the login has
 *   `charge_saved_card` and the client has a card (`cardMethodsOffered`).
 * - `SavedCardCharge`: asks first (`saved.confirm.*`), then charges it (#13 `method: 'saved_card'`).
 *   A decline is 402 `POS_CARD_DECLINED` with the bank's sentence; the payment stays pending with
 *   the sale locked, so "Choose another way to pay" cancels it first, and when the bank wants the
 *   client to confirm it (`suggest_pay_link`) a pay link is offered.
 * - `SavedCardDeclinedNotice`: the same decline, seen on the sale.
 * - `ClientSavedCardsSection`: a client's saved cards on their profile, with "Remove card" at their
 *   request (`take_payment`), which asks first and then removes it for good.
 */

export function SavedCardMethods({ sale, onChoose }: { sale: PosSale; onChoose: (card: PosSavedCard) => void }) {
  const t = usePosT();
  const { venue } = useVenueContext();
  const cards = useGuestSavedCards(sale.guest?.id);
  const list = cards.data?.card_on_file_enabled ? cards.data.cards : [];
  if (list.length === 0) return null;
  const timeZone = venue?.timezone ?? 'Europe/London';
  return (
    <>
      {list.map((card) => (
        <View key={card.id} style={{ gap: 2 }}>
          <Button
            label={t('saved.method', { brand: cardBrandName(card.brand), last4: card.last4 ?? '' })}
            variant="secondary"
            onPress={() => onChoose(card)}
            fullWidth
          />
          <Text variant="caption" tone="muted">
            {savedCardConsentLine(card, t, timeZone)}
          </Text>
        </View>
      ))}
    </>
  );
}

type Declined = { message: string; paymentId: string | null; suggestLink: boolean };

/** The 402 decline's details: the sentence, the payment left pending, and whether to offer a link. */
export function savedCardDecline(error: unknown): Declined | null {
  if (!(error instanceof ApiError) || apiErrorCode(error) !== 'POS_CARD_DECLINED') return null;
  const body = error.body as { error?: string; payment?: { id?: string } | null; suggest_pay_link?: boolean } | undefined;
  return {
    message: typeof body?.error === 'string' && body.error.trim() ? body.error : error.message,
    paymentId: typeof body?.payment?.id === 'string' ? body.payment.id : null,
    suggestLink: body?.suggest_pay_link === true,
  };
}

export function SavedCardCharge({
  sale,
  card,
  amountPence,
  send,
  onPaid,
  onBack,
  onUseLink,
}: {
  sale: PosSale;
  card: PosSavedCard;
  amountPence: number;
  send: Send;
  onPaid: () => void;
  onBack: () => void;
  onUseLink?: () => void;
}) {
  const t = usePosT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState<Declined | null>(null);
  const requestId = useRef<string>(newPaymentAttemptId());
  const clientName = sale.guest?.name?.split(' ')[0] ?? `the ${t('app.sale.client').toLowerCase()}`;
  const brand = cardBrandName(card.brand);

  const charge = async () => {
    setBusy(true);
    setError(null);
    try {
      await send({
        action: 'payments',
        money: true,
        body: {
          version: sale.version,
          client_request_id: requestId.current,
          method: 'saved_card',
          saved_card_id: card.id,
          amount_pence: amountPence,
        },
      });
      requestId.current = newPaymentAttemptId();
      hapticSuccess();
      onPaid();
    } catch (e) {
      hapticWarning();
      if (apiErrorCode(e)) requestId.current = newPaymentAttemptId();
      const d = savedCardDecline(e);
      if (d) setDeclined(d);
      else setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  };

  /** "Choose another way to pay": the declined payment holds the sale, so cancel it first. */
  const release = async (then: () => void) => {
    if (!declined?.paymentId) {
      then();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send({ action: 'cancel', path: posPaths.cancelPayment(sale.id, declined.paymentId), money: true, body: {} });
      then();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (declined) {
    return (
      <View style={posStyles.stack}>
        <Text variant="heading">{t('saved.notCharged')}</Text>
        <Text variant="bodySmall">{declined.message || t('saved.declined', { clientName })}</Text>
        <ErrorLine message={error} />
        {declined.suggestLink && onUseLink ? (
          <Button label={t('reader.useLink')} loading={busy} onPress={() => void release(onUseLink)} fullWidth />
        ) : null}
        <Button label={t('pay.otherWay')} variant="secondary" loading={busy} onPress={() => void release(onBack)} fullWidth />
      </View>
    );
  }

  return (
    <View style={posStyles.stack}>
      <Text variant="heading">{t('saved.confirm.title', { amount: money(amountPence), brand, last4: card.last4 ?? '' })}</Text>
      <Text variant="bodySmall">{t('saved.confirm.body', { clientName })}</Text>
      <ErrorLine message={error} />
      <Button
        label={busy ? t('saved.processing') : t('saved.confirm.button')}
        loading={busy}
        disabled={busy || amountPence <= 0}
        onPress={() => void charge()}
        fullWidth
      />
      <Button label={t('pay.otherWay')} variant="ghost" disabled={busy} onPress={onBack} fullWidth />
    </View>
  );
}

/** A declined card on file payment holding the sale (shown on the sale). */
export function SavedCardDeclinedNotice({
  sale,
  payment,
  send,
  canTakePayment,
}: {
  sale: PosSale;
  payment: PosPayment;
  send: Send;
  canTakePayment: boolean;
}) {
  const t = usePosT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const clientName = sale.guest?.name?.split(' ')[0] ?? `the ${t('app.sale.client').toLowerCase()}`;
  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="label">{t('saved.notCharged')}</Text>
        <Text variant="bodySmall">{payment.failure_message || t('saved.declined', { clientName })}</Text>
        {canTakePayment ? (
          <Button
            label={t('pay.otherWay')}
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await send({ action: 'cancel', path: posPaths.cancelPayment(sale.id, payment.id), money: true, body: {} });
              } catch (e) {
                toast.error(writeError(e, t));
              } finally {
                setBusy(false);
              }
            }}
            fullWidth
          />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * "Saved cards" on the client profile (UX spec §4.3 `client.cards.*`). Shown at POS venues with
 * cards on file on. Removing a card needs `take_payment`; it asks first, then removes it for good.
 */
export function ClientSavedCardsSection({ guestId, clientName }: { guestId: string; clientName: string }) {
  const t = usePosT();
  const toast = useToast();
  const { venue } = useVenueContext();
  const posEnabled = usePosEnabled();
  const boot = usePosBootstrap({ enabled: posEnabled });
  const cards = useGuestSavedCards(guestId, { enabled: posEnabled });
  const remove = useRemoveSavedCard(guestId);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!posEnabled || !cards.data?.card_on_file_enabled) return null;
  const canRemove = canPos(boot.data, 'take_payment');
  const timeZone = venue?.timezone ?? 'Europe/London';
  const first = clientName.trim().split(/\s+/)[0] || 'They';
  const venueName = boot.data?.venue?.name ?? venue?.name ?? 'This venue';

  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="label">{t('client.cards.title')}</Text>
        {cards.data.cards.length === 0 ? <Text tone="muted">{t('client.cards.empty')}</Text> : null}
        {cards.data.cards.map((card) => (
          <View key={card.id} style={posStyles.stack}>
            <View>
              <Text variant="bodyMedium">{savedCardLabel(card, t)}</Text>
              <Text variant="caption" tone="muted">
                {savedCardConsentLine(card, t, timeZone)}
              </Text>
            </View>
            {canRemove && confirming === card.id ? (
              <View style={posStyles.stack}>
                <Text variant="label">{t('client.cards.remove.title')}</Text>
                <Text variant="bodySmall">{t('client.cards.remove.body', { venue: venueName, clientName: first })}</Text>
                <Button
                  label={t('client.cards.remove')}
                  variant="danger"
                  loading={remove.isPending}
                  onPress={() => {
                    setError(null);
                    remove.mutate(card.id, {
                      onSuccess: () => {
                        setConfirming(null);
                        toast.success(
                          t('client.cards.removed', { card: `${cardBrandName(card.brand)} ending ${card.last4 ?? ''}` }),
                        );
                      },
                      onError: (e) => setError(writeError(e, t)),
                    });
                  }}
                  fullWidth
                />
                <Button label={t('common.cancel')} variant="ghost" onPress={() => setConfirming(null)} fullWidth />
              </View>
            ) : canRemove ? (
              <Button label={t('client.cards.remove')} variant="secondary" size="sm" onPress={() => setConfirming(card.id)} />
            ) : null}
          </View>
        ))}
        <ErrorLine message={error} />
      </View>
    </Card>
  );
}

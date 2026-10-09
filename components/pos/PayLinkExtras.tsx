import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { PayLinkPanel } from '@/components/pos/PayLinkPanel';
import { ChoiceChips, ErrorLine, money, PosSheet, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, posPaths } from '@/lib/pos/api';
import { payLinkExpiry, waitingPayLinks } from '@/lib/pos/card-methods';
import { queryKeys } from '@/lib/queries/keys';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePayLinks } from '@/lib/queries/usePos';
import { useToast } from '@/providers/ToastProvider';
import type { PosBootstrap, PosPayLink, PosSale } from '@/types/pos';

/**
 * Pay links on the sale screen (UX spec §3.19.4 "A link reserves; it does not lock", §3.29).
 *
 * - `OpenPayLinks`: each link still waiting, with when it stops working, "Show QR code" and
 *   "Cancel link". Read only while the sale has a link payment waiting, every few seconds, which
 *   also settles a payment whose webhook is late.
 * - `TipLinkSheet`: `done.tipLink` on a visit paid in full sends a tip-only link (`amount_pence` 0,
 *   `kind: 'tip_only'`), made and sent in one go by text or email; nothing is charged unless the
 *   client chooses a tip.
 */

export function OpenPayLinks({
  sale,
  bootstrap,
  send,
  canTakePayment,
}: {
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  canTakePayment: boolean;
}) {
  const t = usePosT();
  const toast = useToast();
  const linkPending = sale.payments.some((p) => p.method === 'pay_link' && p.status === 'pending');
  const links = usePayLinks(sale.id, { enabled: linkPending, poll: linkPending });
  const [showing, setShowing] = useState<PosPayLink | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const waiting = waitingPayLinks(links.data?.links);
  const timeZone = bootstrap.venue?.timezone ?? 'Europe/London';
  if (!linkPending || waiting.length === 0) return null;

  const cancel = async (link: PosPayLink) => {
    setBusy(link.id);
    try {
      await send({ action: 'pay-links', path: posPaths.payLinkCancel(sale.id, link.id), money: true, body: {} });
      void links.refetch();
    } catch (e) {
      toast.error(apiErrorCode(e) === 'POS_PAYMENT_NOT_PENDING' ? t('err.invalid_state') : writeError(e, t));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <Card>
      <View style={posStyles.stack}>
        <Text variant="label">{t('link.list')}</Text>
        {waiting.map((l) => (
          <View key={l.id} style={posStyles.stack}>
            <Text variant="bodyMedium">
              {l.kind === 'tip_only' ? t('done.tipLink') : t('link.waitingAmount', { amount: money(l.amount_pence) })}
            </Text>
            <Text variant="caption" tone="muted">
              {t('link.expires', payLinkExpiry(l.expires_at, timeZone))}
            </Text>
            {l.last_attempt_failed ? (
              <Text variant="bodySmall">
                {t('link.attemptFailed', { clientName: sale.guest?.name?.split(' ')[0] ?? t('app.sale.client') })}
              </Text>
            ) : null}
            {confirming === l.id ? (
              <View style={posStyles.buttons}>
                <Text variant="label">{t('link.cancel.confirm.title')}</Text>
                <Text variant="bodySmall">{t('link.cancel.confirm.body')}</Text>
                <Button
                  label={t('link.cancel.confirm.button')}
                  variant="danger"
                  loading={busy === l.id}
                  onPress={() => void cancel(l)}
                  fullWidth
                />
                <Button label={t('link.cancel.keep')} variant="ghost" onPress={() => setConfirming(null)} fullWidth />
              </View>
            ) : (
              <View style={posStyles.row}>
                <Button label={t('link.show')} size="sm" variant="secondary" onPress={() => setShowing(l)} />
                {canTakePayment ? (
                  <Button label={t('link.cancel')} size="sm" variant="ghost" onPress={() => setConfirming(l.id)} />
                ) : null}
              </View>
            )}
          </View>
        ))}
      </View>
      <PosSheet visible={showing !== null} onClose={() => setShowing(null)} title={t('link.title')}>
        {showing ? (
          <PayLinkPanel
            sale={sale}
            bootstrap={bootstrap}
            send={send}
            amountPence={showing.amount_pence}
            linkId={showing.id}
            onPaid={() => setShowing(null)}
            onClose={() => setShowing(null)}
          />
        ) : null}
      </PosSheet>
    </Card>
  );
}

export function TipLinkSheet({
  visible,
  onClose,
  sale,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
}) {
  const t = usePosT();
  const toast = useToast();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const phone = sale.guest?.phone ?? null;
  const email = sale.guest?.email ?? null;
  const [channel, setChannel] = useState<'sms' | 'email'>(phone ? 'sms' : 'email');
  const [to, setTo] = useState((phone ? phone : email) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string>(newPaymentAttemptId());
  // A link made by an attempt whose send failed is sent again, never made twice.
  const madeLinkId = useRef<string | null>(null);
  const clientName = sale.guest?.name?.split(' ')[0] ?? t('app.sale.client');

  const choose = (c: 'sms' | 'email') => {
    setChannel(c);
    setTo((c === 'sms' ? phone : email) ?? '');
  };

  const sendTipLink = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      if (!madeLinkId.current) {
        const made = await posFetch<{ link: PosPayLink }>(posPaths.payLinks(sale.id), {
          accessToken,
          method: 'POST',
          body: { version: sale.version, client_request_id: requestId.current, amount_pence: 0, kind: 'tip_only' },
        });
        madeLinkId.current = made.link.id;
      }
      const res = await posFetch<{ sent: boolean; destination: string }>(posPaths.payLinkSend(sale.id, madeLinkId.current), {
        accessToken,
        method: 'POST',
        body: { channel, ...(to.trim() ? { to: to.trim() } : {}) },
      });
      requestId.current = newPaymentAttemptId();
      madeLinkId.current = null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.pos.sale(accessToken, sale.id) });
      toast.success(t('link.tipOnly.sent', { destination: res.destination }));
      onClose();
    } catch (e) {
      // Only a dropped connection keeps the same request id, so trying again never makes two links.
      if (apiErrorCode(e) && !madeLinkId.current) requestId.current = newPaymentAttemptId();
      setError(posErrorMessage(e, t('common.networkError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PosSheet visible={visible} onClose={onClose} title={t('link.tipOnly.title', { clientName })}>
      <View style={posStyles.stack}>
        <Text variant="bodySmall">{t('link.tipOnly.body')}</Text>
        <Text variant="label">{t('link.tipOnly.how')}</Text>
        <ChoiceChips
          options={[
            { value: 'sms', label: t('link.text') },
            { value: 'email', label: t('link.email') },
          ]}
          value={channel}
          onChange={(v) => choose(v as 'sms' | 'email')}
        />
        <Input
          label={channel === 'sms' ? t('link.text.to') : t('link.email.to')}
          accessibilityLabel={channel === 'sms' ? t('link.text.to') : t('link.email.to')}
          value={to}
          onChangeText={setTo}
          keyboardType={channel === 'sms' ? 'phone-pad' : 'email-address'}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ErrorLine message={error} />
        <Button label={t('link.tipOnly.send')} loading={busy} onPress={() => void sendTipLink()} fullWidth />
        <Button label={t('common.cancel')} variant="ghost" onPress={onClose} fullWidth />
      </View>
    </PosSheet>
  );
}

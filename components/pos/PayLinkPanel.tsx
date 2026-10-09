import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Switch, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AmountRow, ErrorLine, money, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { hapticSuccess } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, posPaths } from '@/lib/pos/api';
import { payLinkExpiry, tipsOnLinks } from '@/lib/pos/card-methods';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { usePayLinks } from '@/lib/queries/usePos';
import { radius, spacing } from '@/theme/index';
import type { PosBootstrap, PosPayLink, PosSale } from '@/types/pos';

/**
 * Pay by link or QR code from the phone (POS plan §4.4.4, P7-8; UX spec §3.19.4, §13.4 "Pay by link
 * or QR"). A link for the amount (part of the bill is fine), with a tip on the client's phone when
 * the venue allows one; then the QR code on this phone for the client to scan, the link to copy or
 * share, and "Text it" or "Email it" with the client's details filled in and editable
 * (`.../pay-links/[linkId]/send`, `to` used for this send only). While it waits the phone reads the
 * sale's links every few seconds, which also settles a payment whose webhook is late. A link
 * reserves its amount but never locks the sale, so leaving this panel leaves the link open.
 *
 * The QR code is drawn on the phone from the link's address (`react-native-qrcode-svg`, already in
 * the build), the same address the web's own QR code carries.
 */

type Phase = { kind: 'setup' } | { kind: 'creating' } | { kind: 'live'; linkId: string };

export function PayLinkPanel({
  sale,
  bootstrap,
  send,
  amountPence,
  linkId: existingLinkId = null,
  onPaid,
  onClose,
  onPark,
}: {
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  amountPence: number;
  /** Show a link made earlier ("Show QR code" in the list) instead of making one. */
  linkId?: string | null;
  onPaid: () => void;
  onClose: () => void;
  /** "Park sale" for a client who has gone (`link.later`). */
  onPark?: () => void;
}) {
  const t = usePosT();
  const accessToken = useAccessToken();
  const tipsAllowed = tipsOnLinks(bootstrap);
  const [phase, setPhase] = useState<Phase>(existingLinkId ? { kind: 'live', linkId: existingLinkId } : { kind: 'setup' });
  const [allowTip, setAllowTip] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState<'sms' | 'email' | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [made, setMade] = useState<PosPayLink | null>(null);
  const requestId = useRef<string>(newPaymentAttemptId());
  const finished = useRef(false);
  const timeZone = bootstrap.venue?.timezone ?? 'Europe/London';
  const clientName = sale.guest?.name?.split(' ')[0] ?? `the ${t('app.sale.client').toLowerCase()}`;

  const live = phase.kind === 'live';
  const links = usePayLinks(sale.id, { poll: live });
  const link = live ? links.data?.links.find((l) => l.id === phase.linkId) ?? (made?.id === phase.linkId ? made : null) : null;

  // Paid: hand back once.
  useEffect(() => {
    if (link?.status === 'paid' && !finished.current) {
      finished.current = true;
      hapticSuccess();
      onPaid();
    }
  }, [link?.status, onPaid]);

  const create = async () => {
    setPhase({ kind: 'creating' });
    setError(null);
    try {
      const res = await send({
        action: 'payments',
        money: true,
        body: {
          version: sale.version,
          client_request_id: requestId.current,
          method: 'pay_link',
          amount_pence: amountPence,
          allow_tip: tipsAllowed ? allowTip : false,
        },
      });
      const createdLink = (res.link as PosPayLink | undefined) ?? null;
      requestId.current = newPaymentAttemptId();
      if (!createdLink) {
        setPhase({ kind: 'setup' });
        setError(t('common.saveError'));
        return;
      }
      setMade(createdLink);
      setPhase({ kind: 'live', linkId: createdLink.id });
      void links.refetch();
    } catch (e) {
      // Only a dropped connection keeps the same request id, so "Try again" never makes two links.
      if (apiErrorCode(e)) requestId.current = newPaymentAttemptId();
      setError(writeError(e, t));
      setPhase({ kind: 'setup' });
    }
  };

  const openSend = (channel: 'sms' | 'email') => {
    setSending(channel);
    setNotice(null);
    setError(null);
    setTo((channel === 'sms' ? sale.guest?.phone : sale.guest?.email) ?? '');
  };

  const sendLink = async () => {
    if (!sending || !link || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await posFetch<{ sent: boolean; destination: string }>(posPaths.payLinkSend(sale.id, link.id), {
        accessToken,
        method: 'POST',
        body: { channel: sending, ...(to.trim() ? { to: to.trim() } : {}) },
      });
      setNotice(sending === 'sms' ? t('link.sent.text', { phone: res.destination }) : t('link.sent.email', { email: res.destination }));
      setSending(null);
    } catch (e) {
      setError(posErrorMessage(e, t('common.networkError')));
    } finally {
      setBusy(false);
    }
  };

  const cancelLink = async () => {
    if (!link) return;
    setBusy(true);
    setError(null);
    try {
      await send({ action: 'pay-links', path: posPaths.payLinkCancel(sale.id, link.id), money: true, body: {} });
      onClose();
    } catch (e) {
      setError(apiErrorCode(e) === 'POS_PAYMENT_NOT_PENDING' ? t('err.invalid_state') : writeError(e, t));
      setConfirmCancel(false);
      void links.refetch();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await Clipboard.setStringAsync(url);
      setNotice(t('link.copied'));
    } catch {
      setNotice(url);
    }
  };

  const share = async (url: string) => {
    try {
      await Share.share({ message: url, url });
    } catch {
      // Dismissed, or nothing to share with.
    }
  };

  if (phase.kind !== 'live') {
    return (
      <View style={posStyles.stack}>
        <AmountRow label={t('link.amount')} amount={money(amountPence)} strong />
        {tipsAllowed ? (
          <View style={posStyles.row}>
            <Text variant="bodySmall" style={styles.flex}>
              {t('link.allowTip')}
            </Text>
            <Switch value={allowTip} onValueChange={setAllowTip} accessibilityLabel={t('link.allowTip')} />
          </View>
        ) : null}
        {tipsAllowed && allowTip ? (
          <Text variant="caption" tone="muted">
            {t('link.tipNote')}
          </Text>
        ) : null}
        <ErrorLine message={error} />
        <Button label={t('link.create')} loading={phase.kind === 'creating'} disabled={amountPence <= 0} onPress={() => void create()} fullWidth />
        <Button label={t('link.back')} variant="ghost" onPress={onClose} fullWidth />
      </View>
    );
  }

  if (!link) {
    return (
      <View style={posStyles.stack}>
        <Text tone="muted">{t('app.loading')}</Text>
        <Button label={t('link.back')} variant="ghost" onPress={onClose} fullWidth />
      </View>
    );
  }

  if (link.status !== 'waiting') {
    return (
      <View style={posStyles.stack}>
        <Text variant="heading">
          {link.status === 'paid'
            ? t('link.paid', { clientName, amount: money(link.amount_pence + link.tip_pence) })
            : t(link.status === 'expired' ? 'link.status.expired' : 'link.status.cancelled')}
        </Text>
        <Button label={t('link.close')} onPress={onClose} fullWidth />
      </View>
    );
  }

  const expiry = payLinkExpiry(link.expires_at, timeZone);
  return (
    <View style={posStyles.stack}>
      <Text variant="heading">{t('link.waiting', { clientName })}</Text>
      <AmountRow label={t('link.amount')} amount={link.kind === 'tip_only' ? t('done.tipLink') : money(link.amount_pence)} strong />
      <View style={styles.qrWrap} accessible accessibilityRole="image" accessibilityLabel={t('link.qrAlt')}>
        <View style={styles.qrFrame}>
          <QRCode value={link.url} size={220} backgroundColor="#ffffff" color="#111111" />
        </View>
      </View>
      <Text variant="bodySmall">{t('link.scan', { clientName })}</Text>
      <Text variant="caption" tone="muted">
        {t('link.expires', expiry)}
      </Text>
      {link.last_attempt_failed ? <Text variant="bodySmall">{t('link.attemptFailed', { clientName })}</Text> : null}

      {sending ? (
        <View style={posStyles.stack}>
          <Input
            label={sending === 'sms' ? t('link.text.to') : t('link.email.to')}
            accessibilityLabel={sending === 'sms' ? t('link.text.to') : t('link.email.to')}
            value={to}
            onChangeText={setTo}
            keyboardType={sending === 'sms' ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button label={t('link.send')} loading={busy} onPress={() => void sendLink()} fullWidth />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setSending(null)} fullWidth />
        </View>
      ) : confirmCancel ? (
        <View style={posStyles.stack}>
          <Text variant="label">{t('link.cancel.confirm.title')}</Text>
          <Text variant="bodySmall">{t('link.cancel.confirm.body')}</Text>
          <Button label={t('link.cancel.confirm.button')} variant="danger" loading={busy} onPress={() => void cancelLink()} fullWidth />
          <Button label={t('link.cancel.keep')} variant="ghost" onPress={() => setConfirmCancel(false)} fullWidth />
        </View>
      ) : (
        <View style={posStyles.buttons}>
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Button label={t('link.text')} variant="secondary" onPress={() => openSend('sms')} fullWidth />
            </View>
            <View style={styles.flex}>
              <Button label={t('link.email')} variant="secondary" onPress={() => openSend('email')} fullWidth />
            </View>
          </View>
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Button label={t('link.copy')} variant="secondary" onPress={() => void copy(link.url)} fullWidth />
            </View>
            <View style={styles.flex}>
              <Button label={t('link.share')} variant="secondary" onPress={() => void share(link.url)} fullWidth />
            </View>
          </View>
          <Text variant="caption" tone="muted">
            {t('link.later')}
          </Text>
          {onPark ? <Button label={t('sale.park')} variant="ghost" onPress={onPark} fullWidth /> : null}
          <Button label={t('link.cancel')} variant="ghost" onPress={() => setConfirmCancel(true)} fullWidth />
          <Button label={t('link.back')} variant="ghost" onPress={onClose} fullWidth />
        </View>
      )}
      {notice ? (
        <Text variant="bodySmall" accessibilityRole="text">
          {notice}
        </Text>
      ) : null}
      <ErrorLine message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.sm },
  qrWrap: { alignItems: 'center' },
  qrFrame: { padding: spacing.md, backgroundColor: '#ffffff', borderRadius: radius.md },
});

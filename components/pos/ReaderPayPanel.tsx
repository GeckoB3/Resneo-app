import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ErrorLine, money, PickRow, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, posPaths } from '@/lib/pos/api';
import { cardBrandName, defaultReaderFor, readerStatusCopyId } from '@/lib/pos/card-methods';
import { tipConfig } from '@/lib/pos/sale-math';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { SaleStaleError, usePosReaders } from '@/lib/queries/usePos';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap, PosReaderPaymentResponse, PosReaderPaymentState, PosSale } from '@/types/pos';

/**
 * Sending a sale to the counter reader from the phone (POS plan §4.4.2, P7-8; UX spec §3.19.3,
 * §13.4 "The counter reader"). The server, not the phone, talks to the reader, so a sale in the
 * app can be paid on the desk's S700 or WisePOS E (§4.4.2 step 6).
 *
 * `POST .../payments` with `method: 'card_reader'` and the chosen `reader_id` starts it; the reader
 * asks about the tip itself, so the app sends none. The phone then follows
 * `GET .../payments/[paymentId]/reader` (which also settles a payment a lost webhook left pending)
 * and shows waiting, confirming, declined (try again on the same PaymentIntent), paid, cancelled,
 * failed, moved away or checking, with the server's sentence word for word. Cancel is the payment's
 * cancel route (#14), which also stops the reader.
 */

const POLL_MS = 2_500;
const SLOW_AFTER_MS = 90_000;

type Phase =
  | { kind: 'choose' }
  | { kind: 'sending'; readerId: string }
  | { kind: 'refused'; message: string; code: string | null }
  | { kind: 'live'; state: PosReaderPaymentState };

export function ReaderPayPanel({
  sale,
  bootstrap,
  send,
  amountPence,
  pendingPaymentId = null,
  onPaid,
  onBack,
  onUseLink,
}: {
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  amountPence: number;
  /** Follow a reader payment already waiting on the sale instead of starting one. */
  pendingPaymentId?: string | null;
  onPaid: () => void;
  onBack: () => void;
  /** "Send a pay link instead", after this payment is cancelled. */
  onUseLink?: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const readersQ = usePosReaders({ refresh: true });
  const readers = (readersQ.data?.readers ?? bootstrap.readers ?? []).filter((r) => r.is_active);
  const [chosen, setChosen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(pendingPaymentId ? { kind: 'sending', readerId: '' } : { kind: 'choose' });
  const [paymentId, setPaymentId] = useState<string | null>(pendingPaymentId);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef<string | null>(null);
  const finished = useRef(false);
  const handlers = useRef({ onPaid });
  useEffect(() => {
    handlers.current = { onPaid };
  }, [onPaid]);

  const fallback = defaultReaderFor(readers, sale.till_id);
  const readerId = chosen ?? fallback?.id ?? null;
  const readerLabel = (id: string | null) => readers.find((r) => r.id === id)?.label ?? 'the card reader';
  const clientName = sale.guest?.name?.split(' ')[0] ?? `the ${t('app.sale.client').toLowerCase()}`;
  const tipsOn = tipConfig(bootstrap.tip_settings).enabled;

  const start = async (id: string) => {
    if (!requestId.current) requestId.current = newPaymentAttemptId();
    setNotice(null);
    setPhase({ kind: 'sending', readerId: id });
    try {
      const res = await send({
        action: 'payments',
        money: true,
        body: {
          version: sale.version,
          client_request_id: requestId.current,
          method: 'card_reader',
          amount_pence: amountPence,
          reader_id: id,
        },
      });
      const state = (res.reader_state as PosReaderPaymentState | null | undefined) ?? null;
      const pid = state?.payment_id ?? res.payment?.id ?? null;
      setPaymentId(pid);
      if (state) setPhase({ kind: 'live', state });
    } catch (e) {
      // Only a dropped connection keeps the same request id, so trying again never makes two payments.
      if (apiErrorCode(e) || e instanceof SaleStaleError) requestId.current = null;
      hapticWarning();
      setPhase({ kind: 'refused', message: writeError(e, t), code: apiErrorCode(e) });
    }
  };

  const tick = useCallback(async (): Promise<PosReaderPaymentState | null> => {
    if (!paymentId || !accessToken) return null;
    try {
      const r = await posFetch<PosReaderPaymentResponse>(posPaths.readerPayment(sale.id, paymentId), { accessToken });
      return r.reader_state;
    } catch {
      return null;
    }
  }, [accessToken, paymentId, sale.id]);

  // Follow the payment until it ends.
  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      const state = await tick();
      if (!alive) return;
      if (state) {
        setPhase((p) => (p.kind === 'refused' ? p : { kind: 'live', state }));
        if (state.screen === 'paid') {
          if (!finished.current) {
            finished.current = true;
            hapticSuccess();
            handlers.current.onPaid();
          }
          return;
        }
        if (state.status === 'cancelled' || state.status === 'failed') return;
      }
      setNow(Date.now());
      timer = setTimeout(() => void run(), POLL_MS);
    };
    void run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, tick]);

  const cancel = async (then?: () => void) => {
    if (!paymentId) {
      (then ?? onBack)();
      return;
    }
    setActing(true);
    setNotice(null);
    try {
      await send({ action: 'cancel', path: posPaths.cancelPayment(sale.id, paymentId), money: true, body: {} });
      setPaymentId(null);
      requestId.current = null;
      if (then) then();
      else setPhase({ kind: 'choose' });
    } catch (e) {
      // It went through after all: the paid state follows by itself.
      setNotice(apiErrorCode(e) === 'POS_PAYMENT_NOT_PENDING' ? t('err.invalid_state') : posErrorMessage(e, t('common.networkError')));
    } finally {
      setActing(false);
    }
  };

  const retry = async () => {
    if (!paymentId) return;
    setActing(true);
    setNotice(null);
    try {
      await send({ action: 'reader', path: posPaths.readerPayment(sale.id, paymentId), money: true, body: { action: 'retry' } });
      const state = await tick();
      if (state) setPhase({ kind: 'live', state });
    } catch (e) {
      setNotice(posErrorMessage(e, t('common.networkError')));
    } finally {
      setActing(false);
    }
  };

  if (phase.kind === 'choose') {
    return (
      <View style={posStyles.stack}>
        <Text variant="label">{t('reader.choose')}</Text>
        {readersQ.isLoading && readers.length === 0 ? <ActivityIndicator color={colors.brand} /> : null}
        {!readersQ.isLoading && readers.length === 0 ? <Text tone="muted">{t('reader.none')}</Text> : null}
        {readers.map((r) => (
          <View key={r.id} style={posStyles.row}>
            <View style={{ flex: 1 }}>
              <PickRow title={r.label} selected={readerId === r.id} onPress={() => setChosen(r.id)} />
            </View>
            <Badge
              label={t(readerStatusCopyId(r))}
              tone={r.busy ? 'brand' : r.status === 'offline' ? 'danger' : 'success'}
            />
          </View>
        ))}
        <View style={posStyles.buttons}>
          <Button
            label={t('app.sendToReader', { reader: readerLabel(readerId) })}
            disabled={!readerId}
            onPress={() => readerId && void start(readerId)}
            fullWidth
          />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
        </View>
      </View>
    );
  }

  if (phase.kind === 'sending') {
    return (
      <View style={posStyles.stack}>
        <View style={posStyles.row}>
          <ActivityIndicator color={colors.brand} />
          <Text variant="bodyMedium">
            {pendingPaymentId ? t('app.loading') : t('reader.sending', { amount: money(amountPence), reader: readerLabel(phase.readerId) })}
          </Text>
        </View>
      </View>
    );
  }

  if (phase.kind === 'refused') {
    return (
      <View style={posStyles.stack}>
        <ErrorLine message={phase.message} />
        <View style={posStyles.buttons}>
          {phase.code === 'POS_READER_BUSY' && readerId ? (
            <Button label={t('common.tryAgain')} onPress={() => void start(readerId)} fullWidth />
          ) : null}
          <Button label={t('reader.useOther')} variant="secondary" onPress={() => setPhase({ kind: 'choose' })} fullWidth />
          {onUseLink ? <Button label={t('reader.useLink')} variant="secondary" onPress={onUseLink} fullWidth /> : null}
          <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
        </View>
      </View>
    );
  }

  const s = phase.state;
  const vars = { clientName, reader: s.reader_label ?? readerLabel(s.reader_id) };
  const slow = s.screen === 'waiting' && now - Date.parse(s.started_at) > SLOW_AFTER_MS;
  return (
    <View style={posStyles.stack}>
      <Text variant="title">{money(s.amount_pence + s.tip_pence)}</Text>
      {s.screen === 'waiting' ? (
        <>
          <Text variant="heading">{t('reader.waiting.title')}</Text>
          <Text variant="bodySmall">{t('reader.waiting.body', vars)}</Text>
          {tipsOn ? (
            <Text variant="caption" tone="muted">
              {t('reader.waiting.tip')}
            </Text>
          ) : null}
          {slow ? <Text variant="bodySmall">{t('reader.slow', vars)}</Text> : null}
          <Button label={t('reader.cancel')} variant="secondary" loading={acting} onPress={() => void cancel()} fullWidth />
        </>
      ) : s.screen === 'confirming' ? (
        <View style={posStyles.row}>
          <ActivityIndicator color={colors.brand} />
          <Text variant="bodySmall">{t('reader.confirming')}</Text>
        </View>
      ) : s.screen === 'checking' ? (
        <Text variant="bodySmall">{t('reader.checking')}</Text>
      ) : s.screen === 'paid' ? (
        <>
          <Text variant="heading" color={colors.success}>
            {s.card_last4
              ? t('reader.success', {
                  amount: money(s.amount_pence + s.tip_pence),
                  cardBrand: cardBrandName(s.card_brand),
                  last4: s.card_last4,
                })
              : t('reader.success.plain', { amount: money(s.amount_pence + s.tip_pence) })}
          </Text>
          {s.tip_pence > 0 ? <Text variant="bodySmall">{t('reader.success.tip', { tip: money(s.tip_pence) })}</Text> : null}
        </>
      ) : s.screen === 'declined' ? (
        <>
          <Text variant="heading">{t('reader.declined.title')}</Text>
          <Text variant="bodySmall">{s.pin_required ? t('reader.declined.pin', vars) : s.message}</Text>
          {!s.pin_required ? <Text variant="bodySmall">{t('reader.declined.stillOpen', vars)}</Text> : null}
          <Button label={t('reader.tryAgain')} loading={acting} onPress={() => void retry()} fullWidth />
          <Button label={t('pay.otherWay')} variant="ghost" disabled={acting} onPress={() => void cancel(onBack)} fullWidth />
        </>
      ) : s.screen === 'moved_away' ? (
        <>
          <ErrorLine message={s.message ?? t('reader.movedAway', vars)} />
          <Button label={t('reader.useOther')} variant="secondary" loading={acting} onPress={() => void cancel()} fullWidth />
          {onUseLink ? (
            <Button label={t('reader.useLink')} variant="secondary" disabled={acting} onPress={() => void cancel(onUseLink)} fullWidth />
          ) : null}
        </>
      ) : s.screen === 'cancelled' ? (
        <>
          <Text variant="bodyMedium">{t('reader.cancelled')}</Text>
          <Button label={t('pay.otherWay')} onPress={onBack} fullWidth />
        </>
      ) : (
        <>
          <Text variant="heading">{t('reader.failed.title')}</Text>
          {s.message ? <Text variant="bodySmall">{s.message}</Text> : null}
          <Button label={t('pay.otherWay')} onPress={onBack} fullWidth />
        </>
      )}
      <ErrorLine message={notice} />
    </View>
  );
}

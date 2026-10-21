import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ErrorLine, money, PickRow, posStyles, usePosT, writeError, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ApiError, apiErrorCode } from '@/lib/api/client';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { posErrorMessage, posFetch, posPaths } from '@/lib/pos/api';
import {
  collectEnded,
  collectStaffName,
  phoneChoiceFor,
  phoneChoiceKey,
  phoneLastSeenRelative,
  type PhoneChoice,
} from '@/lib/pos/card-methods';
import type { PosCopyId } from '@/lib/pos/copy';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { queryKeys } from '@/lib/queries/keys';
import { SaleStaleError, useCollectPhones } from '@/lib/queries/usePos';
import { useTheme } from '@/theme/useTheme';
import type { PosCardPhoneKind, PosCollectState, PosCollectStateResponse, PosSale } from '@/types/pos';

/**
 * "Send to a phone" from a device that can't take cards itself (a tablet without NFC, an iPad), the
 * app's version of the web till's panel (`src/components/pos/tophone/SendToPhonePanel.tsx`; UX spec
 * §23; plan §4.36).
 *
 * Choose who takes it ("Any phone that can take cards" first, then each team member with a phone
 * that can take cards now, the person serving preselected when they have one) and send the amount:
 * `POST .../payments` with `method: 'card_app'` and `collect_on`. The server makes a pending payment
 * with no PaymentIntent and tells their phones, which take it on the collect screen. The panel then
 * follows `GET /api/venue/pos/payments/[id]/collect` (which also expires an overdue request and runs
 * the card self-heal): waiting with the 2-minute countdown, taken by {name}, collecting, paid,
 * declined, chip and PIN, cancelled, expired, the phone gave up, and checking. Only the server says
 * it is paid. Cancel is the collect cancel route, which tells the phone.
 *
 * The sale screen also shows it for a send-to-phone payment already waiting on the sale
 * (`pendingPaymentId`), so a sheet closed while it waits still shows who has it.
 */

const POLL_MS = 2_000;

type Phase =
  | { kind: 'choose' }
  | { kind: 'sending' }
  | { kind: 'loading' }
  /** `retry`: the connection dropped, so "Try again" sends the same request (the same id) once more. */
  | { kind: 'refused'; message: string; code: string | null; retry: boolean }
  | { kind: 'live'; state: PosCollectState; deadline: number };

const DEVICE_COPY: Record<PosCardPhoneKind, PosCopyId> = {
  iphone: 'phone.device.iphone',
  android: 'phone.device.android',
  wisepad: 'phone.device.wisepad',
};

export function SendToPhonePanel({
  sale,
  send,
  amountPence,
  pendingPaymentId = null,
  onPaid,
  onBack,
  onUseLink,
  onUseReader,
}: {
  sale: PosSale;
  send: Send;
  /** What to take, in pence (the balance, or the part typed). The phone adds any tip. */
  amountPence: number;
  /** Follow a send-to-phone payment already waiting on the sale instead of starting one. */
  pendingPaymentId?: string | null;
  onPaid: () => void;
  /** Back to the payment methods. */
  onBack: () => void;
  /** "Send a pay link instead", when the venue takes pay links. */
  onUseLink?: () => void;
  /** "Use another reader", when the venue has a counter reader. */
  onUseReader?: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>(pendingPaymentId ? { kind: 'loading' } : { kind: 'choose' });
  const [paymentId, setPaymentId] = useState<string | null>(pendingPaymentId);
  const [picked, setPicked] = useState<PhoneChoice | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef<string | null>(null);
  const lastChoice = useRef<PhoneChoice | null>(null);
  const finished = useRef(false);
  const handlers = useRef({ onPaid });
  useEffect(() => {
    handlers.current = { onPaid };
  }, [onPaid]);

  // The phones that can take cards now, read afresh whenever the list shows.
  const phonesQ = useCollectPhones({ enabled: phase.kind === 'choose' });
  const phones = phonesQ.data?.phones ?? null;
  const choice = phoneChoiceFor(phones ?? [], picked, sale.operator?.staff_id);

  const live = useCallback((state: PosCollectState) => {
    // The clock moves with the deadline, so the countdown starts at the server's seconds, not one more.
    const at = Date.now();
    setNow(at);
    setPhase({ kind: 'live', state, deadline: at + state.seconds_left * 1000 });
  }, []);

  // The sale screen reads the sale again on its own; this only makes it prompt once the phone is done.
  const refreshSale = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.pos.sale(accessToken, sale.id) });
  }, [accessToken, queryClient, sale.id]);

  const finishPaid = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    hapticSuccess();
    refreshSale();
    handlers.current.onPaid();
  }, [refreshSale]);

  const start = async (to: PhoneChoice) => {
    if (!requestId.current) requestId.current = newPaymentAttemptId();
    lastChoice.current = to;
    finished.current = false;
    setNotice(null);
    setPhase({ kind: 'sending' });
    try {
      const res = await send({
        action: 'payments',
        money: true,
        body: {
          version: sale.version,
          client_request_id: requestId.current,
          method: 'card_app',
          amount_pence: amountPence,
          collect_on: to,
        },
      });
      requestId.current = null;
      const state = (res.collect as PosCollectState | null | undefined) ?? null;
      const pid = state?.payment_id ?? res.payment?.id ?? (typeof res.payment_id === 'string' ? res.payment_id : null);
      setPaymentId(pid);
      if (state) live(state);
      else if (!pid) setPhase({ kind: 'refused', message: t('common.networkError'), code: null, retry: false });
    } catch (e) {
      // A refusal is final for this request id; only a dropped connection keeps it, so trying again
      // can only replay the first request.
      const final = Boolean(apiErrorCode(e)) || e instanceof SaleStaleError;
      if (final) requestId.current = null;
      hapticWarning();
      setPhase({ kind: 'refused', message: writeError(e, t), code: apiErrorCode(e), retry: !final });
    }
  };

  // Follow the payment until it ends.
  useEffect(() => {
    if (!paymentId || !accessToken) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      try {
        const r = await posFetch<PosCollectStateResponse>(posPaths.collectState(paymentId), { accessToken });
        if (!alive) return;
        live(r.collect);
        if (r.collect.screen === 'paid') {
          finishPaid();
          return;
        }
        if (collectEnded(r.collect.screen)) {
          refreshSale();
          return;
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) {
          setPaymentId(null);
          setPhase({ kind: 'choose' });
          return;
        }
        // A dropped connection: keep asking.
      }
      timer = setTimeout(() => void run(), POLL_MS);
    };
    void run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, accessToken, live, finishPaid, refreshSale]);

  // The countdown while a request waits.
  const waiting = phase.kind === 'live' && phase.state.screen === 'waiting';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const cancel = async (then?: () => void) => {
    if (!paymentId) {
      (then ?? onBack)();
      return;
    }
    setActing(true);
    setNotice(null);
    try {
      const res = await send({ action: 'cancel', path: posPaths.collectCancel(paymentId), money: true, body: { reason: 'desk' } });
      const state = (res.collect as PosCollectState | null | undefined) ?? null;
      if (state) live(state);
      if (then) then();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { collect?: PosCollectState } | undefined) : undefined;
      if (apiErrorCode(e) === 'POS_PAYMENT_NOT_PENDING') {
        // It went through after all: show it as paid.
        if (body?.collect) {
          live(body.collect);
          if (body.collect.screen === 'paid') finishPaid();
        } else {
          setNotice(t('err.invalid_state'));
        }
      } else {
        setNotice(posErrorMessage(e, t('common.networkError')));
      }
    } finally {
      setActing(false);
    }
  };

  const chooseAnother = () => {
    requestId.current = null;
    setPaymentId(null);
    setNotice(null);
    setPhase({ kind: 'choose' });
  };

  const sendAgain = () => {
    setPaymentId(null);
    void start(lastChoice.current ?? choice);
  };

  const noPhones = (
    <View style={posStyles.stack}>
      <Text variant="heading">{t('phone.none.title')}</Text>
      <ErrorLine message={t('err.POS_NO_CARD_DEVICE')} />
      <Text variant="bodySmall" tone="muted">
        {t('phone.none.help')}
      </Text>
      <View style={posStyles.buttons}>
        {onUseLink ? <Button label={t('reader.useLink')} variant="secondary" onPress={onUseLink} fullWidth /> : null}
        <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
      </View>
    </View>
  );

  const fallbacks = (
    <View style={posStyles.buttons}>
      <Button label={t('phone.sendAgain')} onPress={sendAgain} fullWidth />
      <Button label={t('phone.another')} variant="secondary" onPress={chooseAnother} fullWidth />
      {onUseLink ? <Button label={t('reader.useLink')} variant="secondary" onPress={onUseLink} fullWidth /> : null}
      <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
    </View>
  );

  if (phase.kind === 'choose' && phones === null && phonesQ.isError) {
    return (
      <View style={posStyles.stack}>
        <ErrorLine message={posErrorMessage(phonesQ.error, t('common.networkError'))} />
        <View style={posStyles.buttons}>
          <Button label={t('common.tryAgain')} variant="secondary" onPress={() => void phonesQ.refetch()} fullWidth />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
        </View>
      </View>
    );
  }

  if (phase.kind === 'loading' || phase.kind === 'sending' || (phase.kind === 'choose' && phones === null)) {
    const label =
      phase.kind === 'sending'
        ? t('phone.sending', { amount: money(amountPence) })
        : phase.kind === 'loading'
          ? t('app.loading')
          : t('phone.loading');
    return (
      <View style={posStyles.stack}>
        <View style={posStyles.row}>
          <ActivityIndicator color={colors.brand} />
          <Text variant="bodyMedium">{label}</Text>
        </View>
      </View>
    );
  }

  if (phase.kind === 'choose') {
    if (!phones || phones.length === 0) return noPhones;
    const options = [
      { key: 'any', choice: { any: true } as PhoneChoice, title: t('phone.any'), detail: null as string | null },
      ...phones.map((p) => {
        const lastSeen = phoneLastSeenRelative(p.last_seen_at);
        const devices = p.devices.map((d) => t(DEVICE_COPY[d])).join(', ');
        const detail = [devices, lastSeen ? t('phone.lastSeen', { relative: lastSeen }) : ''].filter(Boolean).join('. ');
        return { key: p.staff_id, choice: { staff_id: p.staff_id } as PhoneChoice, title: p.name, detail: detail || null };
      }),
    ];
    return (
      <View style={posStyles.stack}>
        <Text variant="title">{money(amountPence)}</Text>
        <Text variant="label">{t('phone.who')}</Text>
        {options.map((o) => (
          <PickRow
            key={o.key}
            title={o.title}
            detail={o.detail}
            selected={phoneChoiceKey(choice) === o.key}
            onPress={() => setPicked(o.choice)}
          />
        ))}
        <Text variant="caption" tone="muted">
          {t('phone.notListed')}
        </Text>
        <View style={posStyles.buttons}>
          <Button label={t('phone.send', { amount: money(amountPence) })} onPress={() => void start(choice)} fullWidth />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
        </View>
      </View>
    );
  }

  if (phase.kind === 'refused') {
    if (phase.code === 'POS_NO_CARD_DEVICE') return noPhones;
    return (
      <View style={posStyles.stack}>
        <ErrorLine message={phase.message} />
        <View style={posStyles.buttons}>
          {phase.retry ? (
            <Button label={t('common.tryAgain')} onPress={() => void start(lastChoice.current ?? choice)} fullWidth />
          ) : null}
          <Button label={t('phone.another')} variant="secondary" onPress={chooseAnother} fullWidth />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={onBack} fullWidth />
        </View>
      </View>
    );
  }

  const s = phase.state;
  const vars = { staffName: collectStaffName(s) ?? t('phone.someone') };
  const tipLine = s.tip_pence > 0 ? <Text variant="bodySmall">{t('phone.tip', { tip: money(s.tip_pence) })}</Text> : null;
  const cancelButton = (
    <Button label={t('phone.cancel')} variant="secondary" loading={acting} onPress={() => void cancel()} fullWidth />
  );
  let body;
  switch (s.screen) {
    case 'waiting': {
      const seconds = Math.max(0, Math.ceil((phase.deadline - now) / 1000));
      body = (
        <>
          <Text variant="heading">
            {s.for_anyone ? t('phone.waiting.any') : t('phone.waiting', { staffName: s.target_name ?? t('phone.someone') })}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {t('phone.expiresIn', { seconds })}
          </Text>
          {cancelButton}
        </>
      );
      break;
    }
    case 'claimed':
    case 'collecting':
      body = (
        <>
          <Text variant="heading">{t(s.screen === 'claimed' ? 'phone.claimed' : 'phone.collecting', vars)}</Text>
          {tipLine}
          {cancelButton}
        </>
      );
      break;
    case 'paid':
      body = (
        <>
          <Text variant="heading" color={colors.success}>
            {t('phone.paid', vars)}
          </Text>
          {tipLine}
        </>
      );
      break;
    case 'declined':
      body = (
        <>
          <Text variant="bodyMedium">{t('phone.declined', vars)}</Text>
          {cancelButton}
          <Button label={t('pay.otherWay')} variant="ghost" disabled={acting} onPress={() => void cancel(onBack)} fullWidth />
        </>
      );
      break;
    case 'needs_pin':
      body = (
        <>
          <Text variant="bodyMedium">{t('phone.needsPin')}</Text>
          {onUseLink ? (
            <Button label={t('reader.useLink')} variant="secondary" disabled={acting} onPress={() => void cancel(onUseLink)} fullWidth />
          ) : null}
          {onUseReader ? (
            <Button label={t('reader.useOther')} variant="secondary" disabled={acting} onPress={() => void cancel(onUseReader)} fullWidth />
          ) : null}
          <Button label={t('pay.otherWay')} variant="ghost" disabled={acting} onPress={() => void cancel(onBack)} fullWidth />
        </>
      );
      break;
    case 'checking':
      body = <Text variant="bodySmall">{t('reader.checking')}</Text>;
      break;
    case 'cancelled':
      body = (
        <>
          <Text variant="bodyMedium">{t('phone.cancelled')}</Text>
          <Button label={t('pay.otherWay')} variant="secondary" onPress={onBack} fullWidth />
        </>
      );
      break;
    case 'expired':
    case 'timed_out':
      body = (
        <>
          <Text variant="bodyMedium">{s.screen === 'expired' ? t('phone.expired') : t('phone.timedOut', vars)}</Text>
          {fallbacks}
        </>
      );
      break;
    default:
      body = (
        <>
          <Text variant="bodyMedium">{t('phone.failed')}</Text>
          {fallbacks}
        </>
      );
  }

  return (
    <View style={posStyles.stack}>
      <Text variant="title">{money(s.amount_pence + s.tip_pence)}</Text>
      {body}
      <ErrorLine message={notice} />
    </View>
  );
}

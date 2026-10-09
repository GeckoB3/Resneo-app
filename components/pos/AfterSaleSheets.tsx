import { useMemo, useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { writeError, type Send } from '@/components/pos/SaleSheets';
import { AmountRow, ChoiceChips, ErrorLine, money, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import {
  isCardMethod,
  itemsRefundPence,
  maxRefundablePence,
  parseMoneyInput,
  paymentMethodName,
  penceToInput,
  refundableLines,
  refundablePayments,
  refundEverything,
  slicesTotal,
  spreadRefund,
  type RefundSlice,
} from '@/lib/pos/sale-math';
import { canRestock, refundLinesBody } from '@/lib/pos/product-math';
import {
  isStoredValueMethod,
  isVoucherLine,
  paymentVoucherGone,
  storedValueRefundNote,
  voucherLineRefundState,
} from '@/lib/pos/voucher-math';
import type { PosBootstrap, PosPayment, PosSale } from '@/types/pos';

/**
 * The money after a sale in the app (UX spec §3.20 to §3.22, §13.3): the refund builder (items or
 * an amount, cards first, back to the original method; a different method only for admins, D44),
 * "Refund and cancel", sending the receipt by email or text, and changing a tip's split.
 *
 * Pass V (§20.5): a part paid by gift voucher goes back to that voucher, or to the client's
 * account credit once the voucher has run out (which needs a client on the sale); a part paid by
 * credit goes back to credit. Neither ever goes anywhere else, whoever is signed in. An admin may
 * also send money to the client's account credit. A voucher line refunds only what is left on the
 * voucher, and once part of it is used, only an admin can refund it.
 *
 * Pass 4 (P4-10, §3.22): a product line chosen for refund offers "Put back in stock", unticked,
 * sent as the line's `restock`.
 */

const DEFAULT_REFUND_REASONS = ['Not happy with the service', 'Product returned', 'Charged by mistake', 'Goodwill'];

type Destination = 'original' | 'cash' | 'external' | 'account_credit';

/** Where one payment's part goes, in words for the summary ("Refund £10.00 to cash"). */
function destinationWords(
  p: PosPayment,
  dest: Destination,
  ctx: { t: ReturnType<typeof usePosT>; typeName: string | null },
): string {
  const { t } = ctx;
  if (isStoredValueMethod(p.method)) {
    return p.method === 'gift_card' && paymentVoucherGone(p) ? t('refund.dest.credit').toLowerCase() : paymentMethodName(p);
  }
  if (dest === 'cash') return t('refund.dest.cash').toLowerCase();
  if (dest === 'account_credit') return t('refund.dest.credit').toLowerCase();
  if (dest === 'external') return ctx.typeName ?? t('refund.dest.other').toLowerCase();
  return paymentMethodName(p);
}

function RefundSheetBody({
  visible,
  onClose,
  sale,
  bootstrap,
  send,
  cancelSale,
  onRefunded,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  /** "Refund and cancel" (§3.16): everything back, then the sale is voided. */
  cancelSale: boolean;
  onRefunded: (message: string) => void;
}) {
  const t = usePosT();
  const isAdmin = bootstrap.role === 'admin';
  const clientName = sale.guest?.name ?? 'the client';
  const reasons = bootstrap.settings.refund_reasons?.length ? bootstrap.settings.refund_reasons : DEFAULT_REFUND_REASONS;
  const lines = useMemo(() => refundableLines(sale), [sale]);
  const payments = useMemo(() => refundablePayments(sale.payments), [sale.payments]);
  const maxGoods = maxRefundablePence(sale.payments);
  const tipTotal = payments.reduce((s, p) => s + p.refundable_tip_pence, 0);

  const [by, setBy] = useState<'amount' | 'items'>('amount');
  const [amountText, setAmountText] = useState(penceToInput(maxGoods));
  const [chosen, setChosen] = useState<Record<string, number>>({});
  // Product lines put back in stock (P4-10): unticked, because refunds restock only when asked.
  const [restock, setRestock] = useState<ReadonlySet<string>>(new Set());
  const [withTip, setWithTip] = useState(cancelSale);
  const [destination, setDestination] = useState<Destination>('original');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(newPaymentAttemptId());


  const goods = cancelSale
    ? maxGoods
    : by === 'items'
      ? itemsRefundPence(lines, chosen)
      : Math.min(parseMoneyInput(amountText) ?? 0, maxGoods);
  const tipIds = new Set(withTip ? payments.filter((p) => p.refundable_tip_pence > 0).map((p) => p.id) : []);
  const slices: RefundSlice[] = cancelSale ? refundEverything(sale.payments) : spreadRefund(sale.payments, goods, tipIds).slices;
  const total = slicesTotal(slices);
  const typeName = bootstrap.payment_types.find((p) => p.id === typeId)?.name ?? null;
  const paymentOf = (id: string) => sale.payments.find((p) => p.id === id)!;
  // A voucher or credit payment always goes back where it came from; the choice is for money.
  const destFor = (s: RefundSlice): Destination => (isStoredValueMethod(s.method) ? 'original' : destination);
  const destinationLabel = [
    ...new Set(slices.map((s) => destinationWords(paymentOf(s.payment_id), destFor(s), { t, typeName }))),
  ].join(', ');
  const hasMoneySlice = payments.some((p) => !isStoredValueMethod(p.method));
  const storedNotes = slices
    .filter((s) => isStoredValueMethod(s.method))
    .map((s) => ({
      slice: s,
      payment: paymentOf(s.payment_id),
      info: storedValueRefundNote(paymentOf(s.payment_id), Boolean(sale.guest)),
    }));
  const blocked = storedNotes.some((n) => n.info?.blocked);

  async function submit(target: Destination, payTypeId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await send({
        action: 'refunds',
        money: true,
        timeoutMs: 30_000,
        body: {
          client_request_id: requestId.current,
          ...(by === 'items' && !cancelSale
            ? { lines: refundLinesBody(sale.lines, chosen, restock) }
            : {}),
          destinations: slices.map((s) => {
            const dest = isStoredValueMethod(s.method) ? 'original' : target;
            return {
              payment_id: s.payment_id,
              amount_pence: s.amount_pence,
              ...(s.tip_pence > 0 ? { tip_pence: s.tip_pence } : {}),
              destination: dest,
              ...(dest === 'external' && payTypeId ? { payment_type_id: payTypeId } : {}),
            };
          }),
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(cancelSale ? { cancel: true } : {}),
        },
      });
      requestId.current = newPaymentAttemptId();
      const card = target === 'original' && slices.some((s) => isCardMethod(s.method));
      const pendingCard = (res.refunds ?? []).some((r) => r.status === 'pending');
      const allMoney = slices.every((s) => !isStoredValueMethod(s.method));
      onRefunded(
        cancelSale && pendingCard
          ? t('rv.pending')
          : card
            ? t('refund.sentCard', { clientName })
            : allMoney && (target === 'cash' || (target === 'original' && slices.every((s) => s.method === 'cash')))
              ? t('refund.doneCash', { clientName, amount: money(total) })
              : t('refund.doneOther', { amount: money(total), typeName: destinationLabel }),
      );
      onClose();
    } catch (e) {
      // A card Stripe will no longer refund (POS_CARD_REFUND_UNAVAILABLE): its sentence says to
      // refund another way, which is a different refund, so it gets a new request id.
      if (apiErrorCode(e) === 'POS_CARD_REFUND_UNAVAILABLE') requestId.current = newPaymentAttemptId();
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  if (maxGoods <= 0 && tipTotal <= 0) {
    return (
      <PosSheet visible={visible} onClose={onClose} title={t('refund.title', { saleNo: sale.number_label })}>
        <Text tone="muted">{t('app.sale.refundNothing')}</Text>
      </PosSheet>
    );
  }

  return (
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={cancelSale ? t('sale.refundAndVoid') : t('refund.title', { saleNo: sale.number_label })}>
      <View style={posStyles.stack}>
        {!cancelSale ? (
          <>
            <Text variant="label">{t('refund.what')}</Text>
            <Segmented
              options={[
                { value: 'amount', label: t('refund.byAmount') },
                { value: 'items', label: t('refund.byItems') },
              ]}
              value={by}
              onChange={setBy}
            />
            {by === 'amount' ? (
              <Input
                label={t('refund.byAmount')}
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                inputMode="decimal"
                helper={`Up to ${money(maxGoods)}`}
              />
            ) : (
              lines.map((r) => {
                const voucherState = isVoucherLine(r.line)
                  ? voucherLineRefundState(r.line.voucher, r.line.unit_price_pence, isAdmin)
                  : null;
                const stuck = voucherState?.state === 'usedUp' || voucherState?.state === 'adminOnly';
                const name = isVoucherLine(r.line) ? t('line.voucher', { amount: money(r.line.unit_price_pence) }) : r.line.name;
                return (
                  <View key={r.line.id} style={posStyles.stack}>
                    <Stepper
                      label={`${name} (${money(r.remainingPence)})`}
                      value={String(chosen[r.line.id] ?? 0)}
                      onDecrement={() => setChosen((c) => ({ ...c, [r.line.id]: Math.max(0, (c[r.line.id] ?? 0) - 1) }))}
                      onIncrement={() => {
                        if (stuck) return;
                        setChosen((c) => ({ ...c, [r.line.id]: Math.min(r.remainingQty, (c[r.line.id] ?? 0) + 1) }));
                      }}
                    />
                    {r.line.booking_id ? (
                      <Text variant="caption" tone="muted">
                        {t('refund.bookingLine')}
                      </Text>
                    ) : null}
                    {canRestock(r.line) && (chosen[r.line.id] ?? 0) > 0 ? (
                      <View style={posStyles.row}>
                        <View style={{ flex: 1 }}>
                          <Text variant="bodySmall">{t('refund.restock')}</Text>
                          <Text variant="caption" tone="muted">
                            {t('refund.restock.help')}
                          </Text>
                        </View>
                        <Switch
                          value={restock.has(r.line.id)}
                          onValueChange={(on) =>
                            setRestock((cur) => {
                              const next = new Set(cur);
                              if (on) next.add(r.line.id);
                              else next.delete(r.line.id);
                              return next;
                            })
                          }
                          accessibilityLabel={`${t('refund.restock')}: ${r.line.name}`}
                        />
                      </View>
                    ) : null}
                    {voucherState?.state === 'ok' ? (
                      <Text variant="caption" tone="muted">
                        {t('refund.voucherLine', { balance: money(voucherState.balancePence ?? 0) })}
                      </Text>
                    ) : voucherState?.state === 'usedUp' ? (
                      <Text variant="caption" tone="muted">
                        {t('refund.voucherUsedUp')}
                      </Text>
                    ) : voucherState?.state === 'adminOnly' ? (
                      <Text variant="caption" tone="danger">
                        {t('refund.voucherUsed')}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
            {tipTotal > 0 ? (
              <View style={posStyles.row}>
                <Text variant="bodySmall" style={{ flex: 1 }}>
                  {t('refund.tip', { tip: money(tipTotal) })}
                </Text>
                <Switch value={withTip} onValueChange={setWithTip} accessibilityLabel={t('refund.tip', { tip: money(tipTotal) })} />
              </View>
            ) : null}
          </>
        ) : null}

        <Text variant="label">{t('refund.where')}</Text>
        {!hasMoneySlice ? null : isAdmin ? (
          <>
            <ChoiceChips
              options={[
                { value: 'original', label: t('refund.dest.original', { method: 'the original payment' }) },
                { value: 'cash', label: t('refund.dest.cash') },
                ...(bootstrap.payment_types.length ? [{ value: 'external' as const, label: t('refund.dest.other') }] : []),
                ...(sale.guest ? [{ value: 'account_credit' as const, label: t('refund.dest.credit') }] : []),
              ]}
              value={destination}
              onChange={setDestination}
            />
            {destination === 'external' ? (
              <ChoiceChips
                options={bootstrap.payment_types.map((p) => ({ value: p.id, label: p.name }))}
                value={typeId}
                onChange={setTypeId}
              />
            ) : null}
          </>
        ) : (
          <Text variant="caption" tone="muted">
            {t('limit.refundMethod')}
          </Text>
        )}
        {slices.length > 1 ? (
          <Text variant="caption" tone="muted">
            {t('refund.spans', { count: slices.length })}
          </Text>
        ) : null}
        {slices.map((s) => {
          const p = sale.payments.find((x) => x.id === s.payment_id);
          return p ? (
            <AmountRow
              key={s.payment_id}
              label={t('app.sale.refundFrom', { method: paymentMethodName(p) })}
              amount={money(s.amount_pence + s.tip_pence)}
              muted
            />
          ) : null;
        })}
        {storedNotes.map(({ slice, payment, info }) => (
          <View key={`sv-${slice.payment_id}`} style={posStyles.stack}>
            {info?.note === 'voucherExpired' ? (
              <Text variant="caption" tone="muted">
                {t('refund.dest.voucherExpired', { clientName })}
              </Text>
            ) : info?.note === 'needsClient' ? (
              <Text variant="bodySmall" tone="danger">
                {t('refund.needsClient')}
              </Text>
            ) : (
              <Text variant="caption" tone="muted">
                {payment.method === 'gift_card' && payment.voucher?.code_last4
                  ? t('refund.dest.voucher', { last4: payment.voucher.code_last4 })
                  : t('refund.dest.original', { method: paymentMethodName(payment) })}
              </Text>
            )}
          </View>
        ))}

        <Text variant="label">{t('refund.reason')}</Text>
        <ChoiceChips options={reasons.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
        <Input label={t('refund.note')} value={note} onChangeText={setNote} maxLength={500} />
        {total > 0 ? <Text variant="bodyMedium">{t('refund.summary', { amount: money(total), destination: destinationLabel })}</Text> : null}
        <ErrorLine message={error} />
        <Button
          label={t('refund.confirm', { amount: money(total) })}
          variant="danger"
          loading={busy}
          disabled={busy || total <= 0 || !reason || blocked || (hasMoneySlice && destination === 'external' && !typeId)}
          onPress={() => void submit(destination, typeId)}
          fullWidth
        />
      </View>
    </PosSheet>
  );
}

function ReceiptSheetBody({
  visible,
  onClose,
  sale,
  send,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  send: Send;
  onSent: (message: string) => void;
}) {
  const t = usePosT();
  const hasEmail = Boolean(sale.guest?.email);
  const [channel, setChannel] = useState<'email' | 'sms'>(hasEmail || !sale.guest?.phone ? 'email' : 'sms');
  const [to, setTo] = useState(() => (hasEmail ? sale.guest?.email ?? '' : sale.guest?.phone ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <PosSheet visible={visible} onClose={onClose} title={t('sale.done.receipt')}>
      <View style={posStyles.stack}>
        <ChoiceChips
          options={[
            { value: 'email', label: t('done.receipt.email') },
            { value: 'sms', label: t('done.receipt.text') },
          ]}
          value={channel}
          onChange={(c) => {
            setChannel(c);
            setTo(c === 'email' ? sale.guest?.email ?? '' : sale.guest?.phone ?? '');
          }}
        />
        <Input
          label={t('done.receipt.to')}
          value={to}
          onChangeText={setTo}
          keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
          autoCapitalize="none"
          maxLength={200}
        />
        <ErrorLine message={error} />
        <Button
          label={channel === 'email' ? t('done.receipt.email') : t('done.receipt.text')}
          loading={busy}
          disabled={!to.trim() || busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await send({ action: 'receipt', body: { channel, to: to.trim() } });
              onSent(t('done.receipt.sent', { destination: String(res.destination ?? to.trim()) }));
              onClose();
            } catch (e) {
              setError(writeError(e, t));
            } finally {
              setBusy(false);
            }
          }}
          fullWidth
        />
      </View>
    </PosSheet>
  );
}

const TIP_RULES = ['pro_rata_services', 'equal_performers', 'operator'] as const;

function TipSplitSheetBody({
  visible,
  onClose,
  sale,
  send,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  send: Send;
}) {
  const t = usePosT();
  const tipped = sale.payments.filter((p) => p.status === 'succeeded' && p.tip_pence - p.refunded_tip_pence > 0);
  const [paymentId, setPaymentId] = useState<string | null>(tipped.length === 1 ? tipped[0]!.id : null);
  const [rule, setRule] = useState<(typeof TIP_RULES)[number] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shares = sale.tips.filter((s) => !paymentId || s.payment_id === paymentId);

  return (
    <PosSheet visible={visible} onClose={onClose} title={t('app.sale.tipChange.title')}>
      <View style={posStyles.stack}>
        {tipped.length > 1 ? (
          <ChoiceChips
            options={tipped.map((p) => ({ value: p.id, label: `${paymentMethodName(p)} ${money(p.tip_pence)}` }))}
            value={paymentId}
            onChange={setPaymentId}
          />
        ) : null}
        {shares.map((s) => (
          <AmountRow key={`${s.payment_id}-${s.calendar_id ?? s.staff_id}`} label={s.name} amount={money(s.amount_pence)} />
        ))}
        <Text variant="label">{t('app.sale.tipChange.rule')}</Text>
        <ChoiceChips
          options={TIP_RULES.map((r) => ({
            value: r,
            label:
              r === 'operator'
                ? t('tip.rule.operator', { staffName: sale.operator.name ?? 'the person serving' })
                : r === 'equal_performers'
                  ? t('tip.rule.equal_performers')
                  : t('tip.rule.pro_rata_services'),
          }))}
          value={rule}
          onChange={setRule}
        />
        <Input label={t('tip.alloc.reason')} value={reason} onChangeText={setReason} maxLength={200} />
        <ErrorLine message={error} />
        <Button
          label={t('common.save')}
          loading={busy}
          disabled={!paymentId || !rule || !reason.trim() || busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await send({ action: 'tips', method: 'PATCH', money: true, body: { payment_id: paymentId, rule, reason: reason.trim() } });
              onClose();
            } catch (e) {
              setError(writeError(e, t));
            } finally {
              setBusy(false);
            }
          }}
          fullWidth
        />
      </View>
    </PosSheet>
  );
}

/** Mounted only while open, so every opening starts from a clean form. */
export function RefundSheet(props: Parameters<typeof RefundSheetBody>[0]) {
  return props.visible ? <RefundSheetBody {...props} /> : null;
}

/** Mounted only while open, so every opening starts from a clean form. */
export function ReceiptSheet(props: Parameters<typeof ReceiptSheetBody>[0]) {
  return props.visible ? <ReceiptSheetBody {...props} /> : null;
}

/** Mounted only while open, so every opening starts from a clean form. */
export function TipSplitSheet(props: Parameters<typeof TipSplitSheetBody>[0]) {
  return props.visible ? <TipSplitSheetBody {...props} /> : null;
}

import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { SaleCardCollect } from '@/components/pos/SaleCardCollect';
import { writeError, type Send } from '@/components/pos/SaleSheets';
import { AmountRow, ChoiceChips, ErrorLine, money, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import type { SaleCardResult } from '@/lib/payments/useSaleCardPayment';
import type { PosT } from '@/lib/pos/copy';
import {
  cashChange,
  cashCovers,
  cashQuickAmounts,
  checkPaymentAmount,
  parseMoneyInput,
  penceToInput,
  splitEvenly,
  tipBasePence,
  tipConfig,
  tipSuggestions,
  type AmountProblem,
} from '@/lib/pos/sale-math';
import { spacing } from '@/theme/index';
import type { PosBootstrap, PosPaymentType, PosSale } from '@/types/pos';

/**
 * Taking payment on a sale in the app (UX spec §3.18, §3.19, §13.3): the amount to pay now (the
 * whole balance, part of it, or an even split), then cash with change, another payment type with
 * its reference, or a card by Tap to Pay or the Bluetooth reader. Typed tips for cash and other
 * payments; for a card, the app's own tip screen comes first (Tap to Pay asks for no tip, P7-2).
 * One request id per payment staff are recording, so a retry or a double tap records it once.
 */

type Mode = 'choose' | 'cash' | 'other' | 'tip' | 'card' | 'done';

export type PaidOutcome = { changePence: number; method: 'cash' | 'external' | 'card_app' };

function amountProblemText(problem: AmountProblem, t: PosT, balance: number, max: number | null | undefined, venue: string) {
  switch (problem) {
    case 'exceeds_balance':
      return t('err.POS_AMOUNT_EXCEEDS_BALANCE', { balance: money(balance) });
    case 'above_ceiling':
      return t('err.ceiling', { max: money(max ?? 0), venue });
    default:
      return null;
  }
}

function PaySheetBody({
  visible,
  onClose,
  sale,
  bootstrap,
  send,
  cardAvailable,
  isAdmin,
  onPaid,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  cardAvailable: boolean;
  isAdmin: boolean;
  onPaid: (outcome: PaidOutcome) => void;
}) {
  const t = usePosT();
  const tips = useMemo(() => tipConfig(bootstrap.tip_settings), [bootstrap.tip_settings]);
  const balance = Math.max(0, sale.balance_due_pence);
  const max = bootstrap.settings.max_payment_pence ?? null;

  const [mode, setMode] = useState<Mode>('choose');
  const [amountText, setAmountText] = useState(penceToInput(balance));
  const [tipText, setTipText] = useState('');
  const [cardTip, setCardTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [tendered, setTendered] = useState('');
  const [keepChange, setKeepChange] = useState(false);
  const [type, setType] = useState<PosPaymentType | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeGiven, setChangeGiven] = useState(0);
  const requestId = useRef<string>(newPaymentAttemptId());


  const amount = parseMoneyInput(amountText);
  const typedTip = tips.enabled ? parseMoneyInput(tipText) ?? 0 : 0;
  const amountProblem = checkPaymentAmount({ amountPence: amount, balancePence: balance, maxPaymentPence: max });
  const amountOk = amountProblem === null && amount != null;
  const remaining = amount != null ? Math.max(0, balance - amount) : balance;
  const venueName = bootstrap.venue?.name ?? 'This venue';

  function enter(next: Mode) {
    setError(null);
    requestId.current = newPaymentAttemptId();
    setMode(next);
  }

  async function record(body: Record<string, unknown>, method: 'cash' | 'external') {
    setBusy(true);
    setError(null);
    try {
      const res = await send({
        action: 'payments',
        money: true,
        body: { version: sale.version, client_request_id: requestId.current, ...body },
      });
      requestId.current = newPaymentAttemptId();
      const change = typeof res.change_given_pence === 'number' ? res.change_given_pence : 0;
      setChangeGiven(change);
      onPaid({ changePence: change, method });
      if (change > 0) setMode('done');
      else onClose();
    } catch (e) {
      setError(writeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  // ── Cash ──
  const tenderedPence = parseMoneyInput(tendered);
  const cashDue = (amount ?? 0) + (keepChange ? 0 : typedTip);
  const change = cashChange(cashDue, tenderedPence);
  const cashTip = keepChange ? change : typedTip;
  const cashReady = amountOk && cashCovers(amount ?? 0, keepChange ? 0 : typedTip, tenderedPence);

  // ── Card tip screen ──
  const tipBase = tipBasePence(sale, tips.base, amount ?? 0);
  const suggestions = tipSuggestions({
    basePence: tipBase,
    percents: tips.percents,
    amounts: tips.amounts,
    thresholdPence: tips.thresholdPence,
  });
  const customTipPence = parseMoneyInput(customTip);
  const cardTipPence = cardTip ?? 0;
  const cardCeiling = checkPaymentAmount({ amountPence: amount, balancePence: balance, maxPaymentPence: max, tipPence: cardTipPence });

  const title =
    mode === 'cash' ? t('cash.title') : mode === 'other' ? type?.name ?? t('pay.title') : mode === 'tip' ? t('app.tip.title') : t('pay.title');

  return (
    <PosSheet visible={visible} onClose={onClose} title={title}>
      {mode === 'done' ? (
        <View style={posStyles.stack}>
          <Text variant="title">{t('done.change', { amount: money(changeGiven) })}</Text>
          <Button label={t('add.done')} onPress={onClose} fullWidth />
        </View>
      ) : mode === 'choose' ? (
        <View style={posStyles.stack}>
          <Input
            label={t('pay.amount')}
            accessibilityLabel={t('pay.amount')}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            inputMode="decimal"
            error={amountProblem ? amountProblemText(amountProblem, t, balance, max, venueName) ?? undefined : undefined}
            helper={amountOk && remaining > 0 ? t('pay.amount.part', { remaining: money(remaining) }) : undefined}
          />
          {balance > 1 ? (
            <View style={styles.chips}>
              <Text variant="caption" tone="muted">
                {t('pay.splitEvenly')}
              </Text>
              {[2, 3, 4].map((ways) => (
                <Chip
                  key={ways}
                  label={`${ways} x ${money(splitEvenly(balance, ways)[0]!)}`}
                  onPress={() => setAmountText(penceToInput(splitEvenly(balance, ways)[0]!))}
                />
              ))}
            </View>
          ) : null}
          <View style={posStyles.buttons}>
            {cardAvailable ? (
              <Button
                label={t('app.pay.card')}
                disabled={!amountOk}
                onPress={() => {
                  setCardTip(tips.enabled ? null : 0);
                  enter(tips.enabled ? 'tip' : 'card');
                }}
                fullWidth
              />
            ) : null}
            <Button label={t('pay.method.cash')} variant="secondary" disabled={!amountOk} onPress={() => enter('cash')} fullWidth />
            {(bootstrap.payment_types ?? []).map((pt) => (
              <Button
                key={pt.id}
                label={t('pay.method.other', { typeName: pt.name })}
                variant="secondary"
                disabled={!amountOk}
                onPress={() => {
                  setType(pt);
                  enter('other');
                }}
                fullWidth
              />
            ))}
          </View>
          {!cardAvailable && bootstrap.card_methods?.card_app ? (
            <Text variant="caption" tone="muted">
              {t('app.pay.cardUnavailable')}
            </Text>
          ) : null}
        </View>
      ) : mode === 'cash' ? (
        <View style={posStyles.stack}>
          <Text variant="heading">{t('cash.due', { amount: money(cashDue) })}</Text>
          {tips.enabled ? (
            <Input label={t('tip.label')} accessibilityLabel={t('tip.label')} value={tipText} onChangeText={setTipText} keyboardType="decimal-pad" inputMode="decimal" optional />
          ) : null}
          <Input
            label={t('cash.tendered')}
            accessibilityLabel={t('cash.tendered')}
            value={tendered}
            onChangeText={setTendered}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder={penceToInput(cashDue)}
          />
          <View style={styles.chips}>
            {cashQuickAmounts(cashDue).map((p, i) => (
              <Chip key={p} label={i === 0 ? t('cash.exact') : money(p)} onPress={() => setTendered(penceToInput(p))} />
            ))}
          </View>
          {tips.enabled && change > 0 ? (
            <View style={posStyles.row}>
              <Text variant="bodySmall" style={styles.flex}>
                {t('cash.keepChange', { amount: money(change) })}
              </Text>
              <Switch value={keepChange} onValueChange={setKeepChange} accessibilityLabel={t('cash.keepChange', { amount: money(change) })} />
            </View>
          ) : null}
          {!keepChange && change > 0 ? <Text variant="heading">{t('cash.change', { amount: money(change) })}</Text> : null}
          <ErrorLine message={error} />
          <Button
            label={t('cash.confirm', { amount: money((amount ?? 0) + cashTip) })}
            loading={busy}
            disabled={!cashReady || busy}
            onPress={() =>
              void record(
                {
                  method: 'cash',
                  amount_pence: amount,
                  ...(cashTip > 0 ? { tip_pence: cashTip } : {}),
                  ...(tenderedPence != null ? { cash_tendered_pence: tenderedPence } : {}),
                },
                'cash',
              )
            }
            fullWidth
          />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={() => setMode('choose')} fullWidth />
        </View>
      ) : mode === 'other' && type ? (
        <View style={posStyles.stack}>
          <Text variant="bodySmall" tone="muted">
            {t('other.help')}
          </Text>
          <AmountRow label={t('pay.amount')} amount={money(amount ?? 0)} strong />
          {tips.enabled ? (
            <Input label={t('tip.label')} accessibilityLabel={t('tip.label')} value={tipText} onChangeText={setTipText} keyboardType="decimal-pad" inputMode="decimal" optional />
          ) : null}
          <Input
            label={t('other.reference')}
            accessibilityLabel={t('other.reference')}
            value={reference}
            onChangeText={setReference}
            maxLength={120}
            required={type.requires_reference}
            optional={!type.requires_reference}
            helper={type.requires_reference ? t('other.reference.required') : undefined}
          />
          <ErrorLine message={error} />
          <Button
            label={t('other.confirm', { amount: money((amount ?? 0) + typedTip), typeName: type.name })}
            loading={busy}
            disabled={!amountOk || busy || (type.requires_reference && !reference.trim())}
            onPress={() =>
              void record(
                {
                  method: 'external',
                  amount_pence: amount,
                  payment_type_id: type.id,
                  ...(typedTip > 0 ? { tip_pence: typedTip } : {}),
                  ...(reference.trim() ? { reference: reference.trim() } : {}),
                },
                'external',
              )
            }
            fullWidth
          />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={() => setMode('choose')} fullWidth />
        </View>
      ) : mode === 'tip' ? (
        <View style={posStyles.stack}>
          <Text variant="bodySmall" tone="muted">
            {tips.base === 'services'
              ? t('tip.base.services', { amount: money(tipBase) })
              : t('tip.base.total', { amount: money(tipBase) })}
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
          {cardCeiling === 'above_ceiling' ? (
            <ErrorLine message={t('err.ceiling', { max: money(max ?? 0), venue: venueName })} />
          ) : null}
          <Button
            label={t('app.pay.withTip', { amount: money((amount ?? 0) + cardTipPence) })}
            disabled={cardTip == null || (customTip !== '' && customTipPence == null) || cardCeiling !== null}
            onPress={() => setMode('card')}
            fullWidth
          />
          <Button label={t('pay.otherWay')} variant="ghost" onPress={() => setMode('choose')} fullWidth />
        </View>
      ) : mode === 'card' && cardAvailable && amount != null ? (
        <SaleCardCollect
          saleId={sale.id}
          version={sale.version}
          amountPence={amount}
          tipPence={cardTipPence}
          isAdmin={isAdmin}
          balanceAfterStalePence={sale.balance_due_pence}
          onDone={(_result: SaleCardResult) => {
            // The webhook settles the payment; the sale screen reads it again and shows it.
            onPaid({ changePence: 0, method: 'card_app' });
            onClose();
          }}
          onBack={() => setMode(tips.enabled ? 'tip' : 'choose')}
        />
      ) : null}
    </PosSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});

/** Mounted only while open, so every opening starts from a clean form. */
export function PaySheet(props: Parameters<typeof PaySheetBody>[0]) {
  return props.visible ? <PaySheetBody {...props} /> : null;
}

import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { PayLinkPanel } from '@/components/pos/PayLinkPanel';
import { isPracticeSale } from '@/components/pos/practice/model';
import { PracticePaySheet } from '@/components/pos/practice/PracticePaySheet';
import {
  DueHeadline,
  OtherWays,
  PAY_ICONS,
  PayLink,
  PayTile,
  PayTileGrid,
  PayTileUnavailable,
  SplitWays,
} from '@/components/pos/PayTiles';
import { ReaderPayPanel } from '@/components/pos/ReaderPayPanel';
import { SaleCardCollect } from '@/components/pos/SaleCardCollect';
import { SavedCardCharge, SavedCardMethods } from '@/components/pos/SavedCards';
import { SendToPhonePanel } from '@/components/pos/SendToPhonePanel';
import { CreditPayPanel, VoucherPayPanel } from '@/components/pos/VoucherSheets';
import { writeError, type Send } from '@/components/pos/SaleSheets';
import { AmountRow, ErrorLine, money, Notice, PosSheet, posStyles, usePosT } from '@/components/pos/parts';
import { CashTillPrompt } from '@/components/pos/TillSheets';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { apiErrorCode } from '@/lib/api/client';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { useTapToPayDeviceSupport } from '@/lib/payments/tap-to-pay-device-support';
import { tapToPayButtonLabel } from '@/lib/payments/tap-to-pay-copy';
import { isRequestReused } from '@/lib/pos/api';
import type { SaleCardResult } from '@/lib/payments/useSaleCardPayment';
import { cardMethodsOffered } from '@/lib/pos/card-methods';
import type { PosT } from '@/lib/pos/copy';
import {
  cashChange,
  cashCovers,
  cashQuickAmounts,
  checkPaymentAmount,
  parseMoneyInput,
  penceToInput,
  splitEvenly,
  splitWaysOffered,
  tipConfig,
  type AmountProblem,
} from '@/lib/pos/sale-math';
import { useClientStoredValue } from '@/lib/queries/usePos';
import { fonts, radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap, PosPaymentType, PosSale, PosSavedCard } from '@/types/pos';

/**
 * Taking payment on a sale in the app (UX spec §3.18, §3.19, §13.3): the amount to pay now (the
 * whole balance, part of it, or an even split), then cash with change, another payment type with
 * its reference, or a card by Tap to Pay or the Bluetooth reader. Typed tips for cash and other
 * payments; for a card, the client chooses the tip on their side of the phone once the reader is
 * ready (`CustomerTip.tsx`; Tap to Pay asks for no tip, P7-2), and the sheet's title becomes the
 * venue's name while they hold it.
 * One request id per payment staff are recording, so a retry or a double tap records it once.
 *
 * App step 2 (POS plan P7-8, UX spec §13.4) adds: the counter reader (`card_reader`, driven by the
 * server, with its status), pay by link or QR code (`pay_link`, the QR code on this phone, for the
 * whole bill or the part typed), and the client's cards on file (`saved_card`, with
 * `charge_saved_card`). Saving a card with the client's consent rides on the card collector.
 *
 * The choice is laid out as Part 2 mock-up 1 (approved 2026-10-11): "£49.95 to pay" as the
 * headline, the amount field behind "Pay part of it" (with an even split that shows every share,
 * odd pennies first), the everyday methods as tiles with the card methods first and in navy,
 * account credit and saved cards as tiles when the client has them, and the venue's own payment
 * types under "Other ways". Every method shows under the same rules as before. On a phone that
 * can't take cards, at a venue with no counter reader, the card tile says so and what to do instead.
 *
 * On a device that can't take a card by tapping (a tablet without NFC, an iPad), "Send to a phone"
 * comes first when someone has a phone that can take one: the web till's panel, so a venue run
 * from a tablet with no counter reader can still take cards (`SendToPhonePanel`). The card tile
 * then says it is for a Bluetooth reader, or, where the app can't take cards at all, gives way.
 */

type Mode = 'choose' | 'cash' | 'other' | 'card' | 'done' | 'voucher' | 'credit' | 'reader' | 'link' | 'saved' | 'phone';

export type PaidOutcome = {
  changePence: number;
  method: 'cash' | 'external' | 'card_app' | 'gift_card' | 'account_credit' | 'card_reader' | 'pay_link' | 'saved_card';
};

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
  onPark,
}: {
  visible: boolean;
  onClose: () => void;
  sale: PosSale;
  bootstrap: PosBootstrap;
  send: Send;
  cardAvailable: boolean;
  isAdmin: boolean;
  onPaid: (outcome: PaidOutcome) => void;
  /** "Park sale" from a pay link, for a client who has gone (`link.later`). */
  onPark?: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const deviceTapToPay = useTapToPayDeviceSupport();
  const tips = useMemo(() => tipConfig(bootstrap.tip_settings), [bootstrap.tip_settings]);
  const balance = Math.max(0, sale.balance_due_pence);
  const max = bootstrap.settings.max_payment_pence ?? null;

  const [mode, setMode] = useState<Mode>('choose');
  const [amountText, setAmountText] = useState(penceToInput(balance));
  // "Pay part of it": the amount field and the even split, folded away until asked for.
  const [partOpen, setPartOpen] = useState(false);
  const [ways, setWays] = useState<number | null>(null);
  const [tipText, setTipText] = useState('');
  const [customerFacing, setCustomerFacing] = useState(false);
  const [savedCard, setSavedCard] = useState<PosSavedCard | null>(null);
  const [tendered, setTendered] = useState('');
  const [keepChange, setKeepChange] = useState(false);
  const [type, setType] = useState<PosPaymentType | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [tillMessage, setTillMessage] = useState<string | null>(null);
  const [changeGiven, setChangeGiven] = useState(0);
  const [creditPence, setCreditPence] = useState(0);
  const requestId = useRef<string>(newPaymentAttemptId());
  // Pass V (§20.3, §20.4): a gift voucher while vouchers are on or one sold earlier is still
  // active; account credit when the client has some (read only from a server that knows Pass V).
  const vouchersRedeemable = bootstrap.vouchers?.redeemable === true;
  const timeZone = bootstrap.venue?.timezone ?? 'Europe/London';


  const amount = parseMoneyInput(amountText);
  const typedTip = tips.enabled ? parseMoneyInput(tipText) ?? 0 : 0;
  const amountProblem = checkPaymentAmount({ amountPence: amount, balancePence: balance, maxPaymentPence: max });
  const amountOk = amountProblem === null && amount != null;
  const remaining = amount != null ? Math.max(0, balance - amount) : balance;
  const venueName = bootstrap.venue?.name ?? 'This venue';
  const methods = cardMethodsOffered(bootstrap, sale);
  // Cards on file on and a client on the sale: the client may save their card on this phone.
  const consentClientName =
    bootstrap.settings?.card_on_file_enabled === true && sale.guest ? sale.guest.name.split(' ')[0] || sale.guest.name : null;
  // Tap to Pay on this device: the build allows it (never an iPad) and, on Android, the device has
  // not said no (a tablet without NFC does, `tap-to-pay-device-support.ts`).
  const tapToPayHere = buildSupportsTapToPay() && deviceTapToPay !== false;
  // This device can't take a card by tapping, but a team member's phone can: send it there. The
  // card tile stays for a Bluetooth reader. (`cardAvailable` is the app's card SDK and key, not the
  // device: it is true on every store build, tablets included.)
  const phoneOffered = methods.sendToPhone && !(cardAvailable && tapToPayHere);
  // The venue takes cards in the app but this phone can't (Expo Go, no Terminal SDK or no key),
  // and there is no counter reader or phone to take one instead: the card tile says so (mock-up note 5).
  const cardNotHere = !cardAvailable && bootstrap.card_methods?.card_app === true && !methods.cardReader && !phoneOffered;
  const waysOffered = splitWaysOffered(balance);
  const shares = ways ? splitEvenly(balance, ways) : null;
  // The amount never hides a problem behind "Pay part of it": a bill above the venue's largest
  // single payment, or a balance that moved while the sheet was open, opens it with the reason.
  const showPart = partOpen || amountProblem !== null;
  const wholeBillOk = checkPaymentAmount({ amountPence: balance, balancePence: balance, maxPaymentPence: max }) === null;

  // Typing or splitting keeps the amount open, even when it opened itself to show a problem.
  function changeAmount(text: string) {
    setPartOpen(true);
    setAmountText(text);
    setWays(null);
  }

  function chooseWays(next: number) {
    setPartOpen(true);
    setWays(next);
    // Taking a share takes exactly the first share shown, odd pennies and all.
    setAmountText(penceToInput(splitEvenly(balance, next)[0]!));
  }

  function payAll() {
    setPartOpen(false);
    setWays(null);
    setAmountText(penceToInput(balance));
  }

  function enter(next: Mode) {
    setError(null);
    setErrorCode(null);
    setTillMessage(null);
    requestId.current = newPaymentAttemptId();
    setMode(next);
  }

  async function record(body: Record<string, unknown>, method: 'cash' | 'external') {
    setBusy(true);
    setError(null);
    setErrorCode(null);
    setTillMessage(null);
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
      // A reused request id (409 CONFLICT, request_reused) took nothing: the next try is a new
      // request, so it gets a new id. A lost answer keeps the id, so a retry records it once.
      if (isRequestReused(e)) requestId.current = newPaymentAttemptId();
      setError(writeError(e, t));
      setErrorCode(apiErrorCode(e));
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

  const title =
    mode === 'card' && customerFacing
      ? venueName
      : mode === 'cash'
        ? t('cash.title')
        : mode === 'other'
          ? type?.name ?? t('pay.title')
          : mode === 'voucher'
            ? t('vpay.title')
            : mode === 'credit'
              ? t('cpay.title')
              : mode === 'link'
                ? t('link.title')
                : mode === 'reader'
                  ? t('pay.method.cardReader')
                  : mode === 'saved'
                    ? t('pay.method.savedCard')
                    : mode === 'phone'
                      ? t('phone.title')
                      : t('pay.title');

  return (
    // While the client holds the phone (tip, card, result), the sheet becomes client mode: full
    // screen, nothing to drag or tap shut, Back asks staff before stopping (2026-10-11).
    <PosSheet
      visible={visible}
      onClose={onClose}
      title={title}
      eyebrow={mode === 'choose'}
      headline={mode === 'choose' ? <DueHeadline balancePence={balance} /> : undefined}
      takeover={mode === 'card' && customerFacing}>
      {mode === 'done' ? (
        <View style={posStyles.stack}>
          <Text variant="title">{t('done.change', { amount: money(changeGiven) })}</Text>
          <Button label={t('add.done')} onPress={onClose} fullWidth />
        </View>
      ) : mode === 'choose' ? (
        <View style={posStyles.stack}>
          {/* Most sales are paid in one go, so the amount waits behind "Pay part of it". */}
          {balance > 1 && !showPart ? <PayLink label={t('app.pay.part')} expanded={false} onPress={() => setPartOpen(true)} /> : null}
          {showPart ? (
            <View style={[styles.part, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
              <View style={styles.partHead}>
                <Text variant="label" tone="secondary" style={styles.flex}>
                  {t('app.pay.part')}
                </Text>
                {wholeBillOk ? <PayLink label={t('app.pay.all')} onPress={payAll} /> : null}
              </View>
              <Input
                accessibilityLabel={t('pay.amount')}
                value={amountText}
                onChangeText={changeAmount}
                keyboardType="decimal-pad"
                inputMode="decimal"
                leftIcon={
                  <Text variant="bodyMedium" tone="muted" style={styles.amountInput}>
                    £
                  </Text>
                }
                style={styles.amountInput}
                error={amountProblem ? amountProblemText(amountProblem, t, balance, max, venueName) ?? undefined : undefined}
                helper={amountOk && remaining > 0 ? t('pay.amount.part', { remaining: money(remaining) }) : undefined}
              />
              {waysOffered.length > 0 ? (
                <View style={styles.split}>
                  <Text variant="label" tone="secondary">
                    {t('pay.splitEvenly')}
                  </Text>
                  <SplitWays ways={waysOffered} value={ways} onChange={chooseWays} />
                  {/* Every share, never "2 x": nobody is caught out by the odd penny. */}
                  {shares ? <Text style={styles.shares}>{shares.map(money).join(' + ')}</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {showPart && amountOk && amount != null ? (
            <Text variant="label" tone="secondary">
              {t('app.pay.takeBy', { amount: money(amount) })}
            </Text>
          ) : null}
          <PayTileGrid>
            {/* First when shown: it is only shown where this device can't take a card by tapping. */}
            {phoneOffered ? (
              <PayTile
                icon={PAY_ICONS.phone}
                title={t('pay.method.phone')}
                detail={t('app.pay.tile.phone')}
                primary
                disabled={!amountOk}
                onPress={() => enter('phone')}
              />
            ) : null}
            {cardAvailable ? (
              <PayTile
                icon={PAY_ICONS.tapToPay}
                title={t('app.pay.card')}
                detail={
                  tapToPayHere
                    ? t('app.pay.tile.card', { tapToPay: tapToPayButtonLabel() })
                    : t('app.pay.tile.cardBluetooth')
                }
                primary
                disabled={!amountOk}
                onPress={() => enter('card')}
              />
            ) : null}
            {cardNotHere ? (
              <PayTileUnavailable
                title={t('app.pay.card')}
                flag={t('app.pay.tile.notHere')}
                detail={methods.payLink ? t('app.pay.tile.notHere.link') : t('app.pay.tile.notHere.other')}
              />
            ) : null}
            {methods.cardReader ? (
              <PayTile
                icon={PAY_ICONS.reader}
                title={t('pay.method.cardReader')}
                detail={t('app.pay.tile.reader')}
                primary
                disabled={!amountOk}
                onPress={() => enter('reader')}
              />
            ) : null}
            <PayTile
              icon={PAY_ICONS.cash}
              title={t('pay.method.cash')}
              detail={t('app.pay.tile.cash')}
              disabled={!amountOk}
              onPress={() => enter('cash')}
            />
            {methods.payLink ? (
              <PayTile
                icon={PAY_ICONS.link}
                title={t('pay.method.link')}
                detail={t('app.pay.tile.link')}
                disabled={!amountOk}
                onPress={() => enter('link')}
              />
            ) : null}
            {vouchersRedeemable ? (
              <PayTile
                icon={PAY_ICONS.voucher}
                title={t('pay.method.voucher')}
                detail={t('app.pay.tile.voucher')}
                onPress={() => enter('voucher')}
              />
            ) : null}
            {sale.guest && bootstrap.vouchers ? (
              <CreditMethod
                guestId={sale.guest.id}
                clientName={sale.guest.name}
                onCredit={setCreditPence}
                onPress={() => enter('credit')}
              />
            ) : null}
            {methods.savedCards ? (
              <SavedCardMethods
                sale={sale}
                disabled={!amountOk}
                onChoose={(card) => {
                  setSavedCard(card);
                  enter('saved');
                }}
              />
            ) : null}
          </PayTileGrid>
          <OtherWays
            types={bootstrap.payment_types ?? []}
            disabled={!amountOk}
            onChoose={(id) => {
              const pt = (bootstrap.payment_types ?? []).find((p) => p.id === id);
              if (!pt) return;
              setType(pt);
              enter('other');
            }}
          />
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
          {/* Pass 3 (§3.19.1): with cash counted in till sessions and no till open, open it here. */}
          {errorCode === 'POS_TILL_SESSION_REQUIRED' ? (
            <CashTillPrompt
              sale={sale}
              send={send}
              onResolved={(message) => {
                setError(null);
                setErrorCode(null);
                setTillMessage(message);
              }}
            />
          ) : null}
          {tillMessage ? <Notice tone="success">{tillMessage}</Notice> : null}
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
      ) : mode === 'voucher' ? (
        <VoucherPayPanel
          sale={sale}
          send={send}
          timeZone={timeZone}
          onDone={() => {
            onPaid({ changePence: 0, method: 'gift_card' });
            onClose();
          }}
          onBack={() => setMode('choose')}
        />
      ) : mode === 'credit' ? (
        <CreditPayPanel
          sale={sale}
          send={send}
          creditPence={creditPence}
          onDone={() => {
            onPaid({ changePence: 0, method: 'account_credit' });
            onClose();
          }}
          onBack={() => setMode('choose')}
        />
      ) : mode === 'reader' && amount != null ? (
        <ReaderPayPanel
          sale={sale}
          bootstrap={bootstrap}
          send={send}
          amountPence={amount}
          onPaid={() => {
            onPaid({ changePence: 0, method: 'card_reader' });
            onClose();
          }}
          onBack={() => setMode('choose')}
          onUseLink={methods.payLink ? () => enter('link') : undefined}
        />
      ) : mode === 'phone' && amount != null ? (
        <SendToPhonePanel
          sale={sale}
          send={send}
          amountPence={amount}
          onPaid={() => {
            onPaid({ changePence: 0, method: 'card_app' });
            onClose();
          }}
          onBack={() => setMode('choose')}
          onUseLink={methods.payLink ? () => enter('link') : undefined}
          onUseReader={methods.cardReader ? () => enter('reader') : undefined}
        />
      ) : mode === 'link' && amount != null ? (
        <PayLinkPanel
          sale={sale}
          bootstrap={bootstrap}
          send={send}
          amountPence={amount}
          onPaid={() => {
            onPaid({ changePence: 0, method: 'pay_link' });
            onClose();
          }}
          onClose={() => setMode('choose')}
          onPark={
            onPark
              ? () => {
                  onClose();
                  onPark();
                }
              : undefined
          }
        />
      ) : mode === 'saved' && savedCard && amount != null ? (
        <SavedCardCharge
          sale={sale}
          card={savedCard}
          amountPence={amount}
          send={send}
          onPaid={() => {
            onPaid({ changePence: 0, method: 'saved_card' });
            onClose();
          }}
          onBack={() => setMode('choose')}
          onUseLink={methods.payLink ? () => enter('link') : undefined}
        />
      ) : mode === 'card' && cardAvailable && amount != null ? (
        <SaleCardCollect
          saleId={sale.id}
          version={sale.version}
          amountPence={amount}
          customerTip={
            tips.enabled
              ? {
                  sale,
                  tipSettings: bootstrap.tip_settings,
                  amountPence: amount,
                  balancePence: balance,
                  maxPaymentPence: max,
                  venueName,
                  clientName: sale.guest ? sale.guest.name.split(' ')[0] || sale.guest.name : null,
                }
              : null
          }
          onCustomerFacing={setCustomerFacing}
          isAdmin={isAdmin}
          balanceAfterStalePence={sale.balance_due_pence}
          consentClientName={consentClientName}
          onDone={(_result: SaleCardResult) => {
            // The webhook settles the payment; the sale screen reads it again and shows it.
            onPaid({ changePence: 0, method: 'card_app' });
            onClose();
          }}
          onBack={() => setMode('choose')}
        />
      ) : null}
    </PosSheet>
  );
}

/**
 * "Account credit" with what the client has under it (`cpay.available`), shown only when they
 * have some. Its own component, so the credit is read only for a sale with a client.
 */
function CreditMethod({
  guestId,
  clientName,
  onCredit,
  onPress,
}: {
  guestId: string;
  clientName: string;
  onCredit: (pence: number) => void;
  onPress: () => void;
}) {
  const t = usePosT();
  const stored = useClientStoredValue(guestId);
  const credit = Math.max(0, stored.data?.credit.balance_pence ?? 0);
  if (credit <= 0) return null;
  return (
    <PayTile
      icon={PAY_ICONS.credit}
      title={t('pay.method.credit')}
      detail={t('cpay.available', { clientName, amount: money(credit) })}
      onPress={() => {
        onCredit(credit);
        onPress();
      }}
    />
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  part: { borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 14, paddingTop: spacing.md, paddingBottom: 14, gap: spacing.md },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amountInput: { fontSize: 20, lineHeight: 26, fontFamily: fonts.semibold },
  split: { gap: spacing.sm },
  shares: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
});

/** Mounted only while open, so every opening starts from a clean form. */
export function PaySheet(props: Parameters<typeof PaySheetBody>[0]) {
  if (!props.visible) return null;
  // A practice sale (set-up W11, OB4) never takes money: each method only shows what would happen.
  if (isPracticeSale(props.sale)) {
    return <PracticePaySheet visible onClose={props.onClose} sale={props.sale} bootstrap={props.bootstrap} onPaid={props.onPaid} />;
  }
  return <PaySheetBody {...props} />;
}

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence, formatPositivePence, penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { loadLastMethod, rememberLastMethod } from '@/lib/payments/last-method';
import {
  checkChargeAmount,
  otherVisitLineNote,
  paymentMethodLabel,
  pendingCardPayments,
  pendingCardState,
  refundablePayments,
  remainingAfterPayment,
  visitPaymentNote,
  type PendingCardVerdict,
} from '@/lib/payments/payment-display';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { useTapToPayReader } from '@/lib/payments/terminal';
import { usePendingCardClock } from '@/lib/payments/usePendingCardClock';
import {
  useCancelCardCollection,
  useRecordExternalPayment,
  useRefundPayment,
  useTakePayment,
  type InPersonReaderType,
} from '@/lib/queries/useTakePayment';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingPaymentRow, VisitPayment } from '@/types/booking-detail';

/**
 * Take payment sheet (Tap to Pay design doc §7.8 + §7A.6).
 *
 * Opening this sheet is NON-COMMITTAL: staff can dismiss at any state with no
 * side effects. Nothing is charged until a card is confirmed or cash is
 * explicitly confirmed (§3.2).
 *
 * Every sub-step — reader pairing, the cash confirm, the in-flight-payment
 * warning — is folded in as a MODE of this sheet rather than a second stacked
 * Sheet: presenting a modal from inside a visible modal is unreliable on iOS
 * (see the app's stacked-modal note), which would strand staff mid-payment.
 */

export type TakePaymentTarget = {
  id: string;
  guestName: string;
  /**
   * Outstanding balance; null = price unknown, staff must enter an amount
   * (§5.7). VISIT-scoped: on a multi-service visit this is the whole visit's
   * balance, because one collection settles every service in it.
   */
  balanceDuePence: number | null;
  /** The visit behind that balance, so staff can see what it covers (§5.7). */
  visitPayment?: VisitPayment | null;
  /** Admin-only actions (refunds) follow the same rule as every money action. */
  isAdmin: boolean;
  /** Ledger rows from the booking GET; drives the refund list. */
  payments: BookingPaymentRow[];
  /** Venue has a connected Stripe account, so card options can work (§6.6). */
  cardPresentReady: boolean;
};

type SheetMode =
  | 'menu'
  /** A card payment is still settling; warn before starting another. */
  | 'processing'
  | 'card'
  | 'pair'
  /** Confirm step for cash, so a mis-tap can't write a ledger row. */
  | 'cash'
  /** Note + confirm for a bank transfer, gift card and so on. */
  | 'external'
  | 'refund'
  | 'success';

/** How long an armed refund stays armed — the app's standard confirm window. */
const REFUND_ARM_MS = 4000;

/** What was just collected, for the success screen (§7.8). */
type SuccessInfo = {
  amountPence: number | null;
  /** Card payments email a receipt from the webhook; cash and refunds do not. */
  receiptEmailed: boolean;
  heading: string;
  /** Left to pay after a partial collection; null when it can't be worked out. */
  remainingPence: number | null;
};

type TakePaymentSheetProps = {
  target: TakePaymentTarget | null;
  onClose: () => void;
};

export function TakePaymentSheet({ target, onClose }: TakePaymentSheetProps) {
  /**
   * Dismissing must leave NO side effects (§3.2). An in-flight card collection
   * is cancelled by `CardCollectSection`'s unmount cleanup, which covers every
   * route out of the sheet (Close, Back, or the host clearing the target).
   */
  const handleClose = onClose;

  const [mode, setMode] = useState<SheetMode>('menu');
  const [amountInput, setAmountInput] = useState('');
  /** The last value THIS component seeded, so a staff edit is distinguishable. */
  const [seededAmount, setSeededAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [refundArmedId, setRefundArmedId] = useState<string | null>(null);
  const [readerType, setReaderType] = useState<InPersonReaderType>('tap_to_pay');
  /**
   * Set when the card step is entered from a just-completed pairing, so the
   * collection starts immediately. Without it staff would pair a reader and
   * then have to press "Use card reader" a second time, mid-payment, with the
   * client waiting.
   */
  const [autoCollect, setAutoCollect] = useState<InPersonReaderType | null>(null);
  const refundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Same-frame guard for the cash/external write; see `recordCash`. */
  const recordingRef = useRef(false);

  const recordExternal = useRecordExternalPayment(target?.id ?? '');
  const refund = useRefundPayment(target?.id ?? '');

  /**
   * Clock for the pending-row age check, ticking only while there is a row whose
   * age could matter. Render must not read `Date.now()` itself — see
   * `usePendingCardClock`.
   */
  const nowMs = usePendingCardClock(pendingCardPayments(target?.payments).length > 0);

  // Reset every time a different booking opens the sheet, and follow the live
  // balance while it stays open.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when the target changes
      setSeededId(null);
      return;
    }
    const seed =
      target.balanceDuePence != null ? penceToPoundsInput(target.balanceDuePence) : '';

    if (target.id !== seededId) {
      setSeededId(target.id);
      setSeededAmount(seed);
      setAmountInput(seed);
      setNote('');
      setError(null);
      setSuccess(null);
      setRefundArmedId(null);
      /**
       * A card payment already in flight opens on the warning rather than the
       * menu: starting a fresh collection over the top of one is exactly how a
       * client gets charged twice. A row that appears LATER (a confirm that
       * errored after Stripe captured, or a second device collecting) can't
       * move staff mid-flow, so it raises the persistent notice below instead.
       *
       * Only a FRESH, unexplained row gets to take the sheet over. A decline this
       * client watched, or a row so old its webhook is never coming, must not
       * stand between the venue and taking the money — it softens to the notice
       * below. `Date.now()` is fine here: an effect is not render.
       */
      setMode(
        pendingCardState({ payments: target.payments, nowMs: Date.now() }).verdict === 'in_flight'
          ? 'processing'
          : 'menu',
      );
      return;
    }

    if (seed === seededAmount) return;
    // The live balance moved while the sheet was open (a deposit landed, or a
    // sibling service settled). Follow it ONLY while the field still holds what
    // we last put there: an amount the staff member typed is their decision,
    // not a stale default to be overwritten under their fingers.
    setSeededAmount(seed);
    if (amountInput === seededAmount) setAmountInput(seed);
  }, [target?.id, target?.balanceDuePence]); // eslint-disable-line react-hooks/exhaustive-deps

  // An armed refund must not outlive the sheet.
  useEffect(
    () => () => {
      if (refundTimer.current) clearTimeout(refundTimer.current);
    },
    [],
  );

  // Keep the Sheet mounted (hidden) so dismissal animates like the other sheets.
  if (!target) {
    return (
      <Sheet visible={false} onClose={handleClose}>
        <View />
      </Sheet>
    );
  }

  // Read once so the async handlers below close over a plain value rather than
  // re-narrowing `target` (which they cannot: it is a prop, not a const).
  const balancePence = target.balanceDuePence;
  const balanceKnown = balancePence != null;
  const visitNote = visitPaymentNote(target.visitPayment);
  /**
   * One verdict on the typed amount, shared by the card and the cash paths. It
   * blocks anything the charge route would silently clamp or reject, so staff
   * can never commit to a figure the ledger won't actually hold.
   */
  const amountCheck = checkChargeAmount(amountInput, balancePence);
  const amountValid = amountCheck.valid;
  const amountPence = amountCheck.amountPence ?? undefined;
  /** What will actually be taken: the typed amount, else the whole balance. */
  const chargePence = amountCheck.amountPence ?? balancePence;
  const chargeLabel = formatPence(chargePence) ?? 'the amount';
  const isPartial = balancePence != null && chargePence != null && chargePence < balancePence;

  const cardAvailable = target.cardPresentReady && isTerminalSdkAvailable();
  const refundable = refundablePayments(target.payments);
  /**
   * Recomputed every render from the LIVE ledger the host feeds in, not just at
   * open: the backend writes the pending row when the PaymentIntent is created,
   * so one can appear while this sheet is on screen — a confirm that failed
   * after Stripe captured, or a colleague collecting on another device. Reading
   * it once at open would leave Retry (and cash) armed with no warning at all.
   *
   * `verdict` also decides how loud it is: see `pendingCardState`.
   */
  const pending = pendingCardState({ payments: target.payments, nowMs });
  const hasPendingCard = pending.verdict !== 'none';

  const busy = recordExternal.isPending || refund.isPending;
  /** The card steps replace the balance headline with what is being charged. */
  const isCharging = mode === 'card' || mode === 'pair';

  function fail(e: unknown, fallback: string) {
    hapticWarning();
    setError(e instanceof ApiError ? e.message : fallback);
  }

  function disarmRefund() {
    if (refundTimer.current) clearTimeout(refundTimer.current);
    refundTimer.current = null;
    setRefundArmedId(null);
  }

  function armRefund(paymentId: string) {
    hapticWarning();
    setRefundArmedId(paymentId);
    if (refundTimer.current) clearTimeout(refundTimer.current);
    // Disarm on its own so a walked-away-from sheet can't be finished off by
    // whoever picks the phone up next.
    refundTimer.current = setTimeout(() => setRefundArmedId(null), REFUND_ARM_MS);
  }

  async function recordCash(method: 'cash' | 'external') {
    /**
     * Same-frame re-entry guard as the card path, and the more important of the
     * two. `busy` is derived from mutation state that has not re-rendered yet,
     * so two taps in one frame both pass it — and unlike a card payment there is
     * NO server-side idempotency here: the charge route inserts a ledger row
     * unconditionally, and the only unique index covers Stripe PaymentIntents.
     * A double tap therefore records the money twice, and only an admin can
     * reverse it.
     */
    if (recordingRef.current) return;
    recordingRef.current = true;
    setError(null);
    try {
      await recordExternal.mutateAsync({
        method,
        ...(amountPence != null ? { amountPence } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      hapticSuccess();
      // Cash and other settlements are recorded straight to the ledger, with no
      // Stripe leg and therefore no emailed receipt.
      const collected = amountPence ?? balancePence;
      setSuccess({
        amountPence: collected,
        receiptEmailed: false,
        heading: 'Payment recorded',
        remainingPence: remainingAfterPayment(balancePence, collected),
      });
      setMode('success');
    } catch (e) {
      fail(e, 'The payment could not be recorded.');
    } finally {
      recordingRef.current = false;
    }
  }

  async function runRefund(paymentId: string, paymentBookingId?: string) {
    setError(null);
    try {
      // Route to the booking the row is anchored to, not the one on screen —
      // a visit payment is listed on every line but only refundable from its
      // own (§5.7).
      await refund.mutateAsync({ paymentId, paymentBookingId });
      hapticSuccess();
      disarmRefund();
      setSuccess({
        amountPence: null,
        receiptEmailed: false,
        heading: 'Refund issued',
        remainingPence: null,
      });
      setMode('success');
    } catch (e) {
      fail(e, 'The refund could not be completed.');
    }
  }

  return (
    <Sheet visible onClose={handleClose}>
      <View style={styles.body}>
        {/* The balance shown here is a snapshot taken when the sheet opened, so
            it is hidden once something has been collected rather than showing a
            stale "due" figure. On the card steps it is replaced by the amount
            about to be taken, which is the one number that must be unambiguous
            while a client is holding their card out. */}
        {mode !== 'success' ? (
          <View style={styles.header}>
            <Text variant="overline" tone="muted">
              Take payment
            </Text>
            <Text variant="title">
              {isCharging
                ? `Charging ${chargeLabel}`
                : balanceKnown
                  ? `${formatPositivePence(balancePence) ?? '—'} due`
                  : 'Enter the amount'}
            </Text>
            <Text variant="bodySmall" tone="muted">
              {target.guestName}
            </Text>
            {isCharging && isPartial ? (
              <Text variant="bodySmall" tone="muted">
                Part of the {formatPence(balancePence)} outstanding.
              </Text>
            ) : null}
            {/* §5.7: on a multi-service visit the balance above covers every
                service, not just the one that was opened. Without this line a
                £30 service showing "£90.00 due" looks like a bug. */}
            {visitNote ? (
              <Text variant="bodySmall" tone="muted">
                {visitNote}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Success (§7.8) ──────────────────────────────────────────── */}
        {mode === 'success' && success ? (
          <>
            <View style={styles.successBlock}>
              <Text variant="title" tone="success">
                {success.amountPence != null
                  ? `${formatPence(success.amountPence)} collected`
                  : success.heading}
              </Text>
              {/* A part payment leaves money on the appointment, and staff are
                  about to tell the client they are done. Say what is left. */}
              {success.remainingPence != null && success.remainingPence > 0 ? (
                <Text variant="bodyMedium">
                  {formatPence(success.remainingPence)} is still outstanding.
                </Text>
              ) : null}
              {success.receiptEmailed ? (
                <Text variant="bodySmall" tone="muted">
                  A receipt has been emailed to {target.guestName}.
                </Text>
              ) : null}
              <Text variant="caption" tone="muted">
                The booking updates in a moment once the payment is confirmed.
              </Text>
            </View>
            <View style={styles.buttons}>
              <Button label="Done" onPress={handleClose} fullWidth />
            </View>
          </>
        ) : null}

        {/* ── A card payment is still settling ────────────────────────── */}
        {/* As a whole step when the sheet opened on one... */}
        {mode === 'processing' ? (
          <>
            <PendingCardNotice
              verdict={pending.verdict}
              totalPence={pending.totalPence}
              guestName={target.guestName}
            />
            <View style={styles.buttons}>
              <Button label="Wait and close" onPress={handleClose} fullWidth />
              <Button
                label="Take another payment anyway"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  setMode('menu');
                }}
                fullWidth
              />
            </View>
          </>
        ) : hasPendingCard && mode !== 'success' ? (
          /* ...and as a notice pinned above whatever step staff are already on
             when one shows up mid-flow. It sits above every button that could
             commit money — Retry included — rather than only the card ones. A
             stale row lands here too, informational rather than blocking. */
          <PendingCardNotice
            verdict={pending.verdict}
            totalPence={pending.totalPence}
            guestName={target.guestName}
          />
        ) : null}

        {/* ── Method menu ─────────────────────────────────────────────── */}
        {mode === 'menu' ? (
          <>
            <Input
              label={balanceKnown ? 'Amount (£)' : 'Amount to charge (£)'}
              helper={
                balanceKnown
                  ? 'Leave as is to take the full balance, or change it to take part of it.'
                  : 'This appointment has no set price, so enter what the client is paying.'
              }
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              inputMode="decimal"
              editable={!busy}
              error={amountCheck.error ?? undefined}
            />

            <View style={styles.buttons}>
              {cardAvailable ? (
                <Button
                  label="Card payment"
                  disabled={!amountValid || busy}
                  onPress={() => {
                    setError(null);
                    setSuccess(null);
                    setMode('card');
                  }}
                  fullWidth
                />
              ) : null}
              <Button
                label="Record cash"
                variant="secondary"
                disabled={!amountValid || busy}
                onPress={() => {
                  setError(null);
                  setMode('cash');
                }}
                fullWidth
              />
              <Button
                label="Record other payment"
                variant="secondary"
                disabled={!amountValid || busy}
                onPress={() => {
                  setError(null);
                  setMode('external');
                }}
                fullWidth
              />
              {target.isAdmin && refundable.length > 0 ? (
                <Button
                  label="Refund a payment"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => {
                    setError(null);
                    setMode('refund');
                  }}
                  fullWidth
                />
              ) : null}
            </View>
          </>
        ) : null}

        {/* ── Card capture (SDK-gated) ────────────────────────────────── */}
        {mode === 'card' && cardAvailable ? (
          <CardCollectSection
            bookingId={target.id}
            amountPence={amountPence}
            readerType={readerType}
            onReaderTypeChange={setReaderType}
            autoCollect={autoCollect}
            onAutoCollectHandled={() => setAutoCollect(null)}
            onPair={() => setMode('pair')}
            onDone={(collected) => {
              // Card payments settle through Stripe, and the webhook emails the
              // receipt on success (§6.5) — so this is the only path that can
              // promise one.
              setSuccess({
                amountPence: collected,
                receiptEmailed: true,
                heading: 'Payment collected',
                remainingPence: remainingAfterPayment(balancePence, collected),
              });
              setMode('success');
            }}
            onBack={() => setMode('menu')}
          />
        ) : null}

        {/* ── Bluetooth reader pairing (folded in, not a stacked sheet) ─ */}
        {mode === 'pair' && cardAvailable ? (
          <ReaderPairingSection
            onPaired={() => {
              setReaderType('bluetooth');
              setAutoCollect('bluetooth');
              setMode('card');
            }}
            onBack={() => setMode('card')}
          />
        ) : null}

        {/* ── Record cash (confirm step) ──────────────────────────────── */}
        {mode === 'cash' ? (
          <>
            <Text variant="bodyMedium">Record {chargeLabel} taken in cash?</Text>
            <Text variant="bodySmall" tone="muted">
              This writes a payment straight onto the booking. Only an admin can reverse it.
            </Text>
            <View style={styles.buttons}>
              <Button
                label={`Record ${chargeLabel} cash`}
                disabled={!amountValid || busy}
                loading={recordExternal.isPending}
                onPress={() => void recordCash('cash')}
                fullWidth
              />
              <Button
                label="Back"
                variant="secondary"
                disabled={busy}
                onPress={() => setMode('menu')}
                fullWidth
              />
            </View>
          </>
        ) : null}

        {/* ── Record other payment (note) ─────────────────────────────── */}
        {mode === 'external' ? (
          <>
            <Input
              label="Note (optional)"
              placeholder="e.g. bank transfer, gift card"
              value={note}
              onChangeText={setNote}
              editable={!busy}
            />
            <View style={styles.buttons}>
              <Button
                label={`Record ${chargeLabel}`}
                disabled={!amountValid || busy}
                loading={recordExternal.isPending}
                onPress={() => void recordCash('external')}
                fullWidth
              />
              <Button
                label="Back"
                variant="secondary"
                disabled={busy}
                onPress={() => setMode('menu')}
                fullWidth
              />
            </View>
          </>
        ) : null}

        {/* ── Refund (admin) ──────────────────────────────────────────── */}
        {mode === 'refund' ? (
          <>
            <Text variant="bodySmall" tone="muted">
              Refunds are for the full payment. Card refunds go back to the client&apos;s card.
            </Text>
            <View style={styles.buttons}>
              {refundable.map((p) => {
                const lineNote = otherVisitLineNote(p, target.id);
                const armed = refundArmedId === p.id;
                return (
                  <View key={p.id} style={styles.refundRow}>
                    <Button
                      // The amount stays in the label while armed: it is the one
                      // fact worth re-reading at the moment of confirming.
                      label={
                        armed
                          ? `Tap again to refund ${formatPence(p.amount_pence)}`
                          : `Refund ${formatPence(p.amount_pence)} · ${paymentMethodLabel(p.method)}`
                      }
                      variant="danger"
                      disabled={busy}
                      loading={refund.isPending && armed}
                      onPress={() => {
                        if (!armed) {
                          armRefund(p.id);
                          return;
                        }
                        void runRefund(p.id, p.booking_id);
                      }}
                      fullWidth
                    />
                    {armed ? (
                      <Button
                        label="Cancel refund"
                        variant="ghost"
                        disabled={busy}
                        onPress={disarmRefund}
                        fullWidth
                      />
                    ) : null}
                    {lineNote ? (
                      <Text variant="bodySmall" tone="muted">
                        {lineNote}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              <Button
                label="Back"
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  disarmRefund();
                  setMode('menu');
                }}
                fullWidth
              />
            </View>
          </>
        ) : null}

        {error ? (
          <Text variant="bodySmall" tone="danger">
            {error}
          </Text>
        ) : null}

        {mode === 'menu' ? (
          <Button label="Close" variant="secondary" onPress={handleClose} fullWidth />
        ) : null}
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// "A card payment is still going through"
// ---------------------------------------------------------------------------

/**
 * The one warning that stops a client being charged twice, so it reads
 * identically whether it is the whole step (sheet opened on a pending row) or a
 * notice pinned over another step (row appeared while staff were mid-flow).
 *
 * Two registers, because "wait a moment" and "this one is not coming back" need
 * completely different things from staff:
 *  - `in_flight`: wait, and don't collect again.
 *  - `stale`: stop waiting. Nothing in the app can settle or cancel a stuck
 *    `pending` row (see Docs/TAP_TO_PAY.md, "Backend requirements"), so the copy
 *    has to hand staff the two places that CAN answer whether the money arrived —
 *    the booking's payment history and the Stripe dashboard — and make clear
 *    they are not blocked from taking payment in the meantime.
 */
function PendingCardNotice({
  verdict,
  totalPence,
  guestName,
}: {
  verdict: PendingCardVerdict;
  totalPence: number;
  guestName: string;
}) {
  const { colors } = useTheme();
  const amount = totalPence > 0 ? ` of ${formatPence(totalPence)}` : '';

  if (verdict === 'stale') {
    return (
      <View style={styles.notice}>
        <Text variant="bodyMedium" color={colors.warning}>
          A card payment{amount} started a while ago and still has not been confirmed.
        </Text>
        <Text variant="bodySmall" tone="muted">
          It may or may not have gone through. Check the payment history on this booking, or the
          payment in your Stripe dashboard, before taking another card payment. Cash and other
          payments are not affected.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.notice}>
      <Text variant="bodyMedium" color={colors.warning}>
        A card payment{amount} is still going through. It normally finishes within a few seconds.
      </Text>
      <Text variant="bodySmall" tone="muted">
        Taking another payment now could charge {guestName} twice. If it is still here in a few
        minutes, check the payment in your Stripe dashboard before collecting again.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card capture — only mounted when the Terminal SDK is available (§7.6/§7.7)
// ---------------------------------------------------------------------------

type CardStage = 'idle' | 'preparing' | 'collecting' | 'success' | 'error';

function CardCollectSection({
  bookingId,
  amountPence,
  readerType,
  onReaderTypeChange,
  autoCollect,
  onAutoCollectHandled,
  onPair,
  onDone,
  onBack,
}: {
  bookingId: string;
  amountPence: number | undefined;
  readerType: InPersonReaderType;
  onReaderTypeChange: (t: InPersonReaderType) => void;
  /** Start collecting on this channel as soon as the section mounts. */
  autoCollect: InPersonReaderType | null;
  onAutoCollectHandled: () => void;
  onPair: () => void;
  onDone: (collectedPence: number | null) => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const tapToPay = useTapToPayReader();
  const bluetooth = useBluetoothReader();
  const takePayment = useTakePayment(bookingId);
  const cancelCollection = useCancelCardCollection();

  const [stage, setStage] = useState<CardStage>('idle');
  const [message, setMessage] = useState<string | null>(null);
  /** The channel of the last failed attempt, so Retry repeats the same one. */
  const [lastTried, setLastTried] = useState<InPersonReaderType | null>(null);
  /** Ref (not state) so the unmount cleanup below reads the CURRENT value. */
  const collectingRef = useRef(false);
  /**
   * Same-frame re-entry guard. `busy` is derived from state, so two taps landing
   * in one frame both see `busy === false` and both fire: two attempt ids, two
   * PaymentIntents, and an orphan pending row left behind when the second one
   * loses the race with "the SDK is busy".
   */
  const startingRef = useRef(false);
  /**
   * Which attempt is current. Cancel bumps it, and an attempt whose generation is
   * stale must neither touch state nor — the part that matters — go on to create
   * a PaymentIntent for a payment staff have already walked away from.
   */
  const attemptRef = useRef(0);

  // Dismissing mid-collection must leave nothing waiting on a card tap (§3.2).
  // Unmount is the reliable hook for that: this section is torn down whether
  // staff press Close, press Back, or the sheet itself closes.
  useEffect(
    () => () => {
      if (collectingRef.current) void cancelCollection();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup must run only on unmount
    [],
  );

  // Device capability drives which options exist (§7A.3), and the remembered
  // method means staff are not re-asked on every appointment (§7A.6).
  useEffect(() => {
    void tapToPay.checkSupport();
    void loadLastMethod().then((remembered) => {
      if (remembered) onReaderTypeChange(remembered);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const supportsTapToPay = tapToPay.supported !== false;
  const readerConnected = bluetooth.connected != null;

  // Continue straight into collection after a fresh pairing (fires once).
  useEffect(() => {
    if (!autoCollect) return;
    onAutoCollectHandled();
    void collect(autoCollect);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on arrival
  }, [autoCollect]);

  /**
   * Abandon the prepare in flight and come back to a state staff can act from.
   *
   * The bug this exists for: a prepare that never settled left `busy` true, and
   * `busy` disabled every button INCLUDING Back — so a scan that found nothing
   * trapped the staff member on "Getting the card reader ready" until the whole
   * sheet was closed. Cancelling has to reach the SDK too, because an abandoned
   * discovery is refused-as-busy on the next attempt.
   */
  function cancelPrepare() {
    attemptRef.current += 1;
    // Released here, not in the abandoned attempt's `finally`: the collect
    // buttons and Retry must be live again immediately. `collectingRef` is
    // deliberately left alone — it is the unmount cleanup's only signal that a
    // card collection needs cancelling, and Cancel cannot be reached from the
    // collecting stage anyway.
    startingRef.current = false;
    void tapToPay.abort();
    void bluetooth.abort();
    setStage('idle');
    setMessage(null);
  }

  async function collect(kind: InPersonReaderType) {
    if (startingRef.current) return;
    startingRef.current = true;
    const attempt = ++attemptRef.current;
    /** True once Cancel (or a newer attempt) has superseded this one. */
    const superseded = () => attemptRef.current !== attempt;
    try {
      setMessage(null);
      setStage('preparing');
      setLastTried(kind);
      onReaderTypeChange(kind);

      // Ensure a reader is ready for the chosen channel.
      /**
       * Each `await` below is followed by a `superseded()` check, and they are the
       * only awaits between "staff pressed collect" and the charge route — so a
       * cancelled attempt can neither write state nor create a PaymentIntent that
       * nobody is watching.
       */
      if (kind === 'tap_to_pay') {
        // The reason comes back from the call, not from hook state: reading
        // `tapToPay.error` here would see the pre-await render's value.
        const { ok, error: reason } = await tapToPay.connect();
        if (superseded()) return;
        if (!ok) {
          setStage('error');
          setMessage(reason ?? 'The card reader could not be started.');
          return;
        }
      } else if (!readerConnected) {
        // Try the reader this device already knows before making staff pick one
        // from a list (§7A.5): the common case is the same reader every day.
        const reconnected = await bluetooth.reconnectRemembered();
        if (superseded()) return;
        if (!reconnected) {
          onPair();
          setStage('idle');
          return;
        }
      }

      setStage('collecting');
      collectingRef.current = true;
      try {
        // ONE attempt id per user-initiated attempt (§6.3c): a double-fired
        // mutation reuses it and stays idempotent; a later retry mints a new one.
        const attemptId = newPaymentAttemptId();
        const res = await takePayment.mutateAsync({
          attemptId,
          ...(amountPence != null ? { amountPence } : {}),
          readerType: kind,
        });
        collectingRef.current = false;
        hapticSuccess();
        setStage('success');
        rememberLastMethod(kind);
        onDone(res.amountPence ?? null);
      } catch (e) {
        collectingRef.current = false;
        hapticWarning();
        setStage('error');
        setMessage(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : 'The payment was not completed.',
        );
      }
    } finally {
      // Released on every route out, including the connect-failed and
      // sent-to-pairing early returns, so Retry is never dead. A superseded
      // attempt leaves it alone: Cancel already released it, and a newer attempt
      // may be holding it.
      if (!superseded()) startingRef.current = false;
    }
  }

  // Reader work counts as busy too: a firmware install or an in-progress
  // connect must not leave the collect buttons tappable.
  const busy =
    stage === 'preparing' ||
    stage === 'collecting' ||
    bluetooth.status === 'connecting' ||
    bluetooth.status === 'updating';
  /**
   * While a reader is being got ready, the bottom button cancels the attempt
   * instead of navigating: that is the state staff were trapped in, and "Back"
   * would read as if it also abandoned the payment sheet.
   */
  const canCancelPrepare = stage === 'preparing';

  return (
    <>
      {bluetooth.status === 'updating' ? (
        <Text variant="bodySmall" tone="muted">
          Updating your reader. Keep it nearby and switched on. This can take a few minutes.
          {bluetooth.updateProgress != null
            ? ` ${Math.round(bluetooth.updateProgress * 100)}%`
            : ''}
        </Text>
      ) : null}

      {bluetooth.batteryLow ? (
        <Text variant="caption" color={colors.warning}>
          Reader battery low. Charge it soon.
        </Text>
      ) : null}

      {stage === 'collecting' ? (
        <Text variant="bodyMedium">
          {readerType === 'tap_to_pay'
            ? "Hold the client's card near the top of your phone."
            : 'Hold the card to the reader, or insert the chip.'}
        </Text>
      ) : null}

      {stage === 'preparing' ? (
        <Text variant="bodySmall" tone="muted">
          Getting the card reader ready.
        </Text>
      ) : null}

      {message ? (
        <Text variant="bodySmall" tone="danger">
          {message}
        </Text>
      ) : null}

      <View style={styles.buttons}>
        {supportsTapToPay ? (
          <Button
            label="Tap to Pay on this phone"
            disabled={busy}
            loading={busy && readerType === 'tap_to_pay'}
            onPress={() => void collect('tap_to_pay')}
            fullWidth
          />
        ) : null}
        <Button
          label={readerConnected ? 'Use card reader' : 'Connect a card reader'}
          variant="secondary"
          disabled={busy}
          loading={busy && readerType === 'bluetooth'}
          onPress={() => void collect('bluetooth')}
          fullWidth
        />
        {stage === 'error' && lastTried ? (
          <>
            <Button
              label="Retry"
              variant="secondary"
              disabled={busy}
              onPress={() => void collect(lastTried)}
              fullWidth
            />
            <Text variant="caption" tone="muted">
              If the card keeps failing, go back and record a cash or other payment instead.
            </Text>
          </>
        ) : null}
        {/* The escape hatch. NEVER disabled while a reader is being got ready:
            spinner + every button dead is exactly what stranded staff, with only
            "close the whole sheet" left. It locks during `collecting` alone,
            where the client's card is already being read — and even there,
            dismissing the sheet cancels the collection. */}
        <Button
          label={canCancelPrepare ? 'Cancel' : 'Back'}
          variant="ghost"
          disabled={stage === 'collecting'}
          onPress={() => {
            if (canCancelPrepare) {
              cancelPrepare();
              return;
            }
            tapToPay.reset();
            onBack();
          }}
          fullWidth
        />
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bluetooth pairing step (§7A.7 responsibilities, inline to avoid stacking)
// ---------------------------------------------------------------------------

function ReaderPairingSection({
  onPaired,
  onBack,
}: {
  onPaired: () => void;
  onBack: () => void;
}) {
  const reader = useBluetoothReader();
  /** Which reader was tapped, so that row alone shows the progress. */
  const [connectingSerial, setConnectingSerial] = useState<string | null>(null);

  useEffect(() => {
    void reader.scan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updating = reader.status === 'updating';
  /**
   * Scanning and connecting were one flag, so tapping a reader left the copy
   * reading "Looking for card readers nearby" and gave the tapped row no
   * feedback at all. Pairing takes several seconds, which read as a dead button.
   */
  const scanning = reader.status === 'scanning';
  const connecting = reader.status === 'connecting';
  // A mandatory firmware install blocks collection and can run for minutes, so
  // it locks the controls rather than letting staff tap into a dead end.
  const locked = scanning || connecting || updating;

  return (
    <>
      <Text variant="bodySmall" tone="muted">
        {updating
          ? 'Updating your reader. Keep it nearby and switched on. This can take a few minutes.'
          : connecting
            ? 'Connecting to your reader. This takes a few seconds.'
            : scanning
              ? 'Looking for card readers nearby. Keep the reader switched on.'
              : 'Choose your card reader.'}
      </Text>

      {updating && reader.updateProgress != null ? (
        <Text variant="bodySmall" tone="muted">
          {Math.round(reader.updateProgress * 100)}% complete
        </Text>
      ) : null}

      {reader.error && !updating ? (
        <Text variant="bodySmall" tone="danger">
          {reader.error}
        </Text>
      ) : null}

      <View style={styles.buttons}>
        {reader.discovered.map((r) => (
          <Button
            key={r.serialNumber}
            label={r.label?.trim() ? r.label : r.serialNumber}
            variant="secondary"
            disabled={locked}
            loading={connectingSerial === r.serialNumber}
            onPress={() => {
              setConnectingSerial(r.serialNumber);
              // `connect` resolves false rather than rejecting, so one `then`
              // covers both outcomes. Clear BEFORE handing over: success
              // unmounts this section.
              void reader.connect(r).then((ok) => {
                setConnectingSerial(null);
                if (ok) onPaired();
              });
            }}
            fullWidth
          />
        ))}
        <Button
          label="Scan again"
          variant="ghost"
          loading={scanning}
          disabled={locked}
          onPress={() => void reader.scan()}
          fullWidth
        />
        {/* Never disabled. Going back does not disconnect the reader, so it
            cannot interrupt (or brick) a firmware install — and a locked Back
            during a stalled install left staff with nothing to press at all. */}
        <Button label="Back" variant="ghost" onPress={onBack} fullWidth />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  successBlock: {
    gap: spacing.xs,
  },
  notice: {
    gap: spacing.xs,
  },
  buttons: {
    gap: spacing.sm,
  },
  refundRow: {
    gap: spacing.xs,
  },
});

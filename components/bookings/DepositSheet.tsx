import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ConfirmPanel } from '@/components/ui/ConfirmPanel';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ChargeNoShowPanel } from '@/components/bookings/ChargeNoShowPanel';
import { ApiError, isApiErrorBody } from '@/lib/api/client';
import {
  CARD_ADD_NOW_LABEL,
  CARD_CONFIRM_WITHOUT_LABEL,
  CARD_HOLD_CHARGE_DIALOG_TITLE,
  CARD_HOLD_CHARGE_FEES_LABEL,
  CARD_HOLD_REFUND_ACTION_LABEL,
  CARD_HOLD_RELEASE_ACTION_LABEL,
  CARD_SEND_REQUEST_LABEL,
  CONFIRM_WITHOUT_CARD_UNDO_MS,
  cardHoldChargeConfirmLabel,
  cardHoldChargeDialogBody,
  cardHoldReleaseDialogBody,
  confirmWithoutCardQuestion,
  formatCardHoldFeePence,
  type CardHoldUiState,
} from '@/lib/booking/card-hold';
import { hasSettleableDeposit } from '@/lib/booking/booking-staff-indicators';
import { confirmWithoutCardUndoneMessage } from '@/lib/booking/card-list';
import { keepWithoutDepositView, type serverKeepFrom } from '@/lib/booking/server-deposit-fields';
import { currencySymbol, formatPositivePence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import {
  useBookingDeposit,
  useKeepWithoutDeposit,
  type DepositAction,
} from '@/lib/queries/useBookingMutations';
import {
  useConfirmWithoutCard,
  useSendCardRequests,
  useUndoConfirmWithoutCard,
} from '@/lib/queries/useCardsOnFile';
import { spacing } from '@/theme/index';

export type DepositTarget = {
  id: string;
  guestName: string;
  amountPence?: number | null;
  status?: string | null;
  /**
   * Resolved card-hold state (§9.1). When set, the three legacy deposit actions
   * are replaced by the card-aware ones (resend link / waive / charge / refund /
   * release) — the §9.1 hiding rule.
   */
  cardHold?: CardHoldUiState | null;
  /** What was paid was the whole price: the sheet says "Payment", never "Deposit" (26 Nov 2026). */
  paidInFull?: boolean;
  /** The visit the no-show charge covers: `group_booking_id`, or the booking's own id. */
  visitId?: string | null;
  /** "Add card now" can open the desk screen (the booking has a client record of ours). */
  canAddCard?: boolean;
  /** The booking's status: "Keep without deposit" is for a booking waiting (Pending) for it. */
  bookingStatus?: string | null;
  /** Part of a visit across businesses: that visit's own pay link and rules apply, so no Keep. */
  linkedVisitId?: string | null;
  /** What the owed deposit waits for and until when (web deposit-handling plan DH2). */
  owedLine?: string | null;
  /** The server's "Keep without deposit" answer and words (P4.3); absent from an older server. */
  serverKeep?: ReturnType<typeof serverKeepFrom>;
};

type DepositSheetProps = {
  target: DepositTarget | null;
  onClose: () => void;
  /** "Add card now": the parent closes this sheet and opens the desk screen (no stacked sheets). */
  onAddCard?: () => void;
};

/** True for an older server's 404 with no API body: the route is not there yet. */
function isMissingRoute(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404 && !isApiErrorBody(e.body);
}

/** Pounds string for the amount input, e.g. 2500 -> "25.00". */
function penceToPoundsInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** Parse the amount input to pence; null when not a usable number. */
function parsePoundsInputToPence(value: string): number | null {
  const trimmed = value.trim().replace(/^[£€]/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const pounds = Number(trimmed);
  if (!Number.isFinite(pounds)) return null;
  return Math.round(pounds * 100);
}

/**
 * Bottom-sheet for deposit actions: send link, record cash, waive, refund.
 * For card-hold bookings it instead offers the card-aware actions (§9.2),
 * with the charge amount entry folded in as a mode step (no stacked sheets).
 */
export function DepositSheet({ target, onClose, onAddCard }: DepositSheetProps) {
  const mutation = useBookingDeposit(target?.id ?? '');
  const sendRequests = useSendCardRequests();
  const confirmWithout = useConfirmWithoutCard();
  const undoConfirm = useUndoConfirmWithoutCard();

  const [pending, setPending] = useState<DepositAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  // Two-step confirms — Alert.alert is a no-op on react-native-web.
  const [refundArmed, setRefundArmed] = useState(false);
  const [releaseArmed, setReleaseArmed] = useState(false);
  // Record cash takes money on one tap otherwise (web QA PAY-A-F8): confirm it with the amount.
  const [cashArmed, setCashArmed] = useState(false);
  // Charge no-show fee: in-sheet amount step (never a second stacked sheet).
  const [chargeMode, setChargeMode] = useState(false);
  // Charge no-show fees for the visit (card-on-file §6.8), drawn in this sheet.
  const [visitChargeMode, setVisitChargeMode] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  // Confirm without a card asks first (plan §6.4), then offers Undo for 5 minutes.
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [cardBusy, setCardBusy] = useState<'request' | 'confirm' | 'undo' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ actionIds: string[]; until: number } | null>(null);
  // "Keep without deposit" (DH4) asks first, inline: a second sheet over this one would not show on iOS.
  const keepWithout = useKeepWithoutDeposit();
  const [keepAsked, setKeepAsked] = useState(false);

  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
      setSeededId(null);
      return;
    }
    if (target.id === seededId) return;
    setSeededId(target.id);
    setPending(null);
    setError(null);
    setRefundArmed(false);
    setReleaseArmed(false);
    setCashArmed(false);
    setChargeMode(false);
    setVisitChargeMode(false);
    setConfirmArmed(false);
    setCardBusy(null);
    setNotice(null);
    setUndo(null);
    setKeepAsked(false);
    setAmountInput(target.cardHold?.feePence ? penceToPoundsInput(target.cardHold.feePence) : '');
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action: DepositAction, amountPence?: number) {
    setError(null);
    setPending(action);
    try {
      await mutation.mutateAsync({ action, ...(amountPence != null ? { amount_pence: amountPence } : {}) });
      hapticSuccess();
      setPending(null);
      onClose();
    } catch (e) {
      hapticWarning();
      setPending(null);
      setError(e instanceof ApiError ? e.message : 'Could not complete this deposit action.');
    }
  }

  function confirmRefund() {
    if (!refundArmed) {
      hapticWarning();
      setRefundArmed(true);
      return;
    }
    setRefundArmed(false);
    void run('refund');
  }

  function confirmCash() {
    if (!cashArmed) {
      hapticWarning();
      setCashArmed(true);
      return;
    }
    setCashArmed(false);
    void run('record_cash');
  }

  function confirmRelease() {
    if (!releaseArmed) {
      hapticWarning();
      setReleaseArmed(true);
      return;
    }
    setReleaseArmed(false);
    void run('release_hold');
  }

  // Undo is offered for 5 minutes, then the message stays without it until dismissed.
  useEffect(() => {
    if (!undo) return;
    const left = undo.until - Date.now();
    if (left <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the undo window has already closed
      setUndo(null);
      return;
    }
    const timer = setTimeout(() => setUndo(null), left);
    return () => clearTimeout(timer);
  }, [undo]);

  /** "Send card request" (plan §6.3): also turns Card not needed back to Waiting for card. */
  async function sendCardRequest() {
    if (!target) return;
    setError(null);
    setNotice(null);
    setCardBusy('request');
    try {
      const result = await sendRequests.mutateAsync({ bookingIds: [target.id] });
      hapticSuccess();
      setNotice(result.message);
    } catch (e) {
      if (isMissingRoute(e)) {
        // An older server: the deposit route's card request.
        setCardBusy(null);
        await run('send_payment_link');
        return;
      }
      hapticWarning();
      setError(e instanceof Error ? e.message : 'The card request could not be sent.');
    } finally {
      setCardBusy(null);
    }
  }

  /** "Confirm without a card" (plan §4.8, C10): asks first, then Undo for 5 minutes. */
  async function confirmWithoutCard() {
    if (!target) return;
    if (!confirmArmed) {
      hapticWarning();
      setConfirmArmed(true);
      return;
    }
    setConfirmArmed(false);
    setError(null);
    setNotice(null);
    setCardBusy('confirm');
    try {
      const result = await confirmWithout.mutateAsync({ bookingIds: [target.id] });
      hapticSuccess();
      setNotice(result.message);
      if (result.actionIds.length > 0) {
        const until = result.undoUntil ? Date.parse(result.undoUntil) : Number.NaN;
        setUndo({
          actionIds: result.actionIds,
          until: Number.isFinite(until) ? until : Date.now() + CONFIRM_WITHOUT_CARD_UNDO_MS,
        });
      }
    } catch (e) {
      if (isMissingRoute(e)) {
        // An older server: Waive is Confirm without a card there.
        setCardBusy(null);
        await run('waive');
        return;
      }
      hapticWarning();
      setError(e instanceof Error ? e.message : 'The booking could not be confirmed without a card.');
    } finally {
      setCardBusy(null);
    }
  }

  async function undoConfirmWithoutCard() {
    if (!undo) return;
    setError(null);
    setCardBusy('undo');
    try {
      // A card added meanwhile keeps the booking confirmed: say so rather than "waiting again".
      const out = await undoConfirm.mutateAsync(undo.actionIds);
      hapticSuccess();
      setUndo(null);
      setNotice(confirmWithoutCardUndoneMessage(out));
    } catch (e) {
      hapticWarning();
      setUndo(null);
      setError(e instanceof Error ? e.message : 'This can no longer be undone.');
    } finally {
      setCardBusy(null);
    }
  }

  /** Keep the booking without the deposit: the client is sent a confirmation saying it is still due. */
  async function keepWithoutDeposit() {
    if (!target) return;
    setError(null);
    try {
      await keepWithout.mutateAsync({ bookingId: target.id });
      hapticSuccess();
      setKeepAsked(false);
      onClose();
    } catch (e) {
      hapticWarning();
      setKeepAsked(false);
      setError(e instanceof ApiError ? e.message : 'Could not keep the booking. Please try again.');
    }
  }

  const amount = formatPositivePence(target?.amountPence);
  const hold = target?.cardHold ?? null;
  const word: 'deposit' | 'payment' = target?.paidInFull ? 'payment' : 'deposit';
  // "Keep without deposit": the server's answer and words when it sent them (web codebase standards
  // plan P4.3), else worked out here for an older server.
  const keepView = target
    ? keepWithoutDepositView({
        server: target.serverKeep,
        local: {
          status: target.bookingStatus,
          depositStatus: target.status,
          amountPence: target.amountPence,
          linkedVisitId: target.linkedVisitId,
          word,
          guestName: target.guestName,
        },
      })
    : null;
  const showKeep = Boolean(keepView?.show);
  const keepQuestion = keepView?.question ?? null;

  // §9.2 charge amount bounds: min 1 pence (the server's invalid_amount quotes
  // £0.01), max = the consented fee snapshot.
  const feePence = hold?.feePence ?? 0;
  const minPence = Math.min(1, feePence);
  const amountPence = parsePoundsInputToPence(amountInput);
  const amountValid = amountPence != null && amountPence >= minPence && amountPence <= feePence;

  const busy = pending !== null || cardBusy !== null;
  const showAddCard = !!hold && hold.showAddCardNow && !!target?.canAddCard && !!onAddCard;
  const holdHasActions =
    !!hold &&
    (hold.showSendCardRequest ||
      hold.showConfirmWithoutCard ||
      showAddCard ||
      hold.showChargeAction ||
      hold.showRefundAction ||
      hold.showReleaseAction);

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
          {hold && visitChargeMode ? (
            <ChargeNoShowPanel
              visitId={target.visitId || target.id}
              bookingId={target.id}
              onUnavailable={() => {
                // An older server without the visit charge: the single-booking charge.
                setVisitChargeMode(false);
                setAmountInput(penceToPoundsInput(feePence));
                setChargeMode(true);
              }}
              onBack={() => setVisitChargeMode(false)}
            />
          ) : hold && chargeMode ? (
            /* ── Charge no-show fee: amount entry step (§9.2 dialog) ── */
            <>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Card
                </Text>
                <Text variant="title">{CARD_HOLD_CHARGE_DIALOG_TITLE}</Text>
                <Text variant="bodySmall" tone="muted">
                  {cardHoldChargeDialogBody(target.guestName, feePence)}
                </Text>
              </View>

              <Input
                label={`Amount to charge (${currencySymbol()})`}
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="decimal-pad"
                inputMode="decimal"
                helper={`Between ${formatCardHoldFeePence(minPence)} and ${formatCardHoldFeePence(feePence)}.`}
                error={
                  !amountValid && amountInput.trim().length > 0
                    ? `Enter an amount between ${formatCardHoldFeePence(minPence)} and ${formatCardHoldFeePence(feePence)}.`
                    : undefined
                }
                editable={pending === null}
              />

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <View style={styles.buttons}>
                <Button
                  label={
                    amountValid && amountPence != null
                      ? cardHoldChargeConfirmLabel(amountPence)
                      : cardHoldChargeConfirmLabel(feePence)
                  }
                  variant="danger"
                  onPress={() => {
                    if (amountPence == null || !amountValid) return;
                    void run('charge_no_show_fee', amountPence);
                  }}
                  loading={pending === 'charge_no_show_fee'}
                  disabled={pending !== null || !amountValid}
                  fullWidth
                />
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => {
                    setChargeMode(false);
                    setError(null);
                  }}
                  disabled={pending !== null}
                  fullWidth
                />
              </View>
            </>
          ) : hold ? (
            /* ── Card section actions (card-on-file §6.3) ── */
            <>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Card
                </Text>
                <Text variant="title">
                  {hold.pill?.label ??
                    (hold.feePence ? formatCardHoldFeePence(hold.feePence) : 'Card')}
                </Text>
                <Text variant="bodySmall" tone="muted">
                  {target.guestName}
                </Text>
              </View>

              {hold.lines.length > 0 ? (
                <View style={styles.lines}>
                  {hold.lines.map((line) => (
                    <Text key={line} variant="bodySmall" tone="secondary">
                      {line}
                    </Text>
                  ))}
                </View>
              ) : null}

              {notice ? (
                <View style={styles.notice} accessibilityLiveRegion="polite" testID="card-notice">
                  <Text variant="bodySmall" tone="success" accessibilityRole="alert">
                    {notice}
                  </Text>
                  {undo ? (
                    <Button
                      label="Undo"
                      variant="secondary"
                      size="sm"
                      onPress={() => void undoConfirmWithoutCard()}
                      loading={cardBusy === 'undo'}
                      disabled={busy}
                    />
                  ) : null}
                </View>
              ) : null}

              {holdHasActions ? (
                <View style={styles.buttons}>
                  {hold.showSendCardRequest ? (
                    <Button
                      label={CARD_SEND_REQUEST_LABEL}
                      onPress={() => void sendCardRequest()}
                      loading={cardBusy === 'request' || pending === 'send_payment_link'}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                  {showAddCard ? (
                    <Button
                      label={CARD_ADD_NOW_LABEL}
                      variant="secondary"
                      onPress={() => onAddCard?.()}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                  {hold.showConfirmWithoutCard ? (
                    <Button
                      label={confirmArmed ? confirmWithoutCardQuestion(1).confirmLabel : CARD_CONFIRM_WITHOUT_LABEL}
                      variant="secondary"
                      onPress={() => void confirmWithoutCard()}
                      loading={cardBusy === 'confirm' || pending === 'waive'}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                  {hold.showChargeAction && feePence > 0 ? (
                    <Button
                      label={CARD_HOLD_CHARGE_FEES_LABEL}
                      variant="danger"
                      onPress={() => {
                        setError(null);
                        setNotice(null);
                        setVisitChargeMode(true);
                      }}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                  {hold.showRefundAction ? (
                    <Button
                      label={
                        refundArmed ? 'Tap to confirm refund' : CARD_HOLD_REFUND_ACTION_LABEL
                      }
                      variant="danger"
                      onPress={confirmRefund}
                      loading={pending === 'refund'}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                  {hold.showReleaseAction ? (
                    <Button
                      label={
                        releaseArmed ? 'Tap to confirm release' : CARD_HOLD_RELEASE_ACTION_LABEL
                      }
                      variant="secondary"
                      onPress={confirmRelease}
                      loading={pending === 'release_hold'}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                </View>
              ) : null}

              {confirmArmed ? (
                <Text variant="caption" tone="muted">
                  {confirmWithoutCardQuestion(1).body}
                </Text>
              ) : null}
              {releaseArmed ? (
                <Text variant="caption" tone="muted">
                  {cardHoldReleaseDialogBody(target.guestName)}
                </Text>
              ) : null}
              {refundArmed ? (
                <Text variant="caption" tone="muted">
                  This refunds the charged no-show fee to {target.guestName}&apos;s card. The fee
                  cannot be charged again for this booking.
                </Text>
              ) : null}

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <Button label="Close" variant="secondary" onPress={onClose} fullWidth />
            </>
          ) : (
            /* ── Legacy deposit actions ── */
            <>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  {target.paidInFull ? 'Payment' : 'Deposit'}
                </Text>
                <Text variant="title">
                  {amount ?? 'No deposit set'}
                  {target.status ? ` · ${target.status}` : ''}
                </Text>
                <Text variant="bodySmall" tone="muted">
                  {target.guestName}
                </Text>
                {target.owedLine ? (
                  <Text variant="bodySmall" tone="secondary" testID="deposit-sheet-owed-line">
                    {target.owedLine}
                  </Text>
                ) : null}
              </View>

              {keepAsked && keepQuestion ? (
                <ConfirmPanel
                  title={keepQuestion.title}
                  message={keepQuestion.message}
                  confirmLabel={keepQuestion.confirmLabel}
                  loading={keepWithout.isPending}
                  onConfirm={() => void keepWithoutDeposit()}
                  onCancel={() => setKeepAsked(false)}
                />
              ) : null}

              <View style={styles.buttons}>
                {/*
                  Offered only while a deposit is actually outstanding. This used to read
                  "not Paid and not Refunded", which left all three on every booking whose
                  deposit was 'Not Required' — and since web `491832ca` the server refuses
                  `waive` and `record_cash` there with a 409, so they were three buttons
                  that could only produce an error. Matches the route's own guard.
                */}
                {hasSettleableDeposit(target.status) ? (
                  <>
                    <Button
                      label="Send payment link"
                      onPress={() => void run('send_payment_link')}
                      loading={pending === 'send_payment_link'}
                      disabled={pending !== null}
                      fullWidth
                    />
                    <Button
                      label={
                        cashArmed
                          ? amount
                            ? `Tap to confirm ${amount} cash`
                            : 'Tap to confirm cash payment'
                          : 'Record cash payment'
                      }
                      variant="secondary"
                      onPress={confirmCash}
                      loading={pending === 'record_cash'}
                      disabled={pending !== null}
                      fullWidth
                    />
                    {showKeep ? (
                      <Button
                        label={keepView?.label ?? ''}
                        variant="secondary"
                        onPress={() => {
                          hapticWarning();
                          setError(null);
                          setKeepAsked(true);
                        }}
                        loading={keepWithout.isPending}
                        disabled={pending !== null || keepWithout.isPending || keepAsked}
                        fullWidth
                      />
                    ) : null}
                    <Button
                      label={word === 'payment' ? 'Waive payment' : 'Waive deposit'}
                      variant="ghost"
                      onPress={() => void run('waive')}
                      loading={pending === 'waive'}
                      disabled={pending !== null}
                      fullWidth
                    />
                  </>
                ) : null}
                {target.status === 'Paid' ? (
                  <Button
                    label={refundArmed ? 'Tap to confirm refund' : 'Refund'}
                    variant="danger"
                    onPress={confirmRefund}
                    loading={pending === 'refund'}
                    disabled={pending !== null}
                    fullWidth
                  />
                ) : null}
              </View>

              {cashArmed ? (
                <Text variant="caption" tone="muted">
                  {`This records ${amount || 'the deposit'} as paid in cash by ${target.guestName}. If the booking was waiting for it, the booking is confirmed and they get their confirmation.`}
                </Text>
              ) : null}

              {error ? (
                <Text variant="bodySmall" tone="danger">
                  {error}
                </Text>
              ) : null}

              <Button label="Close" variant="secondary" onPress={onClose} fullWidth />
            </>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  lines: {
    gap: spacing.xs,
  },
  notice: {
    gap: spacing.sm,
  },
  buttons: {
    gap: spacing.sm,
  },
});

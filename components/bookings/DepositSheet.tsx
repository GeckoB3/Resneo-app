import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import {
  CARD_HOLD_CHARGE_ACTION_LABEL,
  CARD_HOLD_CHARGE_DIALOG_TITLE,
  CARD_HOLD_REFUND_ACTION_LABEL,
  CARD_HOLD_RELEASE_ACTION_LABEL,
  CARD_HOLD_RESEND_LINK_LABEL,
  CARD_HOLD_WAIVE_LABEL,
  cardHoldChargeConfirmLabel,
  cardHoldChargeDialogBody,
  cardHoldReleaseDialogBody,
  formatCardHoldFeePence,
  type CardHoldUiState,
} from '@/lib/booking/card-hold';
import { formatPositivePence } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useBookingDeposit, type DepositAction } from '@/lib/queries/useBookingMutations';
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
};

type DepositSheetProps = {
  target: DepositTarget | null;
  onClose: () => void;
};

/** Pounds string for the amount input, e.g. 2500 -> "25.00". */
function penceToPoundsInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** Parse the amount input to pence; null when not a usable number. */
function parsePoundsInputToPence(value: string): number | null {
  const trimmed = value.trim().replace(/^£/, '');
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
export function DepositSheet({ target, onClose }: DepositSheetProps) {
  const mutation = useBookingDeposit(target?.id ?? '');

  const [pending, setPending] = useState<DepositAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  // Two-step confirms — Alert.alert is a no-op on react-native-web.
  const [refundArmed, setRefundArmed] = useState(false);
  const [releaseArmed, setReleaseArmed] = useState(false);
  // Charge no-show fee: in-sheet amount step (never a second stacked sheet).
  const [chargeMode, setChargeMode] = useState(false);
  const [amountInput, setAmountInput] = useState('');

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
    setChargeMode(false);
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

  function confirmRelease() {
    if (!releaseArmed) {
      hapticWarning();
      setReleaseArmed(true);
      return;
    }
    setReleaseArmed(false);
    void run('release_hold');
  }

  const amount = formatPositivePence(target?.amountPence);
  const hold = target?.cardHold ?? null;

  // §9.2 charge amount bounds: min 1 pence (the server's invalid_amount quotes
  // £0.01), max = the consented fee snapshot.
  const feePence = hold?.feePence ?? 0;
  const minPence = Math.min(1, feePence);
  const amountPence = parsePoundsInputToPence(amountInput);
  const amountValid = amountPence != null && amountPence >= minPence && amountPence <= feePence;

  const holdHasActions =
    !!hold &&
    (hold.showResendLink ||
      hold.showWaive ||
      hold.showChargeAction ||
      hold.showRefundAction ||
      hold.showReleaseAction);

  return (
    <Sheet visible={!!target} onClose={onClose}>
      {target && seededId === target.id ? (
        <View style={styles.body}>
          {hold && chargeMode ? (
            /* ── Charge no-show fee: amount entry step (§9.2 dialog) ── */
            <>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Card hold
                </Text>
                <Text variant="title">{CARD_HOLD_CHARGE_DIALOG_TITLE}</Text>
                <Text variant="bodySmall" tone="muted">
                  {cardHoldChargeDialogBody(target.guestName, feePence)}
                </Text>
              </View>

              <Input
                label="Amount to charge (£)"
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
            /* ── Card-hold state + card-aware actions (§9.1/§9.2) ── */
            <>
              <View style={styles.headerBlock}>
                <Text variant="overline" tone="muted">
                  Card hold
                </Text>
                <Text variant="title">
                  {hold.pill?.label ??
                    (hold.feePence ? formatCardHoldFeePence(hold.feePence) : 'Card hold')}
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

              {holdHasActions ? (
                <View style={styles.buttons}>
                  {hold.showResendLink ? (
                    <Button
                      label={CARD_HOLD_RESEND_LINK_LABEL}
                      onPress={() => void run('send_payment_link')}
                      loading={pending === 'send_payment_link'}
                      disabled={pending !== null}
                      fullWidth
                    />
                  ) : null}
                  {hold.showWaive ? (
                    <Button
                      label={CARD_HOLD_WAIVE_LABEL}
                      variant="secondary"
                      onPress={() => void run('waive')}
                      loading={pending === 'waive'}
                      disabled={pending !== null}
                      fullWidth
                    />
                  ) : null}
                  {hold.showChargeAction && feePence > 0 ? (
                    <Button
                      label={CARD_HOLD_CHARGE_ACTION_LABEL}
                      variant="danger"
                      onPress={() => {
                        setError(null);
                        setAmountInput(penceToPoundsInput(feePence));
                        setChargeMode(true);
                      }}
                      disabled={pending !== null}
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
                      disabled={pending !== null}
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
                      disabled={pending !== null}
                      fullWidth
                    />
                  ) : null}
                </View>
              ) : null}

              {releaseArmed ? (
                <Text variant="caption" tone="muted">
                  {cardHoldReleaseDialogBody(target.guestName)}
                </Text>
              ) : null}
              {refundArmed ? (
                <Text variant="caption" tone="muted">
                  This refunds the charged no-show fee to {target.guestName}&apos;s card. The card
                  hold ends and the fee cannot be charged again.
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
                  Deposit
                </Text>
                <Text variant="title">
                  {amount ?? 'No deposit set'}
                  {target.status ? ` · ${target.status}` : ''}
                </Text>
                <Text variant="bodySmall" tone="muted">
                  {target.guestName}
                </Text>
              </View>

              <View style={styles.buttons}>
                {target.status !== 'Paid' && target.status !== 'Refunded' ? (
                  <>
                    <Button
                      label="Send payment link"
                      onPress={() => void run('send_payment_link')}
                      loading={pending === 'send_payment_link'}
                      disabled={pending !== null}
                      fullWidth
                    />
                    <Button
                      label="Record cash payment"
                      variant="secondary"
                      onPress={() => void run('record_cash')}
                      loading={pending === 'record_cash'}
                      disabled={pending !== null}
                      fullWidth
                    />
                    <Button
                      label="Waive deposit"
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
  buttons: {
    gap: spacing.sm,
  },
});

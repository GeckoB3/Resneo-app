import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { formatPence, formatPositivePence, parsePoundsToPence, penceToPoundsInput } from '@/lib/format';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { paymentMethodLabel, refundablePayments } from '@/lib/payments/payment-display';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { useTapToPayReader } from '@/lib/payments/terminal';
import {
  cancelCardCollection,
  useRecordExternalPayment,
  useRefundPayment,
  useTakePayment,
  type InPersonReaderType,
} from '@/lib/queries/useTakePayment';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import type { BookingPaymentRow } from '@/types/booking-detail';

/**
 * Take payment sheet (Tap to Pay design doc §7.8 + §7A.6).
 *
 * Opening this sheet is NON-COMMITTAL: staff can dismiss at any state with no
 * side effects. Nothing is charged until a card is confirmed or cash is
 * explicitly recorded (§3.2).
 *
 * The reader-pairing step is folded in as a MODE of this sheet rather than a
 * second stacked Sheet: presenting a modal from inside a visible modal is
 * unreliable on iOS (see the app's stacked-modal note), which would strand
 * staff mid-payment.
 */

export type TakePaymentTarget = {
  id: string;
  guestName: string;
  /** Outstanding balance; null = price unknown, staff must enter an amount (§5.7). */
  balanceDuePence: number | null;
  /** Admin-only actions (refunds) follow the same rule as every money action. */
  isAdmin: boolean;
  /** Ledger rows from the booking GET; drives the refund list. */
  payments: BookingPaymentRow[];
  /** Venue has a connected Stripe account, so card options can work (§6.6). */
  cardPresentReady: boolean;
};

type SheetMode = 'menu' | 'card' | 'pair' | 'cash' | 'refund';

type TakePaymentSheetProps = {
  target: TakePaymentTarget | null;
  onClose: () => void;
};

export function TakePaymentSheet({ target, onClose }: TakePaymentSheetProps) {
  /**
   * Dismissing must leave NO side effects (§3.2). If a card collection is in
   * flight the SDK is told to stop, so an abandoned PaymentIntent is never left
   * waiting on a tap.
   */
  const handleClose = () => {
    void cancelCardCollection();
    onClose();
  };

  const [mode, setMode] = useState<SheetMode>('menu');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seededId, setSeededId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refundArmedId, setRefundArmedId] = useState<string | null>(null);
  const [readerType, setReaderType] = useState<InPersonReaderType>('tap_to_pay');

  const recordExternal = useRecordExternalPayment(target?.id ?? '');
  const refund = useRefundPayment(target?.id ?? '');

  // Reset every time a different booking opens the sheet.
  useEffect(() => {
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed local form state when target changes
      setSeededId(null);
      return;
    }
    if (target.id === seededId) return;
    setSeededId(target.id);
    setMode('menu');
    setAmountInput(
      target.balanceDuePence != null ? penceToPoundsInput(target.balanceDuePence) : '',
    );
    setNote('');
    setError(null);
    setSuccessMessage(null);
    setRefundArmedId(null);
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the Sheet mounted (hidden) so dismissal animates like the other sheets.
  if (!target) {
    return (
      <Sheet visible={false} onClose={handleClose}>
        <View />
      </Sheet>
    );
  }

  const balanceKnown = target.balanceDuePence != null;
  const enteredPence = parsePoundsToPence(amountInput);
  // Known balance: the server clamps to it, so a blank field just means "all of it".
  // Unknown balance: an amount is REQUIRED before anything can be collected.
  const amountValid = balanceKnown
    ? amountInput.trim() === '' || (enteredPence != null && enteredPence > 0)
    : enteredPence != null && enteredPence > 0;
  const amountPence =
    enteredPence != null && enteredPence > 0 ? enteredPence : undefined;

  const cardAvailable = target.cardPresentReady && isTerminalSdkAvailable();
  const refundable = refundablePayments(target.payments);

  const busy = recordExternal.isPending || refund.isPending;

  function fail(e: unknown, fallback: string) {
    hapticWarning();
    setError(e instanceof ApiError ? e.message : fallback);
  }

  async function recordCash(method: 'cash' | 'external') {
    setError(null);
    try {
      await recordExternal.mutateAsync({
        method,
        ...(amountPence != null ? { amountPence } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      hapticSuccess();
      setSuccessMessage(
        amountPence != null
          ? `${formatPence(amountPence)} recorded.`
          : 'Payment recorded.',
      );
      setMode('menu');
    } catch (e) {
      fail(e, 'The payment could not be recorded.');
    }
  }

  async function runRefund(paymentId: string) {
    setError(null);
    try {
      await refund.mutateAsync({ paymentId });
      hapticSuccess();
      setSuccessMessage('Refund issued.');
      setRefundArmedId(null);
      setMode('menu');
    } catch (e) {
      fail(e, 'The refund could not be completed.');
    }
  }

  return (
    <Sheet visible onClose={handleClose}>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text variant="overline" tone="muted">
            Take payment
          </Text>
          <Text variant="title">
            {balanceKnown
              ? `${formatPositivePence(target.balanceDuePence) ?? '—'} due`
              : 'Enter the amount'}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {target.guestName}
          </Text>
        </View>

        {successMessage ? (
          <Text variant="bodySmall" tone="success">
            {successMessage}
          </Text>
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
              error={
                !amountValid && amountInput.trim().length > 0
                  ? 'Enter a valid amount.'
                  : undefined
              }
            />

            <View style={styles.buttons}>
              {cardAvailable ? (
                <Button
                  label="Card payment"
                  disabled={!amountValid || busy}
                  onPress={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('card');
                  }}
                  fullWidth
                />
              ) : null}
              <Button
                label="Record cash"
                variant="secondary"
                disabled={!amountValid || busy}
                loading={recordExternal.isPending}
                onPress={() => void recordCash('cash')}
                fullWidth
              />
              <Button
                label="Record other payment"
                variant="secondary"
                disabled={!amountValid || busy}
                onPress={() => {
                  setError(null);
                  setMode('cash');
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
            onPair={() => setMode('pair')}
            onDone={(collected) => {
              setSuccessMessage(
                collected != null ? `${formatPence(collected)} collected.` : 'Payment collected.',
              );
              setMode('menu');
            }}
            onBack={() => setMode('menu')}
          />
        ) : null}

        {/* ── Bluetooth reader pairing (folded in, not a stacked sheet) ─ */}
        {mode === 'pair' && cardAvailable ? (
          <ReaderPairingSection
            onPaired={() => {
              setReaderType('bluetooth');
              setMode('card');
            }}
            onBack={() => setMode('card')}
          />
        ) : null}

        {/* ── Record other payment (note) ─────────────────────────────── */}
        {mode === 'cash' ? (
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
                label="Record payment"
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
              {refundable.map((p) => (
                <Button
                  key={p.id}
                  label={
                    refundArmedId === p.id
                      ? 'Tap to confirm refund'
                      : `Refund ${formatPence(p.amount_pence)} · ${paymentMethodLabel(p.method)}`
                  }
                  variant="danger"
                  disabled={busy}
                  loading={refund.isPending && refundArmedId === p.id}
                  onPress={() => {
                    if (refundArmedId !== p.id) {
                      hapticWarning();
                      setRefundArmedId(p.id);
                      return;
                    }
                    void runRefund(p.id);
                  }}
                  fullWidth
                />
              ))}
              <Button
                label="Back"
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  setRefundArmedId(null);
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
// Card capture — only mounted when the Terminal SDK is available (§7.6/§7.7)
// ---------------------------------------------------------------------------

type CardStage = 'idle' | 'preparing' | 'collecting' | 'success' | 'error';

function CardCollectSection({
  bookingId,
  amountPence,
  readerType,
  onReaderTypeChange,
  onPair,
  onDone,
  onBack,
}: {
  bookingId: string;
  amountPence: number | undefined;
  readerType: InPersonReaderType;
  onReaderTypeChange: (t: InPersonReaderType) => void;
  onPair: () => void;
  onDone: (collectedPence: number | null) => void;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const tapToPay = useTapToPayReader();
  const bluetooth = useBluetoothReader();
  const takePayment = useTakePayment(bookingId);

  const [stage, setStage] = useState<CardStage>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Device capability drives which options exist (§7A.3).
  useEffect(() => {
    void tapToPay.checkSupport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const supportsTapToPay = tapToPay.supported !== false;
  const readerConnected = bluetooth.connected != null;

  async function collect(kind: InPersonReaderType) {
    setMessage(null);
    setStage('preparing');
    onReaderTypeChange(kind);

    // Ensure a reader is ready for the chosen channel.
    if (kind === 'tap_to_pay') {
      const ok = await tapToPay.connect();
      if (!ok) {
        setStage('error');
        setMessage(tapToPay.error ?? 'The card reader could not be started.');
        return;
      }
    } else if (!readerConnected) {
      onPair();
      setStage('idle');
      return;
    }

    setStage('collecting');
    try {
      // ONE attempt id per user-initiated attempt (§6.3c): a double-fired
      // mutation reuses it and stays idempotent; a later retry mints a new one.
      const attemptId = newPaymentAttemptId();
      const res = await takePayment.mutateAsync({
        attemptId,
        ...(amountPence != null ? { amountPence } : {}),
        readerType: kind,
      });
      hapticSuccess();
      setStage('success');
      onDone(res.amountPence ?? null);
    } catch (e) {
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
  }

  const busy = stage === 'preparing' || stage === 'collecting';

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
        {stage === 'error' ? (
          <Text variant="caption" tone="muted">
            You can try again, or take the payment another way from the previous screen.
          </Text>
        ) : null}
        <Button
          label="Back"
          variant="ghost"
          disabled={busy}
          onPress={() => {
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

  useEffect(() => {
    void reader.scan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scanning = reader.status === 'scanning' || reader.status === 'connecting';

  return (
    <>
      <Text variant="bodySmall" tone="muted">
        {scanning
          ? 'Looking for card readers nearby. Keep the reader switched on.'
          : 'Choose your card reader.'}
      </Text>

      {reader.error ? (
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
            disabled={scanning}
            onPress={() => {
              void reader.connect(r).then((ok) => {
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
          disabled={scanning}
          onPress={() => void reader.scan()}
          fullWidth
        />
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
  buttons: {
    gap: spacing.sm,
  },
});

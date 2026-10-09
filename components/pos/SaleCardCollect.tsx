import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { ReaderPairingSection } from '@/components/bookings/TakePaymentSheet';
import { TapToPayEducationContent } from '@/components/payments/TapToPayEducation';
import { TapToPayProgress } from '@/components/payments/TapToPayProgress';
import { ErrorLine, money, posStyles, usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { TAP_TO_PAY_ON_IPHONE, TAP_TO_PAY_SYMBOL, tapToPayButtonLabel } from '@/lib/payments/tap-to-pay-copy';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import { useTapToPayReader } from '@/lib/payments/terminal';
import { SaleCardError, useSaleCardPayment, type SaleCardResult } from '@/lib/payments/useSaleCardPayment';
import { posErrorMessage } from '@/lib/pos/api';
import { SaleStaleError } from '@/lib/queries/usePos';
import { useTapToPay } from '@/providers/TapToPayProvider';
import { useTheme } from '@/theme/useTheme';

/**
 * Taking a sale's card in the app (POS plan §4.4.3, UX spec §13.3, §13.4): Tap to Pay on this
 * phone (Android, and iPhone XS or later on iOS 1.2.0) or the Bluetooth WisePad 3, on the venue's
 * existing Terminal Location, through `useSaleCardPayment`.
 *
 * The reader steps (connecting Tap to Pay, Apple's terms for admins only, reconnecting or pairing
 * the Bluetooth reader) follow the booking sheet's `CardCollectSection`, which is left untouched
 * for venues without POS; the two share only the Terminal driver and the reader hooks.
 *
 * MUST only be mounted when the Terminal SDK is available (`cardAppAvailable`), because it calls
 * the SDK's `useStripeTerminal` hook.
 */

type Stage = 'idle' | 'preparing' | 'starting' | 'collecting' | 'processing' | 'error';
type Kind = 'tap_to_pay' | 'bluetooth';

export function SaleCardCollect({
  saleId,
  version,
  amountPence,
  tipPence,
  isAdmin,
  balanceAfterStalePence,
  onDone,
  onBack,
}: {
  saleId: string;
  version: number;
  amountPence: number;
  tipPence: number;
  isAdmin: boolean;
  /** The balance to name if the sale changed before the payment started (`stale.payment`). */
  balanceAfterStalePence: number;
  onDone: (result: SaleCardResult) => void;
  onBack: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const tapToPay = useTapToPayReader();
  const tapToPayStatus = useTapToPay();
  const bluetooth = useBluetoothReader();
  const pay = useSaleCardPayment(saleId);
  const terminal = getTerminalSdk()!.useStripeTerminal();

  const [stage, setStage] = useState<Stage>('idle');
  const [kind, setKind] = useState<Kind>('tap_to_pay');
  const [message, setMessage] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [justTurnedOn, setJustTurnedOn] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const stageRef = useRef<Stage>('idle');
  const stopRef = useRef(false);
  const startingRef = useRef(false);

  const setStageBoth = (s: Stage) => {
    stageRef.current = s;
    setStage(s);
  };

  useEffect(() => {
    if (buildSupportsTapToPay()) void tapToPay.checkSupport();
    return () => {
      // Leaving mid-collection must leave nothing waiting on a card; the collector then releases
      // the sale on the server.
      if (stageRef.current === 'collecting') void Promise.resolve(terminal.cancelCollectPaymentMethod()).catch(() => undefined);
      if (stageRef.current === 'starting') stopRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount and unmount only
  }, []);

  const supportsTapToPay = buildSupportsTapToPay() && tapToPay.supported !== false;
  const total = amountPence + tipPence;

  async function collect(chosen: Kind) {
    if (startingRef.current) return;
    startingRef.current = true;
    stopRef.current = false;
    setKind(chosen);
    setMessage(null);
    setJustTurnedOn(false);
    setShowEducation(false);
    try {
      setStageBoth('preparing');
      if (chosen === 'tap_to_pay') {
        // Only an admin may accept Apple's terms (checklist 3.8); anyone else is told to ask one.
        const result = await tapToPay.connect(Platform.OS === 'ios' ? { tosAcceptancePermitted: isAdmin } : undefined);
        if (stopRef.current) return setStageBoth('idle');
        tapToPayStatus.recordConnect(result);
        if (!result.ok) {
          setStageBoth('error');
          setMessage(result.error ?? t('app.card.notCompleted'));
          return;
        }
        if (result.acceptedTerms) {
          const shown = await tapToPayStatus.showEducation();
          if (!shown) setShowEducation(true);
          setJustTurnedOn(true);
          setStageBoth('idle');
          return;
        }
      } else if (bluetooth.connected == null) {
        const reconnected = await bluetooth.reconnectRemembered();
        if (stopRef.current) return setStageBoth('idle');
        if (!reconnected) {
          setPairing(true);
          setStageBoth('idle');
          return;
        }
      }

      setStageBoth('starting');
      const result = await pay.mutateAsync({
        clientRequestId: newPaymentAttemptId(),
        version,
        amountPence,
        tipPence,
        shouldStop: () => stopRef.current,
        onStarted: () => setStageBoth('collecting'),
        onCardRead: () => setStageBoth('processing'),
      });
      hapticSuccess();
      setStageBoth('idle');
      onDone(result);
    } catch (e) {
      hapticWarning();
      if (e instanceof SaleCardError && e.kind === 'cancelled') {
        setStageBoth('idle');
        setMessage(t('app.card.cancelled'));
        return;
      }
      setStageBoth('error');
      if (e instanceof SaleStaleError) {
        setMessage(t('stale.payment', { balance: money(e.sale.balance_due_pence ?? balanceAfterStalePence) }));
      } else {
        setMessage(posErrorMessage(e, t('app.card.notCompleted')));
      }
    } finally {
      startingRef.current = false;
    }
  }

  function cancel() {
    if (stageRef.current === 'collecting') {
      void Promise.resolve(terminal.cancelCollectPaymentMethod()).catch(() => undefined);
      return;
    }
    if (stageRef.current === 'starting') {
      stopRef.current = true;
      return;
    }
    if (stageRef.current === 'preparing') {
      stopRef.current = true;
      void tapToPay.abort();
      void bluetooth.abort();
      startingRef.current = false;
      setStageBoth('idle');
    }
  }

  if (pairing) {
    return (
      <ReaderPairingSection
        onPaired={() => {
          setPairing(false);
          void collect('bluetooth');
        }}
        onBack={() => setPairing(false)}
      />
    );
  }

  const busy = stage === 'preparing' || stage === 'starting' || stage === 'collecting' || stage === 'processing';
  const canCancel = stage === 'preparing' || stage === 'starting' || stage === 'collecting';

  return (
    <View style={posStyles.stack}>
      <Text variant="title">{money(total)}</Text>
      {tipPence > 0 ? (
        <Text variant="bodySmall" tone="muted">
          {t('reader.success.tip', { tip: money(tipPence) })}
        </Text>
      ) : null}

      {bluetooth.status === 'updating' ? (
        <Text variant="bodySmall" tone="muted">
          Updating your reader. Keep it nearby and switched on. This can take a few minutes.
        </Text>
      ) : null}
      {stage === 'preparing' ? (
        Platform.OS === 'ios' && kind === 'tap_to_pay' ? (
          <TapToPayProgress progress={tapToPay.progress} />
        ) : (
          <Text variant="bodySmall" tone="muted">
            {t('app.card.preparing')}
          </Text>
        )
      ) : null}
      {stage === 'collecting' ? (
        <Text variant="bodyMedium">{kind === 'tap_to_pay' ? t('app.card.hold') : t('app.card.holdReader')}</Text>
      ) : null}
      {stage === 'starting' || stage === 'processing' ? (
        <View style={posStyles.row}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text variant="bodyMedium">{t('app.card.processing')}</Text>
        </View>
      ) : null}
      {justTurnedOn ? (
        <Text variant="bodyMedium" color={colors.success}>
          {`${TAP_TO_PAY_ON_IPHONE} is on. Tap it to take the payment.`}
        </Text>
      ) : null}
      {showEducation ? <TapToPayEducationContent /> : null}
      <ErrorLine message={stage === 'error' ? message : null} />
      {stage !== 'error' && message ? (
        <Text variant="bodySmall" tone="muted">
          {message}
        </Text>
      ) : null}

      <View style={posStyles.buttons}>
        {supportsTapToPay ? (
          <Button
            label={tapToPayButtonLabel()}
            leftIcon={
              Platform.OS === 'ios' ? <SymbolView name={TAP_TO_PAY_SYMBOL.ios} size={20} tintColor={colors.onColor} /> : undefined
            }
            disabled={busy}
            loading={busy && kind === 'tap_to_pay'}
            onPress={() => void collect('tap_to_pay')}
            fullWidth
          />
        ) : null}
        <Button
          label={bluetooth.connected ? t('app.card.useReader') : t('app.card.connectReader')}
          variant="secondary"
          disabled={busy}
          loading={busy && kind === 'bluetooth'}
          onPress={() => void collect('bluetooth')}
          fullWidth
        />
        {/* Never disabled: the way out of every stage. */}
        <Button
          label={canCancel ? t('app.card.cancel') : t('app.card.back')}
          variant="ghost"
          onPress={() => (canCancel ? cancel() : onBack())}
          fullWidth
        />
      </View>
    </View>
  );
}

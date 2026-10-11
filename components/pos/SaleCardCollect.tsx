import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ReaderPairingSection } from '@/components/bookings/TakePaymentSheet';
import { TapToPayEducationContent } from '@/components/payments/TapToPayEducation';
import { TapToPayProgress } from '@/components/payments/TapToPayProgress';
import { StaffStopPanel } from '@/components/pos/client-mode/ClientFrame';
import {
  ClientConsent,
  ClientEnding,
  ClientHandBack,
  ClientPaid,
  ClientProcessing,
  ClientReady,
  type ClientEndingKind,
} from '@/components/pos/client-mode/ClientScreens';
import { ClientTip } from '@/components/pos/client-mode/ClientTip';
import { useCustomerTipPrompt, type CustomerTipInput } from '@/components/pos/CustomerTip';
import { ErrorLine, money, posStyles, usePosT } from '@/components/pos/parts';
import { useCardConsentPrompt } from '@/components/pos/SaveCardConsent';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { newPaymentAttemptId } from '@/lib/payments/attempt-id';
import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { TAP_TO_PAY_ON_IPHONE, TAP_TO_PAY_SYMBOL, tapToPayButtonLabel } from '@/lib/payments/tap-to-pay-copy';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import { useTapToPayReader } from '@/lib/payments/terminal';
import {
  SaleCardError,
  useSaleCardPayment,
  type SaleCardInput,
  type SaleCardResult,
} from '@/lib/payments/useSaleCardPayment';
import { posErrorMessage } from '@/lib/pos/api';
import { cardSaveCopyId, followCardSave } from '@/lib/pos/card-consent';
import { isAccountLimitError, isPinRequired } from '@/lib/pos/card-methods';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { SaleStaleError } from '@/lib/queries/usePos';
import { useClientFacing } from '@/lib/ui/client-facing';
import { useVenueContext } from '@/providers/VenueProvider';
import { useToast } from '@/providers/ToastProvider';
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
 * App step 2 (plan §4.4.5): with cards on file on and a client on the sale (`consentClientName`),
 * the client is asked on this phone whether to save their card before it is read
 * (`useCardConsentPrompt`), and afterwards staff are told whether it was kept.
 *
 * Tips (owner, 2026-10-10): when the venue takes tips, the tip is the client's choice, on their
 * side of the phone (`CustomerTip.tsx`). Staff press Tap to Pay or the reader as before; once the
 * reader is ready, the app tells them to hand the phone over, the client chooses a tip and taps
 * their card straight away, and the app ends on "Thank you. Please hand the phone back." The tip is
 * asked once per payment: a retry after a decline keeps it.
 *
 * The reader steps and screens live in `CardCollectPanel`, which a sale sent from the web till to
 * this phone uses too (plan §4.36, `app/(app)/checkout/collect/[paymentId].tsx`): there the
 * payment comes from the claim, not from `card_app`, but Apple's rules, the warm-up, the processing
 * state and the "How to tap" education are the same screen.
 *
 * MUST only be mounted when the Terminal SDK is available (`cardAppAvailable`), because it calls
 * the SDK's `useStripeTerminal` hook.
 */

type Stage = 'idle' | 'preparing' | 'tip' | 'starting' | 'collecting' | 'processing' | 'handBack' | 'error';
export type CardCollectKind = 'tap_to_pay' | 'bluetooth';
type Kind = CardCollectKind;

/** Starts and collects one card payment with the reader `kind` and the tip, reporting progress through `hooks`. */
export type CardCollectPay = (
  kind: CardCollectKind,
  hooks: Pick<SaleCardInput, 'onStarted' | 'onCardRead' | 'shouldStop' | 'askConsent'>,
  tipPence: number,
) => Promise<SaleCardResult>;

export function SaleCardCollect({
  saleId,
  version,
  amountPence,
  customerTip = null,
  onCustomerFacing,
  isAdmin,
  balanceAfterStalePence,
  consentClientName = null,
  onDone,
  onBack,
}: {
  saleId: string;
  version: number;
  amountPence: number;
  /** When the venue takes tips: what the client's tip screen needs. */
  customerTip?: CustomerTipInput | null;
  /** The client has the phone (choosing a tip, tapping, or being thanked), or staff have it back. */
  onCustomerFacing?: (facing: boolean) => void;
  isAdmin: boolean;
  /** The balance to name if the sale changed before the payment started (`stale.payment`). */
  balanceAfterStalePence: number;
  /** The client's first name when they may be asked to save their card (cards on file on, a client on the sale). */
  consentClientName?: string | null;
  onDone: (result: SaleCardResult) => void;
  onBack: () => void;
}) {
  const t = usePosT();
  const payment = useSaleCardPayment(saleId);
  return (
    <CardCollectPanel
      saleId={saleId}
      amountPence={amountPence}
      customerTip={customerTip}
      onCustomerFacing={onCustomerFacing}
      isAdmin={isAdmin}
      consentClientName={consentClientName}
      pay={(kind, hooks, tipPence) =>
        payment.mutateAsync({
          clientRequestId: newPaymentAttemptId(),
          version,
          amountPence,
          tipPence,
          readerType: kind === 'tap_to_pay' ? 'tap_to_pay' : 'wisepad',
          ...hooks,
        })
      }
      describeError={(e) =>
        e instanceof SaleStaleError
          ? t('stale.payment', { balance: money(e.sale.balance_due_pence ?? balanceAfterStalePence) })
          : null
      }
      onDone={onDone}
      onBack={onBack}
    />
  );
}

/**
 * The reader steps and screens of a card payment on this phone, for whatever started the payment
 * (`pay`). `describeError` may put its own sentence on a failure; `extra` shows under it (a sale
 * sent to a phone offers a pay link there); `externalStop` stops a collection someone else ended
 * (the desk cancelled it). `tipPence` is a tip already fixed (a payment this phone claimed
 * earlier); `customerTip` asks the client for one once the reader is ready.
 */
export function CardCollectPanel({
  saleId,
  amountPence,
  tipPence = 0,
  customerTip = null,
  onCustomerFacing,
  isAdmin,
  consentClientName = null,
  pay,
  describeError,
  onFailure,
  extra,
  externalStop = false,
  processingLabel,
  clientEnding,
  hardwareBack = false,
  onDone,
  onBack,
}: {
  saleId: string;
  amountPence: number;
  tipPence?: number;
  customerTip?: CustomerTipInput | null;
  onCustomerFacing?: (facing: boolean) => void;
  isAdmin: boolean;
  consentClientName?: string | null;
  pay: CardCollectPay;
  describeError?: (error: unknown) => string | null;
  onFailure?: (error: unknown) => void;
  extra?: ReactNode;
  externalStop?: boolean;
  processingLabel?: string;
  /** How a failure reads to the client, when the caller knows better (the desk cancelled). */
  clientEnding?: (error: unknown) => ClientEndingKind | null;
  /** A full screen (not a sheet): take Android Back with `BackHandler` while the client holds the phone. */
  hardwareBack?: boolean;
  onDone: (result: SaleCardResult) => void;
  onBack: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const { venue } = useVenueContext();
  const logoUrl = venue?.logo_url ?? null;
  const tapToPay = useTapToPayReader();
  const tapToPayStatus = useTapToPay();
  const bluetooth = useBluetoothReader();
  const terminal = getTerminalSdk()!.useStripeTerminal();
  const accessToken = useAccessToken();
  const toast = useToast();
  const consent = useCardConsentPrompt(consentClientName ?? '');
  const tipPrompt = useCustomerTipPrompt(customerTip);

  const [stage, setStage] = useState<Stage>('idle');
  const [kind, setKind] = useState<Kind>('tap_to_pay');
  const [message, setMessage] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const [justTurnedOn, setJustTurnedOn] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const stageRef = useRef<Stage>('idle');
  const stopRef = useRef(false);
  const startingRef = useRef(false);
  // The tip, asked once per payment (a retry after a decline keeps it), and whether the client
  // holds the phone because they chose it.
  const [tip, setTip] = useState(tipPence);
  const tipRef = useRef(tipPence);
  const tipChosenRef = useRef(customerTip == null);
  const [handedOver, setHandedOver] = useState(false);
  const handedOverRef = useRef(false);
  const [paid, setPaid] = useState<SaleCardResult | null>(null);
  // Client mode (POS test round 2026-10-11, Part 3): from the tip until staff press Done the client
  // sees only client screens, failures included, and nothing they press can close the payment.
  const [ending, setEnding] = useState<ClientEndingKind | null>(null);
  const [handBackOnly, setHandBackOnly] = useState(false);
  const [changingTip, setChangingTip] = useState(false);
  const [stopAsk, setStopAsk] = useState(false);
  const staffStoppedRef = useRef(false);
  // The card-save toast waits until staff have the phone back.
  const pendingSave = useRef<SaleCardResult | null>(null);

  const markHandedOver = (value: boolean) => {
    handedOverRef.current = value;
    setHandedOver(value);
  };

  const facing = tipPrompt.facing || handedOver;
  useEffect(() => {
    onCustomerFacing?.(facing);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it changes
  }, [facing]);

  // Staff may stop from the client's screens until the card has been read.
  const stoppable =
    tipPrompt.stage === 'choose' ||
    changingTip ||
    (handedOver && !ending && !handBackOnly && stage !== 'handBack' && stage !== 'processing');
  const stoppableRef = useRef(false);
  stoppableRef.current = stoppable;
  const openStop = useCallback(() => {
    if (stoppableRef.current) setStopAsk(true);
  }, []);
  useClientFacing(facing, openStop, { hardwareBack });

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
  const total = amountPence + tip;

  async function collect(chosen: Kind) {
    if (startingRef.current) return;
    startingRef.current = true;
    stopRef.current = false;
    staffStoppedRef.current = false;
    setEnding(null);
    setHandBackOnly(false);
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
          // Stripe's limit of three businesses a day on one iPhone, in plain words (plan §4.22).
          setMessage(isAccountLimitError(result.error) ? t('app.collect.accountLimit') : result.error ?? t('app.card.notCompleted'));
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

      // The reader is ready: now the client chooses the tip, on their side of the phone.
      let tipNow = tipRef.current;
      if (customerTip && !tipChosenRef.current) {
        setStageBoth('tip');
        const chosenTip = await tipPrompt.ask();
        if (chosenTip == null || stopRef.current) return setStageBoth('idle');
        tipChosenRef.current = true;
        tipRef.current = chosenTip;
        setTip(chosenTip);
        markHandedOver(true);
        tipNow = chosenTip;
      }

      setStageBoth('starting');
      const result = await pay(
        chosen,
        {
          shouldStop: () => stopRef.current,
          onStarted: () => setStageBoth('collecting'),
          onCardRead: () => setStageBoth('processing'),
          ...(consentClientName
            ? { askConsent: (paymentId: string) => consent.ask(saleId, paymentId, { handedOver: handedOverRef.current }) }
            : {}),
        },
        tipNow,
      );
      hapticSuccess();
      if (handedOverRef.current) pendingSave.current = result;
      else announceCardSave(result);
      if (handedOverRef.current) {
        // The client tapped on this phone: thank them before staff carry on.
        setPaid(result);
        setStageBoth('handBack');
        return;
      }
      setStageBoth('idle');
      onDone(result);
    } catch (e) {
      hapticWarning();
      consent.reset();
      onFailure?.(e);
      if (handedOverRef.current) {
        if (staffStoppedRef.current) {
          // Staff stopped it from the client's screen: back to their card screen.
          staffStoppedRef.current = false;
          markHandedOver(false);
          setStageBoth('idle');
          setMessage(t('app.card.cancelled'));
          return;
        }
        // The client still holds the phone: tell them in their words. Staff read the detail after.
        setEnding(clientEnding?.(e) ?? clientEndingOf(e));
        const forStaff = describeError?.(e) ?? null;
        setStageBoth('error');
        setMessage(
          forStaff ??
            (e instanceof SaleCardError && e.kind === 'cancelled'
              ? t('app.card.cancelled')
              : posErrorMessage(e, t('app.card.notCompleted'))),
        );
        return;
      }
      const custom = describeError?.(e) ?? null;
      if (custom) {
        setStageBoth('error');
        setMessage(custom);
        return;
      }
      if (e instanceof SaleCardError && e.kind === 'cancelled') {
        setStageBoth('idle');
        setMessage(t('app.card.cancelled'));
        return;
      }
      setStageBoth('error');
      setMessage(posErrorMessage(e, t('app.card.notCompleted')));
    } finally {
      startingRef.current = false;
    }
  }

  /** Whether the card was kept, once the webhook has said (reader.saved, reader.notSaved, ...). */
  function announceCardSave(result: SaleCardResult) {
    const clientName = consentClientName ?? '';
    if (result.cardSave === 'declined') {
      toast.info(t('reader.notSaved', { clientName }));
      return;
    }
    if (result.cardSave !== 'agreed' || !accessToken) return;
    void followCardSave(accessToken, saleId, result.paymentId).then((status) => {
      const id = cardSaveCopyId(status);
      if (id === 'reader.saved') toast.success(t(id));
      else if (id) toast.info(t(id, { clientName }));
    });
  }

  // Someone else ended it (the desk cancelled a sale sent to this phone): stop waiting for a card.
  useEffect(() => {
    if (externalStop) cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the signal changes
  }, [externalStop]);

  function cancel() {
    if (stageRef.current === 'tip') {
      tipPrompt.reset();
      return;
    }
    if (consent.active) {
      stopRef.current = true;
      consent.reset();
      return;
    }
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

  /** "Stop payment" on staff's panel inside client mode. */
  function stopFromClient() {
    setStopAsk(false);
    if (tipPrompt.stage === 'choose') {
      tipPrompt.reset();
      markHandedOver(false);
      return;
    }
    if (changingTip) {
      setChangingTip(false);
      markHandedOver(false);
      setStageBoth('idle');
      setMessage(t('app.card.cancelled'));
      return;
    }
    if (stageRef.current === 'preparing') {
      cancel();
      markHandedOver(false);
      return;
    }
    staffStoppedRef.current = true;
    cancel();
  }

  /** Staff have the phone back: their card screen shows how it ended and every other way to pay. */
  function endClientMode() {
    setEnding(null);
    setHandBackOnly(false);
    setChangingTip(false);
    markHandedOver(false);
  }

  function finishPaid() {
    const result = paid;
    setPaid(null);
    markHandedOver(false);
    setStageBoth('idle');
    if (pendingSave.current) {
      announceCardSave(pendingSave.current);
      pendingSave.current = null;
    }
    if (result) onDone(result);
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

  if (facing) {
    const clientInput = customerTip ? { ...customerTip, logoUrl } : null;
    const base = {
      venueName: customerTip?.venueName ?? venue?.name ?? '',
      logoUrl,
      totalPence: total,
      tipPence: tip,
    };
    let screen: ReactNode;
    if (tipPrompt.stage === 'choose' && clientInput) {
      screen = <ClientTip input={clientInput} onChoose={(v) => tipPrompt.choose(v)} onStaffClose={openStop} />;
    } else if (changingTip && clientInput) {
      screen = (
        <ClientTip
          input={clientInput}
          initialTip={tip}
          onChoose={(v) => {
            tipRef.current = v;
            setTip(v);
            setChangingTip(false);
            void collect(kind);
          }}
          onStaffClose={openStop}
        />
      );
    } else if (stage === 'handBack' && paid) {
      screen = <ClientPaid {...base} card={paid.card} clientName={customerTip?.clientName ?? null} onDone={finishPaid} />;
    } else if (handBackOnly) {
      screen = <ClientHandBack venueName={base.venueName} logoUrl={logoUrl} onDone={endClientMode} />;
    } else if (ending) {
      screen = (
        <ClientEnding
          {...base}
          kind={ending}
          canChangeTip={clientInput != null}
          onTryAgain={() => {
            setEnding(null);
            void collect(kind);
          }}
          onChangeTip={() => {
            setEnding(null);
            setChangingTip(true);
          }}
          onOtherWay={() => {
            setEnding(null);
            setHandBackOnly(true);
          }}
          onDone={endClientMode}
        />
      );
    } else if (consent.question) {
      screen = (
        <ClientConsent
          {...base}
          text={consent.question.text}
          saving={consent.question.saving}
          onAnswer={consent.answer}
          onStaffClose={openStop}
        />
      );
    } else if (stage === 'processing') {
      screen = <ClientProcessing {...base} />;
    } else {
      screen = <ClientReady {...base} reader={kind} onStaffClose={openStop} />;
    }
    return (
      <View style={styles.client}>
        {/* Under staff's stop panel the client screen is hidden from screen readers, so the panel
            is the only thing they reach. */}
        <View
          style={styles.client}
          importantForAccessibility={stopAsk ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={stopAsk}>
          {screen}
        </View>
        {stopAsk ? (
          <StaffStopPanel
            title={t('app.client.stop.title')}
            body={t('app.client.stop.body')}
            keepLabel={t('app.client.stop.keep')}
            stopLabel={t('app.client.stop.confirm')}
            onKeep={() => setStopAsk(false)}
            onStop={stopFromClient}
          />
        ) : null}
      </View>
    );
  }

  if (tipPrompt.stage === 'handTo') return <>{tipPrompt.handToView}</>;

  if (consent.active) {
    return (
      <View style={posStyles.stack}>
        <Text variant="title">{money(total)}</Text>
        {consent.view}
        <Button label={t('app.card.cancel')} variant="ghost" onPress={cancel} fullWidth />
      </View>
    );
  }

  return (
    <View style={posStyles.stack}>
      <Text variant="title">{money(total)}</Text>
      {consent.note && (stage === 'collecting' || stage === 'processing') ? (
        <Text variant="bodySmall" tone="muted">
          {consent.note}
        </Text>
      ) : null}
      {tip > 0 ? (
        <Text variant="bodySmall" tone="muted">
          {t('reader.success.tip', { tip: money(tip) })}
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
        <Text variant="bodyMedium">
          {kind === 'tap_to_pay'
            ? t(handedOver ? 'app.card.hold.customer' : 'app.card.hold')
            : t(handedOver ? 'app.card.holdReader.customer' : 'app.card.holdReader')}
        </Text>
      ) : null}
      {stage === 'starting' || stage === 'processing' ? (
        <View style={posStyles.row}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text variant="bodyMedium">{processingLabel ?? t('app.card.processing')}</Text>
        </View>
      ) : null}
      {justTurnedOn ? (
        <Text variant="bodyMedium" color={colors.success}>
          {`${TAP_TO_PAY_ON_IPHONE} is on. Tap it to take the payment.`}
        </Text>
      ) : null}
      {showEducation ? <TapToPayEducationContent /> : null}
      <ErrorLine message={stage === 'error' ? message : null} />
      {stage === 'error' && extra ? extra : null}
      {stage !== 'error' && message ? (
        <Text variant="bodySmall" tone="muted">
          {message}
        </Text>
      ) : null}

      <View style={posStyles.buttons}>
        {/* While the client holds the phone to pay, only Cancel shows. */}
        {supportsTapToPay && !(handedOver && busy) ? (
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
        {!(handedOver && busy) ? (
          <Button
            label={bluetooth.connected ? t('app.card.useReader') : t('app.card.connectReader')}
            variant="secondary"
            disabled={busy}
            loading={busy && kind === 'bluetooth'}
            onPress={() => void collect('bluetooth')}
            fullWidth
          />
        ) : null}
        {/* Never disabled: the way out of every stage. */}
        <Button
          label={canCancel ? t('app.card.cancel') : t('app.card.back')}
          variant="ghost"
          onPress={() => {
            if (canCancel) return cancel();
            markHandedOver(false);
            onBack();
          }}
          fullWidth
        />
      </View>
    </View>
  );
}

/** How a failure reads to a client who still holds the phone (research §6.3, S8). */
function clientEndingOf(error: unknown): ClientEndingKind {
  if (error instanceof SaleCardError) {
    if (isPinRequired(error.codes.declineCode) || isPinRequired(error.codes.code)) return 'pin';
    switch (error.kind) {
      case 'cancelled':
        // Not staff (that path ends client mode): the client closed the card screen.
        return 'closed';
      case 'declined':
        return 'declined';
      case 'timed_out':
        return 'timeout';
      case 'unsure':
        return 'unsure';
      default:
        return 'notDone';
    }
  }
  // The sale changed, the network, or a sentence from the server: the team has to look.
  return 'team';
}

const styles = StyleSheet.create({
  client: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});

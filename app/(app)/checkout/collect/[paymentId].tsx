import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { TapToPayEducationSheet } from '@/components/payments/TapToPayEducation';
import { PayLinkPanel } from '@/components/pos/PayLinkPanel';
import { ReaderPayPanel } from '@/components/pos/ReaderPayPanel';
import { CardCollectPanel, type CardCollectKind } from '@/components/pos/SaleCardCollect';
import { money, posStyles, usePosT, type Send } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { DetailSkeleton } from '@/components/ui/Skeletons';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/lib/api/client';
import { getStripePublishableKey } from '@/lib/env';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { cancelCollectPayment, CollectEndedError, useCollectClaimPayment } from '@/lib/payments/useCollectPayment';
import { SaleCardError, type SaleCardResult } from '@/lib/payments/useSaleCardPayment';
import { collectEnded, collectEndedCopyId, isPinRequired } from '@/lib/pos/card-methods';
import { cardAppAvailable } from '@/lib/pos/pos-enabled';
import { tipConfig } from '@/lib/pos/sale-math';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import {
  useCollectRequests,
  useCollectState,
  usePosBootstrap,
  usePosEnabled,
  usePosSale,
  useSaleWrite,
} from '@/lib/queries/usePos';
import { useStaffMe } from '@/lib/queries/useStaffMe';
import { useVenue } from '@/lib/queries/useVenue';
import { spacing } from '@/theme/index';
import { useTapToPay } from '@/providers/TapToPayProvider';
import { useTheme } from '@/theme/useTheme';
import type { PosBootstrap, PosCollectState, PosSale } from '@/types/pos';

/**
 * Taking a sale the web till sent to this phone (POS plan §4.36, P7-8; UX spec §23.5; test plan
 * TTP-09). Opened from the `pos_collect_request` push, from "Waiting for you" on Today or from the
 * banner above every screen.
 *
 * 1. `app.collect.title` with who sent it and from which till, and the client when there is one.
 * 2. The card screen, which is the same screen as the app's own sale payments
 *    (`CardCollectPanel`): Apple's exact name and button, the processing state, the warm-up and the
 *    "How to tap" education.
 * 3. When the venue takes tips, once the reader is ready the phone is handed to the client, who
 *    chooses the tip on their side of it (`CustomerTip.tsx`, `app.tip.title`); the header about the
 *    sale is hidden while they hold it. Then the payment is claimed with the tip (only now does the
 *    server make the PaymentIntent) and the client taps their card.
 * 4. Outcomes: paid (`app.collect.done`); declined (`app.collect.declined`, the same PaymentIntent
 *    stays pending, so the Tap to Pay button tries again); a card that wants chip and PIN
 *    (`app.collect.insertCard`, with `app.collect.sendLink` and, when the venue has one,
 *    `app.collect.useCounter`; never chip and PIN on the phone); five minutes with no card
 *    (`app.collect.timeout`, the phone cancels its own attempt); the desk cancelled
 *    (`app.collect.cancelledByDesk`); another phone took it, or it was sent to someone else, or
 *    nobody took it in time (the server's sentence, word for word).
 *
 * The phone reads the payment every few seconds, which is how it learns of a cancel from the desk
 * (no push says so). Everything is gated on the POS switch and on this phone being able to take
 * cards here; an iPad never offers Tap to Pay (`buildSupportsTapToPay`).
 */

type Phase = 'card' | 'link' | 'reader' | 'done';

export default function CollectScreen() {
  const t = usePosT();
  const params = useLocalSearchParams<{ paymentId: string; venue?: string }>();
  const paymentId = typeof params.paymentId === 'string' ? params.paymentId : '';
  const venueParam = typeof params.venue === 'string' ? params.venue : null;
  const posEnabled = usePosEnabled();
  const venue = useVenue();
  const boot = usePosBootstrap();
  const canCollect =
    posEnabled &&
    cardAppAvailable({
      bootstrap: boot.data,
      terminalAvailable: isTerminalSdkAvailable(),
      publishableKey: Boolean(getStripePublishableKey()),
    });
  const [live, setLive] = useState(true);
  const stateQ = useCollectState(paymentId, { poll: live });
  const collect = stateQ.data?.collect ?? null;
  const saleQ = usePosSale(collect?.sale_id ?? null);
  const header = <Stack.Screen options={{ headerShown: true, title: t('pay.title') }} />;

  if (!posEnabled) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('till.off.title')} message={t('till.off.body', { venue: 'your venue' })} />
      </Screen>
    );
  }
  if (venueParam && venue.data?.id && venue.data.id !== venueParam) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('app.collect.list.title')} message={t('app.collect.otherVenue')} />
      </Screen>
    );
  }
  if (stateQ.isLoading || boot.isLoading || (collect && saleQ.isLoading)) {
    return (
      <Screen padded={false}>
        {header}
        <DetailSkeleton />
      </Screen>
    );
  }
  if (stateQ.error instanceof ApiError && stateQ.error.status === 404) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('app.collect.list.title')} message={t('app.collect.gone')} />
      </Screen>
    );
  }
  if (!collect || !boot.data || !saleQ.data) {
    const err = stateQ.error ?? boot.error ?? saleQ.error;
    return (
      <Screen>
        {header}
        <ErrorState
          message={err instanceof ApiError ? err.message : t('till.error.body')}
          onRetry={() => {
            void stateQ.refetch();
            void boot.refetch();
            void saleQ.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!canCollect) {
    return (
      <Screen>
        {header}
        <EmptyState title={t('app.collect.list.title')} message={t('app.pay.cardUnavailable')} />
      </Screen>
    );
  }

  return (
    <CollectBody
      paymentId={paymentId}
      collect={collect}
      sale={saleQ.data}
      bootstrap={boot.data}
      header={header}
      onSettled={() => setLive(false)}
      onLive={() => setLive(true)}
    />
  );
}

function CollectBody({
  paymentId,
  collect,
  sale,
  bootstrap,
  header,
  onSettled,
  onLive,
}: {
  paymentId: string;
  collect: PosCollectState;
  sale: PosSale;
  bootstrap: PosBootstrap;
  header: ReactNode;
  onSettled: () => void;
  onLive: () => void;
}) {
  const t = usePosT();
  const { colors } = useTheme();
  const router = useRouter();
  const accessToken = useAccessToken();
  const me = useStaffMe();
  const myId = bootstrap.me?.staff_id ?? me.data?.staff?.id ?? null;
  const requests = useCollectRequests();
  const row = requests.data?.requests.find((r) => r.payment_id === paymentId) ?? null;
  const claim = useCollectClaimPayment(paymentId);
  const write = useSaleWrite(sale.id);
  const send: Send = (input) => write.mutateAsync(input);
  const tips = tipConfig(bootstrap.tip_settings);

  const claimedByMe = collect.claimed_by_staff_id != null && collect.claimed_by_staff_id === myId;
  const [phase, setPhase] = useState<Phase>('card');
  // A payment this phone claimed already carries its tip; otherwise the client chooses one.
  const fixedTip = claimedByMe ? collect.tip_pence : 0;
  const [customerFacing, setCustomerFacing] = useState(false);
  const [needsPin, setNeedsPin] = useState(false);
  const [result, setResult] = useState<SaleCardResult | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [education, setEducation] = useState(false);
  const tapToPayStatus = useTapToPay();
  const deskCancelled = useRef(false);

  // The desk cancelled (or the sweep closed it) while this phone was waiting for the card.
  const endedElsewhere = collect.status !== 'pending' && phase === 'card' && busy && !result;
  useEffect(() => {
    if (endedElsewhere && collect.status !== 'succeeded') deskCancelled.current = true;
  }, [endedElsewhere, collect.status]);

  const clientName = sale.guest?.name ?? row?.client_name ?? null;
  const till = row?.till_name ?? bootstrap.tills.find((x) => x.id === sale.till_id)?.name ?? t('app.collect.desk');
  const sender = row?.sent_by_name ?? sale.created_by_name ?? t('app.collect.someone');
  const head = (
    <View style={posStyles.stack}>
      <Text variant="title">{t('app.collect.title', { amount: money(collect.amount_pence) })}</Text>
      <Text variant="bodySmall" tone="muted">
        {t('app.collect.for', { saleNo: sale.number_label, till, staffName: sender })}
      </Text>
      {clientName ? <Text variant="bodySmall">{t('app.collect.client', { clientName })}</Text> : null}
    </View>
  );

  const close = () => router.back();
  const openSale = () => router.replace(`/checkout/${sale.id}` as Href);

  /** Leaving a payment this phone claimed and still holds: cancel it so the desk can carry on. */
  const leave = async () => {
    if (claimedByMe && collect.status === 'pending' && accessToken) {
      setLeaving(true);
      await cancelCollectPayment(accessToken, paymentId);
      setLeaving(false);
    }
    close();
  };

  // Done on this phone.
  if (phase === 'done' && result) {
    return (
      <Screen>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          {head}
          <Text variant="heading" color={colors.success}>
            {t('app.collect.done')}
          </Text>
          {result.tipPence > 0 ? <Text variant="bodySmall">{t('reader.success.tip', { tip: money(result.tipPence) })}</Text> : null}
          <Button label={t('app.collect.close')} onPress={close} fullWidth />
        </ScrollView>
      </Screen>
    );
  }

  // Ended before (or without) this phone taking the card.
  if (collectEnded(collect.screen) && !busy && phase !== 'link' && phase !== 'reader') {
    return (
      <Screen>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          {head}
          <Text variant="bodyMedium">{t(collectEndedCopyId(collect.screen, claimedByMe))}</Text>
          <Button label={t('app.collect.close')} onPress={close} fullWidth />
          <Button label={t('app.collect.backToSale')} variant="ghost" onPress={openSale} fullWidth />
        </ScrollView>
      </Screen>
    );
  }

  // Another phone has it.
  if (collect.claimed_by_staff_id && !claimedByMe && collect.status === 'pending') {
    return (
      <Screen>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          {head}
          <Text variant="bodyMedium">
            {t('err.POS_PAYMENT_CLAIMED', { staffName: collect.claimed_by_name ?? t('app.collect.someone') })}
          </Text>
          <Button label={t('app.collect.close')} onPress={close} fullWidth />
        </ScrollView>
      </Screen>
    );
  }

  const describeError = (e: unknown): string | null => {
    if (deskCancelled.current) return t('app.collect.cancelledByDesk');
    if (e instanceof CollectEndedError) return e.message;
    if (e instanceof SaleCardError) {
      if (e.kind === 'timed_out') return t('app.collect.timeout');
      if (isPinRequired(e.codes.declineCode) || isPinRequired(e.codes.code)) return t('app.collect.insertCard');
      if (e.kind === 'declined') return t('app.collect.declined');
    }
    return null;
  };

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* The client holding the phone sees only their own screen, not the sale's details. */}
        {customerFacing ? null : head}
        {phase === 'link' ? (
          <PayLinkPanel
            sale={sale}
            bootstrap={bootstrap}
            send={send}
            amountPence={collect.amount_pence}
            onPaid={close}
            onClose={close}
          />
        ) : phase === 'reader' ? (
          <ReaderPayPanel
            sale={sale}
            bootstrap={bootstrap}
            send={send}
            amountPence={collect.amount_pence}
            onPaid={close}
            onBack={close}
          />
        ) : (
          <CardCollectPanel
            saleId={sale.id}
            amountPence={collect.amount_pence}
            tipPence={fixedTip}
            customerTip={
              tips.enabled && !claimedByMe
                ? {
                    sale,
                    tipSettings: bootstrap.tip_settings,
                    amountPence: collect.amount_pence,
                    balancePence: collect.amount_pence,
                    maxPaymentPence: bootstrap.settings.max_payment_pence ?? null,
                    venueName: bootstrap.venue?.name ?? 'This venue',
                    clientName: sale.guest ? sale.guest.name.split(' ')[0] || sale.guest.name : null,
                  }
                : null
            }
            onCustomerFacing={setCustomerFacing}
            isAdmin={bootstrap.role === 'admin'}
            consentClientName={
              bootstrap.settings.card_on_file_enabled === true && sale.guest ? sale.guest.name.split(' ')[0] || sale.guest.name : null
            }
            processingLabel={t('app.collect.processing')}
            externalStop={endedElsewhere}
            pay={async (kind: CardCollectKind, hooks, tipPence) => {
              setBusy(true);
              setNeedsPin(false);
              deskCancelled.current = false;
              onLive();
              try {
                const out = await claim.mutateAsync({
                  readerType: kind === 'tap_to_pay' ? 'tap_to_pay' : 'wisepad',
                  tipPence,
                  ...hooks,
                });
                return out;
              } finally {
                setBusy(false);
              }
            }}
            describeError={describeError}
            onFailure={(e) => {
              if (e instanceof SaleCardError && (isPinRequired(e.codes.declineCode) || isPinRequired(e.codes.code))) setNeedsPin(true);
              if (e instanceof CollectEndedError) onSettled();
            }}
            extra={
              needsPin ? (
                <View style={posStyles.buttons}>
                  {bootstrap.card_methods?.pay_link ? (
                    <Button
                      label={t('app.collect.sendLink')}
                      loading={leaving}
                      onPress={async () => {
                        // The phone cancels this payment first, then sends a link for the amount.
                        if (accessToken) await cancelCollectPayment(accessToken, paymentId);
                        setPhase('link');
                      }}
                      fullWidth
                    />
                  ) : null}
                  {bootstrap.card_methods?.card_reader ? (
                    <Button
                      label={t('app.collect.useCounter')}
                      variant="secondary"
                      onPress={async () => {
                        if (accessToken) await cancelCollectPayment(accessToken, paymentId);
                        setPhase('reader');
                      }}
                      fullWidth
                    />
                  ) : null}
                </View>
              ) : null
            }
            onDone={(r) => {
              setResult(r);
              onSettled();
              setPhase('done');
            }}
            onBack={() => void leave()}
          />
        )}
        {/* Apple's rules apply to this screen however it was opened, a push included (plan §4.36):
            the "How to tap" education is one tap away. */}
        {phase === 'card' && !customerFacing && Platform.OS === 'ios' && buildSupportsTapToPay() ? (
          <Button
            label={t('app.howToTap.title')}
            variant="ghost"
            onPress={async () => {
              const shown = await tapToPayStatus.showEducation();
              if (!shown) setEducation(true);
            }}
            fullWidth
          />
        ) : null}
        <TapToPayEducationSheet visible={education} onClose={() => setEducation(false)} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, gap: spacing.md, paddingBottom: spacing['3xl'] },
});

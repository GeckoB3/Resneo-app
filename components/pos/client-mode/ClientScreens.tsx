import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ClientButton, ClientFrame, ClientRing, ClientText } from '@/components/pos/client-mode/ClientFrame';
import { money, usePosT } from '@/components/pos/parts';
import type { CardSummary } from '@/lib/payments/card-outcome';
import type { PosCopyId } from '@/lib/pos/copy';
import { clientColors, spacing } from '@/theme/index';

/**
 * Client mode's screens after the tip (research `part3-tip-research.md` §6.3, S3 to S9). Each is a
 * full `ClientFrame`; the card panel picks one by the payment's stage while the client holds the
 * phone. None of them draws a phone, the contactless symbol or anything like Apple's sheet.
 */

type Base = { venueName: string; logoUrl?: string | null; totalPence: number; tipPence: number };

/** "£51.75" with "Includes a £6.75 tip" under it, the anchor every client screen repeats. */
function Amount({ totalPence, tipPence, role = 'hero' }: { totalPence: number; tipPence: number; role?: 'hero' | 'result' }) {
  const t = usePosT();
  return (
    <View style={styles.amount}>
      <ClientText role={role} numberOfLines={1} adjustsFontSizeToFit>
        {money(totalPence)}
      </ClientText>
      {tipPence > 0 ? <ClientText role="body">{t('app.client.includesTip', { tip: money(tipPence) })}</ClientText> : null}
    </View>
  );
}

/** S3, save your card: the server's words verbatim and two answers of equal weight. */
export function ClientConsent({
  venueName,
  logoUrl,
  totalPence,
  tipPence,
  text,
  saving,
  onAnswer,
  onStaffClose,
}: Base & { text: string; saving: boolean; onAnswer: (agreed: boolean) => void; onStaffClose: () => void }) {
  const t = usePosT();
  const [pressed, setPressed] = useState<boolean | null>(null);
  return (
    <ClientFrame
      venueName={venueName}
      logoUrl={logoUrl}
      onStaffClose={onStaffClose}
      staffCloseLabel={t('app.client.stop.a11y')}
      screenKey="consent"
      footer={
        // Two answers of the same size and the same neutral style, one above the other so neither
        // label wraps: neither is pushed (UX spec §13.4).
        <>
          <ClientButton
            label={t('app.saveCard.agree')}
            tone="neutral"
            loading={saving && pressed === true}
            disabled={saving}
            onPress={() => {
              setPressed(true);
              onAnswer(true);
            }}
          />
          <ClientButton
            label={t('app.saveCard.decline')}
            tone="neutral"
            loading={saving && pressed === false}
            disabled={saving}
            onPress={() => {
              setPressed(false);
              onAnswer(false);
            }}
          />
        </>
      }>
      <ClientText role="question" accessibilityRole="header">
        {t('app.saveCard.title')}
      </ClientText>
      <ClientText role="body" center={false}>
        {text}
      </ClientText>
      <ClientText role="body">{t('app.tip.total', { amount: money(totalPence) })}</ClientText>
      {tipPence > 0 ? <ClientText role="small">{t('app.client.includesTip', { tip: money(tipPence) })}</ClientText> : null}
    </ClientFrame>
  );
}

/**
 * S4, getting ready: the bridge into the system card screen, in the deeper navy. The spinner and
 * its words appear only after 400ms, so a fast system screen causes no flash.
 */
export function ClientReady({
  venueName,
  logoUrl,
  totalPence,
  tipPence,
  reader,
  onStaffClose,
}: Base & { reader: 'tap_to_pay' | 'bluetooth'; onStaffClose: () => void }) {
  const t = usePosT();
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShowSpinner(true), 400);
    return () => clearTimeout(id);
  }, []);
  const instruction =
    reader === 'bluetooth'
      ? t('app.client.ready.reader')
      : Platform.OS === 'ios'
        ? t('app.client.ready.iphone')
        : t('app.client.ready.android');
  return (
    <ClientFrame
      venueName={venueName}
      logoUrl={logoUrl}
      deep
      onStaffClose={onStaffClose}
      staffCloseLabel={t('app.client.stop.a11y')}
      screenKey="ready">
      {reader === 'tap_to_pay' && Platform.OS === 'ios' ? (
        // The tap area is the top edge of an iPhone: an arrow points there. Never a phone, card or
        // contactless symbol (Apple's marketing rules).
        <View style={styles.arrow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={28} tintColor={clientColors.accent} />
        </View>
      ) : null}
      <View style={styles.centre}>
        <Amount totalPence={totalPence} tipPence={tipPence} />
        <View style={styles.spinnerBlock}>
          {showSpinner ? (
            <>
              <ActivityIndicator size="large" color={clientColors.accent} />
              <ClientText role="venue" color={clientColors.text} accessibilityLiveRegion="polite">
                {t('app.client.ready.title')}
              </ClientText>
            </>
          ) : null}
        </View>
      </View>
      <ClientText role="body">{instruction}</ClientText>
    </ClientFrame>
  );
}

/** S6, processing: no buttons and no staff close; once read, the payment cannot be stopped here. */
export function ClientProcessing({ venueName, logoUrl, totalPence, tipPence }: Base) {
  const t = usePosT();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(t('app.client.processing'));
  }, [t]);
  return (
    <ClientFrame venueName={venueName} logoUrl={logoUrl} deep screenKey="processing">
      <View style={styles.centre}>
        <Amount totalPence={totalPence} tipPence={tipPence} />
        <View style={styles.spinnerBlock}>
          <ActivityIndicator size="large" color={clientColors.accent} />
          <ClientText role="venue" color={clientColors.text}>
            {t('app.client.processing')}
          </ClientText>
          <ClientText role="small">{t('app.client.processing.hint')}</ClientText>
        </View>
      </View>
    </ClientFrame>
  );
}

/** S7, paid: the drawn tick, the amount with the tip, thanks, then staff's white Done. */
export function ClientPaid({
  venueName,
  logoUrl,
  totalPence,
  tipPence,
  card,
  clientName,
  onDone,
}: Base & { card: CardSummary | null; clientName: string | null; onDone: () => void }) {
  const t = usePosT();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(t('app.client.paid.a11y', { amount: money(totalPence) }));
  }, [t, totalPence]);
  const cardLine = card?.last4 ? t('app.client.card', { brand: brandName(card.brand), last4: card.last4 }) : null;
  return (
    <ClientFrame
      venueName={venueName}
      logoUrl={logoUrl}
      screenKey="paid"
      footer={
        <>
          <View style={styles.rule} />
          <ClientText role="body">{t('app.client.handBack')}</ClientText>
          <ClientButton label={t('add.done')} tone="staff" onPress={onDone} testID="client-done" />
        </>
      }>
      <View style={styles.centre}>
        <ClientRing kind="success" />
        <ClientText role="title" accessibilityRole="header">
          {t('app.client.paid')}
        </ClientText>
        <Amount totalPence={totalPence} tipPence={tipPence} role="result" />
        {cardLine ? <ClientText role="small">{cardLine}</ClientText> : null}
        <ClientText role="venue" color={clientColors.text} style={styles.thanks}>
          {clientName ? t('app.client.thanks', { clientName }) : t('app.client.thanks.anon')}
        </ClientText>
      </View>
    </ClientFrame>
  );
}

export type ClientEndingKind = 'declined' | 'pin' | 'timeout' | 'desk' | 'unsure' | 'team' | 'notDone' | 'closed';

/**
 * S8, every way a payment can end without going through, worded for the client, plus S4's
 * "card screen closed" variant. "We can't be sure" never offers a retry: it could charge twice.
 */
export function ClientEnding({
  kind,
  venueName,
  logoUrl,
  totalPence,
  tipPence,
  canChangeTip,
  onTryAgain,
  onChangeTip,
  onOtherWay,
  onDone,
}: Base & {
  kind: ClientEndingKind;
  canChangeTip: boolean;
  onTryAgain: () => void;
  onChangeTip: () => void;
  /** To the hand-back screen, then staff's card screen with every other way to pay. */
  onOtherWay: () => void;
  /** Staff: end client mode now (the desk cancelled, we can't be sure, the team must check). */
  onDone: () => void;
}) {
  const t = usePosT();
  const copy = ENDING_COPY[kind];
  const title = t(copy.title);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);
  const staffOnly = kind === 'desk' || kind === 'unsure' || kind === 'team';
  return (
    <ClientFrame
      venueName={venueName}
      logoUrl={logoUrl}
      screenKey={`ending-${kind}`}
      footer={
        staffOnly ? (
          <ClientButton label={t('add.done')} tone="staff" onPress={onDone} testID="client-done" />
        ) : (
          <>
            <ClientButton
              label={t(kind === 'pin' ? 'app.client.tryAnother' : kind === 'timeout' ? 'app.client.startAgain' : 'app.client.tryAgain')}
              onPress={onTryAgain}
              testID="client-try-again"
            />
            <ClientButton
              label={t(kind === 'timeout' || kind === 'closed' ? 'app.client.giveBack' : 'app.client.otherWay')}
              tone="outline"
              onPress={onOtherWay}
            />
            {canChangeTip && (kind === 'declined' || kind === 'closed' || kind === 'notDone') ? (
              <ClientButton label={t('app.client.changeTip')} tone="text" onPress={onChangeTip} />
            ) : null}
          </>
        )
      }>
      <View style={styles.centre}>
        {kind === 'closed' ? null : <ClientRing kind={CALM.has(kind) ? 'neutral' : 'error'} />}
        <ClientText role="question" accessibilityRole="header">
          {title}
        </ClientText>
        <ClientText role="body">{t(copy.body)}</ClientText>
        {kind === 'closed' || kind === 'team' ? null : (
          <ClientText role="body" color={clientColors.text}>
            {tipPence > 0
              ? t('app.client.amountWithTip', { amount: money(totalPence), tip: money(tipPence) })
              : money(totalPence)}
          </ClientText>
        )}
      </View>
    </ClientFrame>
  );
}

/** Endings that are not the client's card failing: a calm ring, not the error colour. */
const CALM = new Set<ClientEndingKind>(['timeout', 'desk', 'unsure', 'team']);

const ENDING_COPY: Record<ClientEndingKind, { title: PosCopyId; body: PosCopyId }> = {
  declined: { title: 'app.client.declined.title', body: 'app.client.declined.body' },
  pin: { title: 'app.client.insert.title', body: 'app.client.insert.body' },
  timeout: { title: 'app.client.timeout.title', body: 'app.client.timeout.body' },
  desk: { title: 'app.client.desk.title', body: 'app.client.desk.body' },
  unsure: { title: 'app.client.unsure.title', body: 'app.client.unsure.body' },
  team: { title: 'app.client.team.title', body: 'app.client.team.body' },
  notDone: { title: 'app.client.notDone.title', body: 'app.client.notDone.body' },
  closed: { title: 'app.client.closed.title', body: 'app.client.closed.body' },
};

/** S9, hand back: the client gives the phone to staff, who press Done. */
export function ClientHandBack({ venueName, logoUrl, onDone }: { venueName: string; logoUrl?: string | null; onDone: () => void }) {
  const t = usePosT();
  return (
    <ClientFrame
      venueName={venueName}
      logoUrl={logoUrl}
      screenKey="handBack"
      footer={<ClientButton label={t('add.done')} tone="staff" onPress={onDone} testID="client-done" />}>
      <View style={styles.centre}>
        <ClientText role="question" accessibilityRole="header">
          {t('app.client.handBack')}
        </ClientText>
        <ClientText role="body">{t('app.client.closed.body')}</ClientText>
      </View>
    </ClientFrame>
  );
}

/** "visa" from the SDK reads as "Visa". */
function brandName(brand: string | null): string {
  if (!brand) return 'Card';
  const known: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', maestro: 'Maestro' };
  return known[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

const styles = StyleSheet.create({
  amount: { alignItems: 'center', gap: spacing.xs },
  centre: { flexGrow: 1, justifyContent: 'center', alignItems: 'stretch', gap: spacing.base },
  spinnerBlock: { alignItems: 'center', gap: spacing.md, minHeight: 88, paddingTop: spacing.xl },
  arrow: { alignItems: 'center' },
  rule: { height: 1, backgroundColor: clientColors.rule },
  thanks: { marginTop: spacing.sm },
});

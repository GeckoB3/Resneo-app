/**
 * "Add card" (web Docs/card-on-file-plan.md §6.7; web `AddCardDeskSheet`): how a client adds
 * their card at the desk, from the client record, a booking or the booking form.
 *
 * - "Hand the screen to your client": the web desk page, full screen inside the app (a WebView).
 *   The page does not use the staff session and has no way back into staff screens; Android's
 *   back button does nothing while it is open. It ends on success, on the client's "Cancel" or
 *   after 3 idle minutes, and its "I have the screen back" closes it here.
 * - "Show a code for their phone": a QR code to a single-use link (15 minutes), with "Waiting for
 *   the client..." and "Cancel"; it turns into "Card saved" when done and offers a new code if it
 *   expires.
 * - "Send by email or text": the client's card request, when they have details.
 *
 * In a collective each option says its reach ("saves the card for all of {collective}"). Every
 * outcome is said in words: saved (brand and last four), declined, cancelled, expired.
 *
 * Card entry happens on the web page, so Apple Pay and Google Pay are offered there and the app
 * needs no native change (plan §16.1).
 */
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { CardAccountScope } from '@/components/bookings/CardAccountScope';
import { ReaderSaveFlow } from '@/components/cards/ReaderSaveFlow';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { cardLabel } from '@/lib/booking/card-hold';
import { READER_SAVE_OTHER_BUSINESS, type ReaderSaveDevice } from '@/lib/cards/reader-save';
import { getStripePublishableKey } from '@/lib/env';
import { hapticSuccess } from '@/lib/haptics';
import {
  useCancelDeskSession,
  useCreateDeskSession,
  useDeskSessionStatus,
  type DeskMessageSent,
  type DeskSessionCreated,
  type DeskSessionStatus,
} from '@/lib/queries/useCardsOnFile';
import { buildSupportsTapToPay } from '@/lib/payments/tap-to-pay-build-support';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { useReaderSaveOptions } from '@/lib/queries/useReaderSaveOptions';
import { useOverlayOpen } from '@/lib/ui/open-overlays';
import { radius, spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';
import { LinkedVenueContext } from '@/providers/LinkedVenueProvider';
import { useVenueContext } from '@/providers/VenueProvider';

/**
 * Saving a card on Tap to Pay or the Bluetooth reader with no charge (§4.12, C12) needs the
 * Terminal SDK and its provider, which mount only with a publishable key in a native build (the
 * same condition as Take payment's card options). The SDK's `processSetupIntent` is in the 1.3.1
 * store build, so this ships over the air.
 */
export function readerSaveAvailable(): boolean {
  return isTerminalSdkAvailable() && Boolean(getStripePublishableKey());
}

type Step =
  | { kind: 'choose' }
  | { kind: 'handover'; sessionId: string; url: string }
  | { kind: 'waiting'; sessionId: string; mode: 'handover' | 'qr'; url: string }
  | { kind: 'message_sent'; email: boolean; sms: boolean }
  | { kind: 'reader'; device: ReaderSaveDevice }
  | { kind: 'outcome'; text: string; tone: 'success' | 'muted' | 'danger'; canRetry: boolean };

export interface AddCardSheetProps {
  visible: boolean;
  onClose: () => void;
  guestId: string;
  bookingId?: string | null;
  /** Before a booking exists: the business the booking will be at (sent with the desk session). */
  bookingVenueId?: string | null;
  clientFirstName: string;
  /** The client has an email or mobile number, so a card request can reach them. */
  hasContact: boolean;
  /** The business or collective a card saved now is kept with. */
  savedWith: string;
  scope: 'business' | 'collective';
  /** The business's own name, for the reader options' reach. */
  businessName?: string | null;
  /** iOS: only an admin may accept Apple's Tap to Pay terms on first use. */
  isAdmin?: boolean;
  onSaved?: () => void;
}

/**
 * A card saved on the reader is a till card on the signed-in business's own Stripe account (the
 * server's `reader-save/setup-intent` always uses it), so the reader must connect through that
 * account. The app or the booking form may be scoped to a collective or a linked venue instead: the
 * collective form books for the collective, whose id the server reads as a linked venue, and the
 * connection token was refused with "You do not have an active link with that venue" (Tap to Pay
 * from Add card in a collective booking, 2026-11-19). This points the reader back at the signed-in
 * business while the save runs; a no-op when the app is already on it.
 */
function OwnAccountReaderScope({ children }: { children: ReactNode }) {
  const { venue } = useVenueContext();
  const linked = useContext(LinkedVenueContext);
  const appScope = linked?.ownerVenueId ?? null;
  const ownVenueId = venue?.id ?? null;
  const readerOwner = appScope && ownVenueId && appScope !== ownVenueId ? ownVenueId : null;
  return <CardAccountScope ownerVenueId={readerOwner}>{children}</CardAccountScope>;
}

/** The outcome words for a finished session (plan §6.7 point 4). */
export function deskOutcomeText(
  status: DeskSessionStatus,
  savedWith: string,
  clientFirstName: string,
): { text: string; tone: 'success' | 'muted' | 'danger'; canRetry: boolean } | null {
  switch (status.status) {
    case 'saved': {
      const label = status.card?.last4 ? cardLabel(status.card.brand, status.card.last4) : 'The card';
      return { text: `Card saved. ${label} is saved with ${savedWith}.`, tone: 'success', canRetry: false };
    }
    case 'cancelled':
      return { text: `${clientFirstName || 'The client'} cancelled. No card was saved.`, tone: 'muted', canRetry: true };
    case 'expired':
      return {
        text: status.mode === 'qr' ? 'The code expired. No card was saved.' : 'The screen timed out. No card was saved.',
        tone: 'danger',
        canRetry: true,
      };
    default:
      return null;
  }
}

/**
 * Why Tap to Pay and the Bluetooth reader are not offered for a client another business keeps (a
 * collective partner's, as after a booking at a partner). The web leaves the options out without a
 * word; staff on the phone read the missing buttons as a fault (2026-11-19).
 */
export const READER_OTHER_BUSINESS_LINE =
  "Tap to Pay and the card reader only save cards for your own business's clients. For this client, use one of the options above.";

/** The reach line under the title (plan §6.7 point 1). */
export function addCardReachLine(scope: 'business' | 'collective', savedWith: string): string {
  return scope === 'collective' ? `Saves the card for all of ${savedWith}.` : `Saves the card for ${savedWith}.`;
}

export function AddCardSheet({
  visible,
  onClose,
  guestId,
  bookingId,
  bookingVenueId = null,
  clientFirstName,
  hasContact,
  savedWith,
  scope,
  businessName,
  isAdmin = false,
  onSaved,
}: AddCardSheetProps) {
  const { colors } = useTheme();
  const [rawStep, setStep] = useState<Step>({ kind: 'choose' });
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  const create = useCreateDeskSession();
  const cancel = useCancelDeskSession();
  const waitingId = rawStep.kind === 'waiting' ? rawStep.sessionId : null;
  const status = useDeskSessionStatus(waitingId, visible && waitingId !== null);
  const savedReported = useRef<string | null>(null);
  const readersPossible = readerSaveAvailable();
  const readerOptions = useReaderSaveOptions(guestId, visible && readersPossible);
  const readerAnswer = readerOptions.data;
  const readerOtherBusiness = readersPossible && readerAnswer === READER_SAVE_OTHER_BUSINESS;
  const readerData = readerAnswer && typeof readerAnswer === 'object' ? readerAnswer : null;
  const canReaderSave = readersPossible && readerData?.can_save === true;
  const tapToPayHere = canReaderSave && buildSupportsTapToPay();

  // Start again each time the sheet opens (set while rendering, React's pattern for a prop change).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStep({ kind: 'choose' });
      setError(null);
    }
  }

  // The waiting session finished: say how, in words.
  const waitingStatus = rawStep.kind === 'waiting' && status.data?.id === rawStep.sessionId ? status.data : null;
  const finished = waitingStatus ? deskOutcomeText(waitingStatus, savedWith, clientFirstName) : null;
  const step: Step = finished ? { kind: 'outcome', ...finished } : rawStep;

  useEffect(() => {
    if (!waitingStatus || waitingStatus.status !== 'saved' || savedReported.current === waitingStatus.id) return;
    savedReported.current = waitingStatus.id;
    hapticSuccess();
    onSaved?.();
  }, [waitingStatus, onSaved]);

  const start = useCallback(
    (mode: 'handover' | 'qr' | 'message') => {
      setError(null);
      create.mutate(
        { guestId, bookingId: bookingId ?? null, ...(bookingVenueId ? { bookingVenueId } : {}), mode },
        {
          onSuccess: (result) => {
            if (mode === 'message') {
              const sent = result as DeskMessageSent;
              setStep({ kind: 'message_sent', email: Boolean(sent.email), sms: Boolean(sent.sms) });
              return;
            }
            const session = result as DeskSessionCreated;
            setStep(
              mode === 'handover'
                ? { kind: 'handover', sessionId: session.session_id, url: session.url }
                : { kind: 'waiting', sessionId: session.session_id, mode: 'qr', url: session.url },
            );
          },
          onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'),
        },
      );
    },
    [create, guestId, bookingId, bookingVenueId],
  );

  const cancelWaiting = useCallback(
    (sessionId: string) => {
      cancel.mutate(sessionId, {
        onSettled: () =>
          setStep({ kind: 'outcome', text: 'Cancelled. No card was saved.', tone: 'muted', canRetry: true }),
      });
    },
    [cancel],
  );

  const startReaderSave = useCallback((device: ReaderSaveDevice) => {
    setError(null);
    setStep({ kind: 'reader', device });
  }, []);

  const reach = addCardReachLine(scope, savedWith);
  const busy = create.isPending;

  return (
    <>
      <Sheet visible={visible && step.kind !== 'handover'} onClose={onClose}>
        <View style={styles.body} testID="add-card-sheet">
          <View style={styles.header}>
            <Text variant="title" accessibilityRole="header">
              Add card
            </Text>
            <Text variant="bodySmall" tone="muted">
              {reach}
            </Text>
          </View>

          {error ? (
            <Text variant="bodySmall" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          {step.kind === 'choose' ? (
            <View style={styles.buttons}>
              <Button
                label="Hand the screen to your client"
                onPress={() => start('handover')}
                loading={busy && create.variables?.mode === 'handover'}
                disabled={busy}
                fullWidth
              />
              <Button
                label="Show a code for their phone"
                variant="secondary"
                onPress={() => start('qr')}
                loading={busy && create.variables?.mode === 'qr'}
                disabled={busy}
                fullWidth
              />
              {hasContact ? (
                <Button
                  label="Send by email or text"
                  variant="secondary"
                  onPress={() => start('message')}
                  loading={busy && create.variables?.mode === 'message'}
                  disabled={busy}
                  fullWidth
                />
              ) : null}
              {canReaderSave ? (
                <>
                  <Text variant="caption" tone="muted" testID="add-card-reader-reach">
                    {readerData?.reader_reach ||
                      `The reader saves the card for ${businessName?.trim() || 'this business'} only.`}
                  </Text>
                  {tapToPayHere ? (
                    <Button
                      label="Tap to Pay on this phone"
                      variant="secondary"
                      onPress={() => startReaderSave('tap_to_pay')}
                      disabled={busy}
                      fullWidth
                    />
                  ) : null}
                  <Button
                    label="Bluetooth reader"
                    variant="secondary"
                    onPress={() => startReaderSave('bluetooth_reader')}
                    disabled={busy}
                    fullWidth
                  />
                </>
              ) : readerOtherBusiness ? (
                <Text variant="caption" tone="muted" testID="add-card-reader-other-business">
                  {READER_OTHER_BUSINESS_LINE}
                </Text>
              ) : null}
            </View>
          ) : null}

          {step.kind === 'reader' ? (
            <OwnAccountReaderScope>
              <ReaderSaveFlow
                device={step.device}
                guestId={guestId}
                clientFirstName={clientFirstName}
                isAdmin={isAdmin}
                onSaved={onSaved}
                onDone={(saved) => {
                  if (saved) onClose();
                  else setStep({ kind: 'choose' });
                }}
              />
            </OwnAccountReaderScope>
          ) : null}

          {step.kind === 'waiting' ? (
            <View style={styles.stack}>
              {step.mode === 'qr' ? (
                <View
                  style={styles.qrWrap}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`A code for ${clientFirstName || 'the client'} to scan with their phone camera`}>
                  <View style={[styles.qrFrame, { borderColor: colors.border }]}>
                    <QRCode value={step.url} size={220} backgroundColor="#ffffff" color="#111111" />
                  </View>
                </View>
              ) : null}
              <Text variant="bodySmall" accessibilityLiveRegion="polite" testID="add-card-waiting">
                {step.mode === 'qr'
                  ? 'Waiting for the client... The code works once, for 15 minutes.'
                  : 'Waiting for the client...'}
              </Text>
              {status.data?.declined ? (
                <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite">
                  The bank declined the last card tried. The client can try another card.
                </Text>
              ) : null}
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => cancelWaiting(step.sessionId)}
                loading={cancel.isPending}
                fullWidth
              />
            </View>
          ) : null}

          {step.kind === 'message_sent' ? (
            <View style={styles.stack}>
              <Text variant="bodySmall" tone="success" accessibilityLiveRegion="polite">
                {`Card request sent${step.email && step.sms ? ' by email and text.' : step.email ? ' by email.' : step.sms ? ' by text.' : '.'}`}
              </Text>
              <Button label="Done" onPress={onClose} fullWidth />
            </View>
          ) : null}

          {step.kind === 'outcome' ? (
            <View style={styles.stack}>
              <Text
                variant="bodyMedium"
                tone={step.tone}
                accessibilityLiveRegion="polite"
                testID="add-card-outcome">
                {step.text}
              </Text>
              {step.canRetry ? (
                <Button label="Try again" variant="secondary" onPress={() => setStep({ kind: 'choose' })} fullWidth />
              ) : null}
              <Button label="Done" onPress={onClose} fullWidth />
            </View>
          ) : null}
        </View>
      </Sheet>

      <DeskHandoverModal
        visible={visible && step.kind === 'handover'}
        url={step.kind === 'handover' ? step.url : null}
        onHandedBack={() => {
          if (step.kind === 'handover') {
            setStep({ kind: 'waiting', sessionId: step.sessionId, mode: 'handover', url: step.url });
          }
        }}
      />
    </>
  );
}

/**
 * True when a top-frame navigation leaves the desk page for another page of the same site: the
 * page's "I have the screen back" link. Stripe's own pages (bank checks) stay inside.
 */
export function isDeskHandBackNavigation(deskUrl: string, request: Pick<WebViewNavigation, 'url'> & { isTopFrame?: boolean }): boolean {
  if (request.isTopFrame === false) return false;
  try {
    const desk = new URL(deskUrl);
    const next = new URL(request.url);
    if (next.origin !== desk.origin) return false;
    return !next.pathname.startsWith('/desk') && !next.pathname.startsWith('/api/desk');
  } catch {
    return false;
  }
}

/**
 * The desk page, full screen, handed to the client. No staff controls are drawn over it; the
 * page's own "I have the screen back" (or a failed load's) brings staff back.
 */
function DeskHandoverModal({
  visible,
  url,
  onHandedBack,
}: {
  visible: boolean;
  url: string | null;
  onHandedBack: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  useOverlayOpen(visible);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setFailed(false);
  }

  return (
    <Modal
      visible={visible && url !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      // Android back does nothing: the client must not be able to leave the page.
      onRequestClose={() => undefined}>
      <View style={[styles.modal, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {url && !failed ? (
          <WebView
            source={{ uri: url }}
            style={styles.webview}
            originWhitelist={['https://*', 'http://*']}
            onShouldStartLoadWithRequest={(request) => {
              if (isDeskHandBackNavigation(url, request)) {
                onHandedBack();
                return false;
              }
              return true;
            }}
            onError={() => setFailed(true)}
            testID="desk-handover-webview"
          />
        ) : (
          <View style={styles.failed}>
            <Text variant="bodyMedium" accessibilityRole="alert">
              The card screen could not be loaded. Please hand the screen back.
            </Text>
            <Button label="I have the screen back" onPress={onHandedBack} fullWidth />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.base },
  header: { gap: spacing.xs },
  buttons: { gap: spacing.sm },
  stack: { gap: spacing.md },
  qrWrap: { alignItems: 'center' },
  qrFrame: { padding: spacing.md, backgroundColor: '#ffffff', borderRadius: radius.md, borderWidth: 1 },
  modal: { flex: 1 },
  webview: { flex: 1 },
  failed: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.base },
});

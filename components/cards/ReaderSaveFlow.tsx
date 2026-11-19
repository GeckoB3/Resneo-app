/**
 * "Tap to Pay on this phone" / "Bluetooth reader" from Add card (web Docs/card-on-file-plan.md
 * §4.12, C12, §6.7): save the client's card on this business's reader with no charge.
 *
 * 1. Connect the reader with the app's own hooks (`useTapToPayReader`, `useBluetoothReader`).
 * 2. Start the save; when a collective card already covers the client, staff are asked first
 *    ("Save another for {business} only?").
 * 3. Staff hand the phone over; the client reads the words and picks one of two equal buttons.
 * 4. On a yes the card is read (`processSetupIntent`); staff see the progress with "Cancel".
 * 5. The outcome in the server's words: saved (brand and last four), declined, can't be saved,
 *    busy or offline, timed out, cancelled.
 *
 * Mounted only while chosen and only where the Terminal SDK and its provider are present, so the
 * reader hooks never run in a build without them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { readerSaveApi, runReaderSave, type ReaderSaveDevice, type ReaderSaveResult, type ReaderSaveTerminal } from '@/lib/cards/reader-save';
import { hapticSuccess } from '@/lib/haptics';
import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { useTapToPayReader } from '@/lib/payments/terminal';
import { getTerminalSdk } from '@/lib/payments/terminal-sdk';
import { useAccessToken } from '@/lib/queries/useAccessToken';
import { spacing } from '@/theme/index';

export const READER_SAVE_COPY = {
  connecting: 'Getting the card reader ready...',
  noBluetooth:
    'No Bluetooth reader is connected. Connect your reader from Take payment, then try again here.',
  handTo: (client: string) => `Hand the phone to ${client} so they can choose whether to save their card.`,
  handedOver: 'I have handed it over',
  title: 'Save your card for next time?',
  agree: 'Yes, save my card',
  decline: 'No thanks',
  saveAnother: 'Save another card',
  reading: 'Waiting for the client to tap or insert their card...',
} as const;

type Step =
  | { kind: 'connecting' }
  | { kind: 'question'; text: string }
  | { kind: 'handTo'; text: string }
  | { kind: 'ask'; text: string }
  | { kind: 'reading'; text: string }
  | { kind: 'outcome'; result: ReaderSaveResult };

export function ReaderSaveFlow({
  device,
  guestId,
  clientFirstName,
  isAdmin = false,
  onDone,
  onSaved,
}: {
  device: ReaderSaveDevice;
  guestId: string;
  clientFirstName: string;
  isAdmin?: boolean;
  /** Back to the Add card choices; `saved` after a card was saved (the sheet then closes). */
  onDone: (saved?: boolean) => void;
  onSaved?: () => void;
}) {
  const accessToken = useAccessToken();
  const tapToPay = useTapToPayReader();
  const bluetooth = useBluetoothReader();
  const terminal = getTerminalSdk()!.useStripeTerminal() as unknown as ReaderSaveTerminal;
  const [step, setStep] = useState<Step>({ kind: 'connecting' });
  const resolver = useRef<((answer: boolean | null) => void) | null>(null);
  const started = useRef(false);
  const mounted = useRef(true);
  /**
   * Staff stopped (Cancel, or the sheet closed). Nothing further is started on the reader or the
   * server after this. Found 2026-11-19: Cancel while "Getting the card reader ready" went back to
   * the choices but the save still started once the reader connected, and closing the sheet while
   * the card was being read left the reader waiting for a card.
   */
  const stopped = useRef(false);
  /** The reader is collecting the card (between processSetupIntent's start and its answer). */
  const reading = useRef(false);
  const terminalRef = useRef(terminal);
  const client = clientFirstName || 'the client';

  useEffect(() => {
    terminalRef.current = terminal;
  }, [terminal]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopped.current = true;
      // Leaving mid-question counts as stopping.
      resolver.current?.(null);
      resolver.current = null;
      // Leaving mid-read stops the reader too.
      if (reading.current) void terminalRef.current.cancelProcessSetupIntent?.()?.catch(() => undefined);
    };
  }, []);

  const ask = useCallback(
    (next: Step) =>
      new Promise<boolean | null>((resolve) => {
        // Stopped already: answer as staff stopping, so the save is cancelled rather than left open.
        if (stopped.current) {
          resolve(null);
          return;
        }
        resolver.current = resolve;
        if (mounted.current) setStep(next);
      }),
    [],
  );

  const answer = useCallback((value: boolean | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(value);
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    if (device === 'tap_to_pay') {
      const r = await tapToPay.connect(Platform.OS === 'ios' ? { tosAcceptancePermitted: isAdmin } : undefined);
      return r.ok ? null : r.error ?? 'The card reader could not be started.';
    }
    if (bluetooth.connected) return null;
    const ok = await bluetooth.reconnectRemembered();
    return ok ? null : READER_SAVE_COPY.noBluetooth;
  }, [device, tapToPay, bluetooth, isAdmin]);

  useEffect(() => {
    if (started.current || !accessToken) return;
    started.current = true;
    // The reader as the save sees it: once staff have stopped, nothing more is started on it (the
    // save is then cancelled on the server as a stop), and a read in progress can be cancelled.
    const CANCELED = { error: { code: 'CANCELED', message: 'Cancelled.' } };
    const guarded: ReaderSaveTerminal = {
      retrieveSetupIntent: (secret) =>
        stopped.current ? Promise.resolve(CANCELED) : terminal.retrieveSetupIntent(secret),
      processSetupIntent: async (params) => {
        if (stopped.current) return CANCELED;
        reading.current = true;
        try {
          return await terminal.processSetupIntent(params);
        } finally {
          reading.current = false;
        }
      },
      cancelProcessSetupIntent: terminal.cancelProcessSetupIntent,
    };
    void (async () => {
      let outcome: ReaderSaveResult;
      try {
        const failed = await connect();
        // Cancelled while the reader was getting ready: start nothing.
        if (stopped.current) return;
        if (failed) {
          outcome = { kind: 'failed', text: failed, save: null };
        } else {
          outcome = await runReaderSave(readerSaveApi(accessToken), guarded, { guestId, device }, {
            confirmBusinessOnly: async (question) => (await ask({ kind: 'question', text: question })) === true,
            askConsent: async (text) => {
              const handed = await ask({ kind: 'handTo', text });
              if (handed !== true) return null;
              return ask({ kind: 'ask', text });
            },
            onProgress: (text) => {
              if (mounted.current) setStep({ kind: 'reading', text });
            },
          });
        }
      } catch (error) {
        outcome = {
          kind: 'failed',
          text: error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.',
          save: null,
        };
      }
      if (!mounted.current) return;
      if (outcome.kind === 'saved') {
        hapticSuccess();
        onSaved?.();
      }
      setStep({ kind: 'outcome', result: outcome });
    })();
  }, [accessToken, ask, connect, device, guestId, onSaved, terminal]);

  const cancelReading = useCallback(() => {
    // Also covers the moment before the read starts: the guarded reader then starts nothing.
    stopped.current = true;
    void terminal.cancelProcessSetupIntent?.()?.catch(() => undefined);
  }, [terminal]);

  const cancelConnecting = useCallback(() => {
    stopped.current = true;
    onDone(false);
  }, [onDone]);

  return (
    <View style={styles.stack} testID="reader-save-flow">
      {step.kind === 'connecting' ? (
        <>
          <Text variant="bodySmall" accessibilityLiveRegion="polite">
            {READER_SAVE_COPY.connecting}
          </Text>
          <Button label="Cancel" variant="secondary" onPress={cancelConnecting} fullWidth />
        </>
      ) : null}

      {step.kind === 'question' ? (
        <>
          <Text variant="bodyMedium">{step.text}</Text>
          <Button label={READER_SAVE_COPY.saveAnother} onPress={() => answer(true)} fullWidth />
          <Button label="Cancel" variant="secondary" onPress={() => answer(false)} fullWidth />
        </>
      ) : null}

      {step.kind === 'handTo' ? (
        <>
          <Text variant="bodyMedium">{READER_SAVE_COPY.handTo(client)}</Text>
          <Button label={READER_SAVE_COPY.handedOver} onPress={() => answer(true)} fullWidth />
          <Button label="Cancel" variant="secondary" onPress={() => answer(null)} fullWidth />
        </>
      ) : null}

      {step.kind === 'ask' ? (
        <View style={styles.stack} accessibilityViewIsModal>
          <Text variant="title" accessibilityRole="header">
            {READER_SAVE_COPY.title}
          </Text>
          <Text variant="bodyMedium">{step.text}</Text>
          {/* Two buttons of equal size and weight: neither answer is pushed. */}
          <View style={styles.pair}>
            <View style={styles.half}>
              <Button label={READER_SAVE_COPY.agree} variant="secondary" size="lg" onPress={() => answer(true)} fullWidth />
            </View>
            <View style={styles.half}>
              <Button label={READER_SAVE_COPY.decline} variant="secondary" size="lg" onPress={() => answer(false)} fullWidth />
            </View>
          </View>
        </View>
      ) : null}

      {step.kind === 'reading' ? (
        <>
          <Text variant="bodyMedium" accessibilityLiveRegion="polite" testID="reader-save-progress">
            {step.text}
          </Text>
          <Button label="Cancel" variant="secondary" onPress={cancelReading} fullWidth />
        </>
      ) : null}

      {step.kind === 'outcome' ? (
        <>
          <Text
            variant="bodyMedium"
            tone={step.result.kind === 'saved' ? 'success' : step.result.kind === 'failed' ? 'danger' : 'default'}
            accessibilityLiveRegion="polite"
            testID="reader-save-outcome">
            {step.result.text}
          </Text>
          <Button label="Done" onPress={() => onDone(step.result.kind === 'saved')} fullWidth />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  pair: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { getStripePublishableKey } from '@/lib/env';
import { useBluetoothReader } from '@/lib/payments/bluetoothReader';
import { isTerminalSdkAvailable } from '@/lib/payments/terminal-sdk';
import { spacing } from '@/theme/index';
import { useTheme } from '@/theme/useTheme';

/**
 * Card reader management (Tap to Pay design doc §7A.7): pair a Bluetooth
 * reader, see its battery and firmware state, and forget it — all outside a
 * live payment. Opened from Settings; the in-payment pairing path lives inside
 * `TakePaymentSheet` as a mode step (iOS will not reliably present a modal from
 * inside another modal).
 *
 * The body is split out so the Terminal SDK hook is only ever called when the
 * SDK is genuinely available on this build.
 *
 * The availability test must match `TakePaymentSheet`'s and `TerminalProvider`'s
 * EXACTLY — native module AND publishable key. This one checked the module
 * alone, so a build carrying the module but no key (which the production EAS
 * profile was, see Docs/GO_LIVE_CHECK.md §1.1) would open the sheet, run a
 * scan, and fail at connection-token time on something that looks like a
 * hardware fault. Whatever the reader path can't honour, it shouldn't offer.
 */
export function ReaderSettingsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const sdkPresent = isTerminalSdkAvailable();
  const keyPresent = Boolean(getStripePublishableKey());
  const available = sdkPresent && keyPresent;
  return (
    <Sheet visible={visible} onClose={onClose}>
      {visible && available ? (
        <ReaderSettingsBody onClose={onClose} />
      ) : (
        <View style={styles.body}>
          <Text variant="title">Card reader</Text>
          <Text variant="bodySmall" tone="muted">
            In-person card payments are not available on this version of the app. Update the app
            from the App Store or Google Play to pair a reader.
          </Text>
          {/* The copy above is written for a real user on a stale store build,
              who can only act by updating. In development it would send you
              chasing the wrong thing, so name the actual cause. */}
          {__DEV__ ? (
            <Text variant="caption" tone="muted">
              {sdkPresent
                ? 'Dev: the native Terminal module is present but this build has no EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, so the Terminal provider never mounts.'
                : 'Dev: the native Terminal module is missing — Expo Go cannot load it. Use the dev-client or a preview build.'}
            </Text>
          ) : null}
          <Button label="Close" variant="secondary" onPress={onClose} fullWidth />
        </View>
      )}
    </Sheet>
  );
}

function ReaderSettingsBody({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const reader = useBluetoothReader();

  // Try the remembered reader first so the common case needs no picker.
  useEffect(() => {
    void reader.reconnectRemembered();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scanning = reader.status === 'scanning';
  const connecting = reader.status === 'connecting';
  const updating = reader.status === 'updating';
  const busy = scanning || connecting || updating;

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <Text variant="overline" tone="muted">
          In-person payments
        </Text>
        <Text variant="title">Card reader</Text>
        <Text variant="bodySmall" tone="muted">
          Pair a Bluetooth card reader to take chip and contactless payments, including PIN.
        </Text>
      </View>

      {reader.connected ? (
        <View style={styles.status}>
          <Text variant="bodyMedium">
            Connected: {reader.connected.label?.trim() || reader.connected.serialNumber}
          </Text>
          {reader.batteryLevel != null ? (
            <Text
              variant="caption"
              color={reader.batteryLow ? colors.warning : colors.textMuted}>
              Battery {Math.round(reader.batteryLevel * 100)}%
              {reader.batteryLow ? ' · charge it soon' : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      {updating ? (
        <Text variant="bodySmall" tone="muted">
          Updating your reader. Keep it nearby and switched on. This can take a few minutes.
          {reader.updateProgress != null
            ? ` ${Math.round(reader.updateProgress * 100)}%`
            : ''}
        </Text>
      ) : null}

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
            disabled={busy}
            onPress={() => void reader.connect(r)}
            fullWidth
          />
        ))}
        <Button
          label={reader.discovered.length > 0 ? 'Scan again' : 'Find a reader'}
          variant={reader.discovered.length > 0 ? 'ghost' : 'primary'}
          loading={scanning}
          disabled={busy}
          onPress={() => void reader.scan()}
          fullWidth
        />
        {reader.connected ? (
          <Button
            label="Forget this reader"
            variant="ghost"
            disabled={busy}
            onPress={() => void reader.forget()}
            fullWidth
          />
        ) : null}
        <Button label="Close" variant="secondary" onPress={onClose} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  status: {
    gap: spacing.xs,
  },
  buttons: {
    gap: spacing.sm,
  },
});

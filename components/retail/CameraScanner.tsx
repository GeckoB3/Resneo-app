import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePosT } from '@/components/pos/parts';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { acceptScan, NEW_SCAN_GATE, PRODUCT_BARCODE_TYPES, type ScanGate } from '@/lib/retail/scan';
import { AppLockCover } from '@/providers/AppLockProvider';
import { radius, spacing } from '@/theme/index';

/**
 * Scanning with the phone's camera (POS app step 4 over the air, UX spec §13.6 "Camera scanning";
 * app step 5 adds pickup codes, §13.7). `expo-camera` with barcode scanning has been in the
 * binaries since 1.1.2, so this needs no store build; the permission prompt shows the purpose
 * string those binaries carry.
 *
 * A full-screen camera with the hint (`app.scan.hint`), a torch (`app.scan.torch`) and Cancel.
 * - Before the phone has been asked, the plain sentence `app.scan.permission` and a button that
 *   asks. When the person said no and the phone will not ask again, `app.scan.denied` and a
 *   button to the phone's settings. Typing the code always still works where the field is.
 * - `single`: the first code closes the camera and is handed back.
 * - `continuous`: codes keep coming (stocktakes, deliveries, a basket of products), each taken
 *   once while it stays in view (`lib/retail/scan.ts`); the caller's `message` shows what happened
 *   to the last one, and the caller plays the haptics, as it does for a keyboard-mode scanner.
 *   `paused` stops taking codes while the caller is busy with the last one.
 *
 * Rendered as a Modal inside the caller's tree, so it opens over a sheet as well as a screen.
 */

export type ScanMessage = { tone: 'success' | 'warning' | 'error' | 'info'; text: string } | null;

export function CameraScanner({
  visible,
  onClose,
  onScan,
  mode = 'single',
  title,
  hint,
  message = null,
  paused = false,
  barcodeTypes = PRODUCT_BARCODE_TYPES,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  mode?: 'single' | 'continuous';
  title?: string;
  hint?: string;
  message?: ScanMessage;
  paused?: boolean;
  barcodeTypes?: readonly BarcodeType[];
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <WindowInsets>
        {visible ? (
          <ScannerBody
            onClose={onClose}
            onScan={onScan}
            mode={mode}
            title={title}
            hint={hint}
            message={message}
            paused={paused}
            barcodeTypes={barcodeTypes}
          />
        ) : null}
        <AppLockCover />
      </WindowInsets>
    </Modal>
  );
}

/** Android reads insets from the Modal's own window; iOS keeps the root's (see `Sheet`). */
function WindowInsets({ children }: { children: ReactNode }) {
  if (Platform.OS === 'android') return <SafeAreaProvider style={styles.root}>{children}</SafeAreaProvider>;
  return <View style={styles.root}>{children}</View>;
}

function ScannerBody({
  onClose,
  onScan,
  mode,
  title,
  hint,
  message,
  paused,
  barcodeTypes,
}: {
  onClose: () => void;
  onScan: (code: string) => void;
  mode: 'single' | 'continuous';
  title?: string;
  hint?: string;
  message: ScanMessage;
  paused: boolean;
  barcodeTypes: readonly BarcodeType[];
}) {
  const t = usePosT();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [failed, setFailed] = useState(false);
  const gate = useRef<ScanGate>(NEW_SCAN_GATE);
  const done = useRef(false);

  // Ask once on opening when the phone may still ask: the person chose to scan.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && permission.status === 'undetermined') {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  function handleScan(result: BarcodeScanningResult) {
    if (done.current || paused) return;
    const { accept, gate: next } = acceptScan(gate.current, result.data ?? '', Date.now());
    gate.current = next;
    if (!accept) return;
    if (mode === 'single') {
      done.current = true;
      onScan(next.lastCode ?? '');
      onClose();
      return;
    }
    onScan(next.lastCode ?? '');
  }

  const granted = permission?.granted === true;
  const denied = permission != null && !permission.granted && !permission.canAskAgain;

  return (
    <View style={[styles.root, styles.dark]}>
      {granted && !failed ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
          onBarcodeScanned={paused ? undefined : handleScan}
          onMountError={() => setFailed(true)}
        />
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <Text variant="subheading" color="#FFFFFF" style={styles.flex} accessibilityRole="header">
          {title ?? t('app.scan.title')}
        </Text>
        {granted && !failed ? (
          <IconButton
            icon={{ ios: torch ? 'flashlight.on.fill' : 'flashlight.off.fill', android: torch ? 'flashlight_on' : 'flashlight_off', web: 'flashlight_on' }}
            accessibilityLabel={t('app.scan.torch')}
            active={torch}
            tint="#FFFFFF"
            onPress={() => setTorch((v) => !v)}
          />
        ) : null}
      </View>

      {granted && !failed ? (
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
        </View>
      ) : (
        <View style={styles.center}>
          {failed ? (
            <Text variant="body" color="#FFFFFF" style={styles.centerText}>
              {t('app.scan.cameraFailed')}
            </Text>
          ) : denied ? (
            <>
              <Text variant="body" color="#FFFFFF" style={styles.centerText}>
                {t('app.scan.denied')}
              </Text>
              <Button label={t('app.scan.settings')} variant="secondary" onPress={() => void Linking.openSettings()} />
            </>
          ) : permission ? (
            <>
              <Text variant="body" color="#FFFFFF" style={styles.centerText}>
                {t('app.scan.permission')}
              </Text>
              <Button label={t('app.scan.allow')} onPress={() => void requestPermission()} />
            </>
          ) : null}
        </View>
      )}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.base }]}>
        {granted && !failed ? (
          <Text variant="bodySmall" color="#FFFFFF" style={styles.centerText}>
            {hint ?? t('app.scan.hint')}
          </Text>
        ) : null}
        {message ? (
          <View
            style={[styles.message, message.tone === 'success' ? styles.ok : message.tone === 'info' ? styles.info : styles.warn]}
            accessibilityLiveRegion="polite"
            accessibilityRole={message.tone === 'error' ? 'alert' : undefined}>
            <Text variant="bodyMedium" color="#FFFFFF">
              {message.text}
            </Text>
          </View>
        ) : null}
        <Button
          label={mode === 'continuous' ? t('app.scan.done') : t('common.cancel')}
          variant="secondary"
          onPress={onClose}
          fullWidth
        />
      </View>
    </View>
  );
}

/** The camera button beside a field that takes a code. Not offered in the web preview. */
export function ScanButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const t = usePosT();
  if (Platform.OS === 'web') return null;
  return (
    <IconButton
      icon={{ ios: 'barcode.viewfinder', android: 'barcode_scanner', web: 'qr_code_scanner' }}
      accessibilityLabel={label ?? t('app.scan.title')}
      variant="bordered"
      onPress={onPress}
    />
  );
}

/** Whether this build can offer camera scanning (not in the web preview). */
export const cameraScanAvailable = Platform.OS !== 'web';

const styles = StyleSheet.create({
  root: { flex: 1 },
  dark: { backgroundColor: '#000000' },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: '78%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radius.lg,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  centerText: { textAlign: 'center' },
  bottom: {
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  message: { borderRadius: radius.md, padding: spacing.md },
  ok: { backgroundColor: 'rgba(22, 128, 61, 0.92)' },
  info: { backgroundColor: 'rgba(0, 59, 111, 0.92)' },
  warn: { backgroundColor: 'rgba(180, 83, 9, 0.94)' },
});

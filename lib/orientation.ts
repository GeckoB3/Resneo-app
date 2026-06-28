/**
 * Per-device orientation policy.
 *
 * Product decision: TABLETS rotate freely (portrait + landscape) so the
 * calendar and other wide layouts can be used either way; PHONES stay locked to
 * portrait (their screens aren't designed for landscape).
 *
 * Expo's `app.json` `orientation` key is global (it can't distinguish a phone
 * from a tablet) and there is no `android.screenOrientation` config key, so the
 * per-device behaviour is applied at RUNTIME. `app.json` sets
 * `orientation: "default"` and the `expo-screen-orientation` config plugin's
 * `initialOrientation: "DEFAULT"` so the OS *permits* rotation on both idioms;
 * this hook then narrows it: phones → portrait-up, tablets → unlocked.
 *
 * NOTE: `expo-screen-orientation` is a native module — these changes only take
 * effect after a fresh native build (EAS / dev-client), not over JS-only OTA.
 */
import { useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';

import { captureException } from '@/lib/observability';
import { isTabletDimensions } from '@/lib/responsive';

/**
 * Lock phones to portrait and leave tablets free to rotate. Runs once on mount.
 * Device type never changes at runtime, so a single pass is enough. All calls
 * are wrapped so a failure (or web, where locking is unsupported) is a no-op and
 * never blocks startup.
 */
export function useDeviceOrientationLock(): void {
  useEffect(() => {
    // Web preview is light-only and the lock APIs are unreliable in browsers.
    if (Platform.OS === 'web') return;

    let cancelled = false;
    void (async () => {
      try {
        const deviceType = await Device.getDeviceTypeAsync();
        if (cancelled) return;
        // `getDeviceTypeAsync` classifies Android SOLELY by screen diagonal and
        // the docs warn it "may not be completely accurate" — a genuine small
        // (~7") tablet can come back UNKNOWN/PHONE. OR in a dimensions heuristic
        // (short edge ≥ 600dp, orientation-independent) so those still rotate.
        const { width, height } = Dimensions.get('window');
        const isTablet =
          deviceType === Device.DeviceType.TABLET || isTabletDimensions(width, height);
        if (isTablet) {
          // Allow all orientations the plist permits (portrait + both landscapes).
          await ScreenOrientation.unlockAsync();
        } else {
          // Phones (and unknown/desktop) stay upright.
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (error) {
        captureException(error, { scope: 'orientation' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}

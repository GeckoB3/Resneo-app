import { Platform } from 'react-native';

import {
  currentDeviceFacts,
  deviceCanUseTapToPay,
  type DeviceFacts,
} from '@/lib/payments/tap-to-pay-device';

/**
 * Whether THIS BUILD can use the phone's own NFC as the card reader.
 *
 * Distinct from `useTapToPayReader().supported`, which asks the Stripe SDK
 * whether the DEVICE is capable. This asks whether the build is even allowed to
 * try — a question the SDK cannot answer, because on iOS the answer lives in the
 * signed entitlements rather than in the hardware.
 *
 * ---------------------------------------------------------------------------
 * iOS is ON from 1.2.0. Apple granted the DISTRIBUTION entitlement for Tap to
 * Pay on iPhone (`com.apple.developer.proximity-reader.payment.acceptance`) on
 * 2026-10-01, so it is in `app.json` `ios.entitlements` for every build.
 *
 * This flag and the entitlement move TOGETHER, and only with a version bump.
 * The flag is inlined into every OTA bundle, and under the `appVersion` runtime
 * policy a bundle reaches only installs of its own version. iOS 1.1.2 and
 * earlier have no entitlement, so they must never receive a bundle where this
 * is true: an iOS fix for them is published from a branch cut before the 1.2.0
 * bump, where this flag is still off.
 *
 * Before 1.2.0 the grant was development-only (Case-ID 21181959, 2026-08). EAS
 * signs internal builds with Ad Hoc profiles, which that grant did not cover,
 * so the flag came from `EXPO_PUBLIC_TAP_TO_PAY_IOS` on a local Xcode build's
 * command line. That lever is gone.
 *
 * Android is unaffected: the Apple entitlement is an iOS-only key, and the
 * Android half rides on the Stripe plugin's `tapToPayCheck` prop.
 * ---------------------------------------------------------------------------
 */
export const TAP_TO_PAY_IOS_ENABLED = true;

/**
 * May this build, on this device, offer Tap to Pay at all?
 *
 * iOS needs both the entitled build and an iPhone that can do it (XS or later,
 * never an iPad; see `tap-to-pay-device.ts`). Every non-iOS platform is allowed
 * through: Android is fully entitled and its SDK probe decides the device, and
 * web never reaches here (the Terminal SDK is stubbed out of the web bundle).
 *
 * `platform` and `device` are injectable so this is testable without mocking
 * `Platform` or `expo-device`.
 */
export function buildSupportsTapToPay(
  platform: string = Platform.OS,
  device: DeviceFacts | null = null,
): boolean {
  if (platform !== 'ios') return true;
  if (!TAP_TO_PAY_IOS_ENABLED) return false;
  return deviceCanUseTapToPay(device ?? currentDeviceFacts());
}

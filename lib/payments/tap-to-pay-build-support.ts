import { Platform } from 'react-native';

/**
 * Whether THIS BUILD can use the phone's own NFC as the card reader.
 *
 * Distinct from `useTapToPayReader().supported`, which asks the Stripe SDK
 * whether the DEVICE is capable. This asks whether the build is even allowed to
 * try — a question the SDK cannot answer, because on iOS the answer lives in the
 * signed entitlements rather than in the hardware.
 *
 * ---------------------------------------------------------------------------
 * iOS is currently OFF. Apple granted the Tap to Pay entitlement
 * (`com.apple.developer.proximity-reader.payment.acceptance`) with a
 * **development distribution restriction** (Case-ID 21181959, 2026-08). EAS
 * Build signs internal-distribution builds with Ad Hoc provisioning profiles,
 * and Apple does not put the entitlement into an Ad Hoc profile — verified by
 * inspecting the generated profile, whose Entitlements dict carries
 * `aps-environment` and `associated-domains` but not the proximity-reader key.
 * So the iOS build cannot even archive while it declares the entitlement.
 *
 * Until Apple grants distribution, iOS ships **Bluetooth-reader only** (the
 * WisePad 3 needs no Apple entitlement) and `ios.entitlements` is absent from
 * `app.json`. Android is unaffected and keeps full Tap to Pay: the Apple
 * entitlement is an iOS-only key, and the Android half of the feature rides on
 * the Stripe plugin's `tapToPayCheck` prop, which stays set.
 *
 * TO RE-ENABLE once Apple approves distribution: restore the `ios.entitlements`
 * block in `app.json` AND flip this to `true`. Both, together — the entitlement
 * alone would offer a button that cannot work, and this flag alone would archive
 * a build that Apple rejects.
 * ---------------------------------------------------------------------------
 */
export const TAP_TO_PAY_IOS_ENABLED = false;

/**
 * `platform` is injectable so this is testable without mocking `Platform`.
 * Every non-iOS platform is allowed through: Android is fully entitled, and web
 * never reaches here (the Terminal SDK is stubbed out of the web bundle).
 */
export function buildSupportsTapToPay(platform: string = Platform.OS): boolean {
  if (platform === 'ios') return TAP_TO_PAY_IOS_ENABLED;
  return true;
}

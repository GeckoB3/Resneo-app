import {
  TAP_TO_PAY_IOS_ENABLED,
  buildSupportsTapToPay,
} from '@/lib/payments/tap-to-pay-build-support';

/**
 * Build-level Tap to Pay gate. Separate from the SDK's device-capability check:
 * this one answers "is this build allowed to try", which on iOS depends on the
 * signed entitlement rather than the hardware.
 */

describe('buildSupportsTapToPay', () => {
  it('allows Android — the Apple entitlement is an iOS-only key', () => {
    // Android Tap to Pay is live in production and must not be affected by the
    // iOS entitlement situation.
    expect(buildSupportsTapToPay('android')).toBe(true);
  });

  it('follows the iOS flag on iOS', () => {
    expect(buildSupportsTapToPay('ios')).toBe(TAP_TO_PAY_IOS_ENABLED);
  });

  it('is currently OFF for iOS (Apple Case-ID 21181959)', () => {
    // Pins the shipped state deliberately: this test is expected to be updated
    // in the SAME commit that restores `ios.entitlements` to app.json.
    expect(buildSupportsTapToPay('ios')).toBe(false);
  });

  it('does not block any other platform', () => {
    expect(buildSupportsTapToPay('web')).toBe(true);
    expect(buildSupportsTapToPay('macos')).toBe(true);
  });
});

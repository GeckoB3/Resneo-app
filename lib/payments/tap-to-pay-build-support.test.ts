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

  it('is ON for iOS from 1.2.0, in step with ios.entitlements in app.json', () => {
    // Pins the shipped state: the flag and the entitlement move together, and
    // only with a version bump (see the note on TAP_TO_PAY_IOS_ENABLED).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appJson = require('../../app.json') as {
      expo: { ios: { entitlements?: Record<string, unknown> } };
    };
    expect(TAP_TO_PAY_IOS_ENABLED).toBe(true);
    expect(
      appJson.expo.ios.entitlements?.['com.apple.developer.proximity-reader.payment.acceptance'],
    ).toBe(true);
  });

  it('lets an iPhone XS or later through on iOS', () => {
    expect(
      buildSupportsTapToPay('ios', { platform: 'ios', isPad: false, modelId: 'iPhone11,8' }),
    ).toBe(true);
  });

  it('never lets an iPad or an older iPhone through, whatever the flag', () => {
    expect(buildSupportsTapToPay('ios', { platform: 'ios', isPad: true, modelId: 'iPad13,18' })).toBe(
      false,
    );
    expect(
      buildSupportsTapToPay('ios', { platform: 'ios', isPad: false, modelId: 'iPhone10,6' }),
    ).toBe(false);
  });

  it('does not block any other platform', () => {
    expect(buildSupportsTapToPay('web')).toBe(true);
    expect(buildSupportsTapToPay('macos')).toBe(true);
  });
});

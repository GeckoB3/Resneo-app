/**
 * Stripe's Tap to Pay screen on Android in client-mode colours (POS test round 2026-10-11, Part 3):
 * applied once, always dark (beta.33 turns a missing value into LIGHT), never on iOS, and never able
 * to hold up or break a payment.
 */
import { Platform } from 'react-native';

import { __resetTapToPayUxForTests, ANDROID_TAP_TO_PAY_UX, applyTapToPayUx } from '@/lib/payments/tap-to-pay-ux';

describe('applyTapToPayUx', () => {
  beforeEach(() => __resetTapToPayUxForTests());
  afterEach(() => jest.restoreAllMocks());

  it('styles the Android tap screen once, dark with ResNeo teal', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const setTapToPayUxConfiguration = jest.fn(async () => ({}));
    await applyTapToPayUx({ setTapToPayUxConfiguration });
    await applyTapToPayUx({ setTapToPayUxConfiguration });
    expect(setTapToPayUxConfiguration).toHaveBeenCalledTimes(1);
    expect(setTapToPayUxConfiguration).toHaveBeenCalledWith(ANDROID_TAP_TO_PAY_UX);
    expect(ANDROID_TAP_TO_PAY_UX.darkMode).toBe('dark');
    expect(ANDROID_TAP_TO_PAY_UX.colors?.primary).toBe('#00C2C7');
  });

  it('does nothing on iPhone, where Apple styles its own sheet', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const setTapToPayUxConfiguration = jest.fn(async () => ({}));
    await applyTapToPayUx({ setTapToPayUxConfiguration });
    expect(setTapToPayUxConfiguration).not.toHaveBeenCalled();
  });

  it('swallows a throw before the SDK is ready, and tries again next time', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const setTapToPayUxConfiguration = jest
      .fn()
      .mockRejectedValueOnce(new Error('First initialize the Stripe Terminal SDK'))
      .mockResolvedValueOnce({});
    await expect(applyTapToPayUx({ setTapToPayUxConfiguration })).resolves.toBeUndefined();
    await applyTapToPayUx({ setTapToPayUxConfiguration });
    expect(setTapToPayUxConfiguration).toHaveBeenCalledTimes(2);
  });

  it('does nothing on a build whose SDK lacks the call', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await expect(applyTapToPayUx({})).resolves.toBeUndefined();
  });
});

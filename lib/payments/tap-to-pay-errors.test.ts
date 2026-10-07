import {
  TAP_TO_PAY_UPDATE_IOS_MESSAGE,
  classifyTapToPayError,
  iosOlderThanTapToPayFloor,
  isOsVersionNotSupported,
  tapToPayFailureMessage,
} from '@/lib/payments/tap-to-pay-errors';

describe('classifyTapToPayError', () => {
  it.each([
    ['3930', 'terms_not_accepted'],
    ['2970', 'terms_cancelled'],
    ['2960', 'icloud_required'],
    ['3940', 'terms_failed'],
    ['2920', 'passcode_required'],
    ['2930', 'phone_call_active'],
    ['2910', 'device_unsupported'],
    ['3920', 'device_banned'],
    ['3950', 'merchant_blocked'],
  ])('maps SCPError %s to %s', (native, reason) => {
    expect(classifyTapToPayError({ nativeErrorCode: native })).toBe(reason);
  });

  it('leaves everything else unclassified', () => {
    expect(classifyTapToPayError({ nativeErrorCode: '9999' })).toBeNull();
    expect(classifyTapToPayError(undefined)).toBeNull();
    expect(classifyTapToPayError({} as never)).toBeNull();
  });
});

describe('tapToPayFailureMessage', () => {
  it('tells staff how to fix a missing passcode, and where', () => {
    expect(tapToPayFailureMessage('passcode_required', false)).toMatch(/passcode.*Face ID & Passcode/);
  });

  it('points an unsupported or blocked phone at the card reader', () => {
    expect(tapToPayFailureMessage('device_unsupported', true)).toMatch(/card reader/);
    expect(tapToPayFailureMessage('merchant_blocked', true)).toMatch(/support.*card reader/);
  });

  it('tells a non-admin to ask an admin (Apple 3.8.1)', () => {
    expect(tapToPayFailureMessage('terms_not_accepted', false)).toMatch(/Ask an admin/);
    expect(tapToPayFailureMessage('terms_not_accepted', true)).not.toMatch(/Ask an admin/);
  });

  it('uses Apple’s name for the feature verbatim', () => {
    expect(tapToPayFailureMessage('icloud_required', true)).toContain('Tap to Pay on iPhone');
  });
});

describe('Apple 1.4: OS version not supported', () => {
  it('recognises the error wrapped by Stripe (underlyingError)', () => {
    expect(
      isOsVersionNotSupported({
        nativeErrorCode: '3910',
        underlyingError: { code: '7', iosDomain: 'SCPTapToPayReaderErrorDomain' },
      }),
    ).toBe(true);
  });

  it('recognises it unwrapped, as a "domain:code" native code', () => {
    expect(isOsVersionNotSupported({ nativeErrorCode: 'SCPTapToPayReaderErrorDomain:7' })).toBe(true);
  });

  it('recognises Stripe’s wording as a last resort', () => {
    expect(isOsVersionNotSupported({ message: 'The current OS version is not supported.' })).toBe(true);
  });

  it('does not mistake another Tap to Pay error, or code 7 from elsewhere, for it', () => {
    expect(
      isOsVersionNotSupported({ underlyingError: { code: '8', iosDomain: 'SCPTapToPayReaderErrorDomain' } }),
    ).toBe(false);
    expect(isOsVersionNotSupported({ underlyingError: { code: '7', iosDomain: 'NSURLErrorDomain' } })).toBe(false);
    expect(isOsVersionNotSupported(undefined)).toBe(false);
  });

  it('classifies it with a message that says to update iOS, and where', () => {
    expect(
      classifyTapToPayError({
        nativeErrorCode: '3910',
        underlyingError: { code: '7', iosDomain: 'SCPTapToPayReaderErrorDomain' },
      }),
    ).toBe('os_update_required');
    expect(tapToPayFailureMessage('os_update_required', false)).toBe(TAP_TO_PAY_UPDATE_IOS_MESSAGE);
    expect(TAP_TO_PAY_UPDATE_IOS_MESSAGE).toMatch(/Settings → General → Software Update/);
  });

  it('treats iOS before 17.6 as needing an update', () => {
    expect(iosOlderThanTapToPayFloor('ios', '17.5.1')).toBe(true);
    expect(iosOlderThanTapToPayFloor('ios', '16.7')).toBe(true);
    expect(iosOlderThanTapToPayFloor('ios', '17.6')).toBe(false);
    expect(iosOlderThanTapToPayFloor('ios', '18.7')).toBe(false);
    expect(iosOlderThanTapToPayFloor('android', '14')).toBe(false);
  });
});

import { androidPermissionMessage } from '@/lib/payments/terminal-sdk';

/**
 * The Stripe SDK's Android permission helper ALWAYS resolves an object with an
 * `error` key, setting it to `null` on success. The caller used to test
 * `'error' in result`, which is key presence and therefore always true, so a
 * fully granted device was reported as refused and Tap to Pay could never work
 * on Android. The granted case below is the test that was missing.
 */
describe('androidPermissionMessage', () => {
  it('returns null when everything was granted', () => {
    expect(androidPermissionMessage({ error: null })).toBeNull();
  });

  it('returns null for an empty error object', () => {
    expect(androidPermissionMessage({ error: {} })).toBeNull();
  });

  it('returns null when the helper is unavailable', () => {
    expect(androidPermissionMessage(undefined)).toBeNull();
    expect(androidPermissionMessage(null)).toBeNull();
    expect(androidPermissionMessage({})).toBeNull();
  });

  it('names location when fine location was refused', () => {
    const msg = androidPermissionMessage({
      error: { 'android.permission.ACCESS_FINE_LOCATION': 'denied' },
    });
    expect(msg).toContain('Location permission');
    expect(msg).toContain('app settings');
  });

  it('names nearby devices when a Bluetooth permission was refused', () => {
    // Android 12+ needs BLUETOOTH_CONNECT/SCAN, granted under "Nearby devices",
    // for Tap to Pay as well as a reader. Reporting these as a location problem
    // sent staff to the wrong setting entirely.
    for (const key of [
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
    ]) {
      const msg = androidPermissionMessage({ error: { [key]: 'never_ask_again' } });
      expect(msg).toContain('Nearby devices');
      expect(msg).toContain('app settings');
    }
  });
});

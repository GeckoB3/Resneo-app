/**
 * Whether this Android device can use Tap to Pay: no when Android lists no NFC hardware (a tablet),
 * else the probe's definite answers, kept with the Android version they were given on, shared with
 * every reader, and never on iOS (whose support comes from the model and the warm-up).
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

// Android's feature list for this device: NFC by default, as on a phone.
let mockFeatures: string[] = ['android.hardware.nfc', 'android.hardware.wifi'];
jest.mock('expo-device', () => ({ getPlatformFeaturesAsync: jest.fn(async () => mockFeatures) }));
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));

import {
  __resetTapToPayDeviceSupportForTests,
  androidHasNfcHardware,
  loadTapToPayDeviceSupport,
  rememberTapToPayDeviceSupport,
  tapToPayDeviceSupport,
  tapToPayDeviceSupportLoaded,
  useTapToPayDeviceSupport,
} from '@/lib/payments/tap-to-pay-device-support';

const KEY = 'resneo_tap_to_pay_device_support';
const original = { OS: Platform.OS, Version: Platform.Version };

function on(os: string, version: string | number) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

beforeEach(() => {
  mockStore.clear();
  mockFeatures = ['android.hardware.nfc', 'android.hardware.wifi'];
  __resetTapToPayDeviceSupportForTests();
  on('android', 34);
});

afterAll(() => {
  on(original.OS, original.Version);
});

describe('the Tap to Pay answer for this device', () => {
  it('is unknown until the probe or an earlier launch gives one', async () => {
    expect(tapToPayDeviceSupport()).toBeNull();
    expect(await loadTapToPayDeviceSupport()).toBeNull();
    expect(tapToPayDeviceSupportLoaded()).toBe(true);
  });

  it("keeps the probe's answer for this launch and stores it with the Android version", async () => {
    rememberTapToPayDeviceSupport(false);
    expect(tapToPayDeviceSupport()).toBe(false);
    await act(async () => {});
    expect(JSON.parse(mockStore.get(KEY)!)).toEqual({ supported: false, os: '34' });
  });

  it('reads an earlier launch’s answer, so the probe need not run again', async () => {
    mockStore.set(KEY, JSON.stringify({ supported: false, os: '34' }));
    expect(await loadTapToPayDeviceSupport()).toBe(false);
    expect(tapToPayDeviceSupport()).toBe(false);
  });

  it('asks again after an Android update', async () => {
    mockStore.set(KEY, JSON.stringify({ supported: false, os: '33' }));
    expect(await loadTapToPayDeviceSupport()).toBeNull();
  });

  it('ignores something unreadable in the store', async () => {
    mockStore.set(KEY, 'not json');
    expect(await loadTapToPayDeviceSupport()).toBeNull();
  });

  it('lets a probe that answered during the store read win', async () => {
    mockStore.set(KEY, JSON.stringify({ supported: true, os: '34' }));
    const reading = loadTapToPayDeviceSupport();
    rememberTapToPayDeviceSupport(false);
    expect(await reading).toBe(false);
    expect(tapToPayDeviceSupport()).toBe(false);
  });

  it('re-renders whoever is watching when the answer arrives', async () => {
    const { result } = await renderHook(() => useTapToPayDeviceSupport());
    expect(result.current).toBeNull();
    await act(async () => {
      rememberTapToPayDeviceSupport(false);
    });
    expect(result.current).toBe(false);
  });

  it('says no for an Android device without NFC hardware, whatever Stripe could or could not say', async () => {
    // The Lenovo Tab P11 (TB-J616F): 77 features, none of them NFC, Developer options on.
    mockFeatures = ['android.hardware.wifi', 'android.hardware.bluetooth', 'android.hardware.touchscreen'];
    expect(await androidHasNfcHardware()).toBe(false);
    expect(await loadTapToPayDeviceSupport()).toBe(false);
    expect(tapToPayDeviceSupport()).toBe(false);
  });

  it('lets the missing hardware outrank a stored yes', async () => {
    mockFeatures = ['android.hardware.wifi'];
    mockStore.set(KEY, JSON.stringify({ supported: true, os: '34' }));
    expect(await loadTapToPayDeviceSupport()).toBe(false);
  });

  it('reads an empty feature list as "can\'t tell", never as a device without NFC', async () => {
    mockFeatures = [];
    expect(await androidHasNfcHardware()).toBeNull();
    expect(await loadTapToPayDeviceSupport()).toBeNull();
  });

  it('leaves a device with NFC to the probe', async () => {
    expect(await androidHasNfcHardware()).toBe(true);
    expect(await loadTapToPayDeviceSupport()).toBeNull();
  });

  it('is never kept or read on iOS', async () => {
    on('ios', '18.7');
    mockStore.set(KEY, JSON.stringify({ supported: false, os: '18.7' }));
    rememberTapToPayDeviceSupport(false);
    expect(tapToPayDeviceSupport()).toBeNull();
    expect(await loadTapToPayDeviceSupport()).toBeNull();
  });
});

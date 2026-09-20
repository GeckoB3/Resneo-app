import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { hapticError, hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/lib/haptics';

const mocked = Haptics as unknown as {
  impactAsync: jest.Mock;
  selectionAsync: jest.Mock;
  notificationAsync: jest.Mock;
  performAndroidHapticsAsync: jest.Mock;
};

function setPlatform(os: 'ios' | 'android', version: number | string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

const originalOS = Platform.OS;
const originalVersion = Platform.Version;

afterEach(() => {
  setPlatform(originalOS as 'ios' | 'android', originalVersion);
  jest.clearAllMocks();
});

describe('haptics respect the device settings', () => {
  it('on iOS uses the feedback generators, which the system silences when System Haptics is off', () => {
    setPlatform('ios', '17.0');
    hapticTap();
    hapticSelect();
    hapticSuccess();
    expect(mocked.impactAsync).toHaveBeenCalledWith('light');
    expect(mocked.selectionAsync).toHaveBeenCalled();
    expect(mocked.notificationAsync).toHaveBeenCalledWith('success');
    expect(mocked.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('on Android never touches the raw Vibrator path, which ignores the Touch feedback setting', () => {
    setPlatform('android', 34);
    hapticTap();
    hapticSelect();
    hapticSuccess();
    hapticWarning();
    hapticError();
    expect(mocked.impactAsync).not.toHaveBeenCalled();
    expect(mocked.selectionAsync).not.toHaveBeenCalled();
    expect(mocked.notificationAsync).not.toHaveBeenCalled();
    expect(mocked.performAndroidHapticsAsync.mock.calls.map((c) => c[0])).toEqual([
      'virtual-key',
      'clock-tick',
      'confirm',
      'long-press',
      'reject',
    ]);
  });

  it('on Android before API 30 falls back to constants that exist there', () => {
    setPlatform('android', 29);
    hapticSuccess();
    hapticError();
    expect(mocked.performAndroidHapticsAsync.mock.calls.map((c) => c[0])).toEqual([
      'virtual-key',
      'long-press',
    ]);
  });

  it('swallows a native rejection so a cue never breaks a flow', async () => {
    setPlatform('android', 34);
    mocked.performAndroidHapticsAsync.mockRejectedValueOnce(new Error('unsupported'));
    expect(() => hapticSuccess()).not.toThrow();
    await Promise.resolve();
  });
});

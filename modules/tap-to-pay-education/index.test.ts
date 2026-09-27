import { Platform } from 'react-native';

const mockNative = { isAvailable: jest.fn(() => true), showHowToTapAsync: jest.fn(async () => {}) };
let mockModule: typeof mockNative | null = mockNative;
jest.mock('expo', () => ({ requireOptionalNativeModule: () => mockModule }));

import {
  isAppleTapToPayEducationAvailable,
  showAppleTapToPayEducation,
} from '@/modules/tap-to-pay-education';

beforeEach(() => {
  mockModule = mockNative;
  mockNative.isAvailable.mockReturnValue(true);
  mockNative.showHowToTapAsync.mockReset();
  mockNative.showHowToTapAsync.mockResolvedValue(undefined);
});

describe('Apple Tap to Pay education', () => {
  it('shows Apple’s education where the module is present (iOS 18+)', async () => {
    expect(isAppleTapToPayEducationAvailable()).toBe(true);
    await expect(showAppleTapToPayEducation()).resolves.toBe(true);
  });

  it('reports false when Apple cannot provide it, so the app shows its own', async () => {
    mockNative.showHowToTapAsync.mockRejectedValue(new Error('networkUnavailable'));
    await expect(showAppleTapToPayEducation()).resolves.toBe(false);
  });

  it('is unavailable on an older iOS', async () => {
    mockNative.isAvailable.mockReturnValue(false);
    await expect(showAppleTapToPayEducation()).resolves.toBe(false);
    expect(mockNative.showHowToTapAsync).not.toHaveBeenCalled();
  });

  it('is unavailable in a binary without the module', async () => {
    mockModule = null;
    expect(isAppleTapToPayEducationAvailable()).toBe(false);
    await expect(showAppleTapToPayEducation()).resolves.toBe(false);
  });

  it('is unavailable on Android', () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      expect(isAppleTapToPayEducationAvailable()).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });
});

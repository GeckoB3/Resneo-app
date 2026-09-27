const mockFiles = new Set<string>();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(uri) })),
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async (uri: string) => {
    mockFiles.add(uri);
  }),
}));

import {
  hasSeenTapToPayIntro,
  markTapToPayIntroSeen,
} from '@/lib/payments/tap-to-pay-intro-store';

beforeEach(() => mockFiles.clear());

describe('Tap to Pay on iPhone introduction, seen-once flag', () => {
  it('is unseen until marked, then seen', async () => {
    await expect(hasSeenTapToPayIntro('u-1')).resolves.toBe(false);
    await markTapToPayIntroSeen('u-1');
    await expect(hasSeenTapToPayIntro('u-1')).resolves.toBe(true);
  });

  it('is kept per user, for a shared salon phone', async () => {
    await markTapToPayIntroSeen('u-1');
    await expect(hasSeenTapToPayIntro('u-2')).resolves.toBe(false);
  });

  it('keeps an odd user id inside its folder', async () => {
    await markTapToPayIntroSeen('../../evil');
    expect([...mockFiles][0]).toBe('file:///docs/tap-to-pay/intro-seen-______evil');
  });
});

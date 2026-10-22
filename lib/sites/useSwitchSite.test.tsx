/**
 * Switching site from the picker or All sites (web roles plan §6.2c, §6.7): everything tied to the
 * old site goes first, then its screens, then the new site's Today (or Plan) opens.
 */
import { act, renderHook } from '@testing-library/react-native';

const mockOrder: string[] = [];
let mockCanDismiss = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (href: string) => mockOrder.push(`open ${href}`),
    canDismiss: () => mockCanDismiss,
    dismissAll: () => mockOrder.push('dismiss'),
  }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import {
  __resetActiveSiteForTests,
  getChosenSiteId,
  noteActiveVenueId,
  onSiteChange,
  syncChosenSiteUser,
} from '@/lib/sites/active-site';
import { useSwitchSite } from '@/lib/sites/useSwitchSite';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mockOrder.length = 0;
  mockCanDismiss = true;
  __resetActiveSiteForTests();
  syncChosenSiteUser('user-1');
  onSiteChange(() => {
    mockOrder.push('let go of the old site');
  });
});

it('lets go of the old site, clears its screens, then opens Today at the new one', async () => {
  noteActiveVenueId(SITE_A);
  const { result } = await renderHook(() => useSwitchSite());
  await act(async () => {
    await result.current(SITE_B);
  });
  expect(getChosenSiteId()).toBe(SITE_B);
  expect(mockOrder).toEqual(['let go of the old site', 'dismiss', 'open /today']);
});

it('opens the Plan page after switching, for the Plan link', async () => {
  mockCanDismiss = false;
  const { result } = await renderHook(() => useSwitchSite());
  await act(async () => {
    await result.current(SITE_B, '/manage/plan' as never);
  });
  expect(mockOrder).toEqual(['let go of the old site', 'open /manage/plan']);
});

it('only opens Today when the phone already acts on that site', async () => {
  noteActiveVenueId(SITE_A);
  const { result } = await renderHook(() => useSwitchSite());
  await act(async () => {
    await result.current(SITE_A);
  });
  expect(getChosenSiteId()).toBeNull();
  expect(mockOrder).toEqual(['dismiss', 'open /today']);
});

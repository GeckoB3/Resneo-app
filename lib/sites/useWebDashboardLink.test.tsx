/**
 * The hook screens use for links into the web dashboard (web roles plan §6.2b): the venue the app
 * has loaded first, the site this phone acts on when none is loaded, and nothing for a link that is
 * not the dashboard's.
 */
import { renderHook } from '@testing-library/react-native';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@/lib/env', () => ({
  ...jest.requireActual<typeof import('@/lib/env')>('@/lib/env'),
  getWebUrl: () => 'https://web.example.test',
}));
let mockVenue: { id: string } | null = null;
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: mockVenue }) }));

import { __resetActiveSiteForTests, noteActiveVenueId } from '@/lib/sites/active-site';
import { useWebDashboardLink } from '@/lib/sites/useWebDashboardLink';

const LOADED = '33333333-3333-4333-8333-333333333333';
const ACTING = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  __resetActiveSiteForTests();
  mockVenue = null;
});

it('names the venue the app has loaded', async () => {
  mockVenue = { id: LOADED };
  noteActiveVenueId(ACTING);
  const { result } = await renderHook(() => useWebDashboardLink());
  expect(result.current('/dashboard/settings?tab=plan')).toBe(`/dashboard/settings?tab=plan&site=${LOADED}`);
  expect(result.current('https://web.example.test/dashboard')).toBe(`https://web.example.test/dashboard?site=${LOADED}`);
  expect(result.current('https://fallback.example.test/dashboard', 'https://fallback.example.test')).toBe(
    `https://fallback.example.test/dashboard?site=${LOADED}`,
  );
  expect(result.current('/book/glow-bar')).toBe('/book/glow-bar');
});

it('falls back to the site this phone acts on, and to nothing', async () => {
  const { result } = await renderHook(() => useWebDashboardLink());
  expect(result.current('/dashboard')).toBe('/dashboard');
  noteActiveVenueId(ACTING);
  expect(result.current('/dashboard')).toBe(`/dashboard?site=${ACTING}`);
});

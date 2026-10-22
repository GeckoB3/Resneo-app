/**
 * The linked venue belongs to the site it was chosen at (web roles plan §6.2c): a switch clears
 * it, and it is kept per site in SecureStore.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) },
  }),
}));

import { __resetActiveSiteForTests, setChosenSite, syncChosenSiteUser } from '@/lib/sites/active-site';
import { LinkedVenueProvider, useLinkedVenueContext } from '@/providers/LinkedVenueProvider';

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

function Probe() {
  const ctx = useLinkedVenueContext();
  return (
    <>
      <Text testID="owner">{ctx.ownerVenueId ?? 'none'}</Text>
      <Text onPress={() => ctx.setOwnerVenueId('owner-venue-1', 'Chair at Northside')}>Choose linked venue</Text>
    </>
  );
}

beforeEach(() => {
  mockStore.clear();
  __resetActiveSiteForTests();
  syncChosenSiteUser('user-1');
});

it('clears the linked venue when the phone switches site', async () => {
  await act(async () => {
    await setChosenSite(SITE_A);
  });
  await render(
    <LinkedVenueProvider>
      <Probe />
    </LinkedVenueProvider>,
  );
  await act(async () => {
    fireEvent.press(screen.getByText('Choose linked venue'));
  });
  expect(screen.getByTestId('owner').props.children).toBe('owner-venue-1');
  expect(mockStore.has(`reserveni.linked.ownerVenue.${SITE_A}`)).toBe(true);

  await act(async () => {
    await setChosenSite(SITE_B);
  });
  expect(screen.getByTestId('owner').props.children).toBe('none');
  // Site A's own choice is left where it was; only the site switched to starts clear.
  expect(mockStore.has(`reserveni.linked.ownerVenue.${SITE_B}`)).toBe(false);
});

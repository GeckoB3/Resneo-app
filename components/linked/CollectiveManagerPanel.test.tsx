/**
 * Manage combined page on shared services (CQ-10.4, R2-22): Page and About only, with a card at the
 * foot of Page that opens Manage Collective on Venues. Before this it showed Services and Members for
 * every collective: Make host there is refused on shared services, and its Dissolve asked for no
 * typed name. An older collective keeps all four tabs.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { CollectiveView } from '@/types/collectives';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
// Each tab's content has its own tests; here they only say which one shows.
jest.mock('@/components/linked/CollectiveCatalogueBuilder', () => {
  const { Text } = require('react-native');
  return { CollectiveCatalogueBuilder: () => <Text>Catalogue builder</Text> };
});
jest.mock('@/components/linked/CollectiveMembersPanel', () => {
  const { Text } = require('react-native');
  return { CollectiveMembersPanel: () => <Text>Members panel</Text> };
});
jest.mock('@/components/linked/CombinedPageAboutSection', () => {
  const { Text } = require('react-native');
  return { CombinedPageAboutSection: () => <Text>About section</Text> };
});
jest.mock('@/components/linked/CombinedPageAddressRow', () => ({ CombinedPageAddressRow: () => null }));
jest.mock('@/components/linked/CombinedPageConfigEditor', () => ({ CombinedPageConfigEditor: () => null }));
jest.mock('@/components/linked/CombinedPageNameSection', () => {
  const { Text } = require('react-native');
  return { CombinedPageNameSection: () => <Text>Name section</Text> };
});

import { CollectiveManagerPanel } from './CollectiveManagerPanel';

function collective(serviceModel: string): CollectiveView {
  return {
    id: 'col-1',
    slug: 'plus-1',
    name: 'Plus 1',
    status: 'active',
    branding: {},
    serviceGrouping: 'by_practitioner',
    allowAnyPractitioner: true,
    pageMode: 'unified_catalog',
    slugStrategy: 'dedicated',
    adoptedVenueId: null,
    timezone: 'Europe/London',
    bookingPageConfig: null,
    isHost: true,
    hostVenueId: 'v-host',
    serviceModel,
    myVenueId: 'v-host',
    myMembershipStatus: 'active',
    myConfig: null,
    members: [],
    activeMemberCount: 3,
  };
}

const panel = (c: CollectiveView, initialTab?: 'page' | 'services' | 'about' | 'members') => (
  <CollectiveManagerPanel collective={c} eligibleLinks={[]} onChanged={jest.fn()} onDissolved={jest.fn()} initialTab={initialTab} />
);

beforeEach(() => mockPush.mockReset());

describe('CollectiveManagerPanel', () => {
  it('opens the Page tab on the names, for a host on either model (CQ-10.10)', async () => {
    const shared = await render(panel(collective('replicas')));
    expect(screen.getByText('Name section')).toBeTruthy();
    await shared.unmount();
    await render(panel(collective('legacy_copies')));
    expect(screen.getByText('Name section')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('tab', { name: 'About' }));
    });
    expect(screen.queryByText('Name section')).toBeNull();
  });

  it('never shows the names to a venue that is not the host', async () => {
    await render(panel({ ...collective('replicas'), isHost: false }));
    expect(screen.queryByText('Name section')).toBeNull();
  });

  it('shows Page and About only on shared services, with the way to Manage Collective', async () => {
    await render(panel(collective('replicas')));
    expect(screen.getByRole('tab', { name: 'Page' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'About' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Members' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Services' })).toBeNull();
    expect(
      screen.getByText('The services on the Plus 1 page, its venues, the hosting and ending it are all in Manage Collective.'),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open Manage Collective' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/collective-area?tab=venues');
  });

  it('opens on Page when asked for Members or Services on shared services', async () => {
    await render(panel(collective('replicas'), 'members'));
    expect(screen.queryByText('Members panel')).toBeNull();
    expect(screen.getByText(/all in Manage Collective\.$/)).toBeTruthy();
  });

  it('keeps all four tabs for an older collective', async () => {
    await render(panel(collective('legacy_copies'), 'members'));
    expect(screen.getByRole('tab', { name: 'Members' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Services' })).toBeTruthy();
    expect(screen.getByText('Members panel')).toBeTruthy();
    expect(screen.queryByText(/all in Manage Collective\.$/)).toBeNull();
  });
});

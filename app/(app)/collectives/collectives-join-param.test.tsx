/**
 * The banner's invitation row (web `?join=` on Linked Accounts, 2026-10-28): an invitation from a
 * host this venue is already linked with comes with no link request, so the banner opens
 * `/collectives?join={collectiveId}` and that collective's join sheet opens, once.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import type { CollectiveView } from '@/types/collectives';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => undefined) }));

// The sheets themselves are tested elsewhere: here only which one opens, and for what.
jest.mock('@/components/linked/CreateCollectiveSheet', () => ({ CreateCollectiveSheet: () => null }));
jest.mock('@/components/linked/LeaveCollectiveSheet', () => ({ LeaveCollectiveSheet: () => null }));
jest.mock('@/components/services/collective/ReleaseReviewCard', () => ({ ReleaseReviewCard: () => null }));
jest.mock('@/components/linked/setup/CollectiveSetupSheet', () => ({ CollectiveSetupSheet: () => null }));
jest.mock('@/components/linked/setup/JoinCollectiveSheet', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    JoinCollectiveSheet: ({ visible, collectiveId }: { visible: boolean; collectiveId: string | null }) =>
      visible ? React.createElement(Text, null, `Join sheet for ${collectiveId}`) : null,
  };
});

let mockCollectives: CollectiveView[] = [];
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectives: () => ({
    data: { collectives: mockCollectives },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useCollectiveMemberAction: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useIncomingLinks: () => ({ data: undefined, refetch: jest.fn() }),
  useLinkedVenues: () => ({ data: { links: [] } }),
}));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ isLoading: false, data: { staff: { role: 'admin' } } }),
}));
jest.mock('@/lib/sites/useWebDashboardLink', () => ({ useWebDashboardLink: () => (path: string) => path }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ name: 'Light 3' }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

import CollectivesScreen from './index';

function collective(overrides: Partial<CollectiveView>): CollectiveView {
  return {
    id: 'col-1',
    slug: 'northside',
    name: 'Northside',
    status: 'active',
    branding: {},
    isHost: false,
    hostVenueId: 'v-host',
    serviceModel: 'replicas',
    bookingPageConfig: null,
    myVenueId: 'v-me',
    myMembershipStatus: 'invited',
    myConfig: null,
    members: [
      { venueId: 'v-host', venueName: 'Bright Cuts', status: 'active' },
      { venueId: 'v-me', venueName: 'Light 3', status: 'invited' },
    ],
    activeMemberCount: 2,
    ...overrides,
  } as CollectiveView;
}

beforeEach(() => {
  mockParams = {};
  mockCollectives = [];
});

describe('CollectivesScreen ?join=', () => {
  it("opens that collective's join sheet for an invitation", async () => {
    mockParams = { join: 'col-1' };
    mockCollectives = [collective({})];
    await render(<CollectivesScreen />);
    expect(screen.getByText('Join sheet for col-1')).toBeTruthy();
  });

  it('opens nothing for a collective the venue is already in, or one not in the list', async () => {
    mockParams = { join: 'col-1' };
    mockCollectives = [collective({ myMembershipStatus: 'active' })];
    await render(<CollectivesScreen />);
    expect(screen.queryByText(/^Join sheet for/)).toBeNull();

    mockParams = { join: 'col-2' };
    mockCollectives = [collective({})];
    await render(<CollectivesScreen />);
    expect(screen.queryByText(/^Join sheet for/)).toBeNull();
  });

  it('opens nothing without the param', async () => {
    mockCollectives = [collective({})];
    await render(<CollectivesScreen />);
    expect(screen.queryByText(/^Join sheet for/)).toBeNull();
  });
});

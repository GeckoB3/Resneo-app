/**
 * Who can start Create venue collective (CQ-10.9, R2-12 option A). It was greyed out unless a link
 * already gave full access both ways, with a note telling the host to fix a link first, though Create
 * itself lists partly linked venues and says how to change them. Now it opens for any linked venue, and
 * the note shows only when there are none at all. A venue already in a live collective gets no button.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { render, screen } from '@testing-library/react-native';

import type { CollectiveCandidate, CollectiveView } from '@/types/collectives';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => undefined) }));

// The sheet has its own tests: here only what the screen hands it.
const mockSheetProps: Record<string, unknown>[] = [];
jest.mock('@/components/linked/CreateCollectiveSheet', () => ({
  CreateCollectiveSheet: (props: Record<string, unknown>) => {
    mockSheetProps.push(props);
    return null;
  },
}));
jest.mock('@/components/linked/LeaveCollectiveSheet', () => ({ LeaveCollectiveSheet: () => null }));
jest.mock('@/components/services/collective/ReleaseReviewCard', () => ({ ReleaseReviewCard: () => null }));
jest.mock('@/components/linked/setup/CollectiveSetupSheet', () => ({ CollectiveSetupSheet: () => null }));
jest.mock('@/components/linked/setup/JoinCollectiveSheet', () => ({ JoinCollectiveSheet: () => null }));

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
let mockCandidates: { data?: CollectiveCandidate[]; isSuccess: boolean; isError: boolean } = { isSuccess: false, isError: false };
const mockCandidateOptions = jest.fn();
jest.mock('@/lib/queries/useCollectiveLinks', () => ({
  useCollectiveCandidates: (options: unknown) => {
    mockCandidateOptions(options);
    return { ...mockCandidates, refetch: jest.fn() };
  },
}));
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useIncomingLinks: () => ({ data: undefined, refetch: jest.fn() }),
  // No link here gives full access both ways: that is the point.
  useLinkedVenues: () => ({ data: { links: [], venue: { id: 'v-me', name: 'Light 3', slug: 'light-3' } } }),
}));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ isLoading: false, data: { staff: { role: 'admin' } } }),
}));
jest.mock('@/lib/sites/useWebDashboardLink', () => ({ useWebDashboardLink: () => (path: string) => path }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ name: 'Light 3' }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

import CollectivesScreen from './index';

const partlyLinked: CollectiveCandidate = {
  venue_id: 'v-p',
  venue_name: 'Partial',
  venue_slug: 'partial',
  link_id: 'link-p',
  standing: 'permissions',
  reason: 'Your link with Partial does not share full calendar details yet.',
  detail: null,
};
const NOTE = 'You can invite venues you have an active link with. Set one up on the Linked venues screen first.';
const createButton = () => screen.queryByRole('button', { name: 'Create venue collective' });

beforeEach(() => {
  mockCollectives = [];
  mockCandidates = { isSuccess: false, isError: false };
  mockSheetProps.length = 0;
  mockCandidateOptions.mockClear();
  mockPush.mockClear();
});

describe('Create venue collective', () => {
  it('opens for a partly linked venue, with no note', async () => {
    mockCandidates = { data: [partlyLinked], isSuccess: true, isError: false };
    await render(<CollectivesScreen />);
    expect(createButton()?.props.accessibilityState?.disabled).toBeFalsy();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByText(/you need a link granting create, edit/)).toBeNull();
    expect(screen.getByText('No venue collectives yet. Create one to offer a combined booking page.')).toBeTruthy();
  });

  it('is disabled, with the note, only when there are no linked venues at all', async () => {
    mockCandidates = { data: [], isSuccess: true, isError: false };
    await render(<CollectivesScreen />);
    expect(createButton()?.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.queryByText(/No venue collectives yet/)).toBeNull();
  });

  it('does not say there are no links while the list loads, or when it fails', async () => {
    await render(<CollectivesScreen />);
    expect(createButton()?.props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByText(NOTE)).toBeNull();

    mockCandidates = { isSuccess: false, isError: true };
    await render(<CollectivesScreen />);
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.getByText('Could not load your linked venues. Please try again.')).toBeTruthy();
  });

  it('is not offered to a member of a live collective, and its candidates are not asked for', async () => {
    mockCollectives = [
      {
        id: 'col-1',
        slug: 'plus-1',
        name: 'Plus 1',
        status: 'active',
        branding: {},
        isHost: false,
        hostVenueId: 'v-host',
        serviceModel: 'replicas',
        bookingPageConfig: null,
        myVenueId: 'v-me',
        myMembershipStatus: 'active',
        myConfig: null,
        members: [
          { venueId: 'v-host', venueName: 'Aura Hair Studio', status: 'active' },
          { venueId: 'v-me', venueName: 'Light 3', status: 'active' },
        ],
        activeMemberCount: 2,
      } as CollectiveView,
    ];
    mockCandidates = { data: [partlyLinked], isSuccess: true, isError: false };
    await render(<CollectivesScreen />);
    expect(createButton()).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(mockCandidateOptions).toHaveBeenLastCalledWith({ enabled: false });
  });

  it("gives the sheet this venue's address, and closes it before going to another screen", async () => {
    mockCandidates = { data: [partlyLinked], isSuccess: true, isError: false };
    await render(<CollectivesScreen />);
    const props = mockSheetProps[mockSheetProps.length - 1];
    expect(props.venueSlug).toBe('light-3');
    (props.onOpen as (href: string) => void)('/linked-venues/link-p');
    expect(mockPush).toHaveBeenCalledWith('/linked-venues/link-p');
  });
});

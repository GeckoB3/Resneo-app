/**
 * A member's Booking page summary on shared services (CQ-10.6, R2-26, R2-15): it says the venue and
 * the host each choose its calendars in Manage Collective, that leaving is at the foot of Manage
 * Collective, and opens it. Before this it said the host alone chooses, and sent the member to Linked
 * venues to leave, where nothing collective lives. An older collective keeps its words.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { CollectiveView } from '@/types/collectives';

jest.mock('@/components/linked/CombinedPageAboutSection', () => ({ CombinedPageAboutSection: () => null }));
jest.mock('@/components/linked/CombinedPageAddressRow', () => ({ CombinedPageAddressRow: () => null }));
jest.mock('@/components/linked/CollectiveBookingSettingsSummary', () => ({ CollectiveBookingSettingsSummary: () => null }));
let mockItems: unknown[] = [];
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectiveCatalogue: () => ({
    isError: false,
    isLoading: false,
    error: null,
    data: { catalogue: { items: mockItems } },
  }),
}));

import { CombinedPageMemberSummary } from './CombinedPageMemberSummary';

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
    isHost: false,
    hostVenueId: 'v-host',
    serviceModel,
    myVenueId: 'v-me',
    myMembershipStatus: 'active',
    myConfig: null,
    members: [
      { venueId: 'v-host', venueName: 'Aura Hair Studio', status: 'active', displayOrder: 0, soloPageBehavior: 'redirect' },
      { venueId: 'v-me', venueName: 'Aura Hair Studio in Holywood', status: 'active', displayOrder: 1, soloPageBehavior: 'redirect' },
    ],
    activeMemberCount: 2,
  };
}

beforeEach(() => {
  mockItems = [];
});

describe('CombinedPageMemberSummary', () => {
  it('points a member on shared services to Manage Collective, not Linked venues', async () => {
    const onOpenManageCollective = jest.fn();
    const onOpenLinkedVenues = jest.fn();
    await render(
      <CombinedPageMemberSummary
        collective={collective('replicas')}
        onOpenManageCollective={onOpenManageCollective}
        onOpenLinkedVenues={onOpenLinkedVenues}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Open Linked venues' })).toBeNull();
    expect(screen.queryByText(/leave the collective under Linked venues/)).toBeNull();
    expect(
      screen.getByText(
        'None of your calendars offers a service on the Plus 1 page yet. You or Aura Hair Studio can choose them in Manage Collective.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('To stop taking part, leave Plus 1 at the foot of Manage Collective.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open Manage Collective' }));
    });
    expect(onOpenManageCollective).toHaveBeenCalled();
    expect(onOpenLinkedVenues).not.toHaveBeenCalled();
  });

  it('says who chooses the calendars once one is on the page', async () => {
    mockItems = [
      {
        id: 'i1',
        name: 'Haircut',
        status: 'active',
        providers: [{ venueId: 'v-me', status: 'active', practitionerId: 'p1', practitionerName: 'Jenny' }],
      },
    ];
    await render(<CombinedPageMemberSummary collective={collective('replicas')} onOpenManageCollective={jest.fn()} />);
    expect(screen.getByText('Jenny')).toBeTruthy();
    expect(
      screen.getByText('You and Aura Hair Studio can each choose which of your calendars offer the services, in Manage Collective.'),
    ).toBeTruthy();
  });

  it('keeps the older words and Linked venues for an older collective', async () => {
    await render(<CombinedPageMemberSummary collective={collective('legacy_copies')} onOpenLinkedVenues={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Open Linked venues' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Manage Collective' })).toBeNull();
  });
});

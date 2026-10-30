/**
 * A member's Booking page summary on shared services (CQ-10.6, R2-26, R2-15): it says the venue and
 * the host each choose its calendars in Manage Collective, that leaving is at the foot of Manage
 * Collective, and opens it. Before this it said the host alone chooses, and sent the member to Linked
 * venues to leave, where nothing collective lives. An older collective keeps its words.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
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
  useAnswerAddressAdoption: () => ({
    isPending: false,
    mutate: (input: unknown, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => {
      mockAnswer(input);
      if (mockAnswerError) callbacks.onError(mockAnswerError);
      else callbacks.onSuccess();
    },
  }),
}));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), getWebUrl: () => 'https://resneo.test' }));
const mockAnswer = jest.fn();
let mockAnswerError: unknown = null;

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
  mockAnswer.mockReset();
  mockAnswerError = null;
});

/** The host's request to use this venue's page address (CQ-10.10, web N38). */
describe('CombinedPageMemberSummary address adoption', () => {
  const asked = (): CollectiveView => {
    const c = collective('replicas');
    return {
      ...c,
      pendingAdoptedVenueId: 'v-me',
      members: c.members.map((m) => (m.venueId === 'v-me' ? { ...m, venueSlug: 'aura-2' } : m)),
    };
  };
  const ASK =
    'Aura Hair Studio would like the Plus 1 page to use your page address, https://resneo.test/book/aura-2. Nothing changes unless you agree, and you get the address back if you leave.';

  it('asks the venue it is waiting for, and says nothing changes unless it agrees', async () => {
    await render(<CombinedPageMemberSummary collective={asked()} />);
    expect(screen.getByText(ASK)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agree' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  });

  it('asks nobody else, and nothing on an older server', async () => {
    await render(<CombinedPageMemberSummary collective={{ ...collective('replicas'), pendingAdoptedVenueId: 'v-host' }} />);
    expect(screen.queryByTestId('address-adoption-ask')).toBeNull();
    await render(<CombinedPageMemberSummary collective={{ ...collective('replicas'), pendingAdoptedVenueId: null }} />);
    expect(screen.queryByTestId('address-adoption-ask')).toBeNull();
    await render(<CombinedPageMemberSummary collective={collective('replicas')} />);
    expect(screen.queryByTestId('address-adoption-ask')).toBeNull();
  });

  it('sends Agree, and keeps saying so after the refreshed collective stops asking', async () => {
    const view = await render(<CombinedPageMemberSummary collective={asked()} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Agree' }));
    });
    expect(mockAnswer).toHaveBeenCalledWith({ collectiveId: 'col-1', accept: true });
    expect(screen.getByText('The Plus 1 page now uses your page address.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agree' })).toBeNull();
    await view.rerender(<CombinedPageMemberSummary collective={{ ...asked(), pendingAdoptedVenueId: null }} />);
    expect(screen.getByText('The Plus 1 page now uses your page address.')).toBeTruthy();
  });

  it('sends Not now', async () => {
    await render(<CombinedPageMemberSummary collective={asked()} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    });
    expect(mockAnswer).toHaveBeenCalledWith({ collectiveId: 'col-1', accept: false });
    expect(screen.getByText('Your page address stays as it is.')).toBeTruthy();
  });

  it("shows the server's sentence on a refusal and keeps the question open", async () => {
    mockAnswerError = new ApiError('Only an admin can answer this.', 403);
    await render(<CombinedPageMemberSummary collective={asked()} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Agree' }));
    });
    expect(screen.getByText('Only an admin can answer this.')).toBeTruthy();
    expect(screen.getByText(ASK)).toBeTruthy();
  });
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

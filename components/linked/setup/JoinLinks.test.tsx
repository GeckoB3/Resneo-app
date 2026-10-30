/**
 * One invitation covers linking with every venue in the collective and joining (owner, web
 * 2026-10-28): the server makes every link the joining venue needs in the same request as the join,
 * so the app accepts nothing itself and offers no "Ask {venue} to link". The check step names the
 * venues joining links the venue with. Only a link already in force with less than full access
 * blocks the preview: the checklist says which, with "Change it in Linked venues" (the app's name for it). The review
 * sheet does the same, leaving out the request under review, and is titled "invited you to join"
 * for a collective already running.
 *
 * `apiFetch` is mocked so a stray request (an accept from the app) would show. jest hoists mock
 * factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { JoinPreview, LinkNeed } from '@/types/collectives';
import type { AccountLinkView } from '@/types/linked-venues';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockApiFetch = jest.fn();
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));
jest.mock('@/lib/queries/useBillingStatus', () => ({
  useStripeConnectLink: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useVenueSettings', () => ({
  useUpdateFeatureFlags: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ refetch: jest.fn() }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

let mockPreview: JoinPreview;
const mockJoin = jest.fn();
const mockPreviewCalls: unknown[][] = [];
jest.mock('@/lib/queries/useCollectives', () => ({
  useJoinPreview: (...args: unknown[]) => {
    mockPreviewCalls.push(args);
    return { data: mockPreview, isError: false, error: null, refetch: jest.fn() };
  },
  useCollectiveMemberAction: () => ({ mutate: mockJoin, isPending: false }),
}));

const mockRespond = jest.fn();
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useRespondLink: () => ({ mutate: mockRespond, isPending: false }),
}));

import { ApiError } from '@/lib/api/client';

import { JoinCollectiveSheet } from './JoinCollectiveSheet';
import { ReviewLinkRequestSheet } from './ReviewLinkRequestSheet';

const need = (venue: string, state: LinkNeed['state'], linkId: string | null = null, isHost = false): LinkNeed => ({
  venue_id: `v-${venue}`,
  venue_name: venue,
  venue_slug: venue.toLowerCase(),
  is_host: isHost,
  state,
  link_id: linkId,
});

const basePreview: JoinPreview = {
  consent_version: 'join-2026-09',
  collective_name: 'Northside',
  host_name: 'Bright Cuts',
  blocked: null,
  services_to_set_up: 3,
  same_name: [],
  own_services: [],
  forms: [],
  warnings: { no_stripe_paid_services: 0, form_services: 0, forms_off: false },
  other_models: null,
};

beforeEach(() => {
  mockApiFetch.mockReset();
  mockJoin.mockReset();
  mockRespond.mockReset();
  mockPreviewCalls.length = 0;
});

async function walkToCheck(steps = 2) {
  for (let i = 0; i < steps; i += 1) {
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    });
  }
}

describe('JoinCollectiveSheet held up by a link with less than full access', () => {
  const blocked: JoinPreview = {
    ...basePreview,
    blocked:
      'To join Northside, your link with Oak needs full access both ways, and it was set up with less. Change it under Linked Accounts, then join.',
    links: [need('Bright Cuts', 'full', 'l0', true), need('Zen', 'none'), need('Oak', 'not_full', 'l2')],
  };

  it('reads the plain preview, says which link holds it up, and opens Linked venues', async () => {
    mockPreview = blocked;
    const onOpenLinked = jest.fn();
    await render(
      <JoinCollectiveSheet
        visible
        collectiveId="col-1"
        collectiveName="Northside"
        venueName="Light 3"
        onClose={jest.fn()}
        onOpenLinked={onOpenLinked}
      />,
    );
    // No `withPendingLink` any more: the server counts every link joining makes.
    expect(mockPreviewCalls[0]).toEqual(['col-1', { enabled: true }]);
    expect(screen.getByText('Your links with the venues in it')).toBeTruthy();
    expect(screen.getByText('Already linked at full access')).toBeTruthy();
    expect(screen.getByText('Linked when you join')).toBeTruthy();
    expect(screen.getByText('Linked with less than full access both ways. Change it first.')).toBeTruthy();
    // Nothing to ask for: the join makes the missing link itself.
    expect(screen.queryByRole('button', { name: /^Ask .* to link$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Change it in Linked venues' }));
    });
    expect(onOpenLinked).toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('only says so without somewhere to go', async () => {
    mockPreview = blocked;
    await render(
      <JoinCollectiveSheet visible collectiveId="col-1" collectiveName="Northside" venueName="Light 3" onClose={jest.fn()} />,
    );
    expect(screen.getByText('Linked with less than full access both ways. Change it first.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change it in Linked venues' })).toBeNull();
  });
});

describe('JoinCollectiveSheet with links to make', () => {
  const toMake: JoinPreview = {
    ...basePreview,
    links: [
      need('Bright Cuts', 'full', 'l0', true),
      need('Ash', 'their_request', 'l1'),
      need('Zen', 'none'),
      need('Oak', 'my_request', 'l3'),
    ],
  };

  async function joinThrough() {
    await render(
      <JoinCollectiveSheet visible collectiveId="col-1" collectiveName="Northside" venueName="Light 3" onClose={jest.fn()} />,
    );
    // Not blocked: no checklist row asks for a change, straight through the steps.
    expect(screen.queryByText('Linked with less than full access both ways. Change it first.')).toBeNull();
    // Step 1 still says which links joining makes, what they let each venue do, and that they last
    // (CQ-08): host first, each with where its link stands.
    const disclosure = screen.getByTestId('join-links-disclosure');
    expect(within(disclosure).getByText('Your links with the venues in it')).toBeTruthy();
    expect(within(disclosure).getAllByText('Linked when you join')).toHaveLength(3);
    expect(within(disclosure).getByText('Already linked at full access')).toBeTruthy();
    expect(
      within(disclosure).getByText(/^These links stay if you leave Northside, or if it ends, until one of you unlinks in Linked venues\./),
    ).toBeTruthy();
    await walkToCheck();
    expect(screen.getByText('Joining also links your venue with Ash, Zen and Oak, with full access both ways.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(/^I understand that guests who visit Light 3/));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Join Northside' }));
    });
  }

  it('joins in one request and accepts nothing from the app', async () => {
    mockPreview = toMake;
    await joinThrough();
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(mockJoin.mock.calls[0]?.[0]).toMatchObject({ collectiveId: 'col-1', payload: { action: 'accept' } });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows a refusal inside the sheet, naming the venue', async () => {
    mockPreview = toMake;
    mockJoin.mockImplementation((_vars: unknown, options: { onError: (err: unknown) => void }) => {
      options.onError(
        new ApiError('Could not link your venue with Zen, so you have not joined Northside yet. Please try again.', 409),
      );
    });
    await joinThrough();
    expect(
      screen.getByText('Could not link your venue with Zen, so you have not joined Northside yet. Please try again.'),
    ).toBeTruthy();
  });
});

describe('ReviewLinkRequestSheet with other venues in the collective', () => {
  const full = { calendar: 'full_details' as const, pii: true, act: 'create_edit_cancel' as const };
  const link: AccountLinkView = {
    id: 'l0',
    status: 'pending',
    otherVenue: { id: 'v-host', name: 'Bright Cuts', slug: 'bright' },
    initiatedByMe: false,
    iCan: full,
    theyCan: full,
    requestMessage: null,
    pendingChange: null,
    createdAt: '2026-10-28T09:00:00Z',
    respondedAt: null,
    terminatedAt: null,
    terminationReason: null,
  } as AccountLinkView;
  const collective = { id: 'col-1', name: 'Northside', slug: 'northside', serviceModel: 'replicas', live: true };

  it('says "invited you to join", names the other venues it links with, and accepts only this request', async () => {
    mockPreview = {
      ...basePreview,
      links: [need('Bright Cuts', 'their_request', 'l0', true), need('Zen', 'their_request', 'l2'), need('Oak', 'none')],
    };
    await render(<ReviewLinkRequestSheet link={link} visible venueName="Light 3" collective={collective} onClose={jest.fn()} />);
    expect(mockPreviewCalls[0]).toEqual(['col-1', { enabled: true }]);
    expect(screen.getByText('Bright Cuts invited you to join Northside')).toBeTruthy();
    expect(
      screen.getByText(
        'Bright Cuts has also invited you to join Northside, one booking page for the venues in it. Here is what that means for Light 3.',
      ),
    ).toBeTruthy();
    await walkToCheck(3);
    // The request under review is described by the sheet itself, so only Zen and Oak are named.
    expect(screen.getByText('Joining also links your venue with Zen and Oak, with full access both ways.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(/^I understand what Bright Cuts will be able to see and do/));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Accept and join Northside' }));
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockRespond).toHaveBeenCalledTimes(1);
    expect(mockRespond.mock.calls[0]?.[0]).toMatchObject({ linkId: 'l0', action: 'accept', collective: { collective_id: 'col-1' } });
  });

  it('keeps "start" for a collective not running yet', async () => {
    mockPreview = { ...basePreview, links: [need('Bright Cuts', 'their_request', 'l0', true)] };
    await render(
      <ReviewLinkRequestSheet link={link} visible venueName="Light 3" collective={{ ...collective, live: false }} onClose={jest.fn()} />,
    );
    expect(screen.getByText('Bright Cuts wants to link with you and start Northside')).toBeTruthy();
  });

  it('shows the checklist, without the request under review, when a link holds it up', async () => {
    mockPreview = {
      ...basePreview,
      blocked:
        'To join Northside, your link with Zen needs full access both ways, and it was set up with less. Change it under Linked Accounts, then join.',
      links: [need('Bright Cuts', 'their_request', 'l0', true), need('Zen', 'not_full', 'l2')],
    };
    const onOpenLinked = jest.fn();
    await render(
      <ReviewLinkRequestSheet
        link={link}
        visible
        venueName="Light 3"
        collective={collective}
        onClose={jest.fn()}
        onOpenLinked={onOpenLinked}
      />,
    );
    expect(screen.getByText('Your links with the venues in it')).toBeTruthy();
    expect(screen.getByText('Linked with less than full access both ways. Change it first.')).toBeTruthy();
    expect(screen.queryByText('Linked when you join')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Change it in Linked venues' }));
    });
    expect(onOpenLinked).toHaveBeenCalled();
  });
});

/**
 * Link with a venue, through the name and changes steps it now shares with Create (`CreateSteps`,
 * CQ-10.9): the wizard says the same as before, with its own account links card, and sends the
 * collective with the link in one call.
 *
 * And the friction taken out of it (CQ-17): no level is picked for the owner, a venue that has already
 * asked is one tap from its review, the already-linked message fits the case, and a venue already in a
 * collective is told so before Send rather than refused at it. A host can invite instead. An older
 * server sends none of the new fields, and the wizard then behaves as it did.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import { setupCopy } from '@/lib/linked/setup-copy';
import type { VenueLookupResponse } from '@/types/linked-venues';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/linked/VenuePicker', () => ({ VenuePicker: () => null }));
const mockEditorProps = jest.fn();
jest.mock('@/components/linked/GrantPairEditor', () => ({
  GrantPairEditor: (props: unknown) => {
    mockEditorProps(props);
    return null;
  },
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

let mockSlug: { available: boolean; reason: string | null } = { available: true, reason: null };
const mockSlugAsked = jest.fn();
jest.mock('@/lib/queries/useCollectives', () => ({
  useSlugAvailable: (slug: string) => {
    mockSlugAsked(slug);
    return { isFetching: false, data: slug ? mockSlug : undefined };
  },
}));
const mockSend = jest.fn();
let mockSendError: Error | null = null;
let mockLookup: VenueLookupResponse;
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useMyCalendars: () => ({ data: { calendars: [] } }),
  useLinkSetup: () => ({
    isPending: false,
    mutate: (payload: unknown, callbacks: { onSuccess: (data: unknown) => void; onError: (err: Error) => void }) => {
      mockSend(payload);
      if (mockSendError) callbacks.onError(mockSendError);
      else callbacks.onSuccess({ collective: (payload as { collective?: unknown }).collective ? { id: 'c1', name: 'Riverside', slug: 'riverside' } : null });
    },
  }),
  useVenueLookup: () => ({ isFetching: false, data: mockLookup }),
}));

import { LinkSetupSheet } from './LinkSetupSheet';

const BRIGHT = { found: true as const, name: 'Bright Cuts', slug: 'bright-cuts', eligible: true, reason: null, alreadyLinked: false };
const OK = { standing: 'ok' as const, reason: null, detail: null };
const PLUS_1 = { id: 'col-1', name: 'Plus 1' };
const FULL_CARD = 'Work as one team';

const mockReview = jest.fn();
const mockEdit = jest.fn();

const press = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
};
const pick = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('radio', { name }));
  });
};
const continueDisabled = () => screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled;
const open = async () => {
  await render(
    <LinkSetupSheet
      visible
      venueName="Aura"
      venueSlug="aura"
      prefill={{ slug: 'bright-cuts', name: 'Bright Cuts' }}
      onClose={jest.fn()}
      onReviewRequest={mockReview}
      onEditPermissions={mockEdit}
    />,
  );
};
const openAtLevel = async () => {
  await open();
  await press('Continue');
};

beforeEach(() => {
  mockSlug = { available: true, reason: null };
  mockSlugAsked.mockClear();
  mockSend.mockClear();
  mockSendError = null;
  mockEditorProps.mockClear();
  mockReview.mockClear();
  mockEdit.mockClear();
  mockLookup = { ...BRIGHT, collective: OK };
});

describe('LinkSetupSheet with a collective', () => {
  const toName = async () => {
    await open();
    await press('Continue'); // the venue
    await pick(FULL_CARD);
    await press('Continue'); // the level
    expect(mockSlugAsked).not.toHaveBeenCalledWith(expect.stringMatching(/./));
    await pick('Also start a collective');
    await press('Continue'); // the collective
  };

  it('asks the name and address with the shared step, holding Continue until they are in', async () => {
    await toName();
    expect(screen.getByText('Aura will be the host.')).toBeTruthy();
    // The wizard said what a collective is a step earlier.
    expect(screen.queryByText('What a collective is')).toBeNull();
    expect(continueDisabled()).toBe(true);

    mockSlug = { available: false, reason: null };
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Collective name'), 'Riverside');
    });
    expect(screen.getByLabelText('Page address').props.value).toBe('riverside');
    expect(screen.getByText('That address is taken. Try another.')).toBeTruthy();

    mockSlug = { available: true, reason: null };
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Page address'), 'River-Side 2!');
    });
    expect(screen.getByLabelText('Page address').props.value).toBe('river-side2');
    expect(continueDisabled()).toBeFalsy();
  });

  it('says what changes in its own words, and sends the collective with the link', async () => {
    await toName();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Collective name'), 'Riverside');
    });
    await press('Continue');

    expect(screen.getByText('Aura (/book/aura) leads to /book/c/riverside')).toBeTruthy();
    expect(screen.getByText('Bright Cuts (/book/bright-cuts) leads to /book/c/riverside')).toBeTruthy();
    // The wizard's link is the one being sent; Create's are in force already.
    expect(screen.getByText(/The link you are sending is what lets the two venues see each other/)).toBeTruthy();
    expect(screen.queryByText(/is already linked with the others/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('checkbox', { name: 'I understand what changes for Aura and for the venues I invite.' }));
    });
    await press('Continue');
    await press('Send request');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ targetSlug: 'bright-cuts', collective: { name: 'Riverside', slug: 'riverside' } }),
    );
    expect(mockSend.mock.calls[0][0].inviteTo).toBeUndefined();
  });
});

describe('the level step: nothing is picked for you (CQ-17.5)', () => {
  it('has no level chosen, and holds Continue with the reason until one is', async () => {
    await openAtLevel();
    for (const name of ["See each other's diaries", "Manage each other's bookings", FULL_CARD]) {
      expect(screen.getByRole('radio', { name }).props.accessibilityState?.selected).toBe(false);
    }
    expect(continueDisabled()).toBe(true);
    expect(screen.getByText('Choose how closely you will work together.')).toBeTruthy();

    await pick("See each other's diaries");
    expect(screen.getByRole('radio', { name: "See each other's diaries" }).props.accessibilityState?.selected).toBe(true);
    expect(continueDisabled()).toBeFalsy();
    expect(screen.queryByText('Choose how closely you will work together.')).toBeNull();
  });

  it('starts Customise from the least when nothing is picked, and from the pick when one is', async () => {
    await openAtLevel();
    await press('Customise permissions');
    expect(mockEditorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ mine: expect.objectContaining({ act: 'none', pii: false }), theirs: expect.objectContaining({ act: 'none', pii: false }) }),
    );
    await press('Back to the three levels');
    expect(continueDisabled()).toBe(true);

    await pick(FULL_CARD);
    await press('Customise permissions');
    expect(mockEditorProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ mine: expect.objectContaining({ act: 'create_edit_cancel' }) }),
    );
  });

  it('sends the level picked, with no collective step below full', async () => {
    await openAtLevel();
    await pick("See each other's diaries");
    await press('Continue');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
    await press('Send request');
    expect(mockSend.mock.calls[0][0].grants.mine).toEqual(expect.objectContaining({ act: 'none', pii: false }));
  });
});

describe('a venue with a request already, either way (CQ-17.6)', () => {
  const request = (state: 'their_request' | 'my_request'): VenueLookupResponse => ({
    ...BRIGHT,
    eligible: false,
    reason: 'There is already a pending request with this venue.',
    link: { id: 'link-1', state, requested_at: '2026-10-30T10:00:00Z' },
    requester_collective: null,
    same_collective: false,
  });

  it('offers the review of a request from them', async () => {
    mockLookup = request('their_request');
    await open();
    expect(screen.getByText('Bright Cuts has already asked to link with you. Review their request to answer it.')).toBeTruthy();
    expect(screen.queryByText('There is already a pending request with this venue.')).toBeNull();
    expect(continueDisabled()).toBe(true);
    await press('Review their request');
    expect(mockReview).toHaveBeenCalledWith('link-1');
  });

  it("says where a request of this venue's own is, with the app's name for it", async () => {
    mockLookup = request('my_request');
    await open();
    expect(
      screen.getByText('You have already asked Bright Cuts to link. The request waits under Sent by you on the Linked venues screen, where you can cancel it.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review their request' })).toBeNull();
  });
});

describe('a venue already linked (CQ-17.2)', () => {
  const linked = (more: Partial<Extract<VenueLookupResponse, { found: true }>>): VenueLookupResponse => ({
    ...BRIGHT,
    eligible: false,
    alreadyLinked: true,
    reason: 'You are already linked with this venue.',
    ...more,
  });
  const LINK = { id: 'link-2', requested_at: null };
  const MEMBER = { ...PLUS_1, role: 'member' as const };
  const HOST = { ...PLUS_1, role: 'host' as const };

  it('says first that it is in your collective', async () => {
    mockLookup = linked({ link: { ...LINK, state: 'not_full' }, requester_collective: HOST, same_collective: true });
    await open();
    expect(screen.getByText('You are already linked with Bright Cuts, and it is in Plus 1 with you.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit permissions' })).toBeNull();
  });

  it('then that you host one to invite them to', async () => {
    mockLookup = linked({ link: { ...LINK, state: 'not_full' }, requester_collective: HOST, same_collective: false });
    await open();
    expect(
      screen.getByText('You are already linked with Bright Cuts. To bring them onto the Plus 1 page, invite them in Manage Collective, under Venues.'),
    ).toBeTruthy();
  });

  it('then that a partial link needs changing, opening that link', async () => {
    mockLookup = linked({ link: { ...LINK, state: 'not_full' }, requester_collective: null, same_collective: false });
    await open();
    expect(screen.getByText(/A shared booking page needs Work as one team both ways/)).toBeTruthy();
    await press('Edit permissions');
    expect(mockEdit).toHaveBeenCalledWith('link-2');
  });

  it('points a member at no way to start a page, whatever the link', async () => {
    mockLookup = linked({ link: { ...LINK, state: 'not_full' }, requester_collective: MEMBER, same_collective: false });
    await open();
    expect(screen.getByText('You are already linked with this venue.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit permissions' })).toBeNull();
  });

  it('and otherwise where to start one, naming the real button and screen', async () => {
    mockLookup = linked({ link: { ...LINK, state: 'full' }, requester_collective: null, same_collective: false });
    await open();
    expect(
      screen.getByText('You are already linked with Bright Cuts. To share one booking page with them, use Create venue collective, on the Venue collectives screen.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit permissions' })).toBeNull();
  });
});

describe('the shared page on the level step and after it (CQ-17.4, CQ-17.7)', () => {
  it('moves "Collective ready" to the deck, and keeps it when a collective can start', async () => {
    await openAtLevel();
    expect(screen.getByText('Collective ready')).toBeTruthy();
    expect(setupCopy('setup.level.collectiveReady')).toBe('Collective ready');
  });

  it("says when the other venue cannot be on a shared page and why, and leaves the step out", async () => {
    mockLookup = { ...BRIGHT, collective: { standing: 'blocked', reason: 'In Europe/Paris, not Europe/London', detail: null } };
    await openAtLevel();
    expect(screen.getByText('No shared page with Bright Cuts')).toBeTruthy();
    expect(screen.getByText('In Europe/Paris, not Europe/London')).toBeTruthy();
    expect(screen.queryByText('Collective ready')).toBeNull();

    await pick(FULL_CARD);
    await press('Continue');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
    expect(screen.queryByText('Collective ready')).toBeNull();
  });

  it('tells a member, and offers them no collective', async () => {
    mockLookup = { ...BRIGHT, collective: OK, link: null, requester_collective: { ...PLUS_1, role: 'member' }, same_collective: false };
    await openAtLevel();
    expect(screen.getByText('You are part of Plus 1, so you can link with Bright Cuts but not start a shared page.')).toBeTruthy();
    await pick(FULL_CARD);
    await press('Continue');
    expect(screen.queryByRole('radio', { name: 'Also start a collective' })).toBeNull();
    await press('Send request');
    const payload = mockSend.mock.calls[0][0];
    expect(payload.collective).toBeUndefined();
    expect(payload.inviteTo).toBeUndefined();
    expect(screen.getByText('When Bright Cuts accepts, the link starts straight away.')).toBeTruthy();
  });

  it("tells a member first, as the other venue's standing is not what stops them", async () => {
    mockLookup = {
      ...BRIGHT,
      collective: { standing: 'blocked', reason: 'In Europe/Paris, not Europe/London', detail: null },
      link: null,
      requester_collective: { ...PLUS_1, role: 'member' },
      same_collective: false,
    };
    await openAtLevel();
    expect(screen.getByText('You are part of Plus 1, so you can link with Bright Cuts but not start a shared page.')).toBeTruthy();
    expect(screen.queryByText('No shared page with Bright Cuts')).toBeNull();
  });

  it('tells a venue with an open invitation to answer it, in the app', async () => {
    mockLookup = { ...BRIGHT, collective: OK, link: null, requester_collective: { ...PLUS_1, role: 'invited' }, same_collective: false };
    await openAtLevel();
    expect(
      screen.getByText('Your venue has been invited to Plus 1. Accept or decline the invitation on the Venue collectives screen first.'),
    ).toBeTruthy();
    await pick(FULL_CARD);
    await press('Continue');
    expect(screen.getByRole('button', { name: 'Send request' })).toBeTruthy();
    await press('Send request');
    expect(mockSend.mock.calls[0][0].inviteTo).toBeUndefined();
  });

  describe('as a host', () => {
    beforeEach(() => {
      mockLookup = { ...BRIGHT, collective: OK, link: null, requester_collective: { ...PLUS_1, role: 'host' }, same_collective: false };
    });

    const toInviteStep = async () => {
      await openAtLevel();
      expect(screen.getByText('You already host Plus 1, so this link cannot start another shared page.')).toBeTruthy();
      await pick(FULL_CARD);
      await press('Continue');
    };

    it('offers to invite them, and sends that in place of a new collective', async () => {
      await toInviteStep();
      expect(screen.getByText('Bring Bright Cuts onto the Plus 1 page?')).toBeTruthy();
      expect(screen.queryByRole('radio', { name: 'Also start a collective' })).toBeNull();
      expect(screen.queryByText('What a collective is')).toBeNull();
      expect(screen.getByText('Bright Cuts is asked to join Plus 1 when they accept the link. You stay the host.')).toBeTruthy();
      expect(continueDisabled()).toBe(true);
      expect(screen.queryByText('Choose whether to start a collective.')).toBeNull();

      await pick('Also invite them to Plus 1');
      await press('Continue');
      expect(screen.getByText('Invite to Plus 1')).toBeTruthy();
      expect(screen.getByText('Aura invited you to join Plus 1')).toBeTruthy();

      await press('Send request');
      const payload = mockSend.mock.calls[0][0];
      expect(payload.inviteTo).toBe('col-1');
      expect(payload.collective).toBeUndefined();
      expect(screen.getByText('When Bright Cuts accepts, they join Plus 1. Choose their calendars in Manage Collective.')).toBeTruthy();
    });

    it('can just link', async () => {
      await toInviteStep();
      await pick('Just link for now');
      await press('Continue');
      expect(screen.getByText('Not this time')).toBeTruthy();
      await press('Send request');
      expect(mockSend.mock.calls[0][0].inviteTo).toBeUndefined();
      expect(screen.getByText('When Bright Cuts accepts, the link starts straight away.')).toBeTruthy();
    });

    it('does not offer it below full access', async () => {
      await openAtLevel();
      await pick("Manage each other's bookings");
      await press('Continue');
      expect(screen.queryByText('Bring Bright Cuts onto the Plus 1 page?')).toBeNull();
      await press('Send request');
      expect(mockSend.mock.calls[0][0].inviteTo).toBeUndefined();
    });

    it('does not offer it when the other venue cannot join', async () => {
      mockLookup = {
        ...BRIGHT,
        collective: { standing: 'blocked', reason: 'Already part of another collective', detail: null },
        link: null,
        requester_collective: { ...PLUS_1, role: 'host' },
        same_collective: false,
      };
      await openAtLevel();
      expect(screen.getByText('No shared page with Bright Cuts')).toBeTruthy();
      expect(screen.getByText('Already part of another collective')).toBeTruthy();
      await pick(FULL_CARD);
      await press('Continue');
      expect(screen.queryByText('Bring Bright Cuts onto the Plus 1 page?')).toBeNull();
    });
  });
});

describe('at the request limit', () => {
  it('shows the refusal with no way back to a step that would not help (17.3)', async () => {
    mockSendError = new ApiError('You have 10 link requests waiting.', 409, { error: 'You have 10 link requests waiting.', field: 'plan' });
    await openAtLevel();
    await pick("See each other's diaries");
    await press('Continue');
    await press('Send request');
    expect(screen.getByText('You have 10 link requests waiting.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go back and change it' })).toBeNull();
  });
});

describe('an older server, which sends none of the new fields', () => {
  it('keeps the plain already-linked line', async () => {
    mockLookup = { ...BRIGHT, eligible: false, alreadyLinked: true, reason: 'You are already linked with this venue.' };
    await open();
    expect(screen.getByText(/To share one booking page with them, use Create venue collective/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit permissions' })).toBeNull();
  });

  it("keeps the server's reason for a pending request", async () => {
    mockLookup = { ...BRIGHT, eligible: false, reason: 'There is already a pending request with this venue.' };
    await open();
    expect(screen.getByText('There is already a pending request with this venue.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review their request' })).toBeNull();
  });

  it('still offers a new collective at full access', async () => {
    await openAtLevel();
    await pick(FULL_CARD);
    await press('Continue');
    expect(screen.getByRole('radio', { name: 'Also start a collective' })).toBeTruthy();
  });
});

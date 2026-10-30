/**
 * Create a collective, ported from the web (CQ-10.9, R2-27). The old one-screen sheet listed only the
 * venues that could join, so a host never learned why a linked venue was missing, and a refusal was a
 * toast behind the sheet. Now: name and address, every linked venue with its standing and reason, what
 * changes, check and create with each refusal on its step, and a receipt with the address.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { ApiError } from '@/lib/api/client';
import type { CollectiveCandidate } from '@/types/collectives';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), getWebUrl: () => 'https://resneo.test' }));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockCandidates: CollectiveCandidate[] = [];
jest.mock('@/lib/queries/useCollectiveLinks', () => ({
  useCollectiveCandidates: () => ({ data: mockCandidates, isLoading: false, isError: false, refetch: jest.fn() }),
}));

let mockCreateError: unknown = null;
const mockCreate = jest.fn();
let mockSlugAvailable: { available: boolean; reason: string | null; format?: boolean } = { available: true, reason: null };
jest.mock('@/lib/queries/useCollectives', () => ({
  useCreateCollective: () => ({
    isPending: false,
    mutate: (payload: unknown, callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => {
      mockCreate(payload);
      if (mockCreateError) callbacks.onError(mockCreateError);
      else callbacks.onSuccess();
    },
  }),
  useSlugAvailable: (slug: string) => ({ isFetching: false, data: slug ? mockSlugAvailable : undefined }),
}));

import { CreateCollectiveSheet } from './CreateCollectiveSheet';

const candidate = (over: Partial<CollectiveCandidate>): CollectiveCandidate => ({
  venue_id: 'v-ok',
  venue_name: 'Bright Cuts',
  venue_slug: 'bright-cuts',
  link_id: 'link-ok',
  standing: 'ok',
  reason: null,
  detail: null,
  ...over,
});

const CANDIDATES = [
  candidate({}),
  candidate({ venue_id: 'v-np', venue_name: 'No Pay', venue_slug: 'no-pay', link_id: 'link-np', standing: 'no_payments', reason: 'No Pay has not connected Stripe.' }),
  candidate({ venue_id: 'v-b', venue_name: 'Elsewhere', venue_slug: 'elsewhere', link_id: 'link-b', standing: 'blocked', reason: 'In UTC, not Europe/London', detail: 'They use another time zone.' }),
  candidate({ venue_id: 'v-p', venue_name: 'Partial', venue_slug: 'partial', link_id: 'link-p', standing: 'permissions', reason: 'Your link with Partial does not share full calendar details yet.' }),
];

const onOpen = jest.fn();
const onClose = jest.fn();
const onCreated = jest.fn();

const sheet = () => (
  <CreateCollectiveSheet visible venueName="Aura" venueSlug="aura" onClose={onClose} onCreated={onCreated} onOpen={onOpen} />
);

const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
};
const tick = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('checkbox', { name }));
  });
};
const typeName = async (value: string) => {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Collective name'), value);
  });
};

const toVenues = async () => {
  await typeName('Riverside');
  await press('Continue');
};
const toChanges = async () => {
  await toVenues();
  await tick('Bright Cuts');
  await press('Continue');
};
const toCheck = async () => {
  await toChanges();
  await tick('I understand what changes for Aura and for the venues I invite.');
  await press('Continue');
};

beforeEach(() => {
  mockCandidates = CANDIDATES;
  mockCreateError = null;
  mockSlugAvailable = { available: true, reason: null };
  mockCreate.mockReset();
  onOpen.mockReset();
  onClose.mockReset();
  onCreated.mockReset();
  mockToast.success.mockReset();
  (Clipboard.setStringAsync as jest.Mock).mockClear();
});

describe('CreateCollectiveSheet', () => {
  it('starts by saying what a collective is and who hosts it, with the name help', async () => {
    await render(sheet());
    expect(screen.getByText('Create a collective')).toBeTruthy();
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText('What a collective is')).toBeTruthy();
    expect(screen.getByText('Aura will be the host.')).toBeTruthy();
    // The web's sentence, with the app's place name (CQ-10.11).
    expect(screen.getByText(/What the collective is called inside ResNeo and in messages between the venues/)).toBeTruthy();
  });

  it('holds the first step until the name and a free address are in', async () => {
    await render(sheet());
    expect(screen.getByText('Type a collective name of at least 2 characters to continue.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBe(true);

    mockSlugAvailable = { available: false, reason: null };
    await typeName('Riverside');
    expect(screen.getByLabelText('Page address').props.value).toBe('riverside');
    expect(screen.getByText('That address is taken. Try another.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBe(true);

    mockSlugAvailable = { available: true, reason: null };
    await typeName('Riverside Co');
    expect(screen.getByText('This address is free.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBeFalsy();
  });

  it('lists every linked venue, with its standing and why it cannot join', async () => {
    await render(sheet());
    await toVenues();
    expect(screen.getByText('Can join')).toBeTruthy();
    expect(screen.getByText('No card payments')).toBeTruthy();
    expect(screen.getByText('No Pay has not connected Stripe.')).toBeTruthy();
    expect(screen.getAllByText('Cannot join yet')).toHaveLength(2);
    expect(screen.getByText('In UTC, not Europe/London')).toBeTruthy();
    expect(screen.getByText('They use another time zone.')).toBeTruthy();
    expect(screen.getByText('Your link with Partial does not share full calendar details yet.')).toBeTruthy();
    // Two venues can share a name.
    expect(screen.getByText('/book/bright-cuts')).toBeTruthy();

    expect(screen.getByRole('checkbox', { name: 'Elsewhere' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Partial' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'No Pay' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('needs a venue chosen, and a partly linked one opens its link to change it', async () => {
    await render(sheet());
    await toVenues();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBe(true);
    await tick('Bright Cuts');
    expect(screen.getByText('1 venue selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBeFalsy();

    // Only the partly linked venue offers it.
    expect(screen.getAllByRole('button', { name: "Change the link's permissions" })).toHaveLength(1);
    await press("Change the link's permissions");
    expect(onOpen).toHaveBeenCalledWith('/linked-venues/link-p');
  });

  it('says what changes for each venue, and asks for the one acknowledgement', async () => {
    await render(sheet());
    await toChanges();
    expect(screen.getByText('What changes when Riverside starts')).toBeTruthy();
    expect(screen.getByText('Aura (/book/aura) leads to /book/c/riverside')).toBeTruthy();
    expect(screen.getByText('Bright Cuts (/book/bright-cuts) leads to /book/c/riverside')).toBeTruthy();
    // Create's own account links card: the wizard's says the link is being sent.
    expect(screen.getByText(/Every venue in Riverside is already linked with the others/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBe(true);
    await tick('I understand what changes for Aura and for the venues I invite.');
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBeFalsy();
  });

  it('checks, creates and ends on the receipt with the address and what to do next', async () => {
    await render(sheet());
    await toCheck();
    expect(screen.getByText('The Riverside page is not live yet. It goes live once an invited venue accepts and at least one calendar offers a service.')).toBeTruthy();
    expect(screen.getByText('What Bright Cuts will read')).toBeTruthy();
    expect(screen.getByText('Aura invited you to join Riverside')).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();

    await press('Create and send invitations');
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Riverside', slug: 'riverside', inviteVenueIds: ['v-ok'] });
    expect(mockToast.success).toHaveBeenCalledWith('Riverside created. Invitations sent to Bright Cuts.');
    // The sheet stays open on the receipt.
    expect(onCreated).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Riverside is created')).toBeTruthy();
    expect(screen.queryByText(/^Step \d of 4$/)).toBeNull();

    expect(screen.getByText('https://resneo.test/book/c/riverside')).toBeTruthy();
    await press('Copy address');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://resneo.test/book/c/riverside');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();

    await press('Waiting for the invited venue');
    expect(onOpen).toHaveBeenLastCalledWith('/collective-area?tab=venues');
    await press('Put services on the page');
    expect(onOpen).toHaveBeenLastCalledWith('/collective-area?view=venues');
    await press('Design the page');
    expect(onOpen).toHaveBeenLastCalledWith('/manage/booking-page');
    // The app's place names, not the web's.
    expect(screen.getByText('Choose how the Riverside page looks, under More, Booking page.')).toBeTruthy();
    await press('Go to Manage Collective');
    expect(onOpen).toHaveBeenLastCalledWith('/collective-area');
  });

  it('shows a refused address on the check step with the way back, and on the name step', async () => {
    mockCreateError = new ApiError('That booking-page address is already in use. Choose another.', 409, { field: 'slug' });
    await render(sheet());
    await toCheck();
    await press('Create and send invitations');
    expect(screen.getByText('That booking-page address is already in use. Choose another.')).toBeTruthy();
    expect(mockToast.error).not.toHaveBeenCalled();
    await press('Change the name or address');
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByText('That booking-page address is already in use. Choose another.')).toBeTruthy();
    // Changing the name clears it.
    await typeName('Riverside Two');
    expect(screen.queryByText('That booking-page address is already in use. Choose another.')).toBeNull();
  });

  it('sends a refused venue back to the venues step', async () => {
    mockCreateError = new ApiError('Bright Cuts is already part of another collective.', 409, { field: 'venues' });
    await render(sheet());
    await toCheck();
    await press('Create and send invitations');
    await press('Change the venues');
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(screen.getByText('Bright Cuts is already part of another collective.')).toBeTruthy();
  });

  it('shows the server sentence, with no way back, for a venue already in a collective', async () => {
    mockCreateError = new ApiError('Your venue is already part of Plus 1.', 409, { field: 'collective' });
    await render(sheet());
    await toCheck();
    await press('Create and send invitations');
    expect(screen.getByText('Your venue is already part of Plus 1.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change the name or address' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change the venues' })).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('points to Linked venues when nothing is linked', async () => {
    mockCandidates = [];
    await render(sheet());
    await toVenues();
    expect(screen.getByText('No venues to invite yet')).toBeTruthy();
    expect(screen.getByText('You can invite venues you have an active link with. Set one up on the Linked venues screen first.')).toBeTruthy();
    await press('Open Linked venues');
    expect(onOpen).toHaveBeenCalledWith('/linked-venues');
  });

  it('opens afresh each time', async () => {
    const view = await render(sheet());
    await toVenues();
    await view.rerender(
      <CreateCollectiveSheet visible={false} venueName="Aura" venueSlug="aura" onClose={onClose} onCreated={onCreated} onOpen={onOpen} />,
    );
    await view.rerender(sheet());
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.getByLabelText('Collective name').props.value).toBe('');
  });
});

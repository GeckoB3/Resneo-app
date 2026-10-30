/**
 * A link that holds a collective together (CQ-01, web P1 "App"): the link's screen says so, and
 * Unlink and Accept change say who leaves the collective before anything is confirmed, ask for the
 * collective's name when it would end, send the plan shown, and offer Remove (host) or Leave (member)
 * instead. Before this, Unlink was the plain "Cross-venue access stops" confirm and Accept change
 * one tap, so a venue left the collective (or ended it) without being told.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { AccountLinkView, LinkBreakPlan, LinkCollectiveHold, LinkGrant } from '@/types/linked-venues';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, { testID: 'sheet' }, children) : null,
  };
});
// Their own tests cover them; here they only need to stay out of the way.
jest.mock('@/components/linked/setup/ReviewLinkRequestSheet', () => ({ ReviewLinkRequestSheet: () => null }));
jest.mock('@/components/linked/LinkAuditView', () => ({ LinkAuditView: () => null }));
jest.mock('@/components/linked/EditPermissionsSheet', () => ({ EditPermissionsSheet: () => null }));
jest.mock('@/components/linked/ReduceAccessSheet', () => ({ ReduceAccessSheet: () => null }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'link-1' }),
}));
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ isLoading: false, data: { staff: { role: 'admin' } } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));

let mockLink: AccountLinkView;
let mockHolds: Record<string, LinkCollectiveHold> | undefined;
const mockUnlink = jest.fn();
const mockRespond = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useLinkedVenues: () => ({
    isLoading: false,
    isError: false,
    data: {
      venue: { id: 'v-me', name: 'Aura Hair Studio', slug: 'light-3' },
      links: [mockLink],
      collectiveHolds: mockHolds,
    },
    refetch: mockRefetch,
  }),
  useMyCalendars: () => ({ data: { calendars: [] } }),
  useRespondLink: () => ({ mutate: mockRespond, isPending: false, variables: undefined }),
  useUnlinkVenue: () => ({ mutate: mockUnlink, isPending: false }),
}));
const mockMemberAction = jest.fn();
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectiveMemberAction: () => ({ mutate: mockMemberAction, isPending: false }),
}));
jest.mock('@/lib/queries/useLeaveCollective', () => ({
  useLeavePreview: () => ({
    data: {
      collective_name: 'Plus 1',
      host_name: 'Aura Hair Studio',
      services: 16,
      no_stripe: 0,
      other_venues: ['Aura Hair Studio', 'Light 16'],
      last_member: false,
    },
    isError: false,
    error: null,
  }),
  useLeaveCollective: () => ({ mutate: jest.fn(), isPending: false }),
}));

import LinkedVenueDetailScreen from './[id]';

const FULL: LinkGrant = { calendar: 'full_details', pii: true, act: 'create_edit_cancel', calendarIds: null };
const host = { venueId: 'v-host', name: 'Aura Hair Studio' };
const me = { venueId: 'v-me', name: 'Aura Hair Studio in Holywood' };
const l16 = { venueId: 'v-16', name: 'Light 16' };

function link(overrides: Partial<AccountLinkView> = {}): AccountLinkView {
  return {
    id: 'link-1',
    status: 'accepted',
    otherVenue: { id: 'v-host', name: 'Aura Hair Studio', slug: 'aura' },
    initiatedByMe: false,
    iCan: FULL,
    theyCan: FULL,
    requestMessage: null,
    pendingChange: null,
    createdAt: '2026-10-01T10:00:00Z',
    respondedAt: '2026-10-01T10:00:00Z',
    terminatedAt: null,
    terminationReason: null,
    ...overrides,
  };
}

function holdOf(ifIChange: LinkBreakPlan, extra: Partial<LinkCollectiveHold> = {}): LinkCollectiveHold {
  return {
    collectiveId: 'col-1',
    collectiveName: 'Plus 1',
    hostVenueId: 'v-host',
    hostName: 'Aura Hair Studio',
    iAmHost: false,
    otherIsHost: true,
    ifIChange,
    ifTheyChange: ifIChange,
    ...extra,
  };
}

const IN_LEAVES: LinkBreakPlan = { leaving: [me], remaining: [host, l16], outcome: 'continues' };

beforeEach(() => {
  mockUnlink.mockReset();
  mockRespond.mockReset();
  mockMemberAction.mockReset();
  mockReplace.mockReset();
  mockLink = link();
  mockHolds = { 'link-1': holdOf(IN_LEAVES) };
});

describe('a link that holds a collective together', () => {
  it('says so on the screen, and Unlink names who leaves and sends the plan shown', async () => {
    await render(<LinkedVenueDetailScreen />);
    expect(
      screen.getByText(
        'Holds Plus 1 together. Unlinking, or giving each other less than full access, takes you out of Plus 1.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink' }));
    });
    // Not the plain confirm: the warning, and the button says what it does.
    expect(screen.getByText('This also changes Plus 1')).toBeTruthy();
    expect(screen.getByText(/^You leave Plus 1\. You keep every service, calendar and booking/)).toBeTruthy();
    expect(screen.getByText('Plus 1 carries on with Aura Hair Studio and Light 16.')).toBeTruthy();
    expect(screen.getByText('Your links with the other venues in Plus 1 stay as they are.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink and leave Plus 1' }));
    });
    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink.mock.calls[0]?.[0]).toEqual({
      linkId: 'link-1',
      acknowledge: { collective_id: 'col-1', leaving: ['v-me'], outcome: 'continues' },
    });
  });

  it('keeps the button off until the name is typed when the collective would end', async () => {
    mockHolds = { 'link-1': holdOf({ leaving: [me], remaining: [host], outcome: 'ends' }) };
    await render(<LinkedVenueDetailScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink' }));
    });
    const confirm = screen.getByRole('button', { name: 'Unlink and end Plus 1' });
    expect(confirm.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('collective-break-typed'), ' plus 1 ');
    });
    expect(screen.getByRole('button', { name: 'Unlink and end Plus 1' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('asks before accepting a change that takes the link below full access, and sends the plan', async () => {
    mockLink = link({
      pendingChange: { proposedByMe: false, iCan: { ...FULL, act: 'edit_existing' }, theyCan: FULL, proposedAt: '' },
    });
    await render(<LinkedVenueDetailScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Accept change' }));
    });
    expect(mockRespond).not.toHaveBeenCalled();
    expect(screen.getByText('Accept Aura Hair Studio’s change?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Accept and leave Plus 1' }));
    });
    expect(mockRespond.mock.calls[0]?.[0]).toEqual({
      linkId: 'link-1',
      action: 'accept_change',
      acknowledge: { collective_id: 'col-1', leaving: ['v-me'], outcome: 'continues' },
    });
  });

  it('accepts a change that keeps full access at once, as before', async () => {
    mockLink = link({
      pendingChange: { proposedByMe: false, iCan: FULL, theyCan: FULL, proposedAt: '' },
    });
    await render(<LinkedVenueDetailScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Accept change' }));
    });
    expect(mockRespond.mock.calls[0]?.[0]).toMatchObject({ linkId: 'link-1', action: 'accept_change', acknowledge: null });
  });

  it("offers a member Leave instead, with what leaving changes, in the same sheet", async () => {
    await render(<LinkedVenueDetailScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink' }));
    });
    expect(screen.getByText('Only want to leave Plus 1? Leave it and keep your links.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Leave Plus 1' }));
    });
    const panel = screen.getByTestId('leave-collective-panel');
    expect(within(panel).getByText('16 services from Aura Hair Studio become your own services, with the settings they have now.')).toBeTruthy();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('offers the host Remove instead, which keeps the link', async () => {
    mockLink = link({ otherVenue: { id: 'v-16', name: 'Light 16', slug: 'light-16' } });
    mockHolds = {
      'link-1': holdOf(
        { leaving: [l16], remaining: [host, me], outcome: 'continues' },
        { iAmHost: true, otherIsHost: false },
      ),
    };
    await render(<LinkedVenueDetailScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink' }));
    });
    expect(screen.getByRole('button', { name: 'Unlink and take Light 16 off the page' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Remove Light 16 from Plus 1' }));
    });
    expect(screen.getByText('Remove Light 16 from Plus 1?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Remove Light 16' }));
    });
    expect(mockMemberAction.mock.calls[0]?.[0]).toEqual({
      collectiveId: 'col-1',
      payload: { action: 'remove', venueId: 'v-16' },
    });
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("shows the server's plan when it refuses an unlink the list did not know held a collective", async () => {
    mockHolds = undefined;
    mockUnlink.mockImplementation((_vars: unknown, options: { onError: (err: unknown) => void }) => {
      options.onError(
        new ApiError('This link holds Plus 1 together, so changing it changes Plus 1 too.', 409, {
          error: 'This link holds Plus 1 together, so changing it changes Plus 1 too.',
          code: 'LINK_HOLDS_COLLECTIVE',
          collectiveBreak: {
            collectiveId: 'col-1',
            collectiveName: 'Plus 1',
            hostVenueId: 'v-host',
            hostName: 'Aura Hair Studio',
            iAmHost: false,
            otherIsHost: true,
            plan: IN_LEAVES,
          },
        }),
      );
    });
    await render(<LinkedVenueDetailScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink' }));
    });
    // The plain confirm, as before: the list said nothing about a collective.
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('sheet')).getByRole('button', { name: 'Unlink' }));
    });
    await waitFor(() => expect(screen.getByText('This also changes Plus 1')).toBeTruthy());
    // The first refusal is expected, so no error line, only the plan.
    expect(screen.queryByText('This link holds Plus 1 together, so changing it changes Plus 1 too.')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Unlink and leave Plus 1' }));
    });
    expect(mockUnlink.mock.calls[1]?.[0]).toEqual({
      linkId: 'link-1',
      acknowledge: { collective_id: 'col-1', leaving: ['v-me'], outcome: 'continues' },
    });
  });
});

/**
 * Reduce access on a link that holds a collective together (CQ-01, web P1 "App" 3): a reduction below
 * full access says who leaves the collective, renames the button, asks for the collective's name when
 * it would end, and sends the plan shown. A 409 `LINK_HOLDS_COLLECTIVE` shows the server's plan (the
 * first time with no error; when the plan moved, with the server's sentence). Before this the sheet
 * said nothing about the collective and its button read "Reduce access" whatever happened.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { AccountLinkView, LinkBreakPlan, LinkCollectiveHold, LinkGrant } from '@/types/linked-venues';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
// The editor stands in as two buttons that stage a grant, so the test is about the warning.
jest.mock('@/components/linked/GrantEditor', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const full = { calendar: 'full_details', pii: true, act: 'create_edit_cancel', calendarIds: null };
  return {
    GrantEditor: ({ onChange }: { onChange: (g: unknown) => void }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: () => onChange({ ...full, act: 'edit_existing' }) },
          React.createElement(Text, null, 'Stage edit only'),
        ),
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: () => onChange({ ...full, pii: true }) },
          React.createElement(Text, null, 'Stage no change'),
        ),
      ),
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
const mockReduce = jest.fn();
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useReduceAccess: () => ({ mutate: mockReduce, isPending: false }),
}));
jest.mock('@/lib/queries/useCollectives', () => ({
  useCollectiveMemberAction: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/queries/useLeaveCollective', () => ({
  useLeavePreview: () => ({ data: undefined, isError: false, error: null }),
  useLeaveCollective: () => ({ mutate: jest.fn(), isPending: false }),
}));

import { ReduceAccessSheet } from './ReduceAccessSheet';

const FULL: LinkGrant = { calendar: 'full_details', pii: true, act: 'create_edit_cancel', calendarIds: null };
const host = { venueId: 'v-host', name: 'Aura Hair Studio' };
const me = { venueId: 'v-me', name: 'Aura Hair Studio in Holywood' };

const link: AccountLinkView = {
  id: 'link-1',
  status: 'accepted',
  otherVenue: { id: 'v-host', name: 'Aura Hair Studio', slug: 'aura' },
  initiatedByMe: false,
  iCan: FULL,
  theyCan: FULL,
  requestMessage: null,
  pendingChange: null,
  createdAt: '',
  respondedAt: null,
  terminatedAt: null,
  terminationReason: null,
};

function holdOf(plan: LinkBreakPlan): LinkCollectiveHold {
  return {
    collectiveId: 'col-1',
    collectiveName: 'Plus 1',
    hostVenueId: 'v-host',
    hostName: 'Aura Hair Studio',
    iAmHost: false,
    otherIsHost: true,
    ifIChange: plan,
    ifTheyChange: plan,
  };
}

async function renderSheet(hold: LinkCollectiveHold | null) {
  await render(
    <ReduceAccessSheet link={link} visible myVenueId="v-me" hold={hold} onClose={jest.fn()} />,
  );
}

beforeEach(() => mockReduce.mockReset());

describe('ReduceAccessSheet on a link that holds a collective', () => {
  it('warns who leaves when a reduction takes the link below full access, and sends the plan', async () => {
    await renderSheet(holdOf({ leaving: [me], remaining: [host], outcome: 'continues' }));
    // Nothing staged: no warning yet.
    expect(screen.queryByText('This also changes Plus 1')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stage edit only' }));
    });
    expect(screen.getByText('This also changes Plus 1')).toBeTruthy();
    expect(screen.getByText(/^You leave Plus 1\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reduce access and leave Plus 1' }));
    });
    expect(mockReduce.mock.calls[0]?.[0]).toEqual({
      linkId: 'link-1',
      grant: { ...FULL, act: 'edit_existing' },
      acknowledge: { collective_id: 'col-1', leaving: ['v-me'], outcome: 'continues' },
    });
  });

  it('asks for the name before a reduction that would end the collective', async () => {
    await renderSheet(holdOf({ leaving: [me], remaining: [host], outcome: 'ends' }));
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stage edit only' }));
    });
    expect(
      screen.getByRole('button', { name: 'Reduce access and end Plus 1' }).props.accessibilityState?.disabled,
    ).toBe(true);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('collective-break-typed'), 'Plus 1');
    });
    expect(
      screen.getByRole('button', { name: 'Reduce access and end Plus 1' }).props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it('reduces as before on a link that holds nothing', async () => {
    await renderSheet(null);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stage edit only' }));
    });
    expect(screen.queryByText('This also changes Plus 1')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reduce access' }));
    });
    expect(mockReduce.mock.calls[0]?.[0]).toEqual({ linkId: 'link-1', grant: { ...FULL, act: 'edit_existing' }, acknowledge: null });
  });

  it("shows the server's plan from a 409, and its sentence once the plan had been shown", async () => {
    const refusal = (message: string) =>
      new ApiError(message, 409, {
        error: message,
        code: 'LINK_HOLDS_COLLECTIVE',
        collectiveBreak: {
          collectiveId: 'col-1',
          collectiveName: 'Plus 1',
          hostVenueId: 'v-host',
          hostName: 'Aura Hair Studio',
          iAmHost: false,
          otherIsHost: true,
          plan: { leaving: [me], remaining: [host], outcome: 'continues' },
        },
      });
    mockReduce.mockImplementation((_vars: unknown, options: { onError: (err: unknown) => void }) =>
      options.onError(refusal('Plus 1 has changed since you opened this. Check what happens now and confirm again.')),
    );
    await renderSheet(null);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Stage edit only' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reduce access' }));
    });
    // Not known before: the plan, no error.
    expect(screen.getByText('This also changes Plus 1')).toBeTruthy();
    expect(screen.queryByText(/has changed since you opened this/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Reduce access and leave Plus 1' }));
    });
    expect(mockReduce.mock.calls[1]?.[0]).toMatchObject({
      acknowledge: { collective_id: 'col-1', leaving: ['v-me'], outcome: 'continues' },
    });
    // Shown, and refused again: the plan moved, so the server's sentence shows.
    expect(screen.getByText('Plus 1 has changed since you opened this. Check what happens now and confirm again.')).toBeTruthy();
  });
});

/**
 * Link with a venue, through the name and changes steps it now shares with Create (`CreateSteps`,
 * CQ-10.9): the wizard says the same as before, with its own account links card, and sends the
 * collective with the link in one call.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/components/linked/VenuePicker', () => ({ VenuePicker: () => null }));
jest.mock('@/components/linked/GrantPairEditor', () => ({ GrantPairEditor: () => null }));
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
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useMyCalendars: () => ({ data: { calendars: [] } }),
  useLinkSetup: () => ({
    isPending: false,
    mutate: (payload: unknown, callbacks: { onSuccess: (data: unknown) => void }) => {
      mockSend(payload);
      callbacks.onSuccess({ collective: { id: 'c1', name: 'Riverside', slug: 'riverside' } });
    },
  }),
  useVenueLookup: () => ({
    isFetching: false,
    data: { found: true, name: 'Bright Cuts', slug: 'bright-cuts', eligible: true, reason: null, alreadyLinked: false, collective: { standing: 'ok', reason: null } },
  }),
}));

import { LinkSetupSheet } from './LinkSetupSheet';

const press = async (name: string) => {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name }));
  });
};

beforeEach(() => {
  mockSlug = { available: true, reason: null };
  mockSlugAsked.mockClear();
  mockSend.mockClear();
});

describe('LinkSetupSheet with a collective', () => {
  const toName = async () => {
    await render(
      <LinkSetupSheet visible venueName="Aura" venueSlug="aura" prefill={{ slug: 'bright-cuts', name: 'Bright Cuts' }} onClose={jest.fn()} />,
    );
    await press('Continue'); // the venue
    await press('Continue'); // the level, full by default
    expect(mockSlugAsked).not.toHaveBeenCalledWith(expect.stringMatching(/./));
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Also start a collective' }));
    });
    await press('Continue'); // the collective
  };

  it('asks the name and address with the shared step, holding Continue until they are in', async () => {
    await toName();
    expect(screen.getByText('Aura will be the host.')).toBeTruthy();
    // The wizard said what a collective is a step earlier.
    expect(screen.queryByText('What a collective is')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBe(true);

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
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState?.disabled).toBeFalsy();
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
  });
});

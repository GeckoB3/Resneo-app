/**
 * The client edit sheet for someone whose "Can see client phone numbers and emails" is off (web roles
 * plan A2, §5.6): the phone and email are read-only "Hidden" with the tip, and a save never sends
 * them (the server ignores them from this person anyway). Everyone else edits them as before.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { GuestEditSheet, type GuestEditTarget } from './GuestEditSheet';
import { FULL_VIEWER_ACCESS, type ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockMutateAsync = jest.fn();
jest.mock('@/lib/queries/useGuestMutations', () => ({
  useUpdateGuest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

const HIDDEN: ViewerAccess = { canSeeClientContact: false, canExportClients: false, otherDiaries: 'book' };
const TIP = 'Your business has hidden client phone numbers and emails for you.';

const TARGET: GuestEditTarget = {
  id: 'guest-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '',
  email: '',
  notes: '',
  tags: '',
  marketingConsent: false,
  marketingOptOut: false,
  addressLine1: '',
  addressLine2: '',
  addressCity: '',
  addressPostcode: '',
};

async function open(access: ViewerAccess, target: GuestEditTarget = TARGET) {
  await render(
    <ViewerAccessProvider value={access}>
      <GuestEditSheet target={target} onClose={jest.fn()} />
    </ViewerAccessProvider>,
  );
}

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue({});
});

describe('GuestEditSheet with hidden contacts', () => {
  it('shows the phone and email as read-only "Hidden", with the tip', async () => {
    await open(HIDDEN);
    const hidden = screen.getAllByDisplayValue('Hidden');
    expect(hidden).toHaveLength(2);
    for (const field of hidden) expect(field.props.editable).toBe(false);
    expect(screen.getAllByText(TIP)).toHaveLength(2);
  });

  it('saves a name change without sending a phone or email', async () => {
    await open(HIDDEN);
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('Ada'), 'Augusta');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({ first_name: 'Augusta' });
  });

  it('hides them too when the response said contacts_hidden', async () => {
    await open(FULL_VIEWER_ACCESS, { ...TARGET, contactsHidden: true });
    expect(screen.getAllByDisplayValue('Hidden')).toHaveLength(2);
  });

  it('keeps both fields editable for someone who can see contacts', async () => {
    await open(FULL_VIEWER_ACCESS, { ...TARGET, phone: '07700900000', email: 'ada@example.com' });
    expect(screen.queryByDisplayValue('Hidden')).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue('ada@example.com'), 'ada.l@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({ email: 'ada.l@example.com' });
  });
});

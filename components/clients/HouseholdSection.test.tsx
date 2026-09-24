/**
 * HouseholdSection: Unlink and the add-member search (web QA FD-9, 2026-09-23).
 *
 * The web added DELETE /api/venue/guests/[guestId]/household?other_guest_id= and an
 * Unlink action per member, asked first with "Unlink {name}?" (or "Leave the
 * household?" on the contact's own row, which reads "(this client)"). The search for
 * a new member leaves out people already in the household.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { HouseholdSection, unlinkConfirmCopy } from './HouseholdSection';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    terminology: { client: 'Client', booking: 'Booking', staff: 'Staff' },
  }),
}));

const mockHouseholds = {
  households: [
    {
      id: 'hh-1',
      name: null,
      members: [
        { guest_id: 'guest-a', name: 'Ada Lovelace', is_primary: true },
        { guest_id: 'guest-b', name: 'Ben Lee', is_primary: false },
      ],
    },
  ],
};
const mockUnlink = jest.fn();
const mockLink = jest.fn();
jest.mock('@/lib/queries/useGuestHousehold', () => ({
  useGuestHousehold: () => ({ data: mockHouseholds, isLoading: false }),
  useAddToHousehold: () => ({ mutateAsync: mockLink, isPending: false }),
  useUnlinkFromHousehold: () => ({ mutateAsync: mockUnlink, isPending: false }),
}));

jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({
    data: {
      guests: [
        { id: 'guest-b', first_name: 'Ben', last_name: 'Lee', email: 'ben@example.com', phone: null },
        { id: 'guest-c', first_name: 'Cat', last_name: 'Lee', email: 'cat@example.com', phone: null },
      ],
    },
    isFetching: false,
  }),
}));

async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}

/** The confirm sheet's button is the last "Unlink" on screen. */
function confirmButton() {
  const all = screen.getAllByText('Unlink');
  return all[all.length - 1];
}

beforeEach(() => {
  mockUnlink.mockReset();
  mockLink.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

describe('HouseholdSection', () => {
  it("marks this contact's own row as the web does", async () => {
    await render(<HouseholdSection guestId="guest-a" />);
    expect(screen.getByText('(this client)')).toBeTruthy();
    expect(screen.getByText('Ben Lee')).toBeTruthy();
  });

  it('unlinks a member after asking first', async () => {
    mockUnlink.mockResolvedValueOnce({ success: true, household_ids: ['hh-1'], dissolved: true });
    await render(<HouseholdSection guestId="guest-a" />);

    await press(screen.getByLabelText('Unlink Ben Lee'));
    expect(screen.getByText('Unlink Ben Lee?')).toBeTruthy();
    expect(
      screen.getByText(
        'Ben Lee will no longer be linked to this household. Their bookings and details stay as they are.',
      ),
    ).toBeTruthy();
    expect(mockUnlink).not.toHaveBeenCalled();

    await press(confirmButton());
    expect(mockUnlink).toHaveBeenCalledWith('guest-b');
    expect(mockToast.success).toHaveBeenCalledWith('Ben Lee is no longer in the household.');
    expect(screen.queryByText('Unlink Ben Lee?')).toBeNull();
  });

  it('asks to leave the household on the contact itself', async () => {
    mockUnlink.mockResolvedValueOnce({ success: true, household_ids: ['hh-1'], dissolved: true });
    await render(<HouseholdSection guestId="guest-a" />);

    await press(screen.getByLabelText('Take this client out of the household'));
    expect(screen.getByText('Leave the household?')).toBeTruthy();

    await press(confirmButton());
    expect(mockUnlink).toHaveBeenCalledWith('guest-a');
    expect(mockToast.success).toHaveBeenCalledWith('Removed from the household.');
  });

  it('changes nothing when the confirm is cancelled', async () => {
    await render(<HouseholdSection guestId="guest-a" />);

    await press(screen.getByLabelText('Unlink Ben Lee'));
    await press(screen.getByText('Cancel'));

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(screen.queryByText('Unlink Ben Lee?')).toBeNull();
  });

  it('shows the server message when the unlink fails', async () => {
    const { ApiError } = jest.requireActual('@/lib/api/client');
    mockUnlink.mockRejectedValueOnce(new ApiError('Could not unlink them. Please try again.', 500));
    await render(<HouseholdSection guestId="guest-a" />);

    await press(screen.getByLabelText('Unlink Ben Lee'));
    await press(confirmButton());

    expect(mockToast.error).toHaveBeenCalledWith('Could not unlink them. Please try again.');
  });

  it('leaves people already in the household out of the add-member search', async () => {
    await render(<HouseholdSection guestId="guest-a" />);

    await press(screen.getByText('Link member'));
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('At least 2 characters…'), 'lee');
    });

    await waitFor(() => expect(screen.getByText('Cat Lee')).toBeTruthy());
    // Ben is a member already: listed in the card, not offered in the search.
    expect(screen.queryByText('ben@example.com')).toBeNull();
    expect(screen.getByText('cat@example.com')).toBeTruthy();
  });
});

describe('unlinkConfirmCopy', () => {
  it('falls back to "this client" for a member with no name', () => {
    expect(
      unlinkConfirmCopy({ guest_id: 'x', name: null, is_primary: false }, 'guest-a', 'client').title,
    ).toBe('Unlink this client?');
  });
});

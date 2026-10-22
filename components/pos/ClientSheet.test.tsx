/**
 * The till's "Add a client" sheet (UX spec §3.11, web `ClientDialog`): search existing contacts,
 * create one in place, or carry on without. Until 2026-10-11 the app had no way to create one, and
 * a search with no match showed nothing at all.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/ui/Sheet', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Stylist' } }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));

let mockGuests: { data?: { guests: unknown[] }; isLoading: boolean; isError: boolean } = {
  data: { guests: [] },
  isLoading: false,
  isError: false,
};
jest.mock('@/lib/queries/useGuests', () => ({ useGuests: () => mockGuests }));

const mockCreate = jest.fn();
jest.mock('@/lib/queries/useCreateGuest', () => ({
  useCreateGuest: () => ({ mutateAsync: mockCreate, isPending: false }),
}));

import { ClientSheet } from '@/components/pos/SaleSheets';
import { makeSale } from '@/lib/pos/test-sale';

const sale = makeSale({ guest: null, version: 3 });

beforeEach(() => {
  mockCreate.mockReset();
  mockGuests = { data: { guests: [] }, isLoading: false, isError: false };
});

describe('ClientSheet', () => {
  it('says when nothing matches the search', async () => {
    await render(<ClientSheet visible onClose={jest.fn()} sale={sale} send={jest.fn()} />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search by name, phone or email'), 'Jo Bloggs');
    });
    expect(screen.getByText('Nothing matches "Jo Bloggs".')).toBeTruthy();
  });

  it('creates a new client from the search and attaches them to the sale', async () => {
    mockCreate.mockResolvedValue({ guest: { id: 'guest-new' } });
    const send = jest.fn().mockResolvedValue({});
    const onClose = jest.fn();
    await render(<ClientSheet visible onClose={onClose} sale={sale} send={send} />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search by name, phone or email'), 'Jo Bloggs');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('New client'));
    });
    // The typed name starts the form; the sheet's own title says what it is.
    expect(screen.getByDisplayValue('Jo')).toBeTruthy();
    expect(screen.getByDisplayValue('Bloggs')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('name@example.com'), 'jo@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add client'));
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ first_name: 'Jo', last_name: 'Bloggs', email: 'jo@example.com' }),
    );
    expect(send).toHaveBeenCalledWith({ action: '', method: 'PATCH', body: { version: 3, guest_id: 'guest-new' } });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not put an email or phone number into the name fields', async () => {
    await render(<ClientSheet visible onClose={jest.fn()} sale={sale} send={jest.fn()} />);
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search by name, phone or email'), '07911 123456');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('New client'));
    });
    expect(screen.queryByDisplayValue('07911')).toBeNull();
  });

  it('goes back to the search from the new client form', async () => {
    await render(<ClientSheet visible onClose={jest.fn()} sale={sale} send={jest.fn()} />);
    await act(async () => {
      fireEvent.press(screen.getByText('New client'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'));
    });
    expect(screen.getByPlaceholderText('Search by name, phone or email')).toBeTruthy();
  });
});

/**
 * Web roles plan A2 (§5.6): someone whose client contacts are hidden searches the till's clients by
 * name only, sees "Hidden" where a match's phone and email would be, and a new client whose typed
 * details belong to someone else is refused with the server's words.
 */
describe('ClientSheet with hidden contacts', () => {
  const HIDDEN = { canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' as const };

  async function renderHidden() {
    const { ViewerAccessProvider } = jest.requireActual<typeof import('@/providers/ViewerAccessProvider')>(
      '@/providers/ViewerAccessProvider',
    );
    await render(
      <ViewerAccessProvider value={HIDDEN}>
        <ClientSheet visible onClose={jest.fn()} sale={sale} send={jest.fn()} />
      </ViewerAccessProvider>,
    );
  }

  it('asks for a name and shows "Hidden" on each match', async () => {
    mockGuests = {
      data: { guests: [{ id: 'g1', first_name: 'Jo', last_name: 'Bloggs', email: null, phone: null }] },
      isLoading: false,
      isError: false,
    };
    await renderHidden();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search by name'), 'Jo');
    });
    expect(screen.getByText('Jo Bloggs')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
  });

  it("shows the server's words when a new client's details belong to someone else", async () => {
    const { ApiError } = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
    const message = 'These details belong to another client. Search by name, or ask an admin.';
    mockCreate.mockRejectedValue(new ApiError(message, 409, { error: message, code: 'CONTACT_BELONGS_TO_OTHER_CLIENT' }));
    await renderHidden();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search by name'), 'Jo Bloggs');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('New client'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('name@example.com'), 'someone@example.com');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Add client'));
    });
    expect(screen.getByText(message)).toBeTruthy();
  });
});

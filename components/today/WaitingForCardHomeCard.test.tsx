/**
 * The Today screen's card-on-file nudge (card-on-file-plan §6.5): shown only when bookings wait,
 * "View" opens the list filtered from today, "Send card requests" asks first with the filter and
 * count; hidden on an older server.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/lib/haptics', () => ({ hapticSelect: jest.fn(), hapticSuccess: jest.fn(), hapticTap: jest.fn() }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/providers/VenueProvider', () => ({ useVenueContext: () => ({ venue: { timezone: 'Europe/London' } }) }));
jest.mock('@/lib/dates/use-venue-today', () => ({ useVenueToday: () => '2026-11-17' }));

let mockRows: unknown[] | undefined;
const mockRangeArgs: unknown[] = [];
jest.mock('@/lib/queries/useBookingsRange', () => ({
  useBookingsRange: (args: unknown) => {
    mockRangeArgs.push(args);
    return { data: mockRows ? { bookings: mockRows } : undefined, isLoading: false };
  },
}));
const mockSend = jest.fn();
const mockPreview = jest.fn();
jest.mock('@/lib/queries/useCardsOnFile', () => ({
  ...jest.requireActual('@/lib/queries/useCardsOnFile'),
  useConfirmWithoutCard: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSendCardRequests: () => ({ mutateAsync: mockSend, isPending: false }),
  usePreviewCardRequests: () => ({ mutateAsync: mockPreview, isPending: false }),
  useUndoConfirmWithoutCard: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import { WAITING_FOR_CARD_HREF, WaitingForCardHomeCard } from './WaitingForCardHomeCard';

beforeEach(() => {
  mockRows = undefined;
  mockRangeArgs.length = 0;
  mockPush.mockReset();
  mockSend.mockReset();
  mockPreview.mockReset();
  mockPreview.mockResolvedValue({
    supported: true,
    clients: 2,
    emails: 2,
    texts: 0,
    reopened: 0,
    skipped: [],
    message: 'This sends to 2 clients: 2 emails.',
  });
});

describe('WaitingForCardHomeCard', () => {
  it('shows the count with View and Send card requests', async () => {
    mockRows = [
      { id: 'a', card_state: 'waiting' },
      { id: 'b', card_state: 'waiting' },
    ];
    mockSend.mockResolvedValue({ clients: 2, emails: 2, texts: 0, reopened: 0, skipped: [], message: '2 clients: 2 emails and 0 texts.' });
    await render(<WaitingForCardHomeCard />);
    expect(mockRangeArgs[0]).toEqual({ from: '2026-11-17', to: '2027-11-17', cardState: 'waiting', enabled: true });
    expect(screen.getByText('2 upcoming bookings are waiting for a card')).toBeTruthy();
    await fireEvent.press(screen.getByText('View'));
    expect(mockPush).toHaveBeenCalledWith(WAITING_FOR_CARD_HREF);
    await fireEvent.press(screen.getByText('Send card requests'));
    expect(screen.getByText('Send card requests for 2 bookings?')).toBeTruthy();
    expect(await screen.findByText(/This sends to 2 clients: 2 emails\./)).toBeTruthy();
    const buttons = screen.getAllByText('Send card requests');
    await fireEvent.press(buttons[buttons.length - 1]);
    expect(mockSend).toHaveBeenCalledWith({
      filter: { card_state: 'waiting', from_date: '2026-11-17', to_date: '2027-11-17' },
      expectedCount: 2,
    });
    expect(screen.getByText('2 clients: 2 emails and 0 texts.')).toBeTruthy();
  });

  it('is hidden when nothing waits', async () => {
    mockRows = [];
    await render(<WaitingForCardHomeCard />);
    expect(screen.queryByText(/waiting for a card/)).toBeNull();
  });

  it('is hidden on an older server (rows without card_state)', async () => {
    mockRows = [{ id: 'a', deposit_status: 'Pending' }];
    await render(<WaitingForCardHomeCard />);
    expect(screen.queryByText(/waiting for a card/)).toBeNull();
  });
});

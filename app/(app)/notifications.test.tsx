/**
 * The bell's two tabs (web booking-activity plan, BA2). "Bookings" is the default and lists new
 * bookings, cancellations and moves as the server words them; "Linked businesses" is the old list,
 * shown only where the venue has linked-business activity. One tab means no tab bar, and a server
 * without the Bookings route (404) keeps the old screen.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const Screen = () => null;
  return { Stack: { Screen }, useRouter: () => ({ push: mockPush, back: jest.fn() }) };
});
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

let mockNotifications: unknown[] = [];
let mockUnread = 0;
jest.mock('@/lib/queries/useNotifications', () => ({
  useNotifications: () => ({
    data: { notifications: mockNotifications, unreadCount: mockUnread, venueId: 'v1' },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  useMarkNotificationsRead: () => ({ mutate: jest.fn(), isPending: false }),
  useLinkedNotificationPrefs: () => ({ data: undefined, isLoading: true, isError: false }),
  useUpdateLinkedNotificationPrefs: () => ({ mutate: jest.fn(), isPending: false }),
}));

let mockRole = 'staff';
jest.mock('@/lib/queries/useStaffMe', () => ({
  useStaffMe: () => ({ data: { staff: { role: mockRole } }, isLoading: false }),
}));

let mockLinks: { status: string }[] = [];
const mockUseLinkedVenues = jest.fn((_options?: { enabled?: boolean }) => ({
  data: { links: mockLinks },
}));
jest.mock('@/lib/queries/useLinkedVenues', () => ({
  useLinkedVenues: (options?: { enabled?: boolean }) => mockUseLinkedVenues(options),
}));

type MockActivity = {
  unavailable?: boolean;
  items?: unknown[];
  hasCalendars?: boolean;
  onlyMine?: boolean;
  isLoading?: boolean;
  isError?: boolean;
};
let mockActivity: MockActivity = {};
const mockRefetch = jest.fn();
const mockUseBookingActivity = jest.fn((_params: { kind: string; mine: boolean }) => ({
  query: {
    data: mockActivity.isLoading || mockActivity.isError ? undefined : { pages: [] },
    isLoading: mockActivity.isLoading ?? false,
    isPlaceholderData: false,
    isError: mockActivity.isError ?? false,
    error: null,
    isRefetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: mockRefetch,
  },
  unavailable: mockActivity.unavailable ?? false,
  items: mockActivity.items ?? [],
  hasCalendars: mockActivity.hasCalendars ?? false,
  onlyMine: mockActivity.onlyMine ?? false,
}));
jest.mock('@/lib/queries/useBookingActivity', () => ({
  useBookingActivity: (params: { kind: string; mine: boolean }) => mockUseBookingActivity(params),
}));

import NotificationsScreen from '@/app/(app)/notifications';

const linkedNotice = {
  id: 'n1',
  type: 'link_booking_created',
  category: 'create',
  title: 'Sage Studio booked a client in your calendar',
  body: '',
  href: '/dashboard',
  actorVenueName: 'Sage Studio',
  read: true,
  createdAt: '2026-11-25T09:00:00.000Z',
};

const newRow = {
  id: 'a1',
  kind: 'new',
  at: '2026-11-25T10:42:00.000Z',
  at_label: 'Today 10:42am',
  booking_id: 'booking-1',
  client_name: 'Sam Client',
  text: 'Booked Full Head Highlights with Jenny Ross for Tue 9 Dec, 2:30pm',
  by_label: 'Online',
  state: 'waiting_for_card',
};
const movedRow = {
  id: 'a2',
  kind: 'moved',
  at: '2026-11-24T16:20:00.000Z',
  at_label: 'Yesterday 4:20pm',
  booking_id: 'booking-2',
  client_name: 'Alex Guest',
  text: 'Moved Cut from Tue 9 Dec, 2:30pm to Thu 11 Dec, 10:00am',
  by_label: null,
  state: null,
};

function lastParams() {
  const calls = mockUseBookingActivity.mock.calls;
  return calls[calls.length - 1][0];
}

beforeEach(() => {
  mockNotifications = [];
  mockUnread = 0;
  mockRole = 'staff';
  mockLinks = [];
  mockActivity = {};
  mockPush.mockReset();
  mockRefetch.mockReset();
  mockUseBookingActivity.mockClear();
  mockUseLinkedVenues.mockClear();
});

describe('the bell tabs', () => {
  it('shows Bookings alone, with no tab bar, for a venue with no linked businesses', async () => {
    mockActivity = { items: [newRow] };
    await render(<NotificationsScreen />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('Linked businesses')).toBeNull();
    expect(screen.getByText('Sam Client')).toBeTruthy();
  });

  it('shows both tabs, Bookings first and selected, when the linked list has rows', async () => {
    mockNotifications = [linkedNotice];
    mockActivity = { items: [newRow] };
    await render(<NotificationsScreen />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByText('Bookings')).toBeTruthy();
    expect(screen.getByText('Linked businesses')).toBeTruthy();
    expect(screen.getByText('Sam Client')).toBeTruthy();
    expect(screen.queryByText(linkedNotice.title)).toBeNull();

    await fireEvent.press(screen.getByText('Linked businesses'));
    expect(screen.getByText(linkedNotice.title)).toBeTruthy();
    expect(screen.queryByText('Sam Client')).toBeNull();
  });

  it('shows the Linked businesses tab to an admin whose venue has an accepted link, before any notice', async () => {
    mockRole = 'admin';
    mockLinks = [{ status: 'accepted' }];
    await render(<NotificationsScreen />);
    expect(mockUseLinkedVenues).toHaveBeenLastCalledWith({ enabled: true });
    expect(screen.getAllByRole('tab')).toHaveLength(2);

    await fireEvent.press(screen.getByText('Linked businesses'));
    expect(screen.getByText('Activity from your linked businesses will appear here.')).toBeTruthy();
  });

  it('never reads the links for someone who is not an admin', async () => {
    mockLinks = [{ status: 'accepted' }];
    await render(<NotificationsScreen />);
    expect(mockUseLinkedVenues).toHaveBeenLastCalledWith({ enabled: false });
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('a server without the Bookings route (404) keeps the old linked list, with no tab bar', async () => {
    mockActivity = { unavailable: true };
    mockNotifications = [linkedNotice];
    await render(<NotificationsScreen />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('Bookings')).toBeNull();
    expect(screen.getByText(linkedNotice.title)).toBeTruthy();
  });

  it('a 404 with nothing linked still shows the old empty state, not an error', async () => {
    mockActivity = { unavailable: true };
    await render(<NotificationsScreen />);
    expect(screen.getByText('Activity from your linked businesses will appear here.')).toBeTruthy();
  });
});

describe('the Bookings tab', () => {
  it('shows the name, the server text, who and when, and the waiting pill', async () => {
    mockActivity = { items: [newRow, movedRow] };
    await render(<NotificationsScreen />);
    expect(screen.getByText('Sam Client')).toBeTruthy();
    expect(screen.getByText(newRow.text)).toBeTruthy();
    expect(screen.getByText('Online · Today 10:42am')).toBeTruthy();
    expect(screen.getByText('Waiting for card')).toBeTruthy();
    // No by_label: the time alone, and no pill.
    expect(screen.getByText('Yesterday 4:20pm')).toBeTruthy();
    expect(screen.getAllByText(/Waiting for/)).toHaveLength(1);
  });

  it('opens the booking a row names, the same route a push opens', async () => {
    mockActivity = { items: [newRow] };
    await render(<NotificationsScreen />);
    await fireEvent.press(screen.getByTestId('booking-activity-row-a1'));
    expect(mockPush).toHaveBeenCalledWith('/booking/booking-1');
  });

  it('asks for All first, and the chips change the kind', async () => {
    await render(<NotificationsScreen />);
    expect(lastParams()).toEqual({ kind: 'all', mine: false });

    await fireEvent.press(screen.getByText('Cancelled'));
    expect(lastParams()).toEqual({ kind: 'cancelled', mine: false });
    await fireEvent.press(screen.getByText('Moved'));
    expect(lastParams()).toEqual({ kind: 'moved', mine: false });
    await fireEvent.press(screen.getByText('New'));
    expect(lastParams()).toEqual({ kind: 'new', mine: false });
  });

  it('offers "Just my clients" to someone who works a calendar and sees the whole business', async () => {
    mockActivity = { hasCalendars: true, onlyMine: false };
    await render(<NotificationsScreen />);
    const toggle = screen.getByLabelText('Just my clients');
    await fireEvent(toggle, 'valueChange', true);
    expect(lastParams()).toEqual({ kind: 'all', mine: true });
  });

  it('has no switch for someone with no calendar', async () => {
    mockActivity = { hasCalendars: false };
    await render(<NotificationsScreen />);
    expect(screen.queryByLabelText('Just my clients')).toBeNull();
    expect(screen.queryByText("You see your own clients' bookings.")).toBeNull();
  });

  it('says so, with no switch, to someone who only ever sees their own clients', async () => {
    mockActivity = { hasCalendars: true, onlyMine: true };
    await render(<NotificationsScreen />);
    expect(screen.queryByLabelText('Just my clients')).toBeNull();
    expect(screen.getByText("You see your own clients' bookings.")).toBeTruthy();
  });

  it('has an empty state that does not mention linked businesses', async () => {
    mockNotifications = [linkedNotice];
    await render(<NotificationsScreen />);
    expect(
      screen.getByText('Nothing yet. New bookings, cancellations and moves will appear here.'),
    ).toBeTruthy();
    expect(screen.queryByText(/linked businesses will appear/)).toBeNull();
  });

  it('shows an error with a retry', async () => {
    mockActivity = { isError: true };
    await render(<NotificationsScreen />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

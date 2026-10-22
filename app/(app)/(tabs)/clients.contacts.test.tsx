/**
 * The Contacts tab for someone whose "Can see client phone numbers and emails" or "Can export client
 * data" is off (web roles plan A2, §5.6):
 *   - each row reads "Hidden" where the phone or email would be, with no Call or Text swipe;
 *   - the search asks for a name, since the server matches names only for them;
 *   - "Export CSV" is gone without the export switch, even for an admin.
 * Everyone else keeps the contact line, the swipes, the full search and the export.
 *
 * jest hoists mock factories above imports, so closed-over vars are prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/lib/env', () => ({
  getWebUrl: () => 'https://staff.example.com',
  isBackendConfigured: () => true,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useGuestTags', () => ({ useGuestTags: () => ({ data: { tags: [] } }) }));

const ADA = {
  id: 'g1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: '+447911123456',
  tags: [],
  visit_count: 2,
  no_show_count: 0,
  last_visit_date: null,
  next_booking_date: null,
  next_booking_time: null,
  total_bookings: 2,
  upcoming_booking_count: 0,
  identifiability_tier: 'identified',
};
let mockGuestsData: Record<string, unknown> = {};
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => ({
    data: mockGuestsData,
    isLoading: false,
    isError: false,
    isFetching: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  }),
  useGuestCustomFields: () => ({ data: { fields: [] }, refetch: jest.fn() }),
}));

jest.mock('@/lib/realtime/useVenueLiveSync', () => ({ useVenueLiveSync: () => 'idle' }));

// The swipe actions, drawn as plain labels so the test can see which are offered.
jest.mock('@/components/ui/SwipeRow', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SwipeRow: ({ rightActions, children }: { rightActions: { key: string; label: string }[]; children: ReactNode }) =>
      React.createElement(
        View,
        null,
        children,
        ...rightActions.map((a) => React.createElement(Text, { key: a.key }, `swipe:${a.label}`)),
      ),
  };
});

jest.mock('@/components/clients/BulkActionSheets', () => ({
  BulkMessageSheet: () => null,
  BulkRemoveTagSheet: () => null,
  BulkTagSheet: () => null,
}));
jest.mock('@/components/clients/ContactFilterSheet', () => {
  const actual = jest.requireActual('@/components/clients/ContactFilterSheet');
  return { ...actual, ContactFilterSheet: () => null };
});
jest.mock('@/components/clients/CreateContactSheet', () => ({ CreateContactSheet: () => null }));

jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    terminology: { client: 'Client' },
    venue: { id: 'venue-1', current_user_role: 'admin' },
    bookingModel: 'unified_scheduling',
  }),
}));

import ClientsScreen from '@/app/(app)/(tabs)/clients';
import { FULL_VIEWER_ACCESS, type ViewerAccess } from '@/lib/roles/roles';
import { ViewerAccessProvider } from '@/providers/ViewerAccessProvider';

function renderAs(access: ViewerAccess): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ViewerAccessProvider value={access}>{children}</ViewerAccessProvider>
    </QueryClientProvider>
  );
  return render((<ClientsScreen />) as ReactElement, { wrapper: Wrapper });
}

describe('Contacts tab: hidden contacts and the export switch', () => {
  it('shows "Hidden", offers no call or text, and searches names only', async () => {
    mockGuestsData = {
      guests: [{ ...ADA, email: null, phone: null }],
      total_count: 1,
      page: 0,
      contacts_hidden: true,
    };
    await renderAs({ canSeeClientContact: false, canExportClients: true, otherDiaries: 'book' });

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.queryByText('swipe:Call')).toBeNull();
    expect(screen.queryByText('swipe:Text')).toBeNull();
    expect(screen.getByPlaceholderText('Search by name')).toBeTruthy();
  });

  it('hides "Export CSV" from an admin without the export switch', async () => {
    mockGuestsData = { guests: [ADA], total_count: 1, page: 0 };
    await renderAs({ ...FULL_VIEWER_ACCESS, canExportClients: false });
    expect(screen.queryByText('Export CSV')).toBeNull();
    // Importing is not an export.
    expect(screen.getAllByText('Import contacts').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the contact line, the swipes, the full search and the export for everyone else', async () => {
    mockGuestsData = { guests: [ADA], total_count: 1, page: 0 };
    await renderAs(FULL_VIEWER_ACCESS);

    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByText('swipe:Call')).toBeTruthy();
    expect(screen.getByText('swipe:Text')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search clients by name, phone, or email')).toBeTruthy();
    expect(screen.getByText('Export CSV')).toBeTruthy();
  });
});

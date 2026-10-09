/**
 * Clients-05: "Import contacts" on the Contacts tab opens the in-app data import
 * wizard (`/import`, web parity with `/dashboard/import`).
 *
 * These tests pin:
 *   - the admin action row shows an "Import contacts" chip; pressing it pushes
 *     the in-app import route (no browser);
 *   - the empty directory offers the same action to admins;
 *   - non-admins see neither.
 *
 * The screen pulls many data hooks/providers; each is mocked so the render is
 * about the import entry point, not the directory. jest hoists mock factories
 * above imports, so closed-over vars are prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

// --- No browser is opened any more: fail loudly if one is ------------------
const mockOpenBrowserAsync = jest.fn((..._args: unknown[]) => Promise.resolve({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock('@/lib/env', () => ({
  getWebUrl: () => 'https://staff.example.com',
  isBackendConfigured: () => true,
}));

// --- expo-router ------------------------------------------------------------
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// --- react-native-safe-area-context (Screen uses insets) -------------------
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement(View, props, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

// --- Toast ------------------------------------------------------------------
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// --- Data hooks: return ready, empty-but-resolved data ----------------------
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/queries/useGuestTags', () => ({
  useGuestTags: () => ({ data: { tags: [] } }),
}));
const mockGuestsQuery = {
  data: { guests: [], total_count: 0, page: 0 },
  isLoading: false,
  isError: false,
  isFetching: false,
  isRefetching: false,
  error: null,
  refetch: jest.fn(),
};
jest.mock('@/lib/queries/useGuests', () => ({
  useGuests: () => mockGuestsQuery,
  useGuestCustomFields: () => ({ data: { fields: [] }, refetch: jest.fn() }),
}));

// --- Realtime: inert ---------------------------------------------------------
jest.mock('@/lib/realtime/useVenueLiveSync', () => ({
  useVenueLiveSync: () => 'idle',
}));

// --- Child sheets: render nothing (not under test here) ---------------------
jest.mock('@/components/clients/BulkActionSheets', () => ({
  BulkMessageSheet: () => null,
  BulkRemoveTagSheet: () => null,
  BulkTagSheet: () => null,
}));
jest.mock('@/components/clients/ContactFilterSheet', () => {
  const actual = jest.requireActual('@/components/clients/ContactFilterSheet');
  return { ...actual, ContactFilterSheet: () => null };
});
jest.mock('@/components/clients/CreateContactSheet', () => ({
  CreateContactSheet: () => null,
}));

// --- VenueProvider: mutable so we can flip the role -------------------------
let mockVenue: { id: string; current_user_role: string };
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    terminology: { client: 'Client' },
    venue: mockVenue,
    bookingModel: 'appointments',
  }),
}));

import ClientsScreen, { IMPORT_ROUTE } from '@/app/(app)/(tabs)/clients';

function withQueryClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockOpenBrowserAsync.mockClear();
  mockPush.mockClear();
  mockVenue = { id: 'venue-1', current_user_role: 'admin' };
});

describe('Contacts tab: Import contacts', () => {
  it('shows an admin "Import contacts" chip that opens the in-app import wizard', async () => {
    await withQueryClient(<ClientsScreen />);

    // The action-row chip + the empty-state action both read "Import contacts".
    const matches = screen.getAllByText('Import contacts');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    await press(() => matches[0]);
    expect(mockPush).toHaveBeenCalledWith('/import');
    expect(IMPORT_ROUTE).toBe('/import');
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it('also offers it from the empty-state action for admins', async () => {
    await withQueryClient(<ClientsScreen />);

    // Empty directory + no search/filter: both the chip AND the EmptyState action.
    const matches = screen.getAllByText('Import contacts');
    expect(matches.length).toBe(2);
    await press(() => matches[1]);
    expect(mockPush).toHaveBeenCalledWith('/import');
  });

  it('hides the import affordance from non-admins', async () => {
    mockVenue = { id: 'venue-1', current_user_role: 'staff' };
    await withQueryClient(<ClientsScreen />);

    expect(screen.queryByText('Import contacts')).toBeNull();
  });
});

/**
 * Clients-05 (High, v1 = link-out): the "Import contacts" link-out from the
 * Contacts tab.
 *
 * The CSV/Excel import wizard is a deliberate mobile scope exclusion; instead the
 * Contacts tab surfaces a discoverable, admin-only link-out to the web Data-import
 * hub. These tests pin:
 *   - the admin sort/action row shows an "Import contacts" chip; pressing it opens
 *     the resolved web URL in an in-app browser (with a Linking fallback);
 *   - non-admins do NOT see the chip;
 *   - `webDashboardUrl` builds the URL from the configured web origin, falling back
 *     to the production origin.
 *
 * The screen pulls many data hooks/providers; each is mocked so the render is
 * about the link-out, not the directory. jest hoists mock factories above imports,
 * so closed-over vars are prefixed `mock*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

// --- In-app browser + system-browser fallback ------------------------------
const mockOpenBrowserAsync = jest.fn((..._args: unknown[]) => Promise.resolve({ type: 'opened' }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));
const mockExpoOpenURL = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockExpoOpenURL(...args),
}));

// --- env: a configured web origin so the URL is deterministic --------------
jest.mock('@/lib/env', () => ({
  getWebUrl: () => 'https://staff.example.com',
  isBackendConfigured: () => true,
}));

// --- expo-router ------------------------------------------------------------
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

import ClientsScreen, { WEB_IMPORT_PATH, webDashboardUrl } from '@/app/(app)/(tabs)/clients';

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
  mockExpoOpenURL.mockClear();
  mockVenue = { id: 'venue-1', current_user_role: 'admin' };
});

describe('Contacts tab — Import link-out', () => {
  it('shows an admin "Import contacts" chip that opens the web import hub', async () => {
    await withQueryClient(<ClientsScreen />);

    // The action-row chip + the empty-state action both read "Import contacts".
    const matches = screen.getAllByText('Import contacts');
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Pressing the first (the chip) opens the resolved web URL in-app.
    await press(() => matches[0]);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://staff.example.com/dashboard/import',
    );
  });

  it('also surfaces the link-out from the empty-state action for admins', async () => {
    await withQueryClient(<ClientsScreen />);

    // Empty directory + no search/filter → both the chip AND the EmptyState
    // action are present, so there are two "Import contacts" affordances.
    expect(screen.getAllByText('Import contacts').length).toBe(2);
  });

  it('hides the import affordance from non-admins', async () => {
    mockVenue = { id: 'venue-1', current_user_role: 'staff' };
    await withQueryClient(<ClientsScreen />);

    expect(screen.queryByText('Import contacts')).toBeNull();
  });
});

describe('webDashboardUrl', () => {
  it('builds the URL on the configured web origin', () => {
    expect(webDashboardUrl(WEB_IMPORT_PATH)).toBe('https://staff.example.com/dashboard/import');
  });
});

/**
 * BookableCalendarsManager — reorder / slug-copy / DELETE (Availability Critical).
 *
 * Renders the manager with mocked query + mutation hooks and exercises:
 *  - up/down reorder → PATCH `sort_order` (dense 0..n-1)
 *  - booking-link slug Save + Copy → PATCH `slug` + clipboard write of the public URL
 *  - delete → ConfirmSheet → `useDeletePractitioner`
 *  - the plan calendar-limit 403 surfaces as an upgrade notice (not a raw toast)
 *
 * jest hoists mock factories above imports, so every variable a factory closes
 * over is prefixed `mock*` (the only out-of-scope names jest permits).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';

// expo-symbols renders the IconButton glyphs — stub to a host element.
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockClipboard = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockClipboard(...a) }));

jest.mock('@/lib/env', () => ({
  getWebUrl: () => 'https://app.resneo.com',
  isBackendConfigured: () => true,
}));

// Venue context — admin with a slug so booking links + reorder are enabled.
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ venue: { current_user_role: 'admin', slug: 'glow-bar', pricing_tier: 'plus' } }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// --- Mutation + query hook mocks (all mock-prefixed for jest hoisting) -------
const mockPatchMutateAsync = jest.fn((_input?: unknown) => Promise.resolve({}));
const mockCreateMutateAsync = jest.fn(() => Promise.resolve({ id: 'new', name: 'New' }));
const mockDeleteMutateAsync = jest.fn(() => Promise.resolve({}));

const mockPractitioners = [
  { id: 'c1', name: 'Alex', slug: 'alex', is_active: true, sort_order: 0 },
  { id: 'c2', name: 'Sam', slug: null, is_active: true, sort_order: 1 },
];
const mockRefetch = jest.fn();

jest.mock('@/lib/queries/usePractitioners', () => ({
  usePractitioners: () => ({
    data: { practitioners: mockPractitioners },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: mockRefetch,
  }),
  useCreateHostCalendar: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
}));
jest.mock('@/lib/queries/useAvailabilityManage', () => ({
  usePatchPractitioner: () => ({ mutateAsync: mockPatchMutateAsync, isPending: false }),
  useDeletePractitioner: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
}));
jest.mock('@/lib/queries/useServicesManage', () => ({
  useManagedServices: () => ({
    data: {
      services: [{ id: 's1', name: 'Cut' }],
      practitioner_services: [{ practitioner_id: 'c1', service_id: 's1' }],
    },
  }),
}));
jest.mock('@/lib/queries/useClassesManage', () => ({
  useManagedClasses: () => ({ data: { class_types: [] } }),
}));
jest.mock('@/lib/queries/useResourcesManage', () => ({
  useResourcesManageList: () => ({ data: [] }),
}));
jest.mock('@/lib/queries/useEventsManage', () => ({
  useManagedEvents: () => ({ data: [] }),
}));

import { BookableCalendarsManager } from '@/components/availability/BookableCalendarsManager';

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockPatchMutateAsync.mockClear();
  mockCreateMutateAsync.mockClear();
  mockDeleteMutateAsync.mockClear();
  mockClipboard.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  mockRefetch.mockClear();
});

describe('BookableCalendarsManager', () => {
  it('lists every calendar with its assignments', async () => {
    await render(<BookableCalendarsManager />);
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('Sam')).toBeTruthy();
    // Alex has the "Cut" service assigned.
    expect(screen.getByText('Cut')).toBeTruthy();
  });

  it('reorders via the down button → PATCHes dense sort_order', async () => {
    await render(<BookableCalendarsManager />);

    // Move Alex (index 0) down → [Sam, Alex] persisted as sort_order 0,1.
    await press(() => screen.getByLabelText('Move Alex down'));

    const calls = mockPatchMutateAsync.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        { id: 'c2', sort_order: 0 },
        { id: 'c1', sort_order: 1 },
      ]),
    );
  });

  it('saves a booking-link slug then copies the public URL', async () => {
    await render(<BookableCalendarsManager />);

    // Sam (2nd card) has no slug — type one, Save.
    const segInputs = screen.getAllByPlaceholderText('segment');
    await act(async () => {
      fireEvent.changeText(segInputs[1], 'sam-c');
    });
    await press(() => screen.getAllByText('Save link')[1]);
    expect(mockPatchMutateAsync).toHaveBeenCalledWith({ id: 'c2', slug: 'sam-c' });

    // Alex already has slug "alex" → Copy writes the public booking URL.
    await press(() => screen.getAllByText('Copy URL')[0]);
    await waitFor(() =>
      expect(mockClipboard).toHaveBeenCalledWith('https://app.resneo.com/book/glow-bar/alex'),
    );
  });

  it('deletes a calendar through the confirm sheet', async () => {
    await render(<BookableCalendarsManager />);

    await press(() => screen.getByLabelText('Delete Alex'));
    expect(screen.getByText('Remove calendar?')).toBeTruthy();

    await press(() => screen.getByText('Remove calendar'));
    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('c1');
  });

  it('shows an upgrade notice when create hits the plan calendar limit (403)', async () => {
    mockCreateMutateAsync.mockRejectedValueOnce(
      new ApiError('Upgrade your plan to add more calendars.', 403, {
        upgrade_required: true,
        error: 'Upgrade your plan to add more calendars.',
      }),
    );
    await render(<BookableCalendarsManager />);

    await press(() => screen.getByText('Add calendar'));
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('e.g. Studio A'), 'Studio B');
    });
    await press(() => screen.getByText('Add'));

    // The plan-limit message surfaces inline (not as a raw error toast).
    await waitFor(() => expect(screen.getByText(/Upgrade your plan/)).toBeTruthy());
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});

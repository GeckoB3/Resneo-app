/**
 * Clients-05: RecentImportsSection, the "Recent imports" list and the 24-hour Undo under the
 * venue-profile Data import area. The import routes take the app's Bearer token, so the Undo
 * runs here (after a confirm) and the hub link opens the in-app Data import screen.
 *
 * Covers:
 *  - data: rows with the status pill, imported counts and the undo window; Undo asks first,
 *    then posts and says what was kept; "See all imports" opens the hub;
 *  - an undone import: no counts, no Undo;
 *  - empty: the "No imports yet" line;
 *  - 403 (not an admin): a plain note, no retry;
 *  - a genuine error: "Could not load" and Try again;
 *  - loading: an inline line.
 *
 * jest hoists mock factories above imports, so closed-over vars are prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { ImportSessionRow } from '@/lib/queries/useImportSessions';

const mockRefetch = jest.fn();
let mockQuery: {
  data?: { sessions: ImportSessionRow[] };
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: typeof mockRefetch;
};
const mockUndo = jest.fn();

jest.mock('@/lib/queries/useImportSessions', () => {
  const actual = jest.requireActual('@/lib/queries/useImportSessions');
  return {
    // Keep the real isAuthGap so the component's branch logic is exercised, not stubbed.
    ...actual,
    useImportSessions: () => mockQuery,
    useUndoImportSession: () => ({ mutateAsync: mockUndo, isPending: false }),
  };
});
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({ terminology: { client: 'Client', booking: 'Appointment', staff: 'Staff' } }),
}));
// Render Sheet children inline (avoids gesture-handler/Modal) when visible.
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

import { RecentImportsSection } from '@/components/manage/RecentImportsSection';

function completeSession(over: Partial<ImportSessionRow> = {}): ImportSessionRow {
  return {
    id: 's1',
    status: 'complete',
    detected_platform: 'csv',
    total_rows: 120,
    imported_clients: 100,
    imported_bookings: 20,
    skipped_rows: 0,
    updated_existing: 0,
    undo_available_until: '2999-01-01T10:00:00.000Z',
    undone_at: null,
    created_at: '2026-06-18T09:30:00.000Z',
    completed_at: '2026-06-18T09:35:00.000Z',
    ai_mapping_used: true,
    ...over,
  };
}

async function press(getEl: () => Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(getEl());
  });
}

beforeEach(() => {
  mockRefetch.mockClear();
  mockUndo.mockReset();
  mockQuery = { data: undefined, isLoading: false, isError: false, error: null, refetch: mockRefetch };
});

describe('RecentImportsSection', () => {
  it('lists imports with status, counts and the undo window, and opens the hub', async () => {
    mockQuery.data = { sessions: [completeSession()] };
    const onOpenHub = jest.fn();
    await render(<RecentImportsSection onOpenHub={onOpenHub} />);

    expect(screen.getByText('Recent imports')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('100 clients, 20 bookings')).toBeTruthy();
    expect(screen.getByText(/Undo available until/)).toBeTruthy();

    await press(() => screen.getByText('See all imports'));
    expect(onOpenHub).toHaveBeenCalledTimes(1);
  });

  it('asks before undoing, then undoes in the app and says who was kept', async () => {
    mockQuery.data = { sessions: [completeSession()] };
    mockUndo.mockResolvedValue({
      ok: true,
      undo_summary: { kept_clients: 1, kept_client_names: ['Ann Lee'], kept_items: 0, kept_item_names: [] },
    });
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);

    await press(() => screen.getByText('Undo'));
    expect(screen.getByText('Undo this import?')).toBeTruthy();
    expect(mockUndo).not.toHaveBeenCalled();

    await press(() => screen.getByText('Undo import'));
    expect(mockUndo).toHaveBeenCalledWith('s1');
    expect(screen.getByText('Import undone.')).toBeTruthy();
    expect(screen.getByText(/1 client was kept.*Ann Lee/)).toBeTruthy();
  });

  it("shows the server's sentence when Undo fails", async () => {
    mockQuery.data = { sessions: [completeSession()] };
    mockUndo.mockRejectedValue(
      new ApiError('Undo window has expired', 400, { error: 'Undo window has expired' }),
    );
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);

    await press(() => screen.getByText('Undo'));
    await press(() => screen.getByText('Undo import'));
    expect(screen.getByText('Undo window has expired')).toBeTruthy();
  });

  it('shows an "Undone" pill and no Undo for an undone import', async () => {
    mockQuery.data = { sessions: [completeSession({ undone_at: '2026-06-18T12:00:00.000Z' })] };
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);

    expect(screen.getByText('Undone')).toBeTruthy();
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.queryByText('100 clients, 20 bookings')).toBeNull();
  });

  it('renders the empty copy when there are no sessions', async () => {
    mockQuery.data = { sessions: [] };
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);
    expect(screen.getByText(/No imports yet/)).toBeTruthy();
  });

  it('says only an admin can see imports on a 403, without a retry', async () => {
    mockQuery.isError = true;
    mockQuery.error = new ApiError('Forbidden: admin only', 403, { error: 'Forbidden: admin only' });
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);

    expect(screen.getByText('Only an admin can see and undo imports.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows a retry on a genuine network/5xx error', async () => {
    mockQuery.isError = true;
    mockQuery.error = new ApiError('Request failed (500)', 500);
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);

    expect(screen.getByText('Could not load recent imports.')).toBeTruthy();
    await press(() => screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows a loading line during the first fetch', async () => {
    mockQuery.isLoading = true;
    await render(<RecentImportsSection onOpenHub={jest.fn()} />);
    expect(screen.getByText('Loading recent imports…')).toBeTruthy();
  });
});

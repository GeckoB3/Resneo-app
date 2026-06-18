/**
 * Clients-05 (Medium): RecentImportsSection — the read-only "Recent imports"
 * list + 24-hour-undo surface under the venue-profile Data-import area.
 *
 * Exercises every state the component owns:
 *  - data → session rows render with status pill, imported counts and the
 *    "Undo available until" notice + an "Undo on the web" link-out for a
 *    completed, still-undoable import; the link-out opens the web import path;
 *  - empty → "No imports yet" copy;
 *  - auth gap (401/403) → the documented "managed on the web" fallback note
 *    (NOT an error/retry — the backend route is cookie-only);
 *  - genuine error (network/5xx) → "Could not load" + a Try-again retry;
 *  - loading → an inline loading line.
 *
 * The data hook (`useImportSessions`) is mocked directly so no QueryClient is
 * needed. jest hoists mock factories above imports, so closed-over vars are
 * prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { ImportSessionRow } from '@/lib/queries/useImportSessions';

// Mutable query result — each test sets data/error/flags before rendering.
const mockRefetch = jest.fn();
let mockQuery: {
  data?: { sessions: ImportSessionRow[] };
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: typeof mockRefetch;
};

jest.mock('@/lib/queries/useImportSessions', () => {
  const actual = jest.requireActual('@/lib/queries/useImportSessions');
  return {
    // Keep the real isAuthGap so the component's branch logic is exercised, not stubbed.
    ...actual,
    useImportSessions: () => mockQuery,
  };
});

import { RecentImportsSection } from '@/components/manage/RecentImportsSection';

const WEB_IMPORT_PATH = '/dashboard/import';

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
    // Far-future undo window so the Undo affordance shows.
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
  mockQuery = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
  };
});

describe('RecentImportsSection', () => {
  it('renders session rows with status, counts and undo notice, and links Undo to the web', async () => {
    mockQuery.data = { sessions: [completeSession()] };
    const onOpenWeb = jest.fn();

    await render(
      <RecentImportsSection onOpenWeb={onOpenWeb} webImportPath={WEB_IMPORT_PATH} />,
    );

    expect(screen.getByText('Recent imports')).toBeTruthy();
    // Status pill + imported summary.
    expect(screen.getByText('complete')).toBeTruthy();
    expect(screen.getByText('100 clients, 20 bookings')).toBeTruthy();
    // The 24h-undo notice.
    expect(screen.getByText(/Undo available until/)).toBeTruthy();

    // Undo is a web link-out (the POST route is cookie-only) → opens the hub path.
    await press(() => screen.getByText('Undo on the web'));
    expect(onOpenWeb).toHaveBeenCalledWith(WEB_IMPORT_PATH);
  });

  it('shows an "undone" pill and hides Undo for an already-undone import', async () => {
    mockQuery.data = {
      sessions: [completeSession({ undone_at: '2026-06-18T12:00:00.000Z' })],
    };
    await render(
      <RecentImportsSection onOpenWeb={jest.fn()} webImportPath={WEB_IMPORT_PATH} />,
    );

    expect(screen.getByText('Undone')).toBeTruthy();
    // No undo affordance once it's been undone.
    expect(screen.queryByText('Undo on the web')).toBeNull();
    // Imported counts are not shown for an undone import.
    expect(screen.queryByText('100 clients, 20 bookings')).toBeNull();
  });

  it('renders the empty copy when there are no sessions', async () => {
    mockQuery.data = { sessions: [] };
    await render(
      <RecentImportsSection onOpenWeb={jest.fn()} webImportPath={WEB_IMPORT_PATH} />,
    );

    expect(screen.getByText(/No imports yet/)).toBeTruthy();
  });

  it('falls back to the read-only "managed on the web" note on an auth gap (401)', async () => {
    mockQuery.isError = true;
    mockQuery.error = new ApiError('Unauthorised', 401, { error: 'Unauthorised' });

    await render(
      <RecentImportsSection onOpenWeb={jest.fn()} webImportPath={WEB_IMPORT_PATH} />,
    );

    expect(
      screen.getByText(/recent imports and the 24-hour undo are managed on the web/i),
    ).toBeTruthy();
    // It must NOT present this deterministic auth state as a retryable error.
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('shows a retry on a genuine network/5xx error', async () => {
    mockQuery.isError = true;
    mockQuery.error = new ApiError('Request failed (500)', 500);

    await render(
      <RecentImportsSection onOpenWeb={jest.fn()} webImportPath={WEB_IMPORT_PATH} />,
    );

    expect(screen.getByText('Could not load recent imports.')).toBeTruthy();
    await press(() => screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows a loading line during the first fetch', async () => {
    mockQuery.isLoading = true;
    await render(
      <RecentImportsSection onOpenWeb={jest.fn()} webImportPath={WEB_IMPORT_PATH} />,
    );

    expect(screen.getByText('Loading recent imports…')).toBeTruthy();
  });
});

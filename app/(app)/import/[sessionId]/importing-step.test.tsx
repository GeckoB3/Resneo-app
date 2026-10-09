/**
 * Import step (web `ImportingStepClient`): carries on an approved import a batch at a time and
 * shows the result (counts, the spot check, the report); never starts one, so an unapproved
 * import says so and points back; a server refusal of a batch as not approved stops the same way.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ sessionId: 's1' }),
}));
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { current_user_role: 'admin', currency: 'GBP' },
    isLoading: false,
    terminology: { client: 'Client', booking: 'Appointment', staff: 'Staff' },
  }),
}));
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
const mockShare = jest.fn(async (..._args: unknown[]) => ({ ok: true }));
jest.mock('@/lib/share/share-text-file', () => ({ shareTextFile: (...args: unknown[]) => mockShare(...args) }));

const mockApi = { progress: jest.fn(), executeBatch: jest.fn(), qa: jest.fn(), reportCsv: jest.fn() };
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => mockApi };
});

import { ApiError } from '@/lib/api/client';
import ImportingStepScreen from '@/app/(app)/import/[sessionId]/importing';

const progress = (over: Record<string, unknown> = {}) => ({
  status: 'importing',
  started_at: '2026-10-09T10:00:00.000Z',
  percent: 0,
  progress_processed: 0,
  progress_total: 40,
  imported_clients: 0,
  imported_bookings: 0,
  skipped_rows: 0,
  ...over,
});
let mockState = progress();

async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState = progress();
  mockApi.progress.mockImplementation(async () => mockState);
  mockApi.qa.mockResolvedValue({ report: { checked: 10, matched: 10, mismatches: [], summary: 'We spot-checked 10 rows and all match.' } });
  mockApi.reportCsv.mockResolvedValue('a,b');
});

describe('Import step', () => {
  it('runs batches until done, then shows what came in', async () => {
    mockApi.executeBatch.mockImplementation(async () => {
      mockState = progress({
        status: 'complete',
        percent: 100,
        progress_processed: 40,
        imported_clients: 12,
        imported_bookings: 38,
        skipped_rows: 2,
        updated_existing: 3,
        repeated_rows_skipped: 1,
      });
      return { ok: true, done: true };
    });
    await render(<ImportingStepScreen />);
    await settle();
    expect(mockApi.executeBatch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Import complete')).toBeTruthy();
    expect(screen.getByText('Clients brought in: 12 (3 existing updated)')).toBeTruthy();
    expect(screen.getByText('Bookings: 38. Skipped rows: 2')).toBeTruthy();
    expect(screen.getByText(/1 of the skipped rows was an exact repeat/)).toBeTruthy();
    expect(screen.getByText('We spot-checked 10 rows and all match.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Share the import report'));
    });
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ filename: 'import-report-s1.csv', body: 'a,b' }));
    await act(async () => {
      fireEvent.press(screen.getByText('See your clients'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/clients');
  });

  it('never starts an import that was not approved', async () => {
    mockState = progress({ status: 'ready' });
    await render(<ImportingStepScreen />);
    await settle();
    expect(mockApi.executeBatch).not.toHaveBeenCalled();
    expect(screen.getByText('This import has not started yet')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Back to Validate'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/import/s1/validate');
  });

  it('stops when the server says the run was not approved', async () => {
    mockApi.executeBatch.mockRejectedValue(
      new ApiError('Import not approved', 409, { error: 'Import not approved', code: 'IMPORT_NOT_APPROVED' }),
    );
    await render(<ImportingStepScreen />);
    await settle();
    expect(screen.getByText('This import has not started yet')).toBeTruthy();
  });

  it('shows a failed import with its reason', async () => {
    mockState = progress({ status: 'failed', error_message: 'The file could not be read.' });
    await render(<ImportingStepScreen />);
    await settle();
    expect(screen.getByText('Import failed')).toBeTruthy();
    expect(screen.getByText('The file could not be read.')).toBeTruthy();
    expect(mockApi.executeBatch).not.toHaveBeenCalled();
  });
});

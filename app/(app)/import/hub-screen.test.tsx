/**
 * Data import hub (web `ImportHub`): admin only; past imports with status, counts, the undo
 * window and what an Undo kept; Continue, Resume, Report, Undo (asks first) and Delete (asks
 * first); Start new import opens the Upload step.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
let mockRole = 'admin';
jest.mock('@/providers/VenueProvider', () => ({
  useVenueContext: () => ({
    venue: { current_user_role: mockRole, currency: 'GBP' },
    isLoading: false,
    terminology: { client: 'Client', booking: 'Appointment', staff: 'Staff' },
  }),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockShare = jest.fn(async (..._args: unknown[]) => ({ ok: true }));
jest.mock('@/lib/share/share-text-file', () => ({ shareTextFile: (...args: unknown[]) => mockShare(...args) }));
const mockReportCsv = jest.fn(async (..._args: unknown[]) => 'a,b');
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => ({ reportCsv: (...args: unknown[]) => mockReportCsv(...args) }) };
});

const mockSessions: { data?: { sessions: unknown[] }; isLoading: boolean; isError: boolean; error: unknown; refetch: jest.Mock } = {
  data: { sessions: [] },
  isLoading: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
};
const mockStart = jest.fn();
const mockUndo = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/lib/queries/useImportSessions', () => ({
  useImportSessions: () => mockSessions,
  useStartImportSession: () => ({ mutateAsync: mockStart, isPending: false }),
  useUndoImportSession: () => ({ mutateAsync: mockUndo, isPending: false }),
  useDeleteImportSession: () => ({ mutateAsync: mockDelete, isPending: false }),
}));

import ImportHubScreen from '@/app/(app)/import/index';

const session = (over: Record<string, unknown> = {}) => ({
  id: 'sess-1',
  status: 'complete',
  imported_clients: 12,
  imported_bookings: 30,
  undo_available_until: '2999-01-01T10:00:00.000Z',
  undone_at: null,
  created_at: '2026-10-01T09:30:00.000Z',
  undo_summary: null,
  undo_incomplete: false,
  ...over,
});

async function press(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  mockRole = 'admin';
  mockPush.mockReset();
  mockStart.mockReset();
  mockUndo.mockReset();
  mockDelete.mockReset();
  mockShare.mockClear();
  mockReportCsv.mockClear();
  mockSessions.data = { sessions: [] };
  mockSessions.isError = false;
});

describe('Data import hub', () => {
  it('is for admins only', async () => {
    mockRole = 'staff';
    await render(<ImportHubScreen />);
    expect(screen.getByText('Only an admin can import data')).toBeTruthy();
    expect(screen.queryByText('Start new import')).toBeNull();
  });

  it('starts a new import and opens its Upload step', async () => {
    mockStart.mockResolvedValue({ id: 'new-1', status: 'uploading' });
    await render(<ImportHubScreen />);
    expect(screen.getByText(/No imports yet/)).toBeTruthy();
    await press('Start new import');
    expect(mockPush).toHaveBeenCalledWith('/import/new-1/upload');
  });

  it('lists a finished import with its counts and undo window, and shares the report', async () => {
    mockSessions.data = { sessions: [session()] };
    await render(<ImportHubScreen />);
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('12 clients, 30 bookings')).toBeTruthy();
    expect(screen.getByText(/Undo available until/)).toBeTruthy();
    await press('Report');
    expect(mockReportCsv).toHaveBeenCalledWith('sess-1');
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ filename: 'import-report-sess-1.csv', body: 'a,b', mimeType: 'text/csv' }));
  });

  it('asks before undoing, then says what was kept', async () => {
    mockSessions.data = { sessions: [session()] };
    mockUndo.mockResolvedValue({
      ok: true,
      undo_summary: { kept_clients: 1, kept_client_names: ['Ann Lee'], kept_items: 0, kept_item_names: [] },
    });
    await render(<ImportHubScreen />);
    await press('Undo');
    expect(screen.getByText('Undo this import?')).toBeTruthy();
    expect(mockUndo).not.toHaveBeenCalled();
    await press('Undo import');
    expect(mockUndo).toHaveBeenCalledWith('sess-1');
    expect(screen.getByText('Import undone.')).toBeTruthy();
    expect(screen.getByText(/1 client was kept.*Ann Lee/)).toBeTruthy();
  });

  it('asks before deleting, and says it keeps what was imported', async () => {
    mockSessions.data = { sessions: [session({ status: 'mapping', imported_clients: 0, imported_bookings: 0, undo_available_until: null })] };
    mockDelete.mockResolvedValue({ ok: true });
    await render(<ImportHubScreen />);
    expect(screen.getByText('Mapping')).toBeTruthy();
    await press('Continue');
    expect(mockPush).toHaveBeenCalledWith('/import/sess-1/upload');
    await press('Delete');
    expect(screen.getByText(/does not remove clients or bookings it already added/)).toBeTruthy();
    await press('Remove');
    expect(mockDelete).toHaveBeenCalledWith('sess-1');
  });

  it('offers Resume for a running import and flags an unfinished Undo', async () => {
    mockSessions.data = {
      sessions: [session({ id: 'run-1', status: 'importing' }), session({ id: 'half-1', undo_incomplete: true })],
    };
    await render(<ImportHubScreen />);
    await press('Resume import');
    expect(mockPush).toHaveBeenCalledWith('/import/run-1/importing');
    expect(screen.getByText(/Undo did not finish/)).toBeTruthy();
  });
});

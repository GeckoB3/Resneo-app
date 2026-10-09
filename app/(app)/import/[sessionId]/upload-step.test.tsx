/**
 * Upload step (web `UploadStepClient`): files are chosen with the document picker and sent one
 * at a time; a file that is not CSV or Excel is refused before upload; the detected kind is
 * shown and can be changed; Remove asks first; a report-shaped file is reorganised straight
 * away; Continue unlocks only when every file has a label.
 *
 * jest hoists mock factories above imports, so every closed-over variable is prefixed `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
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
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('@/lib/share/share-text-file', () => ({ shareTextFile: jest.fn(async () => ({ ok: true })) }));

const mockApi = {
  getSession: jest.fn(),
  uploadFile: jest.fn(),
  setFileType: jest.fn(),
  removeFile: jest.fn(),
  reshapeFile: jest.fn(),
  undoReshape: jest.fn(),
};
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => mockApi };
});

import UploadStepScreen from '@/app/(app)/import/[sessionId]/upload';

const file = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  filename: 'clients.csv',
  file_type: 'clients',
  row_count: 120,
  column_count: 5,
  headers: [],
  sample_rows: [],
  reshape_status: null,
  ...over,
});

let mockFiles: Record<string, unknown>[] = [];

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles = [];
  mockApi.getSession.mockImplementation(async () => ({ session: { id: 's1', status: 'uploading' }, files: mockFiles, mappings: [], issues: [], booking_references: [] }));
});

describe('Upload step', () => {
  it('uploads each chosen file and shows what was detected', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.csv', name: 'a.csv', mimeType: 'text/csv', size: 100 },
        { uri: 'file:///b.xlsx', name: 'b.xlsx', mimeType: 'application/octet-stream', size: 100 },
      ],
    });
    mockApi.uploadFile.mockImplementation(async (_s: string, f: { name: string }) => {
      if (f.name === 'a.csv') {
        mockFiles = [file({ id: 'f1', filename: 'a.csv' })];
        return { warnings: ['a.csv: 2 blank rows skipped'], kind_detections: [{ file_id: 'f1', filename: 'a.csv', detected_kind: 'clients', confidence: 'high', applied: true, reason: '' }] };
      }
      mockFiles = [...mockFiles, file({ id: 'f2', filename: 'b.xlsx', file_type: 'unknown' })];
      return { kind_detections: [{ file_id: 'f2', filename: 'b.xlsx', detected_kind: 'bookings', confidence: 'medium', applied: false, reason: 'It has dates and times.' }] };
    });
    await render(<UploadStepScreen />);
    await press(screen.getByText('Choose files'));

    expect(mockApi.uploadFile).toHaveBeenNthCalledWith(1, 's1', { uri: 'file:///a.csv', name: 'a.csv', mimeType: 'text/csv' });
    expect(mockApi.uploadFile).toHaveBeenNthCalledWith(2, 's1', {
      uri: 'file:///b.xlsx',
      name: 'b.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(screen.getByText('• a.csv: 2 blank rows skipped')).toBeTruthy();
    expect(screen.getByText(/We worked out this is a client list/)).toBeTruthy();
    expect(screen.getByText(/Our best guess: Booking history\. It has dates and times\./)).toBeTruthy();
    // b.xlsx has no label yet, so Continue waits.
    expect(screen.getByText(/Confirm a label for each file/)).toBeTruthy();
  });

  it('refuses a file that is not CSV or Excel before uploading', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///x.pdf', name: 'x.pdf', mimeType: 'application/pdf', size: 10 }] });
    await render(<UploadStepScreen />);
    await press(screen.getByText('Choose files'));
    expect(mockApi.uploadFile).not.toHaveBeenCalled();
    expect(screen.getByText(/"x.pdf" is not a CSV or Excel file/)).toBeTruthy();
  });

  it('labels a file, and Continue opens the Map step once all are labelled', async () => {
    mockFiles = [file({ file_type: 'unknown' })];
    mockApi.setFileType.mockImplementation(async () => {
      mockFiles = [file({ file_type: 'bookings' })];
      return { ok: true };
    });
    await render(<UploadStepScreen />);
    await press(screen.getByText('Continue'));
    expect(mockPush).not.toHaveBeenCalled();

    await press(screen.getByText('Booking history'));
    expect(mockApi.setFileType).toHaveBeenCalledWith('s1', 'f1', 'bookings');
    await press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith('/import/s1/map');
  });

  it('asks before removing a file', async () => {
    mockFiles = [file()];
    mockApi.removeFile.mockResolvedValue({ ok: true });
    await render(<UploadStepScreen />);
    await press(screen.getByText('Remove'));
    expect(screen.getByText('Remove this file?')).toBeTruthy();
    expect(mockApi.removeFile).not.toHaveBeenCalled();
    const removes = screen.getAllByText('Remove');
    await press(removes[removes.length - 1]!);
    expect(mockApi.removeFile).toHaveBeenCalledWith('s1', 'f1');
  });

  it('reorganises a report-shaped file straight away and offers the original back', async () => {
    mockFiles = [file({ file_type: 'bookings', reshape_status: 'pending' })];
    mockApi.reshapeFile.mockImplementation(async () => {
      mockFiles = [file({ file_type: 'bookings', reshape_status: 'done', reshaped: true })];
      return { ok: true, status: 'done', notes: ['Dates read as day first.'], preview: { headers: ['Date', 'Time'], rows: [['2025-07-14', '10:00']], total_rows: 40 } };
    });
    await render(<UploadStepScreen />);
    expect(mockApi.reshapeFile).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reorganised into a table (40 bookings).')).toBeTruthy();
    expect(screen.getByText('• Dates read as day first.')).toBeTruthy();
    await press(screen.getByText('Undo (use the original)'));
    expect(mockApi.undoReshape).toHaveBeenCalledWith('s1', 'f1');
  });
});

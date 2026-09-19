import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token' }));

const mockCount = jest.fn();
jest.mock('@/lib/queries/useExportCount', () => {
  const actual = jest.requireActual('@/lib/queries/useExportCount') as Record<string, unknown>;
  return { ...actual, useExportCount: (...args: unknown[]) => mockCount(...args) };
});

const mockDownload = jest.fn();
jest.mock('@/lib/share/share-binary-file', () => ({ downloadAndShareFile: (...args: unknown[]) => mockDownload(...args) }));
jest.mock('@/lib/env', () => ({ getApiUrl: () => 'https://api.test', isBackendConfigured: () => true }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));

import { DataExportCard, presetRange } from '@/components/reports/DataExportCard';

/**
 * Export your data: what, which dates, which file type, with a count before the download
 * (web `DataExportSection.tsx`, 2026-09-19).
 */
describe('DataExportCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockReturnValue({ data: 142, isLoading: false, isError: false });
    mockDownload.mockResolvedValue({ ok: true });
  });

  it('counts what the choice covers and names it on the button', async () => {
    await render(<DataExportCard bookingWord="Appointment" clientLabel="Client" today="2026-09-19" />);
    expect(screen.getByText('142 appointments in total.')).toBeTruthy();
    expect(screen.getByText('Download appointments as CSV')).toBeTruthy();
    expect(mockCount).toHaveBeenLastCalledWith('bookings', null, true);
  });

  it('re-counts when the kind and the dates change, and names the file type', async () => {
    await render(<DataExportCard bookingWord="Appointment" clientLabel="Client" today="2026-09-19" />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Services' }));
    });
    expect(mockCount).toHaveBeenLastCalledWith('services', null, true);
    expect(screen.getByText(/Services are chosen by the day they were added/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'This month' }));
    });
    const thisMonth = presetRange('this_month')!;
    expect(mockCount).toHaveBeenLastCalledWith('services', thisMonth, true);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'PDF' }));
    });
    expect(screen.getByText('Download services as PDF')).toBeTruthy();
  });

  it('greys the button out when there is nothing in the range', async () => {
    mockCount.mockReturnValue({ data: 0, isLoading: false, isError: false });
    await render(<DataExportCard bookingWord="Appointment" clientLabel="Client" today="2026-09-19" />);
    expect(screen.getByText('No appointments yet.')).toBeTruthy();
    expect(screen.getByText('Download appointments as CSV')).toBeDisabled();
  });

  it('downloads the chosen file with the Bearer token and the format', async () => {
    await render(<DataExportCard bookingWord="Appointment" clientLabel="Client" today="2026-09-19" />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Excel spreadsheet' }));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download appointments as Excel spreadsheet'));
    });
    expect(mockDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.test/api/venue/export?type=bookings&format=xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers: { Authorization: 'Bearer token' },
      }),
    );
  });
});

describe('presetRange', () => {
  it('covers whole months and years on the local calendar', () => {
    const today = new Date(2026, 8, 19);
    expect(presetRange('all', today)).toBeNull();
    expect(presetRange('this_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('last_month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('last_year', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetRange('last_month', new Date(2026, 0, 5))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

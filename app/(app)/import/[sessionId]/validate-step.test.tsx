/**
 * Validate step (web `ValidateStepClient`): arriving starts the background check and follows
 * it; the summary, the plan and the issues show once it is done; existing-client matches must be
 * decided (one at a time or all) before Review and approve opens; the date format question
 * re-checks; approving records the approval and opens the Import step; a run import is shown,
 * not checked again.
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
jest.mock('@/lib/share/share-text-file', () => ({ shareTextFile: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/components/ui/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement(View, null, children) : null,
  };
});

const mockApi = {
  getSession: jest.fn(),
  startValidation: jest.fn(),
  validationJob: jest.fn(),
  plan: jest.fn(),
  decideIssue: jest.fn(),
  decideIssueType: jest.fn(),
  patchSettings: jest.fn(),
  approve: jest.fn(),
  getRow: jest.fn(),
  reportCsv: jest.fn(),
};
jest.mock('@/lib/import/api', () => {
  const actual = jest.requireActual('@/lib/import/api');
  return { ...actual, useImportApi: () => mockApi };
});

import { ApiError } from '@/lib/api/client';
import ValidateStepScreen from '@/app/(app)/import/[sessionId]/validate';

const SUMMARY = { total_data_rows: 50, rows_ready: 48, rows_with_blocking_errors: 2, rows_with_existing_client_warning: 1, warning_issue_count: 2, error_issue_count: 2 };
let mockStatus = 'mapping';
let mockJob: string | null = null;
let mockIssues: Record<string, unknown>[] = [];

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = 'mapping';
  mockJob = null;
  mockIssues = [
    { id: 'i1', file_id: 'f1', row_number: 4, severity: 'warning', issue_type: 'existing_client', message: 'Matches Ann Lee', user_decision: null },
    { id: 'i2', file_id: 'f1', row_number: 7, severity: 'warning', issue_type: 'date_format_ambiguous', message: '03/04/2025 could be either', user_decision: null },
  ];
  mockApi.getSession.mockImplementation(async () => ({
    session: {
      id: 's1',
      status: mockStatus,
      has_booking_file: true,
      validation_job_status: mockJob,
      session_settings: mockJob === 'complete' ? { validation_summary: SUMMARY } : {},
    },
    files: [{ id: 'f1', filename: 'bookings.csv' }],
    mappings: [],
    issues: mockJob === 'complete' ? mockIssues : [],
    booking_references: [],
  }));
  mockApi.startValidation.mockImplementation(async () => {
    mockJob = 'running';
    return { ok: true, jobId: 'j1' };
  });
  mockApi.validationJob.mockImplementation(async () => {
    mockJob = 'complete';
    mockStatus = 'ready';
    return { validation_job_status: 'complete', validation_rows_processed: 50, validation_rows_total: 50, percent: 100, status: 'ready', validation_job_id: 'j1', validation_job_error: null };
  });
  mockApi.plan.mockResolvedValue({ headline: 'Bringing in 48 bookings', narrative: 'Most rows are ready.' });
  mockApi.decideIssue.mockImplementation(async (_s: string, id: string, d: string) => {
    mockIssues = mockIssues.map((i) => (i.id === id ? { ...i, user_decision: d } : i));
    return { ok: true };
  });
  mockApi.approve.mockResolvedValue({ ok: true, started: true });
  mockApi.patchSettings.mockResolvedValue({});
});

describe('Validate step', () => {
  it('starts the check on arrival and shows the result and the plan', async () => {
    await render(<ValidateStepScreen />);
    expect(mockApi.startValidation).toHaveBeenCalledWith('s1');
    expect(mockApi.validationJob).toHaveBeenCalled();
    expect(screen.getByText('Check complete')).toBeTruthy();
    expect(screen.getByText(/48 of 50 rows ready to import/)).toBeTruthy();
    expect(screen.getByText('Bringing in 48 bookings')).toBeTruthy();
    expect(screen.getByText('Row 4, bookings.csv: Matches Ann Lee')).toBeTruthy();
  });

  it('holds approval until existing clients are decided, then approves and opens Import', async () => {
    await render(<ValidateStepScreen />);
    expect(screen.getByText(/Decide what to do with 1 existing-client match/)).toBeTruthy();
    await press(screen.getByText('Review and approve'));
    expect(screen.queryByText('Approve and start import')).toBeNull();

    await press(screen.getByText('Update existing'));
    expect(mockApi.decideIssue).toHaveBeenCalledWith('s1', 'i1', 'update_existing');
    await press(screen.getByText('Review and approve'));
    expect(screen.getByText(/This creates real clients and bookings in your venue/)).toBeTruthy();
    await press(screen.getByText('Approve and start import'));
    expect(mockApi.approve).toHaveBeenCalledWith('s1');
    expect(mockPush).toHaveBeenCalledWith('/import/s1/importing');
  });

  it('shows why approval failed, in the server words', async () => {
    mockIssues = [];
    mockApi.approve.mockRejectedValue(
      new ApiError('Booking references are not resolved', 400, {
        error: 'Booking references are not resolved',
        message: 'Some services or staff in your file are not matched yet.',
        code: 'REFERENCES_UNRESOLVED',
      }),
    );
    await render(<ValidateStepScreen />);
    await press(screen.getByText('Review and approve'));
    await press(screen.getByText('Approve and start import'));
    expect(screen.getByText('Some services or staff in your file are not matched yet.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('asks how to read dates, without naming a country, and checks again', async () => {
    await render(<ValidateStepScreen />);
    expect(screen.queryByText(/UK|US/)).toBeNull();
    await press(screen.getByText('Day first (DD/MM/YYYY)'));
    await press(screen.getByText('Apply and check again'));
    expect(mockApi.startValidation).toHaveBeenLastCalledWith('s1', { ambiguous_date_format: 'dd/MM/yyyy' });
  });

  it('saves the reminders choice for imported bookings', async () => {
    await render(<ValidateStepScreen />);
    await press(screen.getByLabelText('Send upcoming reminders for imported bookings'));
    expect(mockApi.patchSettings).toHaveBeenCalledWith('s1', { send_import_reminders: true });
  });

  it('shows a finished import without checking it again', async () => {
    mockStatus = 'complete';
    mockJob = 'complete';
    await render(<ValidateStepScreen />);
    expect(mockApi.startValidation).not.toHaveBeenCalled();
    expect(screen.getByText('This import has finished')).toBeTruthy();
    await press(screen.getByText('See the result'));
    expect(mockReplace).toHaveBeenCalledWith('/import/s1/importing');
  });
});

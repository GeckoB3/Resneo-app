/**
 * Reports, New bookings under the Reports calendar filter (the contract shared with the web,
 * 2026-10-12): it asks for the chosen calendar's bookings, says what the figures cover from the
 * answer, and shows the server's sentence when the filter is refused.
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { NewBookingsReport } from '@/types/reports';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/reports/SvgStackedBarChart', () => ({ SvgStackedBarChart: () => null }));
jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/reports/csv-export', () => ({ buildAndShareCsv: jest.fn(async () => ({ ok: true })) }));

const mockCalendarIds: (string | null)[] = [];
let mockReport: NewBookingsReport | undefined;
const mockState = { isError: false, error: null as unknown };
jest.mock('@/lib/queries/useNewBookings', () => ({
  useNewBookings: (_choice: unknown, _grain: unknown, _enabled: unknown, calendarId: string | null) => {
    mockCalendarIds.push(calendarId);
    return { data: mockReport, isLoading: false, isError: mockState.isError, error: mockState.error, refetch: jest.fn() };
  },
}));

import { NewBookingsSection } from '@/components/reports/NewBookingsSection';
import { ReportCalendarProvider } from '@/components/reports/ReportCalendarFilter';

const counts = { total: 3, by_channel: { online: 2, team: 1, walk_in: 0, linked_venue: 0 }, cancelled: 0, awaiting_payment: 0 };
const HANNAH = { id: 'cal-1', name: 'Hannah' };
const onClear = jest.fn();

function report(over: Partial<NewBookingsReport> = {}): NewBookingsReport {
  return {
    from: '2026-10-05',
    to: '2026-10-11',
    grain: 'day',
    today: '2026-10-09',
    periods: [{ period_start: '2026-10-05', period_end: '2026-10-05', ...counts }],
    totals: counts,
    ...over,
  };
}

function renderWith(calendar: { id: string; name: string } | null) {
  return render(
    <ReportCalendarProvider calendar={calendar} onClear={onClear}>
      <NewBookingsSection bookingWord="Appointment" today="2026-10-09" />
    </ReportCalendarProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalendarIds.length = 0;
  mockState.isError = false;
  mockState.error = null;
  mockReport = report({ calendar: HANNAH });
});

it("asks for the chosen calendar's bookings and says so from the answer", async () => {
  await renderWith(HANNAH);
  expect(mockCalendarIds[0]).toBe('cal-1');
  expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
});

it('asks for the whole venue with all calendars chosen, and says nothing about calendars', async () => {
  mockReport = report();
  await renderWith(null);
  expect(mockCalendarIds[0]).toBeNull();
  expect(screen.queryByText(/^Showing/)).toBeNull();
  expect(screen.queryByText('These figures are for the whole venue.')).toBeNull();
});

it('reads an answer without a calendar as the whole venue', async () => {
  mockReport = report();
  await renderWith(HANNAH);
  expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
});

it("shows the server's sentence when filtering is not ready yet, with the way back", async () => {
  const sentence = "Filtering by calendar isn't ready yet for this report.";
  mockReport = undefined;
  mockState.isError = true;
  mockState.error = new ApiError(sentence, 409, { error: sentence, code: 'CONFLICT' });
  await renderWith(HANNAH);
  expect(screen.getByText(sentence)).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Show all calendars'));
  });
  expect(onClear).toHaveBeenCalled();
});

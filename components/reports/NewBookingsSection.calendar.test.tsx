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

// What each call was asked for (the Showing picker's scope and comparison).
const mockScopes: { calendarId?: string | null; business?: string | null; compare?: string | null }[] = [];
let mockReport: NewBookingsReport | undefined;
const mockState = { isError: false, error: null as unknown };
jest.mock('@/lib/queries/useNewBookings', () => ({
  useNewBookings: (_choice: unknown, _grain: unknown, _enabled: unknown, scope: (typeof mockScopes)[number]) => {
    mockScopes.push(scope);
    return { data: mockReport, isLoading: false, isError: mockState.isError, error: mockState.error, refetch: jest.fn() };
  },
}));

import { NewBookingsSection } from '@/components/reports/NewBookingsSection';
import { ReportCalendarProvider } from '@/components/reports/ReportCalendarFilter';
import { resolveShowing, type ShowingChoice } from '@/lib/reports/report-scope';
import type { ReportShowingOptions } from '@/types/reports';

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
  mockScopes.length = 0;
  mockState.isError = false;
  mockState.error = null;
  mockReport = report({ calendar: HANNAH });
});

it("asks for the chosen calendar's bookings and says so from the answer", async () => {
  await renderWith(HANNAH);
  expect(mockScopes[0]).toEqual({ calendarId: 'cal-1', business: null, compare: 'previous' });
  expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
});

it('asks for the whole venue with all calendars chosen, and says nothing about calendars', async () => {
  mockReport = report();
  await renderWith(null);
  expect(mockScopes[0]).toEqual({ calendarId: null, business: null, compare: 'previous' });
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

describe('Showing everyone together, with a comparison (release 1)', () => {
  const OPTIONS: ReportShowingOptions = {
    venue: { id: 'v1', name: 'Plus 1' },
    calendars: [{ id: 'cal-1', name: 'Hannah', active: true }],
    businesses: [{ venue_id: 'v2', name: 'Light 3', access: 'collective', all_calendars: true, calendars: [] }],
    together: { name: 'Studio Collective' },
  };
  function renderShowing(choice: ShowingChoice) {
    return render(
      <ReportCalendarProvider showing={resolveShowing(OPTIONS, choice)} options={OPTIONS} onClear={onClear}>
        <NewBookingsSection bookingWord="Appointment" today="2026-10-09" />
      </ReportCalendarProvider>,
    );
  }
  const own = { total: 3, by_channel: { online: 2, team: 1, walk_in: 0, linked_venue: 0 }, cancelled: 1, awaiting_payment: 2 };
  const theirs = { total: 1, by_channel: { online: 1, team: 0, walk_in: 0, linked_venue: 0 }, cancelled: 0, awaiting_payment: 0 };
  const total = { total: 4, by_channel: { online: 3, team: 1, walk_in: 0, linked_venue: 0 }, cancelled: 1, awaiting_payment: 2 };

  it('asks for everyone together, says what it adds up, and lists each business', async () => {
    mockReport = report({
      totals: total,
      scope: { kind: 'together', name: 'Studio Collective', business: null },
      by_business: [
        { venue_id: 'v1', venue_name: 'Plus 1', access: 'own', totals: own },
        { venue_id: 'v2', venue_name: 'Light 3', access: 'collective', totals: theirs },
      ],
    });
    await renderShowing({ kind: 'together' });
    expect(mockScopes[0]).toEqual({ calendarId: null, business: 'all', compare: 'previous' });
    expect(screen.getByText(/^Showing Studio Collective: Plus 1 and Light 3\./)).toBeTruthy();
    expect(screen.getByText('By business')).toBeTruthy();
    const table = screen.getByLabelText('By business');
    expect(table).toBeTruthy();
    expect(screen.getAllByText('Bookings made').length).toBe(2);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Waiting for payment').length).toBe(2);
    expect(screen.getByText('Light 3')).toBeTruthy();
  });

  it('asks for one business, with no table by business', async () => {
    mockReport = report({ scope: { kind: 'business', name: 'Light 3', business: { venue_id: 'v2', name: 'Light 3', access: 'collective' } } });
    await renderShowing({ kind: 'business', venueId: 'v2' });
    expect(mockScopes[0]).toEqual({ calendarId: null, business: 'v2', compare: 'previous' });
    expect(screen.queryByText('By business')).toBeNull();
  });

  it('shows the change on the total only, and what it compares with', async () => {
    mockReport = report({
      totals: { ...counts, total: 6, cancelled: 3 },
      comparison: { basis: 'previous', from: '2026-09-28', to: '2026-10-04', totals: { ...counts, total: 4, cancelled: 1 } },
    });
    await renderShowing({ kind: 'venue' });
    expect(screen.getAllByTestId('change-pill')).toHaveLength(1);
    expect(screen.getByLabelText('+50%')).toBeTruthy();
    expect(screen.getByText('Changes compare with 28 Sep to 4 Oct 2026.')).toBeTruthy();
    expect(screen.getByText('Counted on the day each booking was made')).toBeTruthy();
  });

  it('shows no change without a comparison from the server', async () => {
    mockReport = report();
    await renderShowing({ kind: 'venue' });
    expect(screen.queryByTestId('change-pill')).toBeNull();
    expect(screen.queryByText(/^Changes compare with/)).toBeNull();
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { BookedRevenueReport } from '@/types/reports';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

// The date pickers are native; a text field stands in so a test can type a range.
jest.mock('@/components/ui/DatePickerField', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    DatePickerField: ({
      value,
      onChange,
      accessibilityLabel,
    }: {
      value: string;
      onChange: (iso: string) => void;
      accessibilityLabel: string;
    }) => React.createElement(TextInput, { accessibilityLabel, value, onChangeText: onChange }),
  };
});

// The section's own query hook; capture what it is asked for.
const mockCalls: { query: string }[] = [];
let mockReport: BookedRevenueReport | undefined;
const mockQueryState = {
  isPlaceholderData: false,
  isError: false,
  error: null as unknown,
};
jest.mock('@/lib/queries/useBookedRevenue', () => ({
  useBookedRevenue: (choice: unknown, grain: string) => {
    const { bookedRevenueQuery } = jest.requireActual<typeof import('@/lib/reports/booked-revenue')>(
      '@/lib/reports/booked-revenue',
    );
    mockCalls.push({ query: bookedRevenueQuery(choice as never, grain as never) });
    return {
      data: mockReport,
      isFetching: false,
      isPlaceholderData: mockQueryState.isPlaceholderData,
      isError: mockQueryState.isError,
      error: mockQueryState.error,
      refetch: jest.fn(),
    };
  },
}));

jest.mock('@/lib/reports/csv-export', () => ({
  buildAndShareCsv: jest.fn(async () => ({ ok: true })),
}));

import { BookedRevenueSection } from '@/components/reports/BookedRevenueSection';
import { buildAndShareCsv } from '@/lib/reports/csv-export';

const cell = (booked: number, noShow = 0) => ({
  booked_pence: booked,
  no_show_pence: noShow,
  booked_count: booked > 0 ? 1 : 0,
  no_show_count: noShow > 0 ? 1 : 0,
  unpriced_count: 0,
});

/** The last query the hook was asked for. */
function lastQuery(): string | undefined {
  return mockCalls[mockCalls.length - 1]?.query;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockQueryState.isPlaceholderData = false;
  mockQueryState.isError = false;
  mockQueryState.error = null;
  mockReport = {
    from: '2026-09-07',
    to: '2026-09-13',
    grain: 'day',
    today: '2026-09-11',
    columns: [
      { key: 'a', calendar_id: 'a', name: 'Hannah', venue_id: 'v', venue_name: 'Ours', linked: false, colour: null },
      { key: 'b', calendar_id: 'b', name: 'Jenny', venue_id: 'p', venue_name: 'Partner', linked: true, colour: null },
    ],
    periods: [
      { period_start: '2026-09-11', period_end: '2026-09-11', ...cell(5000, 1500), by_calendar: { a: cell(5000, 1500) } },
      { period_start: '2026-09-12', period_end: '2026-09-12', ...cell(2000), by_calendar: { b: cell(2000) } },
    ],
    totals: { ...cell(7000, 1500), by_calendar: { a: cell(5000, 1500), b: cell(2000) } },
  };
});

/** Reports → Revenue (web #191): what the tab asks for, and what it shows. */
describe('BookedRevenueSection', () => {
  it('opens on This week by day, and shows the totals, the linked note and the columns', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(mockCalls[0]?.query).toBe('grain=day&preset=this_week');
    // The tile and the table's total row both carry the figure.
    expect(screen.getAllByText('£70.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('No-shows deducted')).toBeTruthy();
    expect(screen.getByText(/shared with you through a linked account/)).toBeTruthy();
    expect(screen.getAllByText('Hannah').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Partner').length).toBeGreaterThan(0);
  });

  it('adds no-shows back when asked, and changes the range and grain', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent(screen.getByLabelText('Include no-shows'), 'valueChange', true);
    });
    expect(screen.getAllByText('£85.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No-shows included')).toBeTruthy();

    // Presses go through act so the state flushes before the hook is read again.
    await act(async () => {
      fireEvent.press(screen.getByText('Next 30 days'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Month'));
    });
    expect(lastQuery()).toBe('grain=month&preset=next_30');
  });

  it('steps the range one period back or forward by the grain', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    // By day: the seven-day window walks a day forward from the answer on screen.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Next day'));
    });
    expect(lastQuery()).toBe('grain=day&from=2026-09-08&to=2026-09-14');
    // Switching grain keeps the range; a week back then walks that window.
    await act(async () => {
      fireEvent.press(screen.getByText('Week'));
    });
    expect(lastQuery()).toBe('grain=week&from=2026-09-08&to=2026-09-14');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Previous week'));
    });
    expect(lastQuery()).toBe('grain=week&from=2026-09-01&to=2026-09-07');
  });

  it('steps from the range last requested, so a second quick tap moves again', async () => {
    // The mocked answer always reports 07–13, as a kept-previous answer does
    // while the next range loads. Two taps must still walk two days.
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Next day'));
    });
    expect(lastQuery()).toBe('grain=day&from=2026-09-08&to=2026-09-14');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Next day'));
    });
    expect(lastQuery()).toBe('grain=day&from=2026-09-09&to=2026-09-15');
  });

  it('waits for a preset to resolve before the arrows do anything', async () => {
    mockQueryState.isPlaceholderData = true;
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Next day'));
    });
    // Still the preset: nothing was asked for with explicit dates.
    expect(mockCalls.every((call) => !call.query.includes('from='))).toBe(true);
    expect(screen.getByLabelText('Next day').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('does not open the From/To editor when the range is stepped', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Next day'));
    });
    expect(screen.queryByLabelText('Revenue range start date')).toBeNull();
    // The Custom range chip is what opens it.
    await act(async () => {
      fireEvent.press(screen.getByText('Custom range'));
    });
    expect(screen.getByLabelText('Revenue range start date')).toBeTruthy();
  });

  it('refuses a custom range longer than the route serves, before asking for it', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Custom range'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Revenue range start date'), '2025-01-01');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Apply'));
    });
    expect(mockToast.info).toHaveBeenCalledWith('Choose a range of up to 400 days.');
    expect(mockCalls.every((call) => !call.query.includes('from=2025-01-01'))).toBe(true);
  });

  it('keeps the table and shows the error inline when figures are already on screen', async () => {
    mockQueryState.isError = true;
    mockQueryState.error = new ApiError('Choose a range of up to 400 days.', 400);
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(screen.getByText('Choose a range of up to 400 days.')).toBeTruthy();
    expect(screen.getAllByText('£70.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('falls back to the error state when there is nothing to show', async () => {
    mockReport = undefined;
    mockQueryState.isError = true;
    mockQueryState.error = new ApiError('Could not load booked revenue', 500);
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(screen.getByText('Could not load booked revenue')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('exports the CSV with the web filename', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Export CSV'));
    });
    expect(buildAndShareCsv).toHaveBeenCalledWith(
      'booked-revenue-2026-09-07-2026-09-13-day.csv',
      expect.arrayContaining([['Period', 'Hannah', 'Jenny (Partner)', 'Total', 'No-shows']]),
    );
  });
});

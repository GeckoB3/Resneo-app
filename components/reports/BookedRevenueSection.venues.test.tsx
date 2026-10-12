/**
 * Reports → Revenue (Booked value) for linked and collective venues, as the web's
 * BookedRevenueSection shows them: the venue table (yours marked "(you)", "Through {collective}"),
 * the collective note for members and the linked-account note only for links, the CSV's venue
 * breakdown, and the Reports calendar filter (the param, what the figures are for, refusals).
 *
 * jest hoists mock factories above imports, so closed-over vars are `mock*`.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { ApiError } from '@/lib/api/client';
import type { BookedRevenueReport, BookedRevenueVenueCell } from '@/types/reports';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));

jest.mock('@/components/ui/DatePickerField', () => ({ DatePickerField: () => null }));

// The section's own query hook: what it is asked for (the query string it would send).
const mockQueries: string[] = [];
let mockReport: BookedRevenueReport | undefined;
const mockQueryState = { isError: false, error: null as unknown };
jest.mock('@/lib/queries/useBookedRevenue', () => ({
  useBookedRevenue: (choice: unknown, grain: string, _enabled: boolean, calendarId: string | null) => {
    const { bookedRevenueQuery } = jest.requireActual<typeof import('@/lib/reports/booked-revenue')>(
      '@/lib/reports/booked-revenue',
    );
    mockQueries.push(bookedRevenueQuery(choice as never, grain as never, calendarId));
    return {
      data: mockReport,
      isFetching: false,
      isPlaceholderData: false,
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
import { ReportCalendarProvider } from '@/components/reports/ReportCalendarFilter';
import { buildAndShareCsv } from '@/lib/reports/csv-export';

const cell = (booked: number, noShow = 0) => ({
  booked_pence: booked,
  no_show_pence: noShow,
  booked_count: booked > 0 ? 1 : 0,
  no_show_count: noShow > 0 ? 1 : 0,
  unpriced_count: 0,
});

function venueCell(booked: number, count: number, collectiveBooked: number): BookedRevenueVenueCell {
  return {
    booked_pence: booked,
    no_show_pence: 0,
    booked_count: count,
    no_show_count: 0,
    unpriced_count: 0,
    collective_booked_pence: collectiveBooked,
    collective_no_show_pence: 0,
    collective_count: collectiveBooked > 0 ? 1 : 0,
  };
}

/** Ours with Hannah, a collective member with Mia, and a linked partner with Jenny. */
function collectiveReport(over: Partial<BookedRevenueReport> = {}): BookedRevenueReport {
  return {
    from: '2026-09-07',
    to: '2026-09-13',
    grain: 'day',
    today: '2026-09-11',
    columns: [
      { key: 'a', calendar_id: 'a', name: 'Hannah', venue_id: 'v', venue_name: 'Ours', linked: false, colour: null },
      { key: 'm', calendar_id: 'm', name: 'Mia', venue_id: 'mv', venue_name: 'Member Studio', linked: true, colour: null },
      { key: 'b', calendar_id: 'b', name: 'Jenny', venue_id: 'p', venue_name: 'Partner', linked: true, colour: null },
    ],
    periods: [
      {
        period_start: '2026-09-11',
        period_end: '2026-09-11',
        ...cell(10000),
        by_calendar: { a: cell(5000), m: cell(3000), b: cell(2000) },
      },
    ],
    totals: {
      ...cell(10000),
      booked_count: 6,
      by_calendar: { a: cell(5000), m: cell(3000), b: cell(2000) },
      by_venue: { v: venueCell(5000, 3, 1000), mv: venueCell(3000, 2, 3000), p: venueCell(2000, 1, 0) },
    },
    venues: [
      { venue_id: 'v', venue_name: 'Ours', access: 'own' },
      { venue_id: 'mv', venue_name: 'Member Studio', access: 'collective' },
      { venue_id: 'p', venue_name: 'Partner', access: 'link' },
    ],
    collective: { id: 'col', name: 'Aura Collective' },
    ...over,
  };
}

const COLLECTIVE_NOTE =
  "Includes Member Studio, which is part of Aura Collective with you. Every venue in a collective sees each venue's booked revenue, venue by venue.";
const LINKED_NOTE = 'Includes calendars from Partner, shared with you through a linked account.';

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.length = 0;
  mockQueryState.isError = false;
  mockQueryState.error = null;
  mockReport = collectiveReport();
});

describe('BookedRevenueSection: linked and collective venues', () => {
  it('splits the figures by venue, marks yours, and shows the part through the collective', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    const table = screen.getByLabelText('Booked revenue by venue');
    expect(within(table).getByText('Ours (you)')).toBeTruthy();
    expect(within(table).getByText('Member Studio')).toBeTruthy();
    expect(within(table).getByText('Partner')).toBeTruthy();
    expect(within(table).getByText('Total')).toBeTruthy();
    // Every row (three venues and the total) carries the three figures, named as on the web.
    expect(within(table).getAllByText('Booked revenue')).toHaveLength(4);
    expect(within(table).getAllByText('Through Aura Collective')).toHaveLength(4);
    expect(within(table).getAllByText('Appointments')).toHaveLength(4);
    // Ours: £50.00 booked, £10.00 through the collective's page, 3 appointments.
    expect(within(table).getByText('£10.00')).toBeTruthy();
    expect(within(table).getAllByText('£30.00')).toHaveLength(2);
    // The total row: everything, and the collective's part of it.
    expect(within(table).getByText('£100.00')).toBeTruthy();
    expect(within(table).getByText('£40.00')).toBeTruthy();
    expect(within(table).getByText('6')).toBeTruthy();
  });

  it('names collective members as members and only link venues as shared through a linked account', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(screen.getByText(COLLECTIVE_NOTE)).toBeTruthy();
    expect(screen.getByText(LINKED_NOTE)).toBeTruthy();
    // The member is never called a linked account.
    expect(screen.queryByText(/Member Studio.*linked account/)).toBeNull();
  });

  it('gives a collective with no links the collective note alone', async () => {
    mockReport = collectiveReport({
      venues: [
        { venue_id: 'v', venue_name: 'Ours', access: 'own' },
        { venue_id: 'mv', venue_name: 'Member Studio', access: 'collective' },
      ],
    });
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(screen.getByText(COLLECTIVE_NOTE)).toBeTruthy();
    expect(screen.queryByText(/shared with you through a linked account/)).toBeNull();
  });

  it('leaves out "Through {collective}" when there is no collective', async () => {
    mockReport = collectiveReport({
      collective: null,
      venues: [
        { venue_id: 'v', venue_name: 'Ours', access: 'own' },
        { venue_id: 'p', venue_name: 'Partner', access: 'link' },
      ],
    });
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    const table = screen.getByLabelText('Booked revenue by venue');
    expect(within(table).queryByText(/^Through/)).toBeNull();
    expect(screen.queryByText(/part of/)).toBeNull();
    expect(screen.getByText(LINKED_NOTE)).toBeTruthy();
  });

  it('shows no venue table for one venue on its own', async () => {
    mockReport = collectiveReport({
      collective: null,
      venues: [{ venue_id: 'v', venue_name: 'Ours', access: 'own' }],
      columns: collectiveReport().columns.slice(0, 1),
    });
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(screen.queryByLabelText('Booked revenue by venue')).toBeNull();
    expect(screen.queryByText(/Includes/)).toBeNull();
  });

  it('exports the venue breakdown after the totals, as the web CSV does', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    await act(async () => {
      fireEvent.press(screen.getByText('Export CSV'));
    });
    const rows = (buildAndShareCsv as jest.Mock).mock.calls[0][1] as string[][];
    expect(rows.slice(-5)).toEqual([
      [],
      ['Venue', 'Booked revenue', 'Through Aura Collective'],
      ['Ours', '50.00', '10.00'],
      ['Member Studio', '30.00', '30.00'],
      ['Partner', '20.00', '0.00'],
    ]);
  });
});

describe('BookedRevenueSection: the Reports calendar filter', () => {
  const hannah = { id: 'cal-1', name: 'Hannah' };
  const onClear = jest.fn();

  it('asks for the whole venue when no calendar is chosen', async () => {
    await render(<BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />);
    expect(mockQueries[0]).toBe('grain=day&preset=this_week');
    expect(screen.queryByText(/^Showing/)).toBeNull();
    expect(screen.queryByText('These figures are for the whole venue.')).toBeNull();
  });

  /** A filtered answer (web 90ff4d17): just that column, `venues: [own]`, `collective` unchanged. */
  function filteredReport(): BookedRevenueReport {
    const full = collectiveReport();
    return {
      ...full,
      columns: full.columns.slice(0, 1),
      periods: [{ period_start: '2026-09-11', period_end: '2026-09-11', ...cell(5000), by_calendar: { a: cell(5000) } }],
      totals: { ...cell(5000), by_calendar: { a: cell(5000) }, by_venue: { v: venueCell(5000, 1, 1000) } },
      venues: [{ venue_id: 'v', venue_name: 'Ours', access: 'own' }],
      calendar: hannah,
    };
  }

  it('asks for the chosen calendar and says so from the answer, in the web words', async () => {
    mockReport = filteredReport();
    await render(
      <ReportCalendarProvider calendar={hannah} onClear={onClear}>
        <BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />
      </ReportCalendarProvider>,
    );
    expect(mockQueries[0]).toBe('grain=day&preset=this_week&calendar_id=cal-1');
    expect(screen.getByText('Showing Hannah only.')).toBeTruthy();
    expect(
      screen.getByText("Showing Hannah only. Just this calendar's column. Other calendars and linked venues are left out."),
    ).toBeTruthy();
  });

  it('shows no venue table and no venue notes for one calendar, though the collective is still sent', async () => {
    mockReport = filteredReport();
    await render(
      <ReportCalendarProvider calendar={hannah} onClear={onClear}>
        <BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />
      </ReportCalendarProvider>,
    );
    expect(screen.queryByLabelText('Booked revenue by venue')).toBeNull();
    expect(screen.queryByText(/part of Aura Collective/)).toBeNull();
    expect(screen.queryByText(/linked account/)).toBeNull();
  });

  it("starts the CSV with the calendar and puts its name in the file name, as the web's", async () => {
    mockReport = filteredReport();
    await render(
      <ReportCalendarProvider calendar={hannah} onClear={onClear}>
        <BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />
      </ReportCalendarProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Export CSV'));
    });
    const [filename, rows] = (buildAndShareCsv as jest.Mock).mock.calls[0] as [string, string[][]];
    expect(filename).toBe('booked-revenue-hannah-2026-09-07-2026-09-13-day.csv');
    expect(rows.slice(0, 3)).toEqual([['Showing Hannah only'], [], ['Period', 'Hannah', 'Total', 'No-shows']]);
    // No venue breakdown for one calendar.
    expect(rows.some((row) => row[0] === 'Venue')).toBe(false);
  });

  it('says the figures are the whole venue when the answer carries no calendar', async () => {
    await render(
      <ReportCalendarProvider calendar={hannah} onClear={onClear}>
        <BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />
      </ReportCalendarProvider>,
    );
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
  });

  it("shows the server's sentence when filtering is not ready yet, and offers all calendars", async () => {
    const sentence = "Filtering by calendar isn't ready yet for this report.";
    mockReport = undefined;
    mockQueryState.isError = true;
    mockQueryState.error = new ApiError(sentence, 409, { error: sentence, code: 'CONFLICT' });
    await render(
      <ReportCalendarProvider calendar={hannah} onClear={onClear}>
        <BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />
      </ReportCalendarProvider>,
    );
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Show all calendars'));
    });
    expect(onClear).toHaveBeenCalled();
  });

  it("shows the server's sentence for a calendar it does not know, above figures already on screen", async () => {
    const sentence = "That calendar isn't one of yours. Choose one from the list, or All calendars.";
    mockQueryState.isError = true;
    mockQueryState.error = new ApiError(sentence, 400, {
      error: sentence,
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'calendar_id', message: sentence }],
    });
    await render(
      <ReportCalendarProvider calendar={hannah} onClear={onClear}>
        <BookedRevenueSection bookingWord="Appointment" today="2026-09-11" />
      </ReportCalendarProvider>,
    );
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.getByText('Show all calendars')).toBeTruthy();
    // The figures kept on screen are the whole venue's, and say so.
    expect(screen.getByText('These figures are for the whole venue.')).toBeTruthy();
  });
});

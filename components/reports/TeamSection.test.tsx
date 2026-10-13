/**
 * The Team tab (reports release 2; web repo `reports/release-2-screen-spec.md`): a card per
 * calendar with the seven figures and their changes, the Total, the note, the definitions, the
 * empty state, and release 1's refusal and error.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/reports/csv-export', () => ({ buildAndShareCsv: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/queries/useReportCalendars', () => ({ useReportCalendars: () => ({ data: undefined }) }));

import { TeamSection, type TeamMeasuresQuery } from '@/components/reports/TeamSection';
import { ApiError } from '@/lib/api/client';
import type { SalonMeasures, SalonMeasuresReport } from '@/types/reports';

function measures(overrides: Partial<SalonMeasures> = {}): SalonMeasures {
  return {
    booked_pence: 103400,
    visits: 40,
    visit_pence: 103400,
    avg_visit_pence: 2585,
    booked_minutes: 1278,
    working_minutes: 2040,
    utilisation_pct: 62.5,
    rebook_eligible: 40,
    rebooked: 15,
    rebooking_pct: 38,
    cohort: 10,
    returned: 4,
    retention_pct: 40,
    no_show_count: 2,
    no_show_due: 50,
    no_show_rate_pct: 4,
    no_show_value_pence: 6000,
    recovered_pence: 2000,
    ...overrides,
  };
}

function report(overrides: Partial<SalonMeasuresReport> = {}): SalonMeasuresReport {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    today: '2026-10-13',
    scope: { kind: 'venue', name: 'Plus 1', business: null },
    calendar: null,
    comparison: { basis: 'previous', from: '2026-08-01', to: '2026-08-31' },
    totals: measures({ visits: 70, booked_pence: 180000 }),
    earlier: measures({ visits: 70, booked_pence: 150000 }),
    by_calendar: [
      {
        calendar_id: 'c1',
        name: 'Hannah',
        venue_id: 'v1',
        venue_name: 'Plus 1',
        active: true,
        current: measures({ visits: 44, no_show_rate_pct: 6 }),
        earlier: measures(),
      },
      {
        calendar_id: 'c2',
        name: 'Jess',
        venue_id: 'v2',
        venue_name: 'Light 3',
        active: false,
        current: measures({ retention_pct: null, utilisation_pct: null }),
        earlier: measures(),
      },
    ],
    by_business: null,
    busiest: [],
    not_returned: [],
    not_returned_total: 0,
    checkout: null,
    ...overrides,
  };
}

function query(overrides: Partial<TeamMeasuresQuery> = {}): TeamMeasuresQuery {
  return { data: report(), isLoading: false, isError: false, error: null, refetch: jest.fn(), ...overrides };
}

describe('TeamSection', () => {
  it('shows the title, basis, intro, range and a card per calendar with its changes', async () => {
    await render(<TeamSection query={query()} scoped={false} />);
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.getByText('Counted by appointment date')).toBeTruthy();
    expect(
      screen.getByText("Each calendar's figures for these dates, with the change against the earlier period underneath."),
    ).toBeTruthy();
    expect(screen.getByText('1 Sep to 30 Sep 2026')).toBeTruthy();
    const rows = screen.getAllByTestId('team-row');
    expect(rows).toHaveLength(2);
    const hannah = within(rows[0]!);
    expect(hannah.getByText('Hannah')).toBeTruthy();
    for (const label of ['Booked value', 'Visits', 'Utilisation', 'Rebooking', 'First-visit retention', 'Average visit value', 'No-show rate']) {
      expect(hannah.getByText(label)).toBeTruthy();
    }
    expect(hannah.getByText('£1,034.00')).toBeTruthy();
    expect(hannah.getByText('44')).toBeTruthy();
    expect(hannah.getByLabelText('Visits change +10%')).toBeTruthy();
    // A higher no-show rate is worse.
    expect(hannah.getByLabelText('No-show rate change +2.0 pts')).toBeTruthy();
  });

  it('marks a calendar no longer active, and shows None with no change', async () => {
    await render(<TeamSection query={query()} scoped={false} />);
    const jess = within(screen.getAllByTestId('team-row')[1]!);
    expect(jess.getByText('Jess (no longer active)')).toBeTruthy();
    expect(jess.getAllByText('None')).toHaveLength(2);
    expect(jess.queryByLabelText(/^First-visit retention change/)).toBeNull();
    expect(jess.queryByLabelText(/^Utilisation change/)).toBeNull();
  });

  it('names each calendar at its business for everyone together or a business', async () => {
    await render(
      <TeamSection
        query={query({ data: report({ scope: { kind: 'together', name: 'Everyone together', business: null } }) })}
        scoped
      />,
    );
    expect(screen.getByText('Hannah at Plus 1')).toBeTruthy();
    expect(screen.getByText('Jess at Light 3 (no longer active)')).toBeTruthy();
  });

  it('adds a Total row with its changes, the note, definitions and footnote', async () => {
    await render(<TeamSection query={query()} scoped={false} />);
    const total = within(screen.getByTestId('team-total'));
    expect(total.getByText('Total')).toBeTruthy();
    expect(total.getByText('£1,800.00')).toBeTruthy();
    expect(total.getByLabelText('Booked value change +20%')).toBeTruthy();
    expect(total.getByLabelText('Visits change No change')).toBeTruthy();
    expect(
      screen.getByText('A visit with services on two calendars counts once on each, so the rows can add up to more than the total.'),
    ).toBeTruthy();
    expect(screen.getByText('No-show rate: Of the appointments due, the share where the client did not turn up. Walk-ins are left out.')).toBeTruthy();
    expect(
      screen.getByText('A visit is a booking on a day that has passed, or today, that was not cancelled or a no-show.'),
    ).toBeTruthy();
  });

  it('says so when there are no calendars', async () => {
    await render(<TeamSection query={query({ data: report({ by_calendar: [] }) })} scoped={false} />);
    expect(screen.getByText('No calendars to show for these dates.')).toBeTruthy();
    expect(screen.queryByTestId('team-total')).toBeNull();
  });

  it("shows the server's sentence and the way back when the choice is refused", async () => {
    const error = new ApiError('Choose a calendar this venue can report on.', 400, {
      error: 'Choose a calendar this venue can report on.',
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'calendar_id', message: 'Unknown' }],
    });
    await render(<TeamSection query={query({ data: undefined, isError: true, error })} scoped />);
    expect(screen.getByText('Choose a calendar this venue can report on.')).toBeTruthy();
    expect(screen.getByText('Show all calendars')).toBeTruthy();
  });

  it("shows the server's words with a retry for any other failure", async () => {
    const refetch = jest.fn();
    const error = new ApiError('Something went wrong. Please try again.', 500, { error: 'Something went wrong. Please try again.' });
    await render(<TeamSection query={query({ data: undefined, isError: true, error, refetch })} scoped={false} />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Try again'));
    });
    expect(refetch).toHaveBeenCalled();
  });
});

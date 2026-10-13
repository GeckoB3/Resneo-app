/**
 * Reports release 2: the Key measures and Busiest times cards, the Team tab link, and the Clients
 * tab's tiles and list of clients who have not come back (web repo `reports/release-2-screen-spec.md`).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/providers/ToastProvider', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/reports/csv-export', () => ({ buildAndShareCsv: jest.fn(async () => ({ ok: true })) }));

import {
  BusiestTimesCard,
  ClientMeasures,
  KeyMeasuresCard,
  TeamTabLink,
} from '@/components/reports/SalonMeasuresCards';
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
    no_show_value_pence: 6000,
    no_show_rate_pct: 4,
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
    totals: measures(),
    earlier: measures({ utilisation_pct: 60, no_show_value_pence: 3000 }),
    by_calendar: [],
    by_business: null,
    busiest: [],
    not_returned: [],
    not_returned_total: 0,
    checkout: null,
    ...overrides,
  };
}

describe('KeyMeasuresCard', () => {
  it('shows the four tiles, their sub-lines, badges, definitions and footnote', async () => {
    await render(<KeyMeasuresCard data={report()} />);
    expect(screen.getByText('Key measures')).toBeTruthy();
    expect(screen.getByText('Counted by appointment date')).toBeTruthy();
    expect(screen.getByText('62.5%')).toBeTruthy();
    expect(screen.getByText('21.3 of 34.0 hours booked')).toBeTruthy();
    expect(screen.getByText('38.0%')).toBeTruthy();
    expect(screen.getByText('15 of 40 visits')).toBeTruthy();
    expect(screen.getByText('£25.85')).toBeTruthy();
    expect(screen.getByText('40 visits')).toBeTruthy();
    expect(screen.getByText('£60.00')).toBeTruthy();
    expect(screen.getByText('£20.00 kept from deposits and fees')).toBeTruthy();
    // Utilisation up is good; the no-show cost doubling is a +100% that is bad.
    expect(screen.getByLabelText('+2.5 pts')).toBeTruthy();
    expect(screen.getByLabelText('+100%')).toBeTruthy();
    expect(screen.getAllByLabelText('No change')).toHaveLength(2);
    expect(screen.getByText(/^Utilisation: Booked time as a share of working time/)).toBeTruthy();
    expect(screen.getByText(/^What no-shows cost: The booked value of no-shows, against the deposits/)).toBeTruthy();
    expect(
      screen.getByText('A visit is a booking on a day that has passed, or today, that was not cancelled or a no-show.'),
    ).toBeTruthy();
    expect(screen.getByText('Changes compare with 1 Aug to 31 Aug 2026.')).toBeTruthy();
  });

  it('colours a higher no-show cost as worse', async () => {
    await render(<KeyMeasuresCard data={report()} />);
    const pill = screen.getByLabelText('+100%');
    const good = screen.getByLabelText('+2.5 pts');
    // Red and green pills have different borders.
    const border = (node: typeof pill) => JSON.stringify(node.props.style);
    expect(border(pill)).not.toEqual(border(good));
  });

  it('shows the null texts with no badge, and £0.00 for no no-shows', async () => {
    await render(
      <KeyMeasuresCard
        data={report({
          totals: measures({ utilisation_pct: null, rebooking_pct: null, avg_visit_pence: null, no_show_value_pence: 0, recovered_pence: 0 }),
        })}
      />,
    );
    expect(screen.getByText('No working hours')).toBeTruthy();
    expect(screen.getAllByText('No visits yet')).toHaveLength(2);
    expect(screen.getByText('£0.00')).toBeTruthy();
    expect(screen.queryByText(/hours booked$/)).toBeNull();
  });

  it('adds the till line at a Checkout venue', async () => {
    await render(
      <KeyMeasuresCard
        data={report({
          checkout: {
            current: { service_visits: 12, spend_pence: 48000, avg_spend_pence: 4000, product_visits: 5, product_share_pct: 41.7 },
            earlier: null,
          },
        })}
      />,
    );
    expect(screen.getByText('£40.00 at the till, 41.7% with a product')).toBeTruthy();
  });

  it('shows no badges or caption without a comparison', async () => {
    await render(<KeyMeasuresCard data={report({ comparison: null })} />);
    expect(screen.queryByTestId('change-pill')).toBeNull();
    expect(screen.queryByText(/^Changes compare with/)).toBeNull();
  });
});

describe('BusiestTimesCard', () => {
  it('draws Monday to Sunday over the working hours, with blank cells where nobody works', async () => {
    await render(
      <BusiestTimesCard
        cells={[
          { weekday: 1, hour: 9, booked_minutes: 27, working_minutes: 60 },
          { weekday: 5, hour: 12, booked_minutes: 60, working_minutes: 60 },
        ]}
      />,
    );
    expect(screen.getByText('Busiest times')).toBeTruthy();
    expect(
      screen.getByText(
        'How much of the working time in each hour was booked, across these dates. Darker is busier. Hours nobody works are blank.',
      ),
    ).toBeTruthy();
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(screen.getByText(day)).toBeTruthy();
    for (const hour of ['9', '10', '11', '12']) expect(screen.getByText(hour)).toBeTruthy();
    expect(screen.queryByText('8')).toBeNull();
    expect(screen.queryByText('13')).toBeNull();
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    // 7 days x 4 hours, two of them worked.
    expect(screen.getAllByTestId('busiest-blank')).toHaveLength(26);
    expect(screen.getByLabelText('Mon 9:00, 45% booked')).toBeTruthy();
  });

  it('is hidden when nobody works', async () => {
    await render(<BusiestTimesCard cells={[{ weekday: 2, hour: 10, booked_minutes: 30, working_minutes: 0 }]} />);
    expect(screen.queryByText('Busiest times')).toBeNull();
  });
});

describe('TeamTabLink', () => {
  it('reads as one line and opens the Team tab', async () => {
    const onPress = jest.fn();
    await render(<TeamTabLink onPress={onPress} />);
    expect(screen.getByText("See each person's figures on the Team tab.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Team tab'));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ClientMeasures', () => {
  const people = [
    { guest_id: 'g1', name: 'Ava Brown', first_visit_date: '2026-09-20', calendar_name: 'Jess', venue_name: 'Light 3' },
    { guest_id: 'g2', name: 'Ben Cole', first_visit_date: '2026-09-03', calendar_name: 'Hannah', venue_name: 'Plus 1' },
  ];

  it('shows rebooking and first-visit retention with their definitions', async () => {
    await render(<ClientMeasures data={report({ earlier: measures({ retention_pct: 30 }) })} />);
    expect(screen.getAllByText('Rebooking rate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('First-visit retention').length).toBeGreaterThan(0);
    expect(screen.getByText('4 of 10 came back within 90 days')).toBeTruthy();
    expect(screen.getByLabelText('+10.0 pts')).toBeTruthy();
    expect(
      screen.getByText(
        'First-visit retention: Of new clients whose first visit was 90 days before these dates, the share who came back within 90 days.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^Show the/)).toBeNull();
  });

  it('reads No new clients when nobody was new', async () => {
    await render(<ClientMeasures data={report({ totals: measures({ retention_pct: null }) })} />);
    expect(screen.getByText('No new clients')).toBeTruthy();
  });

  it('opens and closes the list of clients who have not come back', async () => {
    await render(<ClientMeasures data={report({ not_returned: people, not_returned_total: 2 })} />);
    expect(screen.queryByTestId('not-returned-list')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Show the 2 who have not come back'));
    });
    expect(screen.getByTestId('not-returned-list')).toBeTruthy();
    expect(screen.getByText('Ava Brown')).toBeTruthy();
    expect(screen.getByText('First visit 20 Sep 2026')).toBeTruthy();
    // Your own venue: the calendar alone.
    expect(screen.getByText('Jess')).toBeTruthy();
    expect(screen.queryByText(/^Showing the/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Hide the list'));
    });
    expect(screen.queryByTestId('not-returned-list')).toBeNull();
  });

  it('names the business in a combined scope, and says when the list is cut short', async () => {
    await render(
      <ClientMeasures
        data={report({
          scope: { kind: 'together', name: 'Everyone together', business: null },
          not_returned: people,
          not_returned_total: 250,
        })}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Show the 250 who have not come back'));
    });
    expect(screen.getByText('Jess at Light 3')).toBeTruthy();
    expect(screen.getByText('Hannah at Plus 1')).toBeTruthy();
    expect(screen.getByText('Showing the 2 most recent of 250.')).toBeTruthy();
  });
});

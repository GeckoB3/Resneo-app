import {
  MEASURES_COPY,
  busiestGrid,
  busiestOpacity,
  clientMeasureTiles,
  formatMeasureDate,
  keyMeasureTiles,
  notReturnedPlace,
  teamFigures,
  teamRowName,
} from '@/lib/reports/salon-measures';
import type { SalonMeasures } from '@/types/reports';

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

describe('the copy', () => {
  it('never uses an em-dash', () => {
    for (const text of Object.values(MEASURES_COPY)) expect(text).not.toContain('—');
  });
});

describe('keyMeasureTiles', () => {
  it('shows the four figures with their sub-lines, money with thousands separators', () => {
    const tiles = keyMeasureTiles(measures(), measures(), null);
    expect(tiles.map((t) => [t.label, t.value, t.lines])).toEqual([
      ['Utilisation', '62.5%', ['21.3 of 34.0 hours booked']],
      ['Rebooking rate', '38.0%', ['15 of 40 visits']],
      ['Average visit value', '£25.85', ['40 visits']],
      ['What no-shows cost', '£60.00', ['£20.00 kept from deposits and fees']],
    ]);
    expect(keyMeasureTiles(measures({ avg_visit_pence: 103400 }), null, null)[2]!.value).toBe('£1,034.00');
  });

  it('reads the null texts, and never nulls the no-show cost', () => {
    const tiles = keyMeasureTiles(
      measures({ utilisation_pct: null, rebooking_pct: null, avg_visit_pence: null, no_show_value_pence: 0, recovered_pence: 0 }),
      measures(),
      null,
    );
    expect(tiles.map((t) => t.value)).toEqual(['No working hours', 'No visits yet', 'No visits yet', '£0.00']);
    expect(tiles[0]!.lines).toEqual([]);
    expect(tiles[0]!.change).toBeNull();
  });

  it('treats a higher no-show cost as worse, and the rest as better', () => {
    const tiles = keyMeasureTiles(
      measures({ utilisation_pct: 70, rebooking_pct: 30, avg_visit_pence: 3000, no_show_value_pence: 9000 }),
      measures(),
      null,
    );
    expect(tiles.map((t) => t.change)).toEqual([
      { label: '+7.5 pts', tone: 'good' },
      { label: '-8.0 pts', tone: 'bad' },
      { label: '+16%', tone: 'good' },
      { label: '+50%', tone: 'bad' },
    ]);
  });

  it('adds the till line at Checkout venues with visits through the till', () => {
    const checkout = { service_visits: 12, spend_pence: 48000, avg_spend_pence: 4000, product_visits: 5, product_share_pct: 41.7 };
    expect(keyMeasureTiles(measures(), null, checkout)[2]!.lines).toEqual(['40 visits', '£40.00 at the till, 41.7% with a product']);
    expect(keyMeasureTiles(measures(), null, { ...checkout, service_visits: 0 })[2]!.lines).toEqual(['40 visits']);
  });
});

describe('clientMeasureTiles', () => {
  it('shows rebooking and first-visit retention, with the null text', () => {
    expect(clientMeasureTiles(measures(), measures({ retention_pct: 50 })).map((t) => [t.value, t.lines, t.change?.label])).toEqual([
      ['38.0%', ['15 of 40 visits'], 'No change'],
      ['40.0%', ['4 of 10 came back within 90 days'], '-10.0 pts'],
    ]);
    expect(clientMeasureTiles(measures({ retention_pct: null }), null)[1]!.value).toBe('No new clients');
  });
});

describe('busiestGrid', () => {
  it('runs from the earliest to the latest working hour, blank where nobody works', () => {
    const grid = busiestGrid([
      { weekday: 1, hour: 9, booked_minutes: 27, working_minutes: 60 },
      { weekday: 3, hour: 12, booked_minutes: 0, working_minutes: 0 },
      { weekday: 6, hour: 11, booked_minutes: 90, working_minutes: 60 },
      // Booked but nobody working: still blank, and does not widen the hours.
      { weekday: 7, hour: 20, booked_minutes: 30, working_minutes: 0 },
    ])!;
    expect(grid.hours).toEqual([9, 10, 11]);
    expect(grid.rows.map((r) => r.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(grid.rows[0]!.cells.map((c) => c.pct)).toEqual([45, null, null]);
    expect(grid.rows[5]!.cells.map((c) => c.pct)).toEqual([null, null, 150]);
    expect(grid.rows[6]!.cells.every((c) => c.pct === null)).toBe(true);
  });

  it('is null when no cell has working minutes', () => {
    expect(busiestGrid([{ weekday: 1, hour: 9, booked_minutes: 30, working_minutes: 0 }])).toBeNull();
    expect(busiestGrid([])).toBeNull();
  });

  it('scales the teal from very light to full', () => {
    expect(busiestOpacity(0)).toBe(0.08);
    expect(busiestOpacity(100)).toBe(1);
    expect(busiestOpacity(150)).toBe(1);
    expect(busiestOpacity(50)).toBe(0.54);
  });
});

describe('the Team tab', () => {
  it('names a calendar at its business in a combined scope, and marks one no longer active', () => {
    expect(teamRowName({ name: 'Jess', venue_name: 'Light 3', active: true }, false)).toBe('Jess');
    expect(teamRowName({ name: 'Jess', venue_name: 'Light 3', active: true }, true)).toBe('Jess at Light 3');
    expect(teamRowName({ name: 'Sam', venue_name: 'Plus 1', active: false }, true)).toBe('Sam at Plus 1 (no longer active)');
  });

  it('gives the seven figures with their changes, a higher no-show rate worse, and None with no change', () => {
    const figures = teamFigures(
      measures({ no_show_rate_pct: 6, retention_pct: null, visits: 44 }),
      measures(),
    );
    expect(figures.map((f) => [f.label, f.value, f.change?.label ?? null, f.change?.tone ?? null])).toEqual([
      ['Booked value', '£1,034.00', 'No change', 'neutral'],
      ['Visits', '44', '+10%', 'good'],
      ['Utilisation', '62.5%', 'No change', 'neutral'],
      ['Rebooking', '38.0%', 'No change', 'neutral'],
      ['First-visit retention', 'None', null, null],
      ['Average visit value', '£25.85', 'No change', 'neutral'],
      ['No-show rate', '6.0%', '+2.0 pts', 'bad'],
    ]);
  });
});

describe('the clients who have not come back', () => {
  it('says the calendar, at its business in a combined scope', () => {
    expect(notReturnedPlace({ calendar_name: 'Jess', venue_name: 'Light 3' }, false)).toBe('Jess');
    expect(notReturnedPlace({ calendar_name: 'Jess', venue_name: 'Light 3' }, true)).toBe('Jess at Light 3');
    expect(notReturnedPlace({ calendar_name: null, venue_name: 'Light 3' }, false)).toBeNull();
    expect(notReturnedPlace({ calendar_name: null, venue_name: 'Light 3' }, true)).toBe('Light 3');
  });

  it('formats the date the app usual way', () => {
    expect(formatMeasureDate('2026-08-03')).toBe('3 Aug 2026');
  });
});

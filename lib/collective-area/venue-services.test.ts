/**
 * Every venue's own services and the rules for curating the page from them (owner, 2026-10-27; web
 * `VenueServicesPanel.tsx`). Pure, so each rule is checked without rendering.
 */
import { AREA_COPY } from '@/lib/collective-area/copy';
import {
  calendarsWords,
  chunked,
  curateOutcome,
  curateSelection,
  curateTitle,
  declinedText,
  declineTitle,
  joiningList,
  joinsLine,
  onPageAsLine,
  priceWords,
  venueCounts,
  venueServiceFacts,
  venueServiceKey,
  venueServiceRows,
  type VenueServiceRow,
  type VenueServicesGroup,
} from '@/lib/collective-area/venue-services';
import { SETUP_COPY } from '@/lib/linked/setup-copy';

const row = (overrides: Partial<VenueServiceRow> & Pick<VenueServiceRow, 'id' | 'name'>): VenueServiceRow => ({
  duration_minutes: 30,
  price_pence: 2500,
  heading: null,
  bookable_online: true,
  on_page: false,
  item_id: null,
  page_name: null,
  joins: null,
  calendars: 1,
  suggested_at: null,
  ...overrides,
});

const groups: VenueServicesGroup[] = [
  {
    venue_id: 'v-host',
    venue_name: 'Northside Studio',
    is_host: true,
    services: [
      row({ id: 'h1', name: 'Balayage', on_page: true, item_id: 'item-1', heading: 'Colour', calendars: 2 }),
      row({ id: 'h2', name: 'Fringe trim', price_pence: 0, calendars: 0 }),
    ],
  },
  {
    venue_id: 'v-zen',
    venue_name: 'Zen Studio',
    is_host: false,
    services: [
      row({ id: 'z1', name: 'gents cut', on_page: true, item_id: 'item-2', page_name: 'Gents Haircut' }),
      row({ id: 'z2', name: 'Brows', suggested_at: '2026-10-27T09:00:00Z' }),
      row({ id: 'z3', name: 'Balayage', joins: { item_id: 'item-1', name: 'Balayage' }, bookable_online: false }),
    ],
  },
];

describe("every venue's services", () => {
  it('counts what each venue has on the page and how many it suggested', () => {
    const counts = venueCounts(groups);
    expect(counts.get('v-host')).toEqual({ on: 1, total: 2, suggested: 0 });
    expect(counts.get('v-zen')).toEqual({ on: 1, total: 3, suggested: 1 });
  });

  it('filters by venue, by page and by suggestion, and searches names and headings', () => {
    const ids = (venue: string, filter: 'all' | 'on' | 'off' | 'suggested', search = '') =>
      venueServiceRows(groups, venue, filter, search).map((r) => r.service.id);
    expect(ids('all', 'all')).toEqual(['h1', 'h2', 'z1', 'z2', 'z3']);
    expect(ids('v-zen', 'all')).toEqual(['z1', 'z2', 'z3']);
    expect(ids('all', 'on')).toEqual(['h1', 'z1']);
    expect(ids('all', 'off')).toEqual(['h2', 'z2', 'z3']);
    expect(ids('all', 'suggested')).toEqual(['z2']);
    expect(ids('all', 'all', 'BALAY')).toEqual(['h1', 'z3']);
    // The heading counts too.
    expect(ids('all', 'all', 'colour')).toEqual(['h1']);
  });

  it("says each service's facts, its venue only when every venue is shown, and its calendars", () => {
    const [h1, h2] = venueServiceRows(groups, 'all', 'all', '');
    expect(venueServiceFacts(h1!, { symbol: '£', showVenue: true })).toBe(
      '30 min · £25.00 · Colour · Northside Studio (you) · 2 calendars',
    );
    expect(venueServiceFacts(h2!, { symbol: '£', showVenue: false })).toBe('30 min · Free · No calendars');
    const z3 = venueServiceRows(groups, 'v-zen', 'all', '')[2]!;
    expect(venueServiceFacts(z3, { symbol: '€', showVenue: true })).toBe('30 min · €25.00 · Staff only · Zen Studio · 1 calendar');
    expect(calendarsWords(5)).toBe('5 calendars');
    expect(priceWords(1999, '£')).toBe('£19.99');
  });

  it('names the page service a service follows, and the one it would join', () => {
    const zen = groups[1]!.services;
    expect(onPageAsLine(zen[0]!)).toBe('On the page as Gents Haircut');
    // Same name in another case is not worth saying.
    expect(onPageAsLine(row({ id: 'x', name: 'Balayage', on_page: true, page_name: 'balayage ' }))).toBeNull();
    expect(joinsLine(zen[2]!)).toBe('Joins Balayage on the page');
    expect(joinsLine(zen[1]!)).toBeNull();
  });

  it('splits a selection by what each button does with it', () => {
    const selected = new Set([
      venueServiceKey('v-host', 'h1'),
      venueServiceKey('v-zen', 'z2'),
      venueServiceKey('v-zen', 'z3'),
      // A service that is no longer listed is ignored.
      venueServiceKey('v-zen', 'gone'),
    ]);
    const s = curateSelection(groups, selected);
    expect(s.chosen.map((c) => c.service.id)).toEqual(['h1', 'z2', 'z3']);
    expect(s.toAdd.map((c) => c.service.id)).toEqual(['z2', 'z3']);
    expect(s.toRemove.map((c) => c.service.id)).toEqual(['h1']);
    expect(s.toDecline.map((c) => c.service.id)).toEqual(['z2']);
    expect(s.joining.map((c) => c.service.id)).toEqual(['z3']);
    expect(joiningList(s.joining)).toBe('Balayage (Zen Studio)');
  });

  it('asks about one service by name and more by count', () => {
    const s = curateSelection(groups, new Set([venueServiceKey('v-zen', 'z2'), venueServiceKey('v-zen', 'z3')]));
    expect(curateTitle('add', s.toAdd, 'Northside')).toBe('Put 2 services on the Northside page?');
    expect(curateTitle('add', s.toAdd.slice(0, 1), 'Northside')).toBe('Put Brows on the Northside page?');
    expect(curateTitle('remove', s.toAdd.slice(0, 1), 'Northside')).toBe('Take Brows off the Northside page?');
    expect(declineTitle(['Brows'])).toBe('Leave Brows off the page?');
    expect(declineTitle(['Brows', 'Nails'])).toBe('Leave 2 suggestions off the page?');
    expect(declinedText([{ service: 'Brows', venue: 'Zen Studio' }])).toBe('Brows is left off the page. We have let Zen Studio know.');
    expect(declinedText([{ service: 'A', venue: 'V' }, { service: 'B', venue: 'V' }])).toBe(
      '2 suggestions are left off the page. We have let the venues know.',
    );
  });

  it('says what a save did, and keeps the ones that did not change ticked', () => {
    const names: Record<string, string> = { z2: 'Brows', z3: 'Balayage' };
    const nameOf = (r: { service_id: string }) => names[r.service_id] ?? 'A service';
    expect(curateOutcome('add', [{ venue_id: 'v-zen', service_id: 'z2', ok: true, status: 'added' }], nameOf, 'Northside')).toEqual({
      tone: 'ok',
      text: 'Brows is on the Northside page.',
      rows: [],
      failedKeys: [],
    });
    expect(
      curateOutcome(
        'remove',
        [
          { venue_id: 'v-zen', service_id: 'z2', ok: true },
          { venue_id: 'v-zen', service_id: 'z3', ok: true },
        ],
        nameOf,
        'Northside',
      ).text,
    ).toBe('2 services are off the Northside page.');
    expect(
      curateOutcome(
        'add',
        [
          { venue_id: 'v-zen', service_id: 'z2', ok: true },
          { venue_id: 'v-zen', service_id: 'z3', ok: false, message: 'Zen Studio is still updating.' },
          { venue_id: 'v-zen', service_id: 'z2', ok: false },
        ],
        nameOf,
        'Northside',
        () => 'Zen Studio',
      ),
    ).toEqual({
      // CQ-04: the web's wording, with a row for each that names the venue and the reason.
      tone: 'error',
      text: 'These did not change:',
      rows: [
        'Balayage at Zen Studio: Zen Studio is still updating.',
        'Brows at Zen Studio: That did not go through. Please try again.',
      ],
      failedKeys: ['v-zen:z3', 'v-zen:z2'],
    });
  });

  it('sends 200 at a time', () => {
    const list = Array.from({ length: 450 }, (_, i) => i);
    expect(chunked(list).map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunked([])).toEqual([]);
  });
});

describe('the collective copy tables', () => {
  // User-facing copy never uses an em-dash (project rule); the web table is the source.
  it('has no em-dash in any sentence', () => {
    const emDash = String.fromCharCode(0x2014);
    for (const [key, text] of [...Object.entries(AREA_COPY), ...Object.entries(SETUP_COPY)]) {
      expect(`${key}: ${text}`.includes(emDash)).toBe(false);
    }
  });
});

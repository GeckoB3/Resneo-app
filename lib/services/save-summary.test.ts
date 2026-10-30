/**
 * What the save summary says (web `CollectiveSaveSummary`, CQ-11): how far a save reached, the
 * calendar values it cleared by name, and what Put it back brought back.
 */
import type { CollectiveCalendarGroup } from '@/lib/collective-area/model';
import { clearedValuesFrom, saveSummaryLines, undoDoneText, type ClearedCalendarValue } from '@/lib/services/save-summary';

const sync = { venues: 2, applied: 2, pending: [], failed: [] };
const groups = [
  { venue_id: 'v-host', venue_name: 'Bright Cuts', is_host: true, sync, calendars: [{ id: 'cal-a', name: 'Amy', is_active: true, assigned: [] }] },
  { venue_id: 'v-zen', venue_name: 'Zen Studio', is_host: false, sync, calendars: [{ id: 'cal-m', name: 'Mo', is_active: true, assigned: [] }] },
] as CollectiveCalendarGroup[];

describe('saveSummaryLines', () => {
  it('says every venue is up to date, once', () => {
    expect(saveSummaryLines(sync, 'Balayage', ['Zen Studio', 'Light 3'])).toEqual([
      { key: 'all-done', tone: 'ok', text: 'Saved. Balayage is up to date at Zen Studio and Light 3.' },
    ]);
  });

  it('has a line for each venue still updating, each that failed, and each calendar refused', () => {
    const lines = saveSummaryLines(
      {
        venues: 3,
        applied: 1,
        pending: [{ venue_id: 'v1', venue_name: 'Light 3' }],
        failed: [{ venue_id: 'v2', venue_name: 'Zen Studio', message: 'x', code: 'busy' }],
        calendar_failures: [{ calendar_id: 'c1', message: 'Mo at Zen Studio could not be changed.' }],
      },
      'Balayage',
      [],
    );
    expect(lines.map((l) => [l.tone, l.text])).toEqual([
      ['warn', 'Saved. Light 3 is updating. Its calendars take new bookings for Balayage again in a moment.'],
      ['bad', 'Saved here, but Zen Studio could not be updated yet: Zen Studio was busy. We will try again in a moment. We will keep trying.'],
      ['bad', 'Mo at Zen Studio could not be changed.'],
    ]);
  });

  it('says nothing when the save reached nobody', () => {
    expect(saveSummaryLines({ venues: 0, applied: 0, pending: [], failed: [] }, 'Balayage', [])).toEqual([]);
  });
});

describe('clearedValuesFrom', () => {
  it("names each with its calendar and the values cleared, the host's own without a venue", () => {
    expect(
      clearedValuesFrom(
        [
          { calendar_id: 'cal-m', service_id: 'r1', venue_id: 'v-zen', values: { custom_price_pence: 4500, custom_duration_minutes: 40 } },
          { calendar_id: 'cal-a', service_id: 's1', values: { custom_buffer_minutes: 5 } },
          { calendar_id: 'cal-old', service_id: 's1', values: {} },
        ],
        groups,
        [{ id: 'cal-old', name: 'Old chair' }],
      ),
    ).toEqual([
      { calendar_id: 'cal-m', service_id: 'r1', values: { custom_price_pence: 4500, custom_duration_minutes: 40 }, label: 'Mo at Zen Studio (price and length)' },
      { calendar_id: 'cal-a', service_id: 's1', values: { custom_buffer_minutes: 5 }, label: 'Amy (buffer)' },
      { calendar_id: 'cal-old', service_id: 's1', values: {}, label: 'Old chair' },
    ]);
  });

  it('leaves out what an older server or a bad row sends', () => {
    expect(clearedValuesFrom(undefined, groups)).toEqual([]);
    expect(clearedValuesFrom([{ calendar_id: 'c' }, null, { calendar_id: 'c', service_id: 's' }], groups)).toEqual([]);
  });
});

describe('undoDoneText', () => {
  const cleared: ClearedCalendarValue[] = [
    { calendar_id: 'cal-m', service_id: 'r1', values: { custom_price_pence: 4500 }, label: 'Mo at Zen Studio (price)' },
    { calendar_id: 'cal-a', service_id: 's1', values: { custom_buffer_minutes: 5 }, label: 'Amy (buffer)' },
  ];

  it('says the settings are back, and that calendar changes stay when there were some', () => {
    expect(undoDoneText({ serviceName: 'Balayage', calendarsChanged: false, cleared: [] })).toBe(
      "We put Balayage's settings back at every venue.",
    );
    expect(undoDoneText({ serviceName: 'Balayage', calendarsChanged: true, cleared: [] })).toBe(
      "We put Balayage's settings back at every venue. The calendar changes from that save stay as they are.",
    );
  });

  it('says the cleared values are back, or names the ones that are not', () => {
    expect(undoDoneText({ serviceName: 'Balayage', calendarsChanged: false, cleared, notRestored: [] })).toBe(
      "We put Balayage's settings back at every venue. The calendars' own values that save cleared are back too.",
    );
    expect(
      undoDoneText({
        serviceName: 'Balayage',
        calendarsChanged: false,
        cleared,
        notRestored: [{ calendar_id: 'cal-m', service_id: 'r1' }],
      }),
    ).toBe(
      "We put Balayage's settings back at every venue. These could not be put back, so set them again with Edit values: Mo at Zen Studio (price).",
    );
  });
});

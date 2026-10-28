/**
 * The Collective area's rules, as the web grid and "What needs you" apply them (2026-09-17).
 */
import {
  areaCollective,
  buildCollectiveTodos,
  bulkOps,
  calendarWillOffer,
  cellState,
  confirmSummary,
  gridRows,
  isSwitchedOff,
  pageChangeable,
  pickerDescription,
  pickerKey,
  pickerResult,
  pickerServices,
  pickerState,
  selectionSummary,
  stagedCalendarOps,
  stageOps,
  toggleCalendar,
  unsavedSummary,
  type AreaService,
  type CollectiveCalendarGroup,
} from '@/lib/collective-area/model';
import type { ServiceCollectiveBlock } from '@/types/services-manage';

const block = (overrides: Partial<ServiceCollectiveBlock> = {}): ServiceCollectiveBlock => ({
  role: 'master',
  collective_id: 'col-1',
  collective_name: 'Northside',
  host_venue_name: 'Host Venue',
  item_id: 'item-1',
  locked_fields: [],
  delegated_fields: [],
  status: 'up_to_date',
  status_reason: null,
  last_applied_at: null,
  hidden_reasons: [],
  ...overrides,
});

const values = {
  custom_price_pence: null,
  custom_duration_minutes: null,
  custom_buffer_minutes: null,
  custom_deposit_pence: null,
};
const sync = { venues: 1, applied: 1, pending: [], failed: [] };

const groups: CollectiveCalendarGroup[] = [
  {
    venue_id: 'v-host',
    venue_name: 'Host Venue',
    is_host: true,
    sync,
    calendars: [
      { id: 'c1', name: 'Ada', is_active: true, assigned: [{ item_id: 'item-1', service_id: 's1', values, last_changed: null }] },
      { id: 'c2', name: 'Ben', is_active: true, assigned: [] },
    ],
  },
  {
    venue_id: 'v-zen',
    venue_name: 'Zen Studio',
    is_host: false,
    sync,
    calendars: [{ id: 'c3', name: 'Cy', is_active: true, assigned: [] }],
  },
];

const services: AreaService[] = [
  { id: 's2', name: 'Parked cut', collective: block({ role: 'parked', item_id: null }) },
  { id: 's1', name: 'Balayage', collective: block() },
];

describe('the area', () => {
  it('knows the collective and that this venue hosts it', () => {
    expect(areaCollective(services)).toEqual({ id: 'col-1', name: 'Northside', hostVenueName: 'Host Venue', isHost: true });
    expect(areaCollective([])).toBeNull();
  });

  it("takes the venue's side from venue_role, so a host with nothing on the page yet is still the host", () => {
    // Every service parked: no master to guess from (web 2026-10-27).
    const parkedOnly: AreaService[] = [{ id: 's9', name: 'Trim', collective: block({ role: 'parked', item_id: null, venue_role: 'host' }) }];
    expect(areaCollective(parkedOnly)?.isHost).toBe(true);
    // A member never hosts, whatever the roles look like.
    const member: AreaService[] = [{ id: 's1', name: 'Balayage', collective: block({ role: 'master', venue_role: 'member' }) }];
    expect(areaCollective(member)?.isHost).toBe(false);
    // An older server without venue_role: the guess from a master service still holds.
    expect(areaCollective([{ id: 's2', name: 'Cut', collective: block({ role: 'parked', item_id: null }) }])?.isHost).toBe(false);
  });

  it('reads a cell as all, some or no calendars', () => {
    expect(cellState(groups[0]!, 'item-1')).toBe('some');
    expect(cellState(groups[1]!, 'item-1')).toBe('none');
  });

  it('lists services on the page first and filters the ones needing attention', () => {
    expect(gridRows(services, groups, 'all', '').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(gridRows(services, groups, 'off_page', '').map((s) => s.id)).toEqual(['s2']);
    expect(gridRows(services, groups, 'attention', '').map((s) => s.id)).toEqual([]);
    expect(gridRows(services, groups, 'all', 'bala').map((s) => s.id)).toEqual(['s1']);
  });

  it('stages a tick, and unticking it again leaves nothing to save', () => {
    const cal = groups[1]!.calendars[0]!;
    const once = toggleCalendar([], 's1', 'v-zen', cal, 'item-1', true);
    expect(once).toHaveLength(1);
    expect(calendarWillOffer(once, 's1', 'v-zen', cal, 'item-1')).toBe(true);
    expect(toggleCalendar(once, 's1', 'v-zen', cal, 'item-1', false)).toEqual([]);
  });

  it('cancels opposite page changes', () => {
    const on = stageOps([], [{ op: 'offer', service_id: 's2' }]);
    expect(stageOps(on, [{ op: 'withdraw', service_id: 's2' }])).toEqual([]);
  });

  it('says what a save changes, and what is selected', () => {
    const staged = toggleCalendar([], 's1', 'v-zen', groups[1]!.calendars[0]!, 'item-1', true);
    expect(confirmSummary(staged, groups)).toBe('This changes 1 service at Zen Studio.');
    expect(selectionSummary(2, 1)).toBe('2 services at 1 venue selected');
  });

  it('tells the host about a venue that offers nothing yet', () => {
    const todos = buildCollectiveTodos({ isHost: true, services, calendarGroups: groups });
    expect(todos.map((t) => t.text)).toEqual(['Zen Studio has joined. Choose their calendars on 1 service.']);
  });

  it('tells a member about its own hidden services, with a way to fix them', () => {
    const member: AreaService[] = [
      {
        id: 's9',
        name: 'Balayage',
        collective: block({
          role: 'replica',
          hidden_reasons: [{ venue_id: 'v-zen', venue_name: 'Zen Studio', reason: 'payments' }],
        }),
      },
    ];
    const [todo] = buildCollectiveTodos({ isHost: false, services: member, calendarGroups: [] });
    expect(todo?.text).toBe('You cannot take card payments yet, so 1 paid service is hidden from your guests.');
    expect(todo?.action).toEqual({ kind: 'payments', label: 'Connect Stripe' });
  });

  it('leaves out a hidden reason for a service none of its calendars offer (web 2026-10-28)', () => {
    const member: AreaService[] = [
      {
        id: 's20',
        name: 'Keratin',
        collective: block({
          role: 'replica',
          offered_elsewhere: true,
          hidden_reasons: [{ venue_id: 'v-zen', venue_name: 'Zen Studio', reason: 'payments' }],
        }),
      },
    ];
    expect(
      buildCollectiveTodos({ isHost: false, services: member, calendarGroups: [], ownCalendarCount: () => 0, ownVenueId: 'v-zen' }),
    ).toEqual([]);
  });

  it('tells a member about its copies none of its calendars offer, and only its own reasons (Services screen)', () => {
    const member: AreaService[] = [
      { id: 's9', name: 'Balayage', collective: block({ role: 'replica' }) },
      // Another venue offers it, so nothing is in the way of guests booking it.
      { id: 's12', name: 'Fringe trim', collective: block({ role: 'replica', offered_elsewhere: true }) },
      {
        id: 's10',
        name: 'Cut',
        collective: block({
          role: 'replica',
          hidden_reasons: [
            { venue_id: 'v-other', venue_name: 'Other', reason: 'forms' },
            { venue_id: 'v-zen', venue_name: 'Zen Studio', reason: 'forms' },
          ],
        }),
      },
      { id: 's11', name: 'Retired cut', collective: block({ role: 'retired' }) },
    ];
    const todos = buildCollectiveTodos({
      isHost: false,
      services: member,
      calendarGroups: [],
      ownCalendarCount: (id) => (id === 's10' ? 1 : 0),
      ownVenueId: 'v-zen',
    });
    expect(todos.map((t) => t.id)).toEqual(['no-calendars-s9', 'forms-v-zen']);
    expect(todos[0]?.action).toEqual({ kind: 'service', serviceId: 's9', label: 'Choose calendars' });
    expect(todos[1]?.text).toBe('Your forms are switched off, so 1 service that needs a form is hidden from your guests.');
  });
});

describe('the bulk lane (web 2026-10-28)', () => {
  it('puts on the page only what is off it, and takes off only what is on it', () => {
    expect(pageChangeable('offer', ['s1', 's2'], services)).toEqual(['s2']);
    expect(pageChangeable('withdraw', ['s1', 's2'], services)).toEqual(['s1']);
    expect(bulkOps('offer', ['s1'], ['v-host'], services)).toEqual([]);
    expect(bulkOps('withdraw', ['s1', 's2'], ['v-host'], services)).toEqual([{ op: 'withdraw', service_id: 's1' }]);
    expect(bulkOps('retry', ['s1'], ['v-host', 'v-zen'], services)).toEqual([
      { op: 'retry', service_id: 's1', venue_id: 'v-host' },
      { op: 'retry', service_id: 's1', venue_id: 'v-zen' },
    ]);
  });

  it('counts a service switched off at the host as needing attention', () => {
    const off: AreaService[] = [{ id: 's1', name: 'Balayage', collective: block(), is_active: false }];
    // Offered by a calendar and up to date, so only being switched off puts it on the list.
    expect(isSwitchedOff(off[0]!)).toBe(true);
    expect(gridRows(off, groups, 'attention', '').map((s) => s.id)).toEqual(['s1']);
    expect(isSwitchedOff({ id: 's2', name: 'Parked cut', collective: block({ role: 'parked', item_id: null }), is_active: false })).toBe(false);
  });

  it("gives a service's sheet just its own calendar ticks to save", () => {
    const staged = stageOps(
      toggleCalendar([], 's1', 'v-zen', groups[1]!.calendars[0]!, 'item-1', true),
      [{ op: 'offer', service_id: 's2' }],
    );
    expect(stagedCalendarOps(staged, 's1').map((s) => s.key)).toEqual(['calendar:s1:v-zen:c3']);
    expect(stagedCalendarOps(staged, 's2')).toEqual([]);
    expect(unsavedSummary(1)).toBe('1 change not saved yet');
    expect(unsavedSummary(3)).toBe('3 changes not saved yet');
  });
});

describe('choosing calendars for the services picked (web CollectiveBulkCalendarsDialog)', () => {
  // Two services on the page: Ada offers both, Ben offers only Balayage, Cy offers neither.
  const twoGroups: CollectiveCalendarGroup[] = [
    {
      ...groups[0]!,
      calendars: [
        {
          id: 'c1',
          name: 'Ada',
          is_active: true,
          assigned: [
            { item_id: 'item-1', service_id: 's1', values, last_changed: null },
            { item_id: 'item-3', service_id: 's3', values, last_changed: null },
          ],
        },
        { id: 'c2', name: 'Ben', is_active: true, assigned: [{ item_id: 'item-1', service_id: 's1', values, last_changed: null }] },
      ],
    },
    groups[1]!,
  ];
  const picked: AreaService[] = [
    { id: 's1', name: 'Balayage', collective: block() },
    { id: 's3', name: 'Cut', collective: block({ item_id: 'item-3' }) },
    { id: 's2', name: 'Parked cut', collective: block({ role: 'parked', item_id: null }) },
  ];
  const pickerList = pickerServices(['s1', 's3', 's2'], picked);
  const onPage = pickerList.filter((s) => s.itemId);
  const [host, zen] = twoGroups as [CollectiveCalendarGroup, CollectiveCalendarGroup];

  it('reads a service off the page as having no calendars, and names the rest', () => {
    expect(pickerList.map((s) => s.itemId)).toEqual(['item-1', 'item-3', null]);
    expect(pickerDescription(pickerList)).toBe('For 2 services: Balayage, Cut.');
    expect(pickerDescription(pickerList.slice(0, 1))).toBe('For Balayage.');
    expect(pickerDescription([])).toBeNull();
    const many = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ id: `x${i}`, name, itemId: `i${i}` }));
    expect(pickerDescription(many)).toBe('For 5 services: A, B, C and 2 more.');
  });

  it('ticks a calendar that offers every service, clears one that offers none, and dashes one that offers some', () => {
    const none = new Map<string, boolean>();
    expect(pickerState(host, host.calendars[0]!, onPage, [], none)).toBe('on');
    expect(pickerState(host, host.calendars[1]!, onPage, [], none)).toBe('mixed');
    expect(pickerState(zen, zen.calendars[0]!, onPage, [], none)).toBe('off');
    // A tick not saved yet counts.
    const staged = toggleCalendar([], 's3', 'v-host', host.calendars[1]!, 'item-3', true);
    expect(pickerState(host, host.calendars[1]!, onPage, staged, none)).toBe('on');
    // A decision wins.
    expect(pickerState(zen, zen.calendars[0]!, onPage, [], new Map([[pickerKey('v-zen', 'c3'), true]]))).toBe('on');
  });

  it('sends nothing for calendars left alone, and only what differs from what is saved', () => {
    expect(pickerResult(twoGroups, pickerList, [], new Map())).toEqual({ ops: [], settledKeys: [], changeCount: 0 });
    // Ticking Ada (already offers both) sends nothing; ticking Ben adds Cut only; ticking Cy adds both.
    const choice = new Map([
      [pickerKey('v-host', 'c1'), true],
      [pickerKey('v-host', 'c2'), true],
      [pickerKey('v-zen', 'c3'), true],
    ]);
    const result = pickerResult(twoGroups, pickerList, [], choice);
    expect(result.ops).toEqual([
      { op: 'assign', service_id: 's3', venue_id: 'v-host', calendar_id: 'c2' },
      { op: 'assign', service_id: 's1', venue_id: 'v-zen', calendar_id: 'c3' },
      { op: 'assign', service_id: 's3', venue_id: 'v-zen', calendar_id: 'c3' },
    ]);
    expect(result.changeCount).toBe(3);
    // Clearing Ben takes off only what it offers.
    expect(pickerResult(twoGroups, pickerList, [], new Map([[pickerKey('v-host', 'c2'), false]])).ops).toEqual([
      { op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c2' },
    ]);
  });

  it('replaces the ticks staged for a decided calendar, and a choice back to what is saved sends nothing', () => {
    const staged = toggleCalendar([], 's1', 'v-zen', zen.calendars[0]!, 'item-1', true);
    const result = pickerResult(twoGroups, pickerList, staged, new Map([[pickerKey('v-zen', 'c3'), false]]));
    expect(result.ops).toEqual([]);
    expect(result.settledKeys).toEqual(['calendar:s1:v-zen:c3']);
    // What the grid shows changes, so Save is still offered.
    expect(result.changeCount).toBe(1);
  });
});

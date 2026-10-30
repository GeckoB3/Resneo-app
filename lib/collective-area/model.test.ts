/**
 * The Collective area's rules, as the web grid and "What needs you" apply them (2026-09-17).
 */
import {
  affectedBookingsRow,
  affectedBookingsTitle,
  affectedRefusal,
  areaCollective,
  attentionLabel,
  buildCollectiveTodos,
  bulkFailure,
  bulkFailureRetryable,
  bulkOps,
  calendarWillOffer,
  cellState,
  describeStaged,
  failedKeptLine,
  failureRows,
  gridCrossing,
  gridRows,
  groupAffected,
  inverseOps,
  isAffectedRefusal,
  isSwitchedOff,
  NEW_OFFER_WINDOW_MS,
  pageChangeable,
  pageStaged,
  pickerDescription,
  pickerKey,
  pickerResult,
  pickerServices,
  pickerState,
  removalWarnings,
  retryOutcome,
  selectionLabel,
  selectionSummary,
  stagedCalendarOps,
  stagedCountFor,
  stageOps,
  toggleCalendar,
  unsavedSummary,
  valuesNotRestoredLine,
  type AreaService,
  type BulkOp,
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
    expect(describeStaged(staged, services, groups).lines).toEqual(['Balayage: Cy at Zen Studio starts offering it.']);
    expect(selectionSummary(2, 1)).toBe('2 services at 1 venue selected');
  });

  it('labels what is picked by kind, never claiming venues nobody picked (CQ-03)', () => {
    expect(selectionLabel(2, [], groups)).toBe('2 services picked');
    expect(selectionLabel(1, [], groups)).toBe('1 service picked');
    // The host's own venue reads "(you)" (CQ-07).
    expect(selectionLabel(0, ['v-zen', 'v-host'], groups)).toBe('Host Venue (you) and Zen Studio picked');
    expect(selectionLabel(2, ['v-zen'], groups)).toBe('2 services at 1 venue selected');
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
    const ticked = (serviceIds: string[], venueIds: string[]) =>
      gridCrossing({ selectedServices: serviceIds, selectedVenues: venueIds, rows: services, groups });
    expect(bulkOps('offer', ticked(['s1'], ['v-host']), services)).toEqual([]);
    expect(bulkOps('withdraw', ticked(['s1', 's2'], ['v-host']), services)).toEqual([{ op: 'withdraw', service_id: 's1' }]);
    expect(bulkOps('retry', ticked(['s1'], ['v-host', 'v-zen']), services)).toEqual([
      { op: 'retry', service_id: 's1', venue_id: 'v-host' },
      { op: 'retry', service_id: 's1', venue_id: 'v-zen' },
    ]);
  });

  // Regression (CQ-03): a venue picked on its own used to mean every service shown, so Take off
  // the page emptied the page for every venue.
  it('never puts on or takes off the page from a venue picked on its own', () => {
    const crossing = gridCrossing({ selectedServices: [], selectedVenues: ['v-zen'], rows: services, groups });
    expect(bulkOps('withdraw', crossing, services)).toEqual([]);
    expect(bulkOps('offer', crossing, services)).toEqual([]);
    // It means that venue's calendars for the services on the page.
    expect(crossing).toEqual({ serviceIds: ['s1'], venueIds: ['v-zen'], tickedServiceIds: [] });
    // Nothing picked: every service shown at every venue, for Try these again.
    expect(gridCrossing({ selectedServices: [], selectedVenues: [], rows: services, groups })).toEqual({
      serviceIds: ['s2', 's1'],
      venueIds: ['v-host', 'v-zen'],
      tickedServiceIds: [],
    });
  });

  it('counts only calendar changes in a venue line, and says when a row is going on or off', () => {
    const staged = stageOps(toggleCalendar([], 's1', 'v-zen', groups[1]!.calendars[0]!, 'item-1', true), [
      { op: 'withdraw', service_id: 's1' },
    ]);
    expect(stagedCountFor(staged, 's1', 'v-zen')).toBe(1);
    expect(stagedCountFor(staged, 's1', 'v-host')).toBe(0);
    expect(stagedCountFor(staged, 's1')).toBe(2);
    expect(pageStaged(staged, 's1')).toBe('withdraw');
    expect(pageStaged(staged, 's2')).toBeNull();
  });

  it('counts what needs attention for the filter (CQ-13)', () => {
    expect(attentionLabel(services, groups)).toBe('Needs attention');
    const off: AreaService[] = [...services, { id: 's5', name: 'Gloss', collective: block({ item_id: 'item-5' }), is_active: false }];
    expect(attentionLabel(off, groups)).toBe('Needs attention (1)');
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

  it('stops sending what an earlier Save settled, until that calendar is touched again (CQ-04)', () => {
    const choice = new Map([[pickerKey('v-zen', 'c3'), true]]);
    const skip = new Set(['calendar:s1:v-zen:c3']);
    const result = pickerResult(twoGroups, pickerList, [], choice, skip);
    expect(result.ops).toEqual([{ op: 'assign', service_id: 's3', venue_id: 'v-zen', calendar_id: 'c3' }]);
    expect(result.changeCount).toBe(1);
  });

  it('asks before taking calendars off, naming a venue left with nobody and a service nobody offers (CQ-11)', () => {
    // Clearing Ada and Ben leaves Cut offered nowhere; Balayage is still offered nowhere else either.
    const ops: BulkOp[] = [
      { op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' },
      { op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c2' },
      { op: 'unassign', service_id: 's3', venue_id: 'v-host', calendar_id: 'c1' },
    ];
    expect(removalWarnings(ops, pickerList, twoGroups)).toEqual([
      'Nobody will be able to book Balayage at any venue.',
      'Nobody will be able to book Cut at any venue.',
    ]);
    // With Cy still offering Balayage, only the host is left with nobody.
    const zenOffers: CollectiveCalendarGroup[] = [
      host,
      { ...zen, calendars: [{ ...zen.calendars[0]!, assigned: [{ item_id: 'item-1', service_id: 'r1', values, last_changed: null }] }] },
    ];
    expect(removalWarnings(ops.slice(0, 2), pickerList, zenOffers)).toEqual(['Nobody at Host Venue will offer Balayage.']);
    expect(describeStaged(ops.slice(0, 2), picked, twoGroups).lines).toEqual([
      'Balayage: Ada and Ben at Host Venue stop offering it.',
    ]);
  });
});

describe('what a save does, in words (web bulk-describe.ts; CQ-03, CQ-04, CQ-11)', () => {
  it('names each service coming off the page, and makes the ask red', () => {
    const one = describeStaged([{ op: 'withdraw', service_id: 's1' }], services, groups);
    expect(one).toEqual({
      title: 'Take Balayage off the page?',
      lines: [
        'Take off the page: Balayage. Guests will no longer be able to book it at any venue. Bookings already made are not changed.',
      ],
      destructive: true,
      confirmLabel: 'Take it off the page',
    });
    const two = describeStaged(
      [
        { op: 'withdraw', service_id: 's1' },
        { op: 'withdraw', service_id: 's2' },
        { op: 'offer', service_id: 's9' },
      ],
      services,
      groups,
    );
    expect(two.title).toBe('Take 2 services off the page?');
    expect(two.confirmLabel).toBe('Take 2 off the page');
    expect(two.lines[1]).toBe('Put on the page: A service.');
    const calm = describeStaged([{ op: 'offer', service_id: 's2' }], services, groups);
    expect(calm).toMatchObject({ title: 'Save these changes?', destructive: false, confirmLabel: 'Save changes' });
  });

  it('counts the lines past the cap as more changes', () => {
    const many: BulkOp[] = Array.from({ length: 10 }, (_v, i) => ({
      op: 'assign',
      service_id: `x${i}`,
      venue_id: 'v-zen',
      calendar_id: 'c3',
    }));
    const lines = describeStaged(many, services, groups, 8).lines;
    expect(lines).toHaveLength(9);
    expect(lines[8]).toBe('And 2 more changes.');
  });

  it('lists every failure as what and where, and keeps only what can go through (CQ-04)', () => {
    expect(bulkFailureRetryable({})).toBe(true);
    expect(bulkFailureRetryable({ code: 'COLLECTIVE_REPLICA_NOT_READY' })).toBe(true);
    expect(bulkFailureRetryable({ code: 'COLLECTIVE_NOT_ON_PAGE' })).toBe(false);
    const notReady = bulkFailure(
      { op: 'assign', service_id: 's1', venue_id: 'v-zen', calendar_id: 'c3' },
      { code: 'COLLECTIVE_REPLICA_NOT_READY', message: 'Still setting up.' },
    );
    const notOnPage = bulkFailure({ op: 'withdraw', service_id: 's2' }, { code: 'COLLECTIVE_NOT_ON_PAGE', message: 'That service is not on the collective page.' });
    const network = bulkFailure({ op: 'retry', service_id: 's1', venue_id: 'v-zen' }, {});
    expect(failureRows([notReady, notOnPage, network], services, groups).map((r) => r.text)).toEqual([
      'Balayage, Cy at Zen Studio: Still setting up.',
      'Parked cut: That service is not on the collective page.',
      'Balayage at Zen Studio: That change did not go through.',
    ]);
    expect([notReady.retryable, notOnPage.retryable, network.retryable]).toEqual([true, false, true]);
    expect(failedKeptLine([notReady])).toBe('It is still here, so Save sends it again.');
    expect(failedKeptLine([notReady, notOnPage])).toBe('1 of them is still here, so Save sends it again.');
    expect(failedKeptLine([notReady, network, notOnPage])).toBe('2 of them are still here, so Save sends them again.');
    expect(failedKeptLine([notOnPage])).toBeNull();
  });

  it('names the bookings a removal would leave behind, dates and times only (CQ-04)', () => {
    const op: BulkOp = { op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' };
    const result = {
      index: 0,
      ok: false,
      code: 'COLLECTIVE_AFFECTED_BOOKINGS',
      message: 'That calendar has bookings for this service.',
      affected_bookings: Array.from({ length: 6 }, (_v, i) => ({
        booking_date: `2026-11-0${i + 2}`,
        booking_time: '10:30:00',
        calendar_id: 'c1',
      })),
      affected_count: 8,
    };
    expect(isAffectedRefusal(result)).toBe(true);
    expect(isAffectedRefusal({ ok: false, code: 'COLLECTIVE_NOT_ON_PAGE' })).toBe(false);
    const items = groupAffected([affectedRefusal(op, result)], services, groups);
    expect(items[0]).toMatchObject({ serviceName: 'Balayage', calendarName: 'Ada', venueName: 'Host Venue', count: 8 });
    expect(affectedBookingsTitle(items)).toBe('Ada has upcoming bookings for Balayage');
    expect(affectedBookingsRow(items[0]!, 2026)).toBe(
      'Ada at Host Venue, Balayage: Mon 2 Nov, 10:30; Tue 3 Nov, 10:30; Wed 4 Nov, 10:30; Thu 5 Nov, 10:30; Fri 6 Nov, 10:30 and 3 more',
    );
    // An older server sends no dates: the row still names the calendar and service.
    const bare = groupAffected([affectedRefusal(op, { index: 0, ok: false, code: 'COLLECTIVE_AFFECTED_BOOKINGS' })], services, groups);
    expect(affectedBookingsRow(bare[0]!)).toBe('Balayage, Ada at Host Venue');
    expect(affectedBookingsTitle([...items, ...bare])).toBe('Some calendars have upcoming bookings');
  });

  it('undoes a save by turning it round, putting back a removed calendar with its own values (CQ-11)', () => {
    const priced: CollectiveCalendarGroup[] = [
      {
        ...groups[0]!,
        calendars: [
          {
            id: 'c1',
            name: 'Ada',
            is_active: true,
            assigned: [{ item_id: 'item-1', service_id: 's1', values: { ...values, custom_price_pence: 4500, custom_colour: '#ff0000' }, last_changed: null }],
          },
        ],
      },
      groups[1]!,
    ];
    const succeeded: BulkOp[] = [
      { op: 'offer', service_id: 's2' },
      { op: 'assign', service_id: 's1', venue_id: 'v-zen', calendar_id: 'c3' },
      { op: 'unassign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' },
      { op: 'retry', service_id: 's1', venue_id: 'v-zen' },
    ];
    expect(inverseOps(succeeded, priced, (id) => (id === 's1' ? 'item-1' : null))).toEqual([
      {
        op: 'assign',
        service_id: 's1',
        venue_id: 'v-host',
        calendar_id: 'c1',
        values: { custom_price_pence: 4500, custom_colour: '#ff0000' },
      },
      { op: 'unassign', service_id: 's1', venue_id: 'v-zen', calendar_id: 'c3' },
      { op: 'withdraw', service_id: 's2' },
    ]);
    // A calendar with none of its own values goes back without any.
    expect(inverseOps([succeeded[2]!], groups, () => 'item-1')).toEqual([
      { op: 'assign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1' },
    ]);
    expect(
      valuesNotRestoredLine(
        { op: 'assign', service_id: 's1', venue_id: 'v-host', calendar_id: 'c1', values: { custom_price_pence: 4500, custom_buffer_minutes: 5 } },
        services,
        groups,
      ),
    ).toBe('Ada at Host Venue offers it again, but its own price and buffer could not be put back. Set it again with Edit values.');
  });

  it('says what Update now did (CQ-11)', () => {
    expect(retryOutcome({ venues: 1, applied: 1, pending: [], failed: [] }, 'Zen Studio')).toEqual({
      state: 'done',
      text: 'Zen Studio is up to date.',
    });
    expect(retryOutcome({ venues: 1, applied: 0, pending: [{ venue_id: 'v-zen', venue_name: 'Zen Studio' }], failed: [] }, 'Zen Studio').text).toBe(
      'Zen Studio is still updating. We will keep trying.',
    );
    expect(
      retryOutcome(
        { venues: 1, applied: 0, pending: [], failed: [{ venue_id: 'v-zen', venue_name: 'Zen Studio', message: 'x', code: 'busy' }] },
        'Zen Studio',
      ),
    ).toEqual({ state: 'failed', text: 'Zen Studio could not be updated: Zen Studio was busy. We will try again in a moment. We will keep trying.' });
  });
});

describe('What needs you from the server (CQ-05, CQ-13)', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  // Zen already offers Balayage (item-1), so it is a venue that has started choosing.
  const zenOffers: CollectiveCalendarGroup = {
    ...groups[1]!,
    calendars: [
      { id: 'c3', name: 'Cy', is_active: true, assigned: [{ item_id: 'item-1', service_id: 'r1', values, last_changed: null }] },
    ],
  };
  const hostOffersAll: CollectiveCalendarGroup = {
    ...groups[0]!,
    calendars: [
      {
        id: 'c1',
        name: 'Ada',
        is_active: true,
        assigned: [
          { item_id: 'item-1', service_id: 's1', values, last_changed: null },
          { item_id: 'item-6', service_id: 's6', values, last_changed: null },
          { item_id: 'item-7', service_id: 's7', values, last_changed: null },
        ],
      },
    ],
  };
  const fresh = (id: string, name: string, item: string, offeredAt: string | null): AreaService => ({
    id,
    name,
    collective: block({ item_id: item, offered_at: offeredAt }),
  });

  it('names a venue that offers a new page service on no calendar, for two weeks', () => {
    const list = [services[1]!, fresh('s6', 'Gloss', 'item-6', '2026-10-28T09:00:00Z')];
    const todos = buildCollectiveTodos({ isHost: true, services: list, calendarGroups: [hostOffersAll, zenOffers], now });
    expect(todos).toEqual([
      {
        id: 'not-at-venue-v-zen-s6',
        text: 'Gloss is on the page but Zen Studio offers it on no calendar yet.',
        action: { kind: 'service', serviceId: 's6', label: 'Choose calendars' },
      },
    ]);
    // After two weeks it is the venue's own choice, not news.
    expect(buildCollectiveTodos({ isHost: true, services: list, calendarGroups: [hostOffersAll, zenOffers], now: now + NEW_OFFER_WINDOW_MS })).toEqual([]);
    // An older server sends no offered_at: no row.
    const old = [services[1]!, fresh('s6', 'Gloss', 'item-6', null)];
    expect(buildCollectiveTodos({ isHost: true, services: old, calendarGroups: [hostOffersAll, zenOffers], now })).toEqual([]);
  });

  it('makes several new services at one venue one row, opening that venue', () => {
    const list = [
      services[1]!,
      fresh('s6', 'Gloss', 'item-6', '2026-10-28T09:00:00Z'),
      fresh('s7', 'Toner', 'item-7', '2026-10-27T09:00:00Z'),
    ];
    const todos = buildCollectiveTodos({ isHost: true, services: list, calendarGroups: [hostOffersAll, zenOffers], now });
    expect(todos.map((t) => t.text)).toEqual(['Zen Studio offers 2 services from the page on no calendar yet.']);
    expect(todos[0]?.action).toEqual({ kind: 'venue_calendars', venueId: 'v-zen', label: 'Choose calendars' });
  });

  it('says a page service is switched off at the host, with Switch it on', () => {
    const off: AreaService[] = [{ ...services[1]!, is_active: false }];
    const todos = buildCollectiveTodos({ isHost: true, services: off, calendarGroups: [hostOffersAll, zenOffers], now });
    expect(todos).toEqual([
      {
        id: 'switched-off-s1',
        text: 'Balayage is switched off on your Services page, so nobody can book it at any venue.',
        action: { kind: 'switch_on', serviceId: 's1', label: 'Switch it on' },
      },
    ]);
  });
});

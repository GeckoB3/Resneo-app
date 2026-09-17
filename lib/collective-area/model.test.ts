/**
 * The Collective area's rules, as the web grid and "What needs you" apply them (2026-09-17).
 */
import {
  areaCollective,
  buildCollectiveTodos,
  calendarWillOffer,
  cellState,
  confirmSummary,
  gridRows,
  selectionSummary,
  stageOps,
  toggleCalendar,
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
});

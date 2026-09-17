/**
 * The Collective area's data and rules, ported from the web (2026-09-17):
 * `src/lib/linked-accounts/replicas/host-calendars.ts` (shapes), `collective-todos.ts`
 * ("What needs you"), and the staging rules of `CollectiveServicesGrid.tsx`.
 *
 * Pure, so the screen stays thin and the rules are tested without rendering.
 */
import { areaCopy, formatVenueList, type AreaCopyId } from '@/lib/collective-area/copy';
import type { CollectiveHiddenReasonKind, ServiceCollectiveBlock } from '@/types/services-manage';

// ---------------------------------------------------------------------------
// Shapes (web host-calendars.ts, inline-apply.ts, bulk-ops.ts, bulk-preview.ts, history.ts)
// ---------------------------------------------------------------------------

export interface CollectiveSyncVenue {
  venue_id: string;
  venue_name: string;
}

export interface CollectiveSync {
  venues: number;
  applied: number;
  pending: CollectiveSyncVenue[];
  failed: (CollectiveSyncVenue & { message: string; code: string | null })[];
}

export interface CollectiveCalendarValues {
  custom_price_pence: number | null;
  custom_duration_minutes: number | null;
  custom_buffer_minutes: number | null;
  custom_deposit_pence: number | null;
  custom_colour?: string | null;
  custom_name?: string | null;
}

export interface CollectiveCalendarAssignment {
  item_id: string;
  service_id: string;
  values: CollectiveCalendarValues;
  last_changed: { venue_name: string; at: string } | null;
}

export interface CollectiveCalendarEntry {
  id: string;
  name: string;
  is_active: boolean;
  assigned: CollectiveCalendarAssignment[];
}

export interface CollectiveCalendarGroup {
  venue_id: string;
  venue_name: string;
  is_host: boolean;
  sync: CollectiveSync;
  calendars: CollectiveCalendarEntry[];
}

export type BulkOpKind = 'offer' | 'withdraw' | 'assign' | 'unassign' | 'retry';

export interface BulkOp {
  op: BulkOpKind;
  service_id: string;
  venue_id?: string;
  calendar_id?: string;
}

export interface BulkOpResult {
  index: number;
  ok: boolean;
  code?: string;
  message?: string;
}

export interface PreviewVenue {
  venue_id: string;
  venue_name: string;
  is_host: boolean;
  shows: { service_id: string; name: string }[];
  hides: { service_id: string; name: string; reason: string }[];
}

export type HistoryFilter = 'all' | 'services' | 'calendars' | 'members';

export interface HistoryEvent {
  id: string;
  at: string;
  type: string;
  sentence: string;
}

export interface HistoryPage {
  events: HistoryEvent[];
  next_cursor: string | null;
}

/** A service as the area reads it: the Services GET row with its collective block. */
export interface AreaService {
  id: string;
  name: string;
  collective?: ServiceCollectiveBlock | null;
}

// ---------------------------------------------------------------------------
// Which collective this venue is in, and in what role (web CollectiveAreaClient)
// ---------------------------------------------------------------------------

export interface AreaCollective {
  id: string;
  name: string;
  hostVenueName: string;
  isHost: boolean;
}

/** The services say which collective this is; a master service means this venue hosts it. */
export function areaCollective(services: readonly AreaService[]): AreaCollective | null {
  const block = services.find((s) => s.collective)?.collective ?? null;
  if (!block) return null;
  return {
    id: block.collective_id,
    name: block.collective_name,
    hostVenueName: block.host_venue_name,
    isHost: services.some((s) => s.collective?.role === 'master'),
  };
}

// ---------------------------------------------------------------------------
// The grid's cells
// ---------------------------------------------------------------------------

export type CellState = 'all' | 'some' | 'none';

/** How much of a venue offers a service: all its active calendars, some, or none. */
export function cellState(group: CollectiveCalendarGroup, itemId: string | null | undefined): CellState {
  if (!itemId) return 'none';
  const active = group.calendars.filter((c) => c.is_active);
  if (active.length === 0) return 'none';
  const offering = active.filter((c) => c.assigned.some((a) => a.item_id === itemId)).length;
  if (offering === 0) return 'none';
  return offering === active.length ? 'all' : 'some';
}

export const CELL_LABEL: Record<CellState, string> = {
  all: areaCopy('ov.grid.cell.all'),
  some: areaCopy('ov.grid.cell.some'),
  none: areaCopy('ov.grid.cell.none'),
};

export function isOnPage(service: AreaService): boolean {
  return service.collective?.role === 'master';
}

export function isHiddenAt(service: AreaService, venueId: string): boolean {
  return (service.collective?.hidden_reasons ?? []).some((r) => r.venue_id === venueId);
}

export type GridFilter = 'all' | 'attention' | 'off_page';

/** Services on the page first, then the parked ones; filtered and searched as the web grid. */
export function gridRows(
  services: readonly AreaService[],
  groups: readonly CollectiveCalendarGroup[],
  filter: GridFilter,
  search: string,
): AreaService[] {
  const term = search.trim().toLowerCase();
  const ordered = [...services.filter(isOnPage), ...services.filter((s) => !isOnPage(s))];
  return ordered.filter((service) => {
    if (term && !service.name.toLowerCase().includes(term)) return false;
    const onPage = isOnPage(service);
    if (filter === 'off_page') return !onPage;
    if (filter === 'all') return true;
    if (!onPage) return false;
    const block = service.collective!;
    const noCalendars = groups.every((g) => cellState(g, block.item_id) === 'none');
    return noCalendars || block.status === 'failed' || block.status === 'hidden';
  });
}

// ---------------------------------------------------------------------------
// Staging (a change waits until Save, so the ask can say what will change)
// ---------------------------------------------------------------------------

export type StagedOp = BulkOp & { key: string };

export function keyOf(op: BulkOp): string {
  return op.op === 'assign' || op.op === 'unassign'
    ? `calendar:${op.service_id}:${op.venue_id}:${op.calendar_id}`
    : op.op === 'offer' || op.op === 'withdraw'
      ? // One key for both, so taking a service off after putting it on cancels out.
        `page:${op.service_id}`
      : `${op.op}:${op.service_id}:${op.venue_id ?? ''}`;
}

function opposites(a: BulkOp, b: BulkOp): boolean {
  return (
    (a.op === 'assign' && b.op === 'unassign') ||
    (a.op === 'unassign' && b.op === 'assign') ||
    (a.op === 'offer' && b.op === 'withdraw') ||
    (a.op === 'withdraw' && b.op === 'offer')
  );
}

/** Add changes; staging the opposite of a staged change means the host changed their mind. */
export function stageOps(staged: readonly StagedOp[], ops: readonly BulkOp[]): StagedOp[] {
  const next = new Map(staged.map((s) => [s.key, s] as const));
  for (const op of ops) {
    const key = keyOf(op);
    const existing = next.get(key);
    if (existing && opposites(existing, op)) next.delete(key);
    else next.set(key, { ...op, key });
  }
  return [...next.values()];
}

/** Whether a calendar would offer the service once the staged changes are saved. */
export function calendarWillOffer(
  staged: readonly StagedOp[],
  serviceId: string,
  venueId: string,
  calendar: CollectiveCalendarEntry,
  itemId: string | null | undefined,
): boolean {
  const key = keyOf({ op: 'assign', service_id: serviceId, venue_id: venueId, calendar_id: calendar.id });
  const change = staged.find((s) => s.key === key);
  if (change) return change.op === 'assign';
  return Boolean(itemId && calendar.assigned.some((a) => a.item_id === itemId));
}

/** Tick or untick one calendar: a change back to how it is now simply drops the staged change. */
export function toggleCalendar(
  staged: readonly StagedOp[],
  serviceId: string,
  venueId: string,
  calendar: CollectiveCalendarEntry,
  itemId: string | null | undefined,
  offer: boolean,
): StagedOp[] {
  const assignedNow = Boolean(itemId && calendar.assigned.some((a) => a.item_id === itemId));
  const op: BulkOp = { op: offer ? 'assign' : 'unassign', service_id: serviceId, venue_id: venueId, calendar_id: calendar.id };
  const key = keyOf(op);
  const rest = staged.filter((s) => s.key !== key);
  return offer === assignedNow ? rest : [...rest, { ...op, key }];
}

export function stagedCountFor(staged: readonly StagedOp[], serviceId: string, venueId?: string): number {
  return staged.filter(
    (s) =>
      s.service_id === serviceId &&
      (venueId == null || ((s.op === 'assign' || s.op === 'unassign') ? s.venue_id === venueId : true)),
  ).length;
}

/** The bulk lane: one action across the selected services and venues (every one when none are picked). */
export function bulkOps(
  kind: BulkOpKind,
  serviceIds: readonly string[],
  venueIds: readonly string[],
  groups: readonly CollectiveCalendarGroup[],
): BulkOp[] {
  const ops: BulkOp[] = [];
  for (const serviceId of serviceIds) {
    if (kind === 'offer' || kind === 'withdraw') {
      ops.push({ op: kind, service_id: serviceId });
      continue;
    }
    if (kind === 'retry') {
      for (const venueId of venueIds) ops.push({ op: 'retry', service_id: serviceId, venue_id: venueId });
      continue;
    }
    for (const venueId of venueIds) {
      const group = groups.find((g) => g.venue_id === venueId);
      for (const calendar of group?.calendars.filter((c) => c.is_active) ?? []) {
        ops.push({ op: kind, service_id: serviceId, venue_id: venueId, calendar_id: calendar.id });
      }
    }
  }
  return ops;
}

export function toBulkOps(staged: readonly StagedOp[]): BulkOp[] {
  return staged.map(({ key: _key, ...op }) => op);
}

/** "This changes {count} services at {venueList}", counted from what is staged. */
export function confirmSummary(staged: readonly StagedOp[], groups: readonly CollectiveCalendarGroup[]): string {
  const serviceIds = new Set(staged.map((s) => s.service_id));
  const venueIds = new Set(
    staged.flatMap((s) =>
      s.op === 'assign' || s.op === 'unassign' || (s.op === 'retry' && s.venue_id)
        ? [s.venue_id as string]
        : groups.map((g) => g.venue_id),
    ),
  );
  const names = groups.filter((g) => venueIds.has(g.venue_id)).map((g) => g.venue_name);
  return areaCopy(serviceIds.size === 1 ? 'ov.bulk.confirm.messageOne' : 'ov.bulk.confirm.message', {
    count: serviceIds.size,
    venueList: formatVenueList(names),
  });
}

/** "2 services at 1 venue selected". */
export function selectionSummary(serviceCount: number, venueCount: number): string {
  return areaCopy('ov.bulk.selected', {
    services: `${serviceCount} ${areaCopy(serviceCount === 1 ? 'ov.venue.service' : 'ov.venue.services')}`,
    venues: `${venueCount} ${areaCopy(venueCount === 1 ? 'ov.bulk.venue' : 'ov.bulk.venues')}`,
  });
}

/** "12 services, 3 calendars on the page" for one venue. */
export function venueCountsLine(group: CollectiveCalendarGroup): string {
  const calendars = group.calendars.filter((c) => c.is_active).length;
  const onPage = new Set(group.calendars.flatMap((c) => c.assigned.map((a) => a.item_id))).size;
  return areaCopy('ov.venue.countsWords', {
    services: `${onPage} ${areaCopy(onPage === 1 ? 'ov.venue.service' : 'ov.venue.services')}`,
    calendars: `${calendars} ${areaCopy(calendars === 1 ? 'ov.venue.calendar' : 'ov.venue.calendars')}`,
  });
}

export type SyncStatus = 'up_to_date' | 'updating' | 'failed';

export function groupStatus(group: CollectiveCalendarGroup | null | undefined): SyncStatus {
  if (!group) return 'up_to_date';
  if (group.sync.failed.length > 0) return 'failed';
  if (group.sync.pending.length > 0) return 'updating';
  return 'up_to_date';
}

/** The sentences over one venue's calendars: copies first, then where guests cannot book (web `venueWarnings`). */
export function venueWarnings(
  group: CollectiveCalendarGroup,
  reasons: readonly { venue_id: string; venue_name: string; reason: CollectiveHiddenReasonKind }[],
  collectiveName: string,
): string[] {
  const out: string[] = [];
  for (const venue of group.sync.pending) out.push(areaCopy('svc.cal.warn.settingUp', { venue: venue.venue_name }));
  for (const venue of group.sync.failed) {
    out.push(
      areaCopy('svc.cal.warn.failed', {
        venue: venue.venue_name,
        reason: venue.message || areaCopy('sync.reason.unknown'),
      }),
    );
  }
  for (const reason of reasons.filter((r) => r.venue_id === group.venue_id)) {
    if (reason.reason === 'payments') out.push(areaCopy('svc.cal.warn.noStripe', { venue: reason.venue_name }));
    if (reason.reason === 'forms') out.push(areaCopy('svc.cal.warn.formsOff', { venue: reason.venue_name }));
    if (reason.reason === 'suspended') {
      out.push(areaCopy('svc.cal.warn.suspended', { venue: reason.venue_name, collective: collectiveName }));
    }
  }
  return out;
}

/** What a calendar charges or times differently (web `valueChips`). */
export function valueChips(assignment: CollectiveCalendarAssignment | undefined, currencySymbol: string): string[] {
  if (!assignment) return [];
  const v = assignment.values;
  const money = (p: number) => `${currencySymbol}${(p / 100).toFixed(2)}`;
  const chips: string[] = [];
  if (v.custom_price_pence != null) chips.push(areaCopy('svc.cal.chip.price', { price: money(v.custom_price_pence) }));
  if (v.custom_duration_minutes != null) chips.push(areaCopy('svc.cal.chip.length', { minutes: v.custom_duration_minutes }));
  if (v.custom_buffer_minutes != null) chips.push(areaCopy('svc.cal.chip.buffer', { minutes: v.custom_buffer_minutes }));
  if (v.custom_deposit_pence != null) chips.push(areaCopy('svc.cal.chip.deposit', { price: money(v.custom_deposit_pence) }));
  if (v.custom_colour) chips.push(areaCopy('svc.cal.chip.colour'));
  if (v.custom_name) chips.push(areaCopy('svc.cal.chip.name'));
  return chips;
}

// ---------------------------------------------------------------------------
// What needs you (web collective-todos.ts, as the Collective area calls it)
// ---------------------------------------------------------------------------

export type TodoAction =
  | { kind: 'service'; serviceId: string; label: string }
  | { kind: 'venue_calendars'; venueId: string; label: string }
  | { kind: 'payments'; label: string }
  | { kind: 'forms'; label: string }
  | { kind: 'retry'; venueId: string; label: string };

export interface CollectiveTodo {
  id: string;
  text: string;
  action?: TodoAction;
}

const counted = (id: AreaCopyId, count: number, params: Record<string, string | number>): string =>
  areaCopy(count === 1 ? (`${id}One` as AreaCopyId) : id, { ...params, count });

export function buildCollectiveTodos(input: {
  isHost: boolean;
  services: readonly AreaService[];
  calendarGroups: readonly CollectiveCalendarGroup[];
  limit?: number;
}): CollectiveTodo[] {
  const onPage = input.services.filter(
    (s) => s.collective && s.collective.role !== 'parked' && s.collective.role !== 'retired',
  );
  if (onPage.length === 0) return [];
  const todos: CollectiveTodo[] = [];

  if (input.isHost) {
    const groups = input.calendarGroups;
    for (const service of onPage) {
      const itemId = service.collective?.item_id;
      if (!itemId) continue;
      const offered = groups.some((g) => g.calendars.some((c) => c.assigned.some((a) => a.item_id === itemId)));
      if (!offered) {
        todos.push({
          id: `no-calendars-${service.id}`,
          text: areaCopy('ov.todo.noCalendars', { service: service.name }),
          action: { kind: 'service', serviceId: service.id, label: areaCopy('svc.offer.chooseCalendars') },
        });
      }
    }
    for (const group of groups) {
      if (group.is_host) continue;
      if (!group.calendars.some((c) => c.assigned.length > 0)) {
        todos.push({
          id: `new-venue-${group.venue_id}`,
          text: counted('ov.todo.newVenue', onPage.length, { venue: group.venue_name }),
          action: { kind: 'venue_calendars', venueId: group.venue_id, label: areaCopy('svc.offer.chooseCalendars') },
        });
      }
    }
    for (const group of groups) {
      for (const failure of group.sync.failed) {
        const count = onPage.filter((s) => s.collective?.status === 'failed').length || 1;
        todos.push({
          id: `failed-${failure.venue_id}`,
          text: counted('ov.todo.failed', count, { venue: failure.venue_name }),
          action: { kind: 'retry', venueId: failure.venue_id, label: areaCopy('svc.save.retry') },
        });
      }
    }
    todos.push(...hiddenReasonTodos(onPage, false, false));
  } else {
    todos.push(...hiddenReasonTodos(onPage, true, true));
  }
  return todos.slice(0, input.limit ?? 5);
}

function hiddenReasonTodos(services: readonly AreaService[], withActions: boolean, self: boolean): CollectiveTodo[] {
  const payments = new Map<string, { name: string; count: number }>();
  const forms = new Map<string, { name: string; count: number }>();
  for (const service of services) {
    for (const reason of service.collective?.hidden_reasons ?? []) {
      const bucket = reason.reason === 'payments' ? payments : reason.reason === 'forms' ? forms : null;
      if (!bucket) continue;
      const seen = bucket.get(reason.venue_id);
      bucket.set(reason.venue_id, { name: reason.venue_name, count: (seen?.count ?? 0) + 1 });
    }
  }
  const todos: CollectiveTodo[] = [];
  for (const [venueId, venue] of payments) {
    todos.push({
      id: `payments-${venueId}`,
      text: counted(self ? 'ov.todo.noStripeYou' : 'ov.todo.noStripe', venue.count, { venue: venue.name }),
      ...(withActions ? { action: { kind: 'payments' as const, label: areaCopy('svc.member.card.connectStripe') } } : {}),
    });
  }
  for (const [venueId, venue] of forms) {
    todos.push({
      id: `forms-${venueId}`,
      text: counted(self ? 'ov.todo.formsOffYou' : 'ov.todo.formsOff', venue.count, { venue: venue.name }),
      ...(withActions ? { action: { kind: 'forms' as const, label: areaCopy('svc.member.card.turnOn') } } : {}),
    });
  }
  return todos;
}

/** "Hidden at Light 3" when one venue is named, else the plain status word (web `hiddenPillVenue`). */
export function hiddenPillVenue(
  reasons: readonly { venue_name: string; reason: string }[] | null | undefined,
): string | null {
  if ((reasons ?? []).some((r) => r.reason === 'staff_only')) return null;
  const names = [...new Set((reasons ?? []).map((r) => r.venue_name))];
  return names.length === 1 ? names[0]! : null;
}

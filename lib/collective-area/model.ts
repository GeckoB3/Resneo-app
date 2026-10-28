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
  /**
   * Offerings this venue has been asked about and not answered (web plan L13): it holds a
   * same-named service, and its copy exists only once it says whether to use it. Its calendars
   * cannot offer these yet. Absent on older servers.
   */
  awaiting_answer?: string[];
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
  /**
   * The service's standard values and which of them a calendar may set, for a calendar's own values
   * from the grid (web 2026-10-28). The Services GET row carries them; absent elsewhere.
   */
  duration_minutes?: number | null;
  buffer_minutes?: number | null;
  price_pence?: number | null;
  deposit_pence?: number | null;
  payment_requirement?: string | null;
  staff_may_customize_duration?: boolean | null;
  staff_may_customize_buffer?: boolean | null;
  staff_may_customize_price?: boolean | null;
  staff_may_customize_deposit?: boolean | null;
  variants?: { id: string; is_active?: boolean | null }[] | null;
  /**
   * Switched off on the Services screen. A service on the page that is switched off cannot be
   * booked anywhere (web `switchedOff`, 2026-10-28).
   */
  is_active?: boolean | null;
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

/**
 * The services say which collective this is, and the block's own `venue_role` which side this
 * venue is on (web 2026-10-27: a host with nothing on the page yet has no master service to guess
 * from). A server that does not send `venue_role` falls back to the guess: a master service means
 * this venue hosts it.
 */
export function areaCollective(services: readonly AreaService[]): AreaCollective | null {
  const block = services.find((s) => s.collective)?.collective ?? null;
  if (!block) return null;
  const venueRole = services.find((s) => s.collective?.venue_role)?.collective?.venue_role ?? null;
  return {
    id: block.collective_id,
    name: block.collective_name,
    hostVenueName: block.host_venue_name,
    isHost: venueRole ? venueRole === 'host' : services.some((s) => s.collective?.role === 'master'),
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

/** On the page but switched off at the host, so nobody can book it anywhere (web 2026-10-28). */
export function isSwitchedOff(service: AreaService): boolean {
  return isOnPage(service) && service.is_active === false;
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
    return noCalendars || block.status === 'failed' || block.status === 'hidden' || isSwitchedOff(service);
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

export type PageOpKind = 'offer' | 'withdraw';

/**
 * The services picked whose page change would change something (web `pageChangeable`,
 * 2026-10-28): "Put on the page" only for those not on it, "Take off the page" only for those on
 * it, so a save never carries a change that changes nothing.
 */
export function pageChangeable(
  kind: PageOpKind,
  serviceIds: readonly string[],
  services: readonly AreaService[],
): string[] {
  return serviceIds.filter((id) => {
    const service = services.find((s) => s.id === id);
    if (!service) return false;
    return kind === 'offer' ? !isOnPage(service) : isOnPage(service);
  });
}

/**
 * The bulk lane: put on or take off the page, or try again, across the services and venues picked
 * (every one when none are). Calendars are chosen in their own step (`pickerResult`), not here:
 * staging "every calendar" at every venue picked staged changes that changed nothing (2026-10-28).
 */
export function bulkOps(
  kind: PageOpKind | 'retry',
  serviceIds: readonly string[],
  venueIds: readonly string[],
  services: readonly AreaService[],
): BulkOp[] {
  if (kind === 'retry') {
    return serviceIds.flatMap((serviceId) =>
      venueIds.map((venueId): BulkOp => ({ op: 'retry', service_id: serviceId, venue_id: venueId })),
    );
  }
  return pageChangeable(kind, serviceIds, services).map((serviceId): BulkOp => ({ op: kind, service_id: serviceId }));
}

/** The calendar ticks staged for one service, at every venue: what its sheet's Save sends. */
export function stagedCalendarOps(staged: readonly StagedOp[], serviceId: string): StagedOp[] {
  return staged.filter((s) => (s.op === 'assign' || s.op === 'unassign') && s.service_id === serviceId);
}

/** The bar's line when nothing is picked: how many changes are waiting for Save. */
export function unsavedSummary(count: number): string {
  return count === 1 ? areaCopy('ov.bulk.unsavedOne') : areaCopy('ov.bulk.unsaved', { count });
}

// ---------------------------------------------------------------------------
// Choose calendars for the services picked (web CollectiveBulkCalendarsDialog, 2026-10-28)
// ---------------------------------------------------------------------------

export interface PickerService {
  id: string;
  name: string;
  /** The offering on the page; null for a service that is not on it, which has no calendars. */
  itemId: string | null;
}

/** The picked services as the picker reads them, in the order picked. */
export function pickerServices(serviceIds: readonly string[], services: readonly AreaService[]): PickerService[] {
  return serviceIds.flatMap((id) => {
    const service = services.find((s) => s.id === id);
    if (!service) return [];
    return [{ id: service.id, name: service.name, itemId: isOnPage(service) ? (service.collective?.item_id ?? null) : null }];
  });
}

/** The calendars the host has decided in the picker: true offers every service, false none. */
export type PickerChoice = ReadonlyMap<string, boolean>;

export const pickerKey = (venueId: string, calendarId: string): string => `${venueId}:${calendarId}`;

/** Whether a calendar offers the offering now, as saved (no staged change counted). */
export function savedOn(group: CollectiveCalendarGroup, calendarId: string, itemId: string | null): boolean {
  if (!itemId) return false;
  const calendar = group.calendars.find((c) => c.id === calendarId);
  return Boolean(calendar?.assigned.some((a) => a.item_id === itemId));
}

export type PickerState = 'on' | 'off' | 'mixed';

/**
 * One calendar's box: its decision when the host has touched it, else ticked when it offers every
 * service on the page (counting changes not saved yet), clear when none, a dash when some.
 */
export function pickerState(
  group: CollectiveCalendarGroup,
  calendar: CollectiveCalendarEntry,
  onPage: readonly PickerService[],
  staged: readonly StagedOp[],
  choice: PickerChoice,
): PickerState {
  const chosen = choice.get(pickerKey(group.venue_id, calendar.id));
  if (chosen !== undefined) return chosen ? 'on' : 'off';
  const on = onPage.filter((s) => calendarWillOffer(staged, s.id, group.venue_id, calendar, s.itemId)).length;
  if (on === 0) return 'off';
  return on === onPage.length ? 'on' : 'mixed';
}

export interface PickerResult {
  /** The changes from what is SAVED, which Save sends straight away. */
  ops: BulkOp[];
  /** Staged changes this choice replaces: a decided calendar's staged ticks for these services. */
  settledKeys: string[];
  /** Changes from what the grid shows now, which is what the Save button counts. */
  changeCount: number;
}

/** What the picker's Save sends: only the calendars touched, only where they differ (web `onSave`). */
export function pickerResult(
  groups: readonly CollectiveCalendarGroup[],
  services: readonly PickerService[],
  staged: readonly StagedOp[],
  choice: PickerChoice,
): PickerResult {
  const onPage = services.filter((s) => s.itemId);
  const ops: BulkOp[] = [];
  const settledKeys: string[] = [];
  let changeCount = 0;
  for (const group of groups) {
    for (const calendar of group.calendars) {
      const chosen = choice.get(pickerKey(group.venue_id, calendar.id));
      if (chosen === undefined) continue;
      for (const service of onPage) {
        const ref = { service_id: service.id, venue_id: group.venue_id, calendar_id: calendar.id };
        const key = keyOf({ op: 'assign', ...ref });
        if (staged.some((s) => s.key === key)) settledKeys.push(key);
        if (calendarWillOffer(staged, service.id, group.venue_id, calendar, service.itemId) !== chosen) changeCount += 1;
        if (chosen !== savedOn(group, calendar.id, service.itemId)) ops.push({ op: chosen ? 'assign' : 'unassign', ...ref });
      }
    }
  }
  return { ops, settledKeys, changeCount };
}

/** "For Cut." or "For 4 services: Cut, Colour, Blow-dry and 1 more." (web dialog description). */
export function pickerDescription(services: readonly PickerService[]): string | null {
  const names = services.filter((s) => s.itemId).map((s) => s.name);
  if (names.length === 0) return null;
  if (names.length === 1) return areaCopy('ov.bulk.choose.forOne', { service: names[0]! });
  const shown =
    names.length <= 3
      ? names.join(', ')
      : areaCopy('ov.bulk.choose.andMore', { names: names.slice(0, 3).join(', '), count: names.length - 3 });
  return areaCopy('ov.bulk.choose.forMany', { count: names.length, names: shown });
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
  /** The offering shown, so a venue still deciding about its same-named service says so (web plan L13). */
  itemId?: string | null,
): string[] {
  const out: string[] = [];
  if (itemId && (group.awaiting_answer ?? []).includes(itemId)) {
    out.push(areaCopy('svc.cal.warn.awaiting', { venue: group.venue_name }));
  }
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
  /** Member only: how many of its own calendars offer each of its services (the Services screen). */
  ownCalendarCount?: (serviceId: string) => number;
  /** Member only: its own venue id, to read the hidden reasons that are about itself. */
  ownVenueId?: string | null;
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
    // A member asked whether to use its own same-named service (web plan L13): its calendars can be
    // chosen once it answers, so the host is told what it is waiting on.
    for (const service of onPage) {
      const itemId = service.collective?.item_id;
      if (!itemId) continue;
      for (const group of groups) {
        if (group.is_host || !(group.awaiting_answer ?? []).includes(itemId)) continue;
        todos.push({
          id: `awaiting-${group.venue_id}-${service.id}`,
          text: areaCopy('ov.todo.awaiting', { venue: group.venue_name, service: service.name }),
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
    // Only services that venue's calendars offer count: one it does not offer is hidden from nobody
    // there (web `hostTodos`, 2026-10-28).
    const offeredAt = (service: AreaService, venueId: string): boolean => {
      const group = groups.find((g) => g.venue_id === venueId);
      if (!group) return true;
      const itemId = service.collective?.item_id;
      return group.calendars.some((c) => c.assigned.some((a) => a.item_id === itemId));
    };
    todos.push(...hiddenReasonTodos(onPage, false, false, null, offeredAt));
  } else {
    // A copy no calendar of this venue offers cannot be booked here (web `memberTodos`), unless
    // another venue's calendar offers it, when guests can book it there.
    const count = input.ownCalendarCount;
    if (count) {
      for (const service of onPage) {
        if (service.collective?.offered_elsewhere) continue;
        if (count(service.id) === 0) {
          todos.push({
            id: `no-calendars-${service.id}`,
            text: areaCopy('ov.todo.noCalendars', { service: service.name }),
            action: { kind: 'service', serviceId: service.id, label: areaCopy('svc.offer.chooseCalendars') },
          });
        }
      }
    }
    todos.push(
      ...hiddenReasonTodos(onPage, true, true, input.ownVenueId ?? null, count ? (service) => count(service.id) > 0 : undefined),
    );
  }
  return todos.slice(0, input.limit ?? 5);
}

function hiddenReasonTodos(
  services: readonly AreaService[],
  withActions: boolean,
  self: boolean,
  onlyVenueId: string | null,
  /** Whether that venue's calendars offer the service; a service it does not offer is left out. */
  offeredAt?: (service: AreaService, venueId: string) => boolean,
): CollectiveTodo[] {
  const payments = new Map<string, { name: string; count: number }>();
  const forms = new Map<string, { name: string; count: number }>();
  for (const service of services) {
    for (const reason of service.collective?.hidden_reasons ?? []) {
      if (onlyVenueId && reason.venue_id !== onlyVenueId) continue;
      if (offeredAt && !offeredAt(service, reason.venue_id)) continue;
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

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

/**
 * A calendar's own values an assign can put back (web `BULK_RESTORABLE_VALUE_KEYS`, CQ-11): the
 * Undo of a removal sends the values the calendar had, so taking it off and back loses nothing.
 */
export const BULK_RESTORABLE_VALUE_KEYS = [
  'custom_price_pence',
  'custom_duration_minutes',
  'custom_buffer_minutes',
  'custom_deposit_pence',
  'custom_colour',
] as const;

export type BulkAssignValues = Partial<Record<(typeof BULK_RESTORABLE_VALUE_KEYS)[number], number | string | null>>;

export interface BulkOp {
  op: BulkOpKind;
  service_id: string;
  venue_id?: string;
  calendar_id?: string;
  /** An assign only (CQ-11): the calendar's own values, put back with it. A server before 2026-10-29 refuses it. */
  values?: BulkAssignValues;
}

/** One upcoming booking a calendar removal would leave behind: dates, times and calendar, never a guest. */
export interface BulkAffectedBooking {
  booking_date: string;
  booking_time: string;
  calendar_id: string;
}

export interface BulkOpResult {
  index: number;
  ok: boolean;
  code?: string;
  message?: string;
  /**
   * With `COLLECTIVE_AFFECTED_BOOKINGS` (CQ-04): the bookings the removal would leave behind,
   * soonest first, at most 20. Absent on older servers, which still refuse the removal.
   */
  affected_bookings?: BulkAffectedBooking[];
  /** With `COLLECTIVE_AFFECTED_BOOKINGS`: how many there are in all. */
  affected_count?: number;
  /** An assign sent with `values` (CQ-11): whether the calendar's own values were put back. */
  values_restored?: boolean;
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
    return needsAttention(service, groups);
  });
}

/** On the page, and a guest cannot book it everywhere, or no calendar offers it (web `needsAttention`). */
export function needsAttention(service: AreaService, groups: readonly CollectiveCalendarGroup[]): boolean {
  if (!isOnPage(service)) return false;
  const block = service.collective!;
  const noCalendars = groups.every((g) => cellState(g, block.item_id) === 'none');
  return noCalendars || block.status === 'failed' || block.status === 'hidden' || isSwitchedOff(service);
}

/** "Needs attention (3)": counted whatever the search, so the filter says so before it is opened (CQ-13). */
export function attentionLabel(services: readonly AreaService[], groups: readonly CollectiveCalendarGroup[]): string {
  const count = services.filter((s) => needsAttention(s, groups)).length;
  return count > 0 ? areaCopy('ov.filter.attentionCount', { count }) : areaCopy('ov.filter.attention');
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

/**
 * Changes not saved for a service; at one venue, its calendar changes only: a page change is the
 * whole row's news (web, CQ-03), so it no longer reads "(1 not saved)" at every venue.
 */
export function stagedCountFor(staged: readonly StagedOp[], serviceId: string, venueId?: string): number {
  return staged.filter(
    (s) =>
      s.service_id === serviceId &&
      (venueId == null || ((s.op === 'assign' || s.op === 'unassign') && s.venue_id === venueId)),
  ).length;
}

/** Whether a service is staged to go on the page or come off it. */
export function pageStaged(staged: readonly StagedOp[], serviceId: string): PageOpKind | null {
  const change = staged.find((s) => s.service_id === serviceId && (s.op === 'offer' || s.op === 'withdraw'));
  return change ? (change.op as PageOpKind) : null;
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

/** What the bulk lane works on (web `crossing`, CQ-03). */
export interface GridCrossing {
  /** The services Choose calendars and Try these again act on. */
  serviceIds: string[];
  /** The venues they act on: the venues picked, or every venue when none is. */
  venueIds: string[];
  /** Only the services ticked: Put on the page and Take off the page never act on anything else. */
  tickedServiceIds: string[];
}

/**
 * Ticked services when there are any; with only a venue picked, the services on the page shown,
 * because a venue is about its calendars (CQ-03); with nothing picked, every service shown, for
 * Try these again.
 */
export function gridCrossing(input: {
  selectedServices: Iterable<string>;
  selectedVenues: Iterable<string>;
  rows: readonly AreaService[];
  groups: readonly CollectiveCalendarGroup[];
}): GridCrossing {
  const ticked = [...input.selectedServices];
  const venues = [...input.selectedVenues];
  return {
    serviceIds:
      ticked.length > 0
        ? ticked
        : venues.length > 0
          ? input.rows.filter(isOnPage).map((r) => r.id)
          : input.rows.map((r) => r.id),
    venueIds: venues.length > 0 ? venues : input.groups.map((g) => g.venue_id),
    tickedServiceIds: ticked,
  };
}

/**
 * The bulk lane: put on or take off the page (the services ticked, and only where it changes
 * something), or try again across the services and venues the lane works on. A venue picked on its
 * own can never empty the page (CQ-03). Calendars are chosen in their own step (`pickerResult`).
 */
export function bulkOps(kind: PageOpKind | 'retry', crossing: GridCrossing, services: readonly AreaService[]): BulkOp[] {
  if (kind === 'retry') {
    return crossing.serviceIds.flatMap((serviceId) =>
      crossing.venueIds.map((venueId): BulkOp => ({ op: 'retry', service_id: serviceId, venue_id: venueId })),
    );
  }
  return pageChangeable(kind, crossing.tickedServiceIds, services).map(
    (serviceId): BulkOp => ({ op: kind, service_id: serviceId }),
  );
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

/**
 * What the picker's Save sends: only the calendars touched, only where they differ (web `onSave`).
 * `skip` holds the changes an earlier Save settled (went through, or will only be refused again),
 * which are not sent or counted again until their calendar is touched (CQ-04).
 */
export function pickerResult(
  groups: readonly CollectiveCalendarGroup[],
  services: readonly PickerService[],
  staged: readonly StagedOp[],
  choice: PickerChoice,
  skip: ReadonlySet<string> = new Set(),
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
        if (skip.has(key)) continue;
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

/** "2 services at 1 venue selected". */
export function selectionSummary(serviceCount: number, venueCount: number): string {
  return areaCopy('ov.bulk.selected', {
    services: `${serviceCount} ${areaCopy(serviceCount === 1 ? 'ov.venue.service' : 'ov.venue.services')}`,
    venues: `${venueCount} ${areaCopy(venueCount === 1 ? 'ov.bulk.venue' : 'ov.bulk.venues')}`,
  });
}

/**
 * The bar's line for what is picked (web, CQ-03): "2 services picked" never claims "at 3 venues"
 * when no venue was picked, and a venue picked on its own reads "Zen Studio picked".
 */
export function selectionLabel(
  serviceCount: number,
  venueIds: readonly string[],
  groups: readonly CollectiveCalendarGroup[],
): string {
  if (venueIds.length === 0) {
    return areaCopy('ov.bulk.servicesPicked', {
      services: `${serviceCount} ${areaCopy(serviceCount === 1 ? 'ov.venue.service' : 'ov.venue.services')}`,
    });
  }
  if (serviceCount === 0) {
    return areaCopy('ov.bulk.venuesPicked', {
      venueList: formatVenueList(groups.filter((g) => venueIds.includes(g.venue_id)).map(gridVenueName)),
    });
  }
  return selectionSummary(serviceCount, venueIds.length);
}

// ---------------------------------------------------------------------------
// What a save does, in words, and what came back (web `bulk-describe.ts`; CQ-03, CQ-04, CQ-11)
// ---------------------------------------------------------------------------

/** How long the last save in the grid can be undone (web `UNDO_WINDOW_MS`, owner 2026-10-29). */
export const UNDO_WINDOW_MS = 60_000;

/**
 * A venue as the host reads it (web `gridVenueName`, CQ-07): only the host sees the grid, so its
 * own venue is "Aura Hair Studio (you)". A member of the same name arrives labelled with its town.
 */
export function gridVenueName(group: Pick<CollectiveCalendarGroup, 'is_host' | 'venue_name'>): string {
  return group.is_host ? areaCopy('svc.cal.venueYou', { venue: group.venue_name }) : group.venue_name;
}

export interface DescribeService {
  id: string;
  name: string;
}

/** Names in a sentence: "A", "A and B", "A, B and C", then "A, B, C, D, E and 3 more" (web `listNames`). */
export function listNames(names: readonly string[], max = 6): string {
  if (names.length <= max) {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return areaCopy('ov.bulk.choose.andMore', {
    names: names.slice(0, max - 1).join(', '),
    count: names.length - (max - 1),
  });
}

function lookups(services: readonly DescribeService[], groups: readonly CollectiveCalendarGroup[]) {
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'A service';
  const venueName = (id: string | undefined) => groups.find((g) => g.venue_id === id)?.venue_name ?? 'a venue';
  const calendarName = (venueId: string | undefined, calendarId: string | undefined) =>
    groups.find((g) => g.venue_id === venueId)?.calendars.find((c) => c.id === calendarId)?.name ?? 'A calendar';
  return { serviceName, venueName, calendarName };
}

export interface StagedDescription {
  title: string;
  /** One sentence per kind of change and service, the page changes first. */
  lines: string[];
  /** Something comes off the page for every venue, so the confirm is red. */
  destructive: boolean;
  confirmLabel: string;
}

/** Lines shown before the rest are counted as "And N more changes." */
export const DESCRIBE_MAX_LINES = 8;

/**
 * The ask before a grid save (web `describeStaged`, CQ-03): a title, one line per change in plain
 * words, and a red "Take N off the page" when anything is coming off the page for every venue.
 */
export function describeStaged(
  staged: readonly BulkOp[],
  services: readonly DescribeService[],
  groups: readonly CollectiveCalendarGroup[],
  maxLines = DESCRIBE_MAX_LINES,
): StagedDescription {
  const { serviceName, venueName, calendarName } = lookups(services, groups);
  const lines: { text: string; ops: number }[] = [];

  const withdrawn = staged.filter((op) => op.op === 'withdraw').map((op) => serviceName(op.service_id));
  if (withdrawn.length === 1) {
    lines.push({ text: areaCopy('ov.bulk.confirm.lineWithdrawOne', { service: withdrawn[0] }), ops: 1 });
  } else if (withdrawn.length > 1) {
    lines.push({
      text: areaCopy('ov.bulk.confirm.lineWithdraw', { services: listNames(withdrawn, 12) }),
      ops: withdrawn.length,
    });
  }

  const offered = staged.filter((op) => op.op === 'offer').map((op) => serviceName(op.service_id));
  if (offered.length > 0) {
    lines.push({ text: areaCopy('ov.bulk.confirm.lineOffer', { services: listNames(offered, 12) }), ops: offered.length });
  }

  for (const kind of ['assign', 'unassign'] as const) {
    // Per service, in the order staged; within it, per venue: "Ada and Ben at Host Venue and Cy at Zen Studio".
    const byService = new Map<string, Map<string, string[]>>();
    for (const op of staged) {
      if (op.op !== kind) continue;
      const venueId = op.venue_id ?? '';
      const venues = byService.get(op.service_id) ?? new Map<string, string[]>();
      const calendars = venues.get(venueId) ?? [];
      calendars.push(calendarName(op.venue_id, op.calendar_id));
      venues.set(venueId, calendars);
      byService.set(op.service_id, venues);
    }
    for (const [serviceId, venues] of byService) {
      const total = [...venues.values()].reduce((n, calendars) => n + calendars.length, 0);
      const where = listNames(
        [...venues.entries()].map(([venueId, calendars]) =>
          areaCopy('ov.bulk.confirm.calendarsAt', { calendars: listNames(calendars), venue: venueName(venueId) }),
        ),
      );
      const id: AreaCopyId =
        kind === 'assign'
          ? total === 1
            ? 'ov.bulk.confirm.lineAssignOne'
            : 'ov.bulk.confirm.lineAssign'
          : total === 1
            ? 'ov.bulk.confirm.lineUnassignOne'
            : 'ov.bulk.confirm.lineUnassign';
      lines.push({ text: areaCopy(id, { service: serviceName(serviceId), calendar: where, calendars: where }), ops: total });
    }
  }

  const retries = staged.filter((op) => op.op === 'retry');
  if (retries.length > 0) {
    const serviceIds = [...new Set(retries.map((op) => op.service_id))];
    const venueIds = retries.some((op) => !op.venue_id)
      ? groups.map((g) => g.venue_id)
      : [...new Set(retries.map((op) => op.venue_id as string))];
    lines.push({
      text: areaCopy('ov.bulk.confirm.lineRetry', {
        services: listNames(serviceIds.map(serviceName)),
        venueList: listNames(venueIds.map(venueName)),
      }),
      ops: retries.length,
    });
  }

  const shown = lines.length > maxLines ? lines.slice(0, maxLines) : lines;
  const hidden = lines.slice(shown.length).reduce((n, line) => n + line.ops, 0);
  const text = shown.map((line) => line.text);
  if (hidden > 0) text.push(areaCopy('ov.bulk.confirm.more', { count: hidden }));

  const off = withdrawn.length;
  return {
    title:
      off === 1
        ? areaCopy('ov.bulk.confirm.titleWithdrawOne', { service: withdrawn[0] })
        : off > 1
          ? areaCopy('ov.bulk.confirm.titleWithdraw', { count: off })
          : areaCopy('ov.bulk.confirm.title'),
    lines: text,
    destructive: off > 0,
    confirmLabel:
      off === 1
        ? areaCopy('ov.bulk.confirm.confirmWithdrawOne')
        : off > 1
          ? areaCopy('ov.bulk.confirm.confirmWithdraw', { count: off })
          : areaCopy('ov.bulk.confirm.confirm'),
  };
}

/**
 * Whether sending the same change again could go through (web `bulkFailureRetryable`, CQ-04). One
 * with no code is ours or the network's, and a venue's copy that is not ready yet will be in a
 * minute; anything else coded (not on the page, bookings to see first) is refused again.
 */
export function bulkFailureRetryable(result: Pick<BulkOpResult, 'code'>): boolean {
  return !result.code || result.code === 'COLLECTIVE_REPLICA_NOT_READY';
}

/** A change the engine refused, kept with whether sending it again could go through. */
export interface BulkFailure {
  key: string;
  op: BulkOp;
  code?: string;
  message: string;
  /** False for a refusal that will repeat: it is listed, and never sent again by itself. */
  retryable: boolean;
}

export const BULK_FAILURE_FALLBACK = 'That change did not go through.';

export function bulkFailure(op: BulkOp, result: Pick<BulkOpResult, 'code' | 'message'>): BulkFailure {
  return {
    key: keyOf(op),
    op,
    code: result.code,
    message: result.message ?? BULK_FAILURE_FALLBACK,
    retryable: bulkFailureRetryable(result),
  };
}

/** "Facial, Chair 2 at Zen Studio", "Facial at Zen Studio", or just "Facial" for a page change. */
export function failureSubject(
  op: BulkOp,
  services: readonly DescribeService[],
  groups: readonly CollectiveCalendarGroup[],
): string {
  const { serviceName, venueName, calendarName } = lookups(services, groups);
  if (op.op === 'assign' || op.op === 'unassign') {
    return areaCopy('ov.bulk.failed.subjectCalendar', {
      service: serviceName(op.service_id),
      calendar: calendarName(op.venue_id, op.calendar_id),
      venue: venueName(op.venue_id),
    });
  }
  if (op.op === 'retry' && op.venue_id) {
    return areaCopy('ov.bulk.failed.subjectVenue', { service: serviceName(op.service_id), venue: venueName(op.venue_id) });
  }
  return serviceName(op.service_id);
}

/** "{service} at {venue}: {reason}" for every failure, in the order they came back (web `failureRows`). */
export function failureRows(
  failed: readonly Pick<BulkFailure, 'key' | 'op' | 'message'>[],
  services: readonly DescribeService[],
  groups: readonly CollectiveCalendarGroup[],
): { key: string; text: string }[] {
  return failed.map((f) => ({
    key: f.key,
    text: areaCopy('ov.bulk.failed.row', { subject: failureSubject(f.op, services, groups), reason: f.message }),
  }));
}

/** The line under a list of failures, only when some of them are still kept to send again. */
export function failedKeptLine(list: readonly Pick<BulkFailure, 'retryable'>[]): string | null {
  const kept = list.filter((f) => f.retryable).length;
  if (kept === 0) return null;
  if (list.length === 1) return areaCopy('ov.bulk.failed.keptOne');
  if (kept === 1) return areaCopy('ov.bulk.failed.keptOneOfMany');
  return areaCopy('ov.bulk.failed.kept', { count: kept });
}

/** A removal the engine held back because the calendar has upcoming bookings for the service. */
export interface AffectedRefusal {
  key: string;
  op: BulkOp;
  /** Soonest first, at most 20; empty from a server that does not send them yet. */
  bookings: BulkAffectedBooking[];
  /** How many there are in all. */
  count: number;
}

export function isAffectedRefusal(result: Pick<BulkOpResult, 'ok' | 'code'>): boolean {
  return !result.ok && result.code === 'COLLECTIVE_AFFECTED_BOOKINGS';
}

export function affectedRefusal(op: BulkOp, result: BulkOpResult): AffectedRefusal {
  const bookings = result.affected_bookings ?? [];
  return { key: keyOf(op), op, bookings, count: Math.max(result.affected_count ?? 0, bookings.length) };
}

/** One service at one calendar with its bookings, named, for the bookings step. */
export interface AffectedBookingsItem {
  key: string;
  serviceName: string;
  calendarName: string;
  venueName: string;
  bookings: BulkAffectedBooking[];
  count: number;
}

export function groupAffected(
  refusals: readonly AffectedRefusal[],
  services: readonly DescribeService[],
  groups: readonly CollectiveCalendarGroup[],
): AffectedBookingsItem[] {
  const { serviceName, venueName, calendarName } = lookups(services, groups);
  return refusals.map((r) => ({
    key: r.key,
    serviceName: serviceName(r.op.service_id),
    calendarName: calendarName(r.op.venue_id, r.op.calendar_id),
    venueName: venueName(r.op.venue_id),
    bookings: r.bookings,
    count: r.count,
  }));
}

/** "Tue 3 Nov", with the year when it is not this year (web `affectedBookingDateLabel`). */
export function affectedBookingDateLabel(ymd: string, thisYear = new Date().getUTCFullYear()): string {
  const parsed = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(parsed.getUTCFullYear() === thisYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

/** "Chair 2 has upcoming bookings for Facial", or the general title for more than one. */
export function affectedBookingsTitle(items: readonly AffectedBookingsItem[]): string {
  const [first] = items;
  return items.length === 1 && first
    ? areaCopy('ov.bulk.bookings.titleOne', { calendar: first.calendarName, service: first.serviceName })
    : areaCopy('ov.bulk.bookings.title');
}

/** Dates listed per calendar before the rest are counted. */
const AFFECTED_DATES_SHOWN = 5;

/** "Chair 2 at Zen Studio, Facial: Tue 3 Nov, 10:00; Wed 4 Nov, 11:30 and 2 more" (web `affectedBookingsRow`). */
export function affectedBookingsRow(item: AffectedBookingsItem, thisYear?: number): string {
  const shown = item.bookings.slice(0, AFFECTED_DATES_SHOWN).map((booking) =>
    areaCopy('ov.bulk.bookings.date', {
      date: affectedBookingDateLabel(booking.booking_date, thisYear),
      time: booking.booking_time.slice(0, 5),
    }),
  );
  // A server that sends no dates yet still names the calendar and service.
  if (shown.length === 0) {
    return areaCopy('ov.bulk.failed.subjectCalendar', {
      service: item.serviceName,
      calendar: item.calendarName,
      venue: item.venueName,
    });
  }
  const more = item.count - shown.length;
  const dates =
    more > 0 ? `${shown.join('; ')} ${areaCopy('ov.bulk.bookings.more', { count: more })}` : shown.join('; ');
  return areaCopy('ov.bulk.bookings.row', {
    calendar: item.calendarName,
    venue: item.venueName,
    service: item.serviceName,
    dates,
  });
}

/**
 * What a picker save that takes calendars off leaves behind (web `removalWarnings`, CQ-11): a venue
 * left with no calendar for a service, or a service no calendar anywhere would offer. Counted on
 * what is saved plus these changes, over every venue, active calendars only.
 */
export function removalWarnings(
  ops: readonly BulkOp[],
  services: readonly PickerService[],
  groups: readonly CollectiveCalendarGroup[],
): string[] {
  const lines: string[] = [];
  const serviceIds = [...new Set(ops.filter((op) => op.op === 'unassign').map((op) => op.service_id))];
  for (const serviceId of serviceIds) {
    const service = services.find((s) => s.id === serviceId);
    if (!service?.itemId) continue;
    const itemId = service.itemId;
    const offersAfter = (venueId: string, calendarId: string, saved: boolean) => {
      const change = ops.find(
        (op) =>
          (op.op === 'assign' || op.op === 'unassign') &&
          op.service_id === serviceId &&
          op.venue_id === venueId &&
          op.calendar_id === calendarId,
      );
      return change ? change.op === 'assign' : saved;
    };
    let anywhere = 0;
    const emptied: string[] = [];
    for (const group of groups) {
      const active = group.calendars.filter((c) => c.is_active);
      const before = active.filter((c) => c.assigned.some((a) => a.item_id === itemId)).length;
      const after = active.filter((c) =>
        offersAfter(group.venue_id, c.id, c.assigned.some((a) => a.item_id === itemId)),
      ).length;
      anywhere += after;
      if (before > 0 && after === 0) emptied.push(group.venue_name);
    }
    if (anywhere === 0) {
      lines.push(areaCopy('ov.bulk.choose.confirmNowhere', { service: service.name }));
      continue;
    }
    for (const venue of emptied) {
      lines.push(areaCopy('ov.bulk.choose.confirmVenueNone', { venue, service: service.name }));
    }
  }
  return lines;
}

/**
 * What undoes a save (web `inverseOps`, CQ-11): the changes that went through, turned round and in
 * reverse order, so a put-on with its calendars comes off calendars first. A calendar taken off
 * goes back with the values it had before the save (`groupsBefore`), so its own price is not lost.
 * Bringing copies up to date has nothing to undo.
 */
export function inverseOps(
  succeeded: readonly BulkOp[],
  groupsBefore: readonly CollectiveCalendarGroup[],
  /** The offering a service had before the save, to find a calendar's values for it. */
  itemIdOf: (serviceId: string) => string | null | undefined,
): BulkOp[] {
  const out: BulkOp[] = [];
  for (const op of [...succeeded].reverse()) {
    if (op.op === 'offer') out.push({ op: 'withdraw', service_id: op.service_id });
    else if (op.op === 'withdraw') out.push({ op: 'offer', service_id: op.service_id });
    else if (op.op === 'assign') {
      out.push({ op: 'unassign', service_id: op.service_id, venue_id: op.venue_id, calendar_id: op.calendar_id });
    } else if (op.op === 'unassign') {
      const values = valuesBefore(groupsBefore, itemIdOf(op.service_id), op.venue_id, op.calendar_id);
      out.push({
        op: 'assign',
        service_id: op.service_id,
        venue_id: op.venue_id,
        calendar_id: op.calendar_id,
        ...(values ? { values } : {}),
      });
    }
  }
  return out;
}

/** A calendar's own values for an offering, as they were: only the ones it set, or null. */
function valuesBefore(
  groups: readonly CollectiveCalendarGroup[],
  itemId: string | null | undefined,
  venueId: string | undefined,
  calendarId: string | undefined,
): BulkAssignValues | null {
  if (!itemId) return null;
  const calendar = groups.find((g) => g.venue_id === venueId)?.calendars.find((c) => c.id === calendarId);
  const assigned = calendar?.assigned.find((a) => a.item_id === itemId);
  if (!assigned) return null;
  const out: BulkAssignValues = {};
  for (const key of BULK_RESTORABLE_VALUE_KEYS) {
    const value = (assigned.values as unknown as Record<string, unknown>)[key];
    if (typeof value === 'number' || (typeof value === 'string' && value !== '')) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

const VALUE_WORDS: Record<(typeof BULK_RESTORABLE_VALUE_KEYS)[number], string> = {
  custom_price_pence: 'price',
  custom_duration_minutes: 'length',
  custom_buffer_minutes: 'buffer',
  custom_deposit_pence: 'deposit',
  custom_colour: 'colour',
};

/** "Chair 2 at Zen Studio offers it again, but its own price could not be put back. ..." */
export function valuesNotRestoredLine(
  op: BulkOp,
  services: readonly DescribeService[],
  groups: readonly CollectiveCalendarGroup[],
): string {
  const { venueName, calendarName } = lookups(services, groups);
  const fields = BULK_RESTORABLE_VALUE_KEYS.filter((key) => op.values?.[key] !== undefined && op.values?.[key] !== null);
  return areaCopy('ov.bulk.undoValues', {
    calendar: calendarName(op.venue_id, op.calendar_id),
    venue: venueName(op.venue_id),
    fields: listNames(fields.map((key) => VALUE_WORDS[key])),
  });
}

/** Why an update did not reach a venue, in the host's words (web `syncFailureReason`). */
export function syncFailureReason(code: string | null | undefined, venueName: string): string {
  if (code === 'lock_timeout' || code === 'timeout' || code === '55P03' || code === 'busy') {
    return areaCopy('sync.reason.busy', { venue: venueName });
  }
  if (code === 'membership_suspended' || code === 'subscription_lapsed') {
    return areaCopy('sync.reason.subscription', { venue: venueName });
  }
  return areaCopy('sync.reason.unknown');
}

/** What Update now did for one venue (web `retryOutcome`, CQ-11). */
export interface RetryOutcome {
  state: 'done' | 'pending' | 'failed';
  text: string;
}

export function retryOutcome(sync: CollectiveSync | null | undefined, venueName: string): RetryOutcome {
  const failed = sync?.failed[0];
  if (failed) {
    return {
      state: 'failed',
      text: areaCopy('ov.venue.retryFailed', {
        venue: venueName,
        // The reason is a sentence of its own; the line adds its own full stop.
        reason: syncFailureReason(failed.code, venueName).replace(/\.$/, ''),
      }),
    };
  }
  if ((sync?.pending.length ?? 0) > 0) {
    return { state: 'pending', text: areaCopy('ov.venue.retryPending', { venue: venueName }) };
  }
  return { state: 'done', text: areaCopy('ov.venue.retryDone', { venue: venueName }) };
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
  for (const venue of group.sync.pending) out.push(areaCopy('svc.cal.warn.updating', { venue: venue.venue_name }));
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

/**
 * What a calendar charges or times differently (web `valueChips`). `hasOptions` (CQ-12): each option
 * sets its own price, length and buffer, so a value left over for those is not what guests are charged.
 */
export function valueChips(
  assignment: CollectiveCalendarAssignment | undefined,
  currencySymbol: string,
  hasOptions = false,
): string[] {
  if (!assignment) return [];
  const v = assignment.values;
  const money = (p: number) => `${currencySymbol}${(p / 100).toFixed(2)}`;
  const chips: string[] = [];
  if (!hasOptions && v.custom_price_pence != null) chips.push(areaCopy('svc.cal.chip.price', { price: money(v.custom_price_pence) }));
  if (!hasOptions && v.custom_duration_minutes != null) chips.push(areaCopy('svc.cal.chip.length', { minutes: v.custom_duration_minutes }));
  if (!hasOptions && v.custom_buffer_minutes != null) chips.push(areaCopy('svc.cal.chip.buffer', { minutes: v.custom_buffer_minutes }));
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
  | { kind: 'retry'; venueId: string; label: string }
  /** Switch a page service back on at the host (the Services screen's switch), from the strip (CQ-13). */
  | { kind: 'switch_on'; serviceId: string; label: string };

export interface CollectiveTodo {
  id: string;
  text: string;
  action?: TodoAction;
}

const counted = (id: AreaCopyId, count: number, params: Record<string, string | number>): string =>
  areaCopy(count === 1 ? (`${id}One` as AreaCopyId) : id, { ...params, count });

/**
 * How long after a service goes on the page the host is told which venues offer it on no calendar
 * (web `NEW_OFFER_WINDOW_MS`, CQ-05, owner 2026-10-29).
 */
export const NEW_OFFER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function buildCollectiveTodos(input: {
  isHost: boolean;
  services: readonly AreaService[];
  calendarGroups: readonly CollectiveCalendarGroup[];
  /** Member only: how many of its own calendars offer each of its services (the Services screen). */
  ownCalendarCount?: (serviceId: string) => number;
  /** Member only: its own venue id, to read the hidden reasons that are about itself. */
  ownVenueId?: string | null;
  limit?: number;
  /** The clock, for the two weeks after a service goes on the page; injectable for tests. */
  now?: number;
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
    // Switched off on the Services screen while on the page (CQ-13): one switch hid it at every
    // venue, and the grid counts it as needing attention, so this list says so too.
    for (const service of onPage) {
      if (!isSwitchedOff(service)) continue;
      todos.push({
        id: `switched-off-${service.id}`,
        text: areaCopy('ov.todo.switchedOff', { service: service.name }),
        action: { kind: 'switch_on', serviceId: service.id, label: areaCopy('ov.grid.row.turnOn') },
      });
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
    todos.push(...notAtVenueTodos(onPage, groups, input.now ?? Date.now()));
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

/**
 * For two weeks after a service goes on the page, the venues that offer other page services but
 * not this one (web `notAtVenueTodos`, CQ-05). A venue that offers nothing yet has its own row, one
 * still deciding about a same-named service cannot be chosen for yet, and a service no calendar
 * offers anywhere has the louder row. A server without `offered_at` shows none.
 */
function notAtVenueTodos(
  onPage: readonly AreaService[],
  groups: readonly CollectiveCalendarGroup[],
  now: number,
): CollectiveTodo[] {
  const offersItem = (group: CollectiveCalendarGroup, itemId: string) =>
    group.calendars.some((c) => c.assigned.some((a) => a.item_id === itemId));
  const missing = new Map<string, { group: CollectiveCalendarGroup; services: AreaService[] }>();
  for (const service of onPage) {
    const itemId = service.collective?.item_id;
    const offeredAt = service.collective?.offered_at ? Date.parse(service.collective.offered_at) : NaN;
    if (!itemId || !Number.isFinite(offeredAt) || now - offeredAt > NEW_OFFER_WINDOW_MS) continue;
    if (!groups.some((g) => offersItem(g, itemId))) continue;
    for (const group of groups) {
      if (group.is_host || (group.awaiting_answer ?? []).includes(itemId)) continue;
      if (!group.calendars.some((c) => c.assigned.length > 0)) continue;
      if (!group.calendars.some((c) => c.is_active)) continue;
      if (offersItem(group, itemId)) continue;
      const seen = missing.get(group.venue_id) ?? { group, services: [] };
      seen.services.push(service);
      missing.set(group.venue_id, seen);
    }
  }
  const label = areaCopy('svc.offer.chooseCalendars');
  return [...missing.values()].map(({ group, services }) =>
    services.length === 1
      ? {
          id: `not-at-venue-${group.venue_id}-${services[0]!.id}`,
          text: areaCopy('ov.todo.notAtVenue', { service: services[0]!.name, venue: group.venue_name }),
          action: { kind: 'service' as const, serviceId: services[0]!.id, label },
        }
      : {
          id: `not-at-venue-${group.venue_id}`,
          text: areaCopy('ov.todo.notAtVenueMany', { venue: group.venue_name, count: services.length }),
          action: { kind: 'venue_calendars' as const, venueId: group.venue_id, label },
        },
  );
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

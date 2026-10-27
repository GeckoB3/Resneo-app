/**
 * Every venue's own services, on the collective page or not, and the rules for curating the page
 * from them (owner, 2026-10-27; web `src/lib/linked-accounts/replicas/venue-services.ts` for the
 * shapes, `VenueServicesPanel.tsx`, `SuggestionsReview.tsx` and `MemberSuggestPanel.tsx` for the
 * rules).
 *
 * Before this, a member's service reached the page one at a time: the member suggested it, the
 * host added it from "Add from another venue", then the member answered "Use mine" or "Keep
 * separate". Now the host ticks any venue's services and puts them on the page in one save, and
 * nobody is asked.
 *
 * Pure, so the screens stay thin and the rules are tested without rendering.
 */
import { areaCopy, formatVenueList } from '@/lib/collective-area/copy';

// ---------------------------------------------------------------------------
// Shapes (web venue-services.ts)
// ---------------------------------------------------------------------------

/** One of a venue's own services, as GET /api/venue/collectives/[id]/venue-services lists it. */
export interface VenueServiceRow {
  id: string;
  name: string;
  duration_minutes: number | null;
  price_pence: number | null;
  /** Its heading (category) at its own venue, if it has one. */
  heading: string | null;
  bookable_online: boolean;
  /** The host's service is offered, or the member's follows a page service. */
  on_page: boolean;
  /** The page service it is, or follows. */
  item_id: string | null;
  /** The page service's name, when the service follows one ("Gents Cut" for "gents cut"). */
  page_name: string | null;
  /** Off the page: the page service of the same name it would join. */
  joins: { item_id: string; name: string } | null;
  /** How many of its own venue's calendars offer it. */
  calendars: number;
  /** A member's suggestion still waiting for the host. */
  suggested_at: string | null;
}

export interface VenueServicesGroup {
  venue_id: string;
  venue_name: string;
  is_host: boolean;
  services: VenueServiceRow[];
}

/**
 * The GET's answer. The host reads every venue's services (its own venue first); a member reads
 * only its own, with the host's name, to suggest from.
 */
export interface VenueServicesResponse {
  role: 'host' | 'member';
  collective_name: string;
  host_venue_id: string;
  /** A member's answer only. */
  host_name: string | null;
  venues: VenueServicesGroup[];
}

export type CurateAction = 'add' | 'remove';
/** 'match' (the default): a member service joins a page service of the same name; 'separate': never. */
export type CurateMode = 'match' | 'separate';

export interface CurateItem {
  venue_id: string;
  service_id: string;
}

/** One answer per service, so a failure at one does not undo the rest. */
export interface CurateResult extends CurateItem {
  ok: boolean;
  /** added, matched (joined a page service), already, withdrawn, released, not_on_page */
  status?: string;
  code?: string;
  message?: string;
}

/** The route takes at most this many services in one request; more are sent in turns. */
export const CURATE_LIMIT = 200;

export type VenueServicesFilter = 'all' | 'on' | 'off' | 'suggested';

// ---------------------------------------------------------------------------
// Reading the list
// ---------------------------------------------------------------------------

/** A service is chosen by venue and id together: two venues' services never share a key. */
export function venueServiceKey(venueId: string, serviceId: string): string {
  return `${venueId}:${serviceId}`;
}

/** A price as the web's service catalogue says it (`formatPricePenceForServiceCatalog`). */
export function priceWords(pence: number, symbol: string): string {
  return pence <= 0 ? 'Free' : `${symbol}${(pence / 100).toFixed(2)}`;
}

/** Waiting for the host, and not on the page yet. */
export function isSuggested(service: VenueServiceRow): boolean {
  return Boolean(service.suggested_at && !service.on_page);
}

/** "Studio (you)" for the host's own venue, its name for any other. */
export function venueLabel(group: VenueServicesGroup): string {
  return group.is_host ? areaCopy('vs.venueYou', { venue: group.venue_name }) : group.venue_name;
}

export interface VenueCounts {
  on: number;
  total: number;
  suggested: number;
}

/** Per venue: how many of its services are on the page, how many it has, how many are suggested. */
export function venueCounts(groups: readonly VenueServicesGroup[]): Map<string, VenueCounts> {
  const out = new Map<string, VenueCounts>();
  for (const g of groups) {
    out.set(g.venue_id, {
      on: g.services.filter((s) => s.on_page).length,
      total: g.services.length,
      suggested: g.services.filter(isSuggested).length,
    });
  }
  return out;
}

export interface VenueServiceEntry {
  group: VenueServicesGroup;
  service: VenueServiceRow;
}

/**
 * The rows shown for a venue ('all' for every venue), a filter and a search. The search matches the
 * service's name or its heading, as the web's does.
 */
export function venueServiceRows(
  groups: readonly VenueServicesGroup[],
  venue: string,
  filter: VenueServicesFilter,
  search: string,
): VenueServiceEntry[] {
  const q = search.trim().toLowerCase();
  const out: VenueServiceEntry[] = [];
  for (const group of groups) {
    if (venue !== 'all' && group.venue_id !== venue) continue;
    for (const service of group.services) {
      if (filter === 'on' && !service.on_page) continue;
      if (filter === 'off' && service.on_page) continue;
      if (filter === 'suggested' && !isSuggested(service)) continue;
      if (q && !service.name.toLowerCase().includes(q) && !(service.heading ?? '').toLowerCase().includes(q)) continue;
      out.push({ group, service });
    }
  }
  return out;
}

/** "No calendars", "1 calendar", "3 calendars". */
export function calendarsWords(count: number): string {
  if (count === 0) return areaCopy('vs.calendars.none');
  if (count === 1) return areaCopy('vs.calendars.one');
  return areaCopy('vs.calendars.many', { count });
}

/**
 * The line under a service's name: length, price, heading, staff only, its venue when every venue
 * is shown, then how many calendars offer it.
 */
export function venueServiceFacts(entry: VenueServiceEntry, opts: { symbol: string; showVenue: boolean }): string {
  const { service, group } = entry;
  return [
    service.duration_minutes ? `${service.duration_minutes} min` : null,
    service.price_pence != null ? priceWords(service.price_pence, opts.symbol) : null,
    service.heading,
    service.bookable_online ? null : areaCopy('vs.staffOnly'),
    opts.showVenue ? venueLabel(group) : null,
    calendarsWords(service.calendars),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "On the page as Gents Cut", when the page service it follows has another name. */
export function onPageAsLine(service: VenueServiceRow): string | null {
  if (!service.on_page || !service.page_name) return null;
  if (service.page_name.trim().toLowerCase() === service.name.trim().toLowerCase()) return null;
  return areaCopy('vs.onPageAs', { name: service.page_name });
}

/** "Joins Gents Cut on the page", for a service off the page that matches a page service by name. */
export function joinsLine(service: VenueServiceRow): string | null {
  return !service.on_page && service.joins ? areaCopy('vs.joins', { name: service.joins.name }) : null;
}

// ---------------------------------------------------------------------------
// What a selection does
// ---------------------------------------------------------------------------

export interface CurateSelection {
  chosen: VenueServiceEntry[];
  /** Off the page: "Put on the page". */
  toAdd: VenueServiceEntry[];
  /** On the page: "Take off the page". */
  toRemove: VenueServiceEntry[];
  /** Suggested and still waiting: "Not now". */
  toDecline: VenueServiceEntry[];
  /** Going on the page and matching a page service by name: they join it unless added separately. */
  joining: VenueServiceEntry[];
}

/** Split the ticked services by what each button would do with them. */
export function curateSelection(groups: readonly VenueServicesGroup[], selected: ReadonlySet<string>): CurateSelection {
  const chosen: VenueServiceEntry[] = [];
  for (const group of groups) {
    for (const service of group.services) {
      if (selected.has(venueServiceKey(group.venue_id, service.id))) chosen.push({ group, service });
    }
  }
  const toAdd = chosen.filter((c) => !c.service.on_page);
  return {
    chosen,
    toAdd,
    toRemove: chosen.filter((c) => c.service.on_page),
    toDecline: chosen.filter((c) => isSuggested(c.service)),
    joining: toAdd.filter((c) => c.service.joins),
  };
}

/** The confirm's title: one service by name, more by count. */
export function curateTitle(action: CurateAction, list: readonly VenueServiceEntry[], collective: string): string {
  const one = list.length === 1;
  if (action === 'add') {
    return one
      ? areaCopy('vs.addTitleOne', { service: list[0]!.service.name, collective })
      : areaCopy('vs.addTitle', { count: list.length, collective });
  }
  return one
    ? areaCopy('vs.removeTitleOne', { service: list[0]!.service.name, collective })
    : areaCopy('vs.removeTitle', { count: list.length, collective });
}

/** The services that will join a page service of the same name, each with its venue. */
export function joiningList(joining: readonly VenueServiceEntry[]): string {
  return formatVenueList(
    joining.map((c) => `${c.service.name} (${c.group.venue_name})`),
    3,
  );
}

/**
 * What a save says: the services that did not change, by name, when any failed; otherwise how
 * many went on or came off.
 */
export function curateOutcome(
  action: CurateAction,
  results: readonly CurateResult[],
  nameOf: (result: CurateResult) => string,
  collective: string,
): { tone: 'ok' | 'error'; text: string; failedKeys: string[] } {
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    return {
      tone: 'error',
      text: areaCopy('vs.done.failed', { list: formatVenueList(failed.map(nameOf), 3) }),
      failedKeys: failed.map((r) => venueServiceKey(r.venue_id, r.service_id)),
    };
  }
  const done = results.filter((r) => r.ok);
  const one = done.length === 1;
  const id =
    action === 'add' ? (one ? 'vs.done.addedOne' : 'vs.done.added') : one ? 'vs.done.removedOne' : 'vs.done.removed';
  return {
    tone: 'ok',
    text: areaCopy(id, { count: done.length, service: one ? nameOf(done[0]!) : undefined, collective }),
    failedKeys: [],
  };
}

/** What "Not now" says once the suggestions are left off: one by name and venue, more by count. */
export function declinedText(list: readonly { service: string; venue: string }[]): string {
  return list.length === 1
    ? areaCopy('vs.declinedOne', { service: list[0]!.service, venue: list[0]!.venue })
    : areaCopy('vs.declined', { count: list.length });
}

/** The question before "Not now": one by name, more by count. */
export function declineTitle(names: readonly string[]): string {
  return names.length === 1
    ? areaCopy('vs.declineTitleOne', { service: names[0] })
    : areaCopy('vs.declineTitle', { count: names.length });
}

/** Split a list into the route's chunks. */
export function chunked<T>(list: readonly T[], size = CURATE_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
